import { CanvasView } from "../canvas/CanvasView.js";
import { buildCExport } from "../export/buildCExport.js";
import type { ParsedSprite } from "../import/parseSpriteC.js";
import type { CreateToolKind, Primitive, ToolKind } from "../primitives/Primitive.js";
import { bindKeyboardShortcuts } from "../shortcuts/keyboardShortcuts.js";
import { bindToolbar } from "../ui/bindToolbar.js";
import { bindClearDialog } from "../ui/clearDialog.js";
import { getAppElements } from "../ui/elements.js";
import { bindImportDialog } from "../ui/importDialog.js";
import { applyHistorySnapshot, clonePrimitives, createHistorySnapshot, createInitialState } from "./AppState.js";

const MIN_CANVAS_SIZE = 1;
const MAX_CANVAS_SIZE = 2048;
const PASTE_OFFSET = 8;

type LayerMoveTarget = "back" | "backward" | "forward" | "front";

type SelectedPrimitive = {
  index: number;
  primitive: Primitive;
};

type PrimitiveBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function createApp(): void {
  const elements = getAppElements();
  const state = createInitialState();
  let primitiveClipboard: Primitive[] = [];

  const updateExport = (): void => {
    elements.exportOutput.value = buildCExport(state);
    updateSelectedPrimitiveControls();
  };

  const selectTool = (tool: ToolKind): void => {
    state.activeTool = state.activeTool === tool ? null : tool;

    if (isCreateToolKind(tool)) {
      state.activeKind = tool;
    }

    elements.kindButtons.forEach((button) => {
      button.classList.toggle("is-active", state.activeTool !== null && button.dataset.kind === state.activeTool);
    });
  };

  const canvasView = new CanvasView(elements, state, {
    onRender: updateExport,
  });

  const clearSprite = (): void => {
    if (state.primitives.length === 0) {
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));
    state.primitives = [];
    state.redoStack = [];
    state.selectedPrimitiveIndexes = [];
    canvasView.render();
  };

  const clearDialog = bindClearDialog(elements, {
    onConfirm: clearSprite,
  });

  const requestClear = (): void => {
    if (state.primitives.length === 0) {
      return;
    }

    clearDialog.requestClear();
  };

  const copyExport = async (): Promise<void> => {
    const output = buildCExport(state);

    elements.exportOutput.value = output;

    await navigator.clipboard.writeText(output);
  };

  const showExport = (): void => {
    elements.exportOutput.value = buildCExport(state);
    elements.exportDialog.showModal();
  };

  const applyImportedSprite = (sprite: ParsedSprite): void => {
    state.undoStack.push(createHistorySnapshot(state));
    state.spriteId = sprite.spriteId;
    state.spriteWidth = sprite.spriteWidth;
    state.spriteHeight = sprite.spriteHeight;
    state.pivotX = sprite.pivotX;
    state.pivotY = sprite.pivotY;
    state.primitives = clonePrimitives(sprite.primitives);
    state.redoStack = [];
    state.selectedPrimitiveIndexes = [];

    syncCanvasSizeInput();

    canvasView.setupCanvas();
    canvasView.render();
  };

  const importDialog = bindImportDialog(elements, {
    onImport: applyImportedSprite,
  });

  bindToolbar(elements, {
    onSelectTool: selectTool,

    onResizeCanvas: (value: string): void => {
      const nextSize = parseCanvasSizeInput(value);

      if (!nextSize) {
        elements.canvasSizeInput.classList.add("is-invalid");
        return;
      }

      elements.canvasSizeInput.classList.remove("is-invalid");

      if (nextSize.width === state.spriteWidth && nextSize.height === state.spriteHeight) {
        syncCanvasSizeInput();
        return;
      }

      state.undoStack.push(createHistorySnapshot(state));
      state.spriteWidth = nextSize.width;
      state.spriteHeight = nextSize.height;
      state.pivotX = Math.floor(nextSize.width / 2);
      state.pivotY = Math.floor(nextSize.height / 2);
      state.redoStack = [];

      syncCanvasSizeInput();
      canvasView.setupCanvas();
      canvasView.render();
    },

    onValidateCanvasSize: (value: string): boolean => parseCanvasSizeInput(value) !== null,

    onApplyColor: (value: string): void => {
      const nextColor = parseColorInput(value);

      if (!nextColor) {
        elements.colorHexInput.classList.add("is-invalid");
        return;
      }

      elements.colorHexInput.classList.remove("is-invalid");
      state.color = nextColor.color;
      state.alpha = nextColor.alpha;

      syncColorInputs();
      updateExport();
    },

    onValidateColor: (value: string): boolean => parseColorInput(value) !== null,

    onFlipHorizontal: flipHorizontalSelection,
    onFlipVertical: flipVerticalSelection,

    onMoveSelectedLayer: (target: LayerMoveTarget): void => {
      moveSelectedLayer(target);
    },

    onCopyPrimitive: (): void => {
      copySelectedPrimitive();
    },

    onPastePrimitive: (): void => {
      pastePrimitive();
    },

    onDeletePrimitive: (): void => {
      deleteSelectedPrimitive();
    },

    onUndo: (): void => {
      const snapshot = state.undoStack.pop();

      if (!snapshot) {
        return;
      }

      state.redoStack.push(createHistorySnapshot(state));
      applyHistorySnapshot(state, snapshot);

      syncCanvasSizeInput();
      clampSelection();
      canvasView.setupCanvas();
      canvasView.render();
    },

    onRedo: (): void => {
      const snapshot = state.redoStack.pop();

      if (!snapshot) {
        return;
      }

      state.undoStack.push(createHistorySnapshot(state));
      applyHistorySnapshot(state, snapshot);

      syncCanvasSizeInput();
      clampSelection();
      canvasView.setupCanvas();
      canvasView.render();
    },

    onClear: requestClear,
    onImport: importDialog.requestImport,
    onCopy: copyExport,
    onShow: showExport,
    onUpdateExport: updateExport,
  });

  bindKeyboardShortcuts({
    onSelectTool: selectTool,
    onFlipHorizontal: flipHorizontalSelection,
    onFlipVertical: flipVerticalSelection,

    onUndo: (): void => {
      elements.undoButton.click();
    },

    onRedo: (): void => {
      elements.redoButton.click();
    },

    onCopy: copySelectedPrimitive,
    onPaste: pastePrimitive,
    onImport: importDialog.requestImport,
    onShow: showExport,
    onDelete: deleteSelectedPrimitive,

    onClearSelection: (): void => {
      if (state.activeTool !== null) {
        state.activeTool = null;

        elements.kindButtons.forEach((button) => {
          button.classList.toggle("is-active", false);
        });

        canvasView.render();
        return;
      }

      state.selectedPrimitiveIndexes = [];
      canvasView.render();
    },

    onMoveLayer: moveSelectedLayer,
  });

  syncCanvasSizeInput();
  syncColorInputs();
  updateSelectedPrimitiveControls();
  canvasView.setupCanvas();
  canvasView.bind();
  canvasView.render();

  function getSelectedIndexes(): number[] {
    return [...new Set(state.selectedPrimitiveIndexes)].filter((index) => state.primitives[index]).sort((a, b) => a - b);
  }

  function getSelectedPrimitives(): SelectedPrimitive[] {
    return getSelectedIndexes().map((index) => ({
      index,
      primitive: state.primitives[index],
    }));
  }

  function copySelectedPrimitive(): void {
    const selectedPrimitives = getSelectedPrimitives();

    if (selectedPrimitives.length === 0) {
      return;
    }

    primitiveClipboard = selectedPrimitives.map(({ primitive }) => ({ ...primitive }));
    updateSelectedPrimitiveControls();
  }

  function pastePrimitive(): void {
    if (primitiveClipboard.length === 0) {
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));

    const pastedPrimitives = primitiveClipboard.map((primitive) => ({
      ...primitive,
      x: primitive.x + PASTE_OFFSET,
      y: primitive.y + PASTE_OFFSET,
    }));

    const firstPastedIndex = state.primitives.length;

    state.primitives.push(...pastedPrimitives);
    state.selectedPrimitiveIndexes = pastedPrimitives.map((_, index) => firstPastedIndex + index);
    state.redoStack = [];

    canvasView.render();
  }

  function deleteSelectedPrimitive(): void {
    const selectedIndexes = getSelectedIndexes();

    if (selectedIndexes.length === 0) {
      state.selectedPrimitiveIndexes = [];
      updateSelectedPrimitiveControls();
      return;
    }

    const selectedSet = new Set(selectedIndexes);

    state.undoStack.push(createHistorySnapshot(state));
    state.primitives = state.primitives.filter((_, index) => !selectedSet.has(index));
    state.selectedPrimitiveIndexes = [];
    state.redoStack = [];

    canvasView.render();
  }

  function flipHorizontalSelection(): void {
    const selectedPrimitives = getSelectedPrimitives();

    if (selectedPrimitives.length === 0) {
      return;
    }

    const center = getSelectionCenter(selectedPrimitives);

    state.undoStack.push(createHistorySnapshot(state));

    for (const { primitive } of selectedPrimitives) {
      primitive.x = Math.round(center.x - (primitive.x - center.x));
      primitive.rotation = -primitive.rotation;
    }

    state.redoStack = [];
    canvasView.render();
  }

  function flipVerticalSelection(): void {
    const selectedPrimitives = getSelectedPrimitives();

    if (selectedPrimitives.length === 0) {
      return;
    }

    const center = getSelectionCenter(selectedPrimitives);

    state.undoStack.push(createHistorySnapshot(state));

    for (const { primitive } of selectedPrimitives) {
      primitive.y = Math.round(center.y - (primitive.y - center.y));
      primitive.rotation = Math.PI - primitive.rotation;
    }

    state.redoStack = [];
    canvasView.render();
  }

  function moveSelectedLayer(target: LayerMoveTarget): void {
    const selectedIndexes = getSelectedIndexes();

    if (selectedIndexes.length === 0 || state.primitives.length < 2) {
      updateSelectedPrimitiveControls();
      return;
    }

    const selectedSet = new Set(selectedIndexes);
    const selectedPrimitives = state.primitives.filter((_, index) => selectedSet.has(index));
    const remainingPrimitives = state.primitives.filter((_, index) => !selectedSet.has(index));
    const nextIndex = getNextLayerIndex(selectedIndexes, remainingPrimitives.length, target);
    const nextPrimitives = insertPrimitives(remainingPrimitives, selectedPrimitives, nextIndex);

    if (arraysEqual(state.primitives, nextPrimitives)) {
      updateSelectedPrimitiveControls();
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));
    state.primitives = nextPrimitives;
    state.selectedPrimitiveIndexes = selectedPrimitives.map((primitive) => state.primitives.indexOf(primitive));
    state.redoStack = [];

    canvasView.render();
  }

  function updateSelectedPrimitiveControls(): void {
    const selectedPrimitives = getSelectedPrimitives();
    const selectedIndexes = selectedPrimitives.map(({ index }) => index);
    const hasSelection = selectedPrimitives.length > 0;
    const isAtBack = selectedIndexes.every((index, position) => index === position);
    const frontStartIndex = state.primitives.length - selectedIndexes.length;
    const isAtFront = selectedIndexes.every((index, position) => index === frontStartIndex + position);

    elements.flipHorizontalButton.disabled = !hasSelection;
    elements.flipVerticalButton.disabled = !hasSelection;
    elements.sendToBackButton.disabled = !hasSelection || isAtBack;
    elements.sendBackwardButton.disabled = !hasSelection || isAtBack;
    elements.bringForwardButton.disabled = !hasSelection || isAtFront;
    elements.bringToFrontButton.disabled = !hasSelection || isAtFront;
    elements.copyPrimitiveButton.disabled = !hasSelection;
    elements.deletePrimitiveButton.disabled = !hasSelection;
    elements.pastePrimitiveButton.disabled = primitiveClipboard.length === 0;
    elements.undoButton.disabled = state.undoStack.length === 0;
    elements.redoButton.disabled = state.redoStack.length === 0;

    if (selectedPrimitives.length === 0) {
      elements.selectionSummary.textContent = "Selected: none";
    } else if (selectedPrimitives.length === 1) {
      elements.selectionSummary.textContent = "Selected: 1 primitive";
    } else {
      elements.selectionSummary.textContent = `Selected: ${selectedPrimitives.length} primitives`;
    }
  }

  function syncCanvasSizeInput(): void {
    elements.canvasSizeInput.classList.remove("is-invalid");
    elements.canvasSizeInput.value = `${state.spriteWidth}x${state.spriteHeight}`;
  }

  function syncColorInputs(): void {
    const alphaHex = state.alpha.toString(16).padStart(2, "0");

    elements.colorInput.value = state.color;
    elements.colorHexInput.value = `${state.color}${alphaHex}`;
    elements.colorHexInput.classList.remove("is-invalid");
  }

  function parseCanvasSizeInput(value: string): { width: number; height: number } | null {
    const fields = value
      .trim()
      .split(/[x,;\s]+/i)
      .filter(Boolean);

    if (fields.length !== 2) {
      return null;
    }

    const width = Number(fields[0]);
    const height = Number(fields[1]);

    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      return null;
    }

    if (width < MIN_CANVAS_SIZE || height < MIN_CANVAS_SIZE || width > MAX_CANVAS_SIZE || height > MAX_CANVAS_SIZE) {
      return null;
    }

    return { width, height };
  }

  function parseColorInput(value: string): { color: string; alpha: number } | null {
    const trimmedValue = value.trim();
    const match = /^(?:#|0x)([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/i.exec(trimmedValue);

    if (!match) {
      return null;
    }

    return {
      color: `#${match[1].toLowerCase()}`,
      alpha: match[2] ? Number.parseInt(match[2], 16) : 255,
    };
  }

  function getSelectionCenter(selectedPrimitives: SelectedPrimitive[]): { x: number; y: number } {
    const bounds = getSelectionBounds(selectedPrimitives);

    return {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
  }

  function getSelectionBounds(selectedPrimitives: SelectedPrimitive[]): PrimitiveBounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const { primitive } of selectedPrimitives) {
      const bounds = getPrimitiveBounds(primitive);

      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }

    return { minX, minY, maxX, maxY };
  }

  function getPrimitiveBounds(primitive: Primitive): PrimitiveBounds {
    if (primitive.kind === "circle") {
      return {
        minX: primitive.x - primitive.w,
        minY: primitive.y - primitive.w,
        maxX: primitive.x + primitive.w,
        maxY: primitive.y + primitive.w,
      };
    }

    return {
      minX: primitive.x - primitive.w / 2,
      minY: primitive.y - primitive.h / 2,
      maxX: primitive.x + primitive.w / 2,
      maxY: primitive.y + primitive.h / 2,
    };
  }

  function getNextLayerIndex(selectedIndexes: number[], remainingLength: number, target: LayerMoveTarget): number {
    const minSelectedIndex = Math.min(...selectedIndexes);

    if (target === "back") {
      return 0;
    }

    if (target === "backward") {
      return Math.max(0, minSelectedIndex - 1);
    }

    if (target === "forward") {
      return Math.min(remainingLength, minSelectedIndex + 1);
    }

    return remainingLength;
  }

  function insertPrimitives(primitives: Primitive[], insertedPrimitives: Primitive[], index: number): Primitive[] {
    return [...primitives.slice(0, index), ...insertedPrimitives, ...primitives.slice(index)];
  }

  function arraysEqual(left: Primitive[], right: Primitive[]): boolean {
    return left.length === right.length && left.every((primitive, index) => primitive === right[index]);
  }

  function isCreateToolKind(tool: ToolKind): tool is CreateToolKind {
    return tool === "rect" || tool === "circle" || tool === "triangle";
  }

  function clampSelection(): void {
    state.selectedPrimitiveIndexes = getSelectedIndexes();
  }
}
