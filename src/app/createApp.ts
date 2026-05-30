import { CanvasView } from "../canvas/CanvasView.js";
import { buildCExport } from "../export/buildCExport.js";
import type { Primitive, ToolKind } from "../primitives/Primitive.js";
import { bindKeyboardShortcuts } from "../shortcuts/keyboardShortcuts.js";
import { bindToolbar } from "../ui/bindToolbar.js";
import { bindClearDialog } from "../ui/clearDialog.js";
import { getAppElements } from "../ui/elements.js";
import { bindImportDialog } from "../ui/importDialog.js";
import { applyHistorySnapshot, clonePrimitives, createHistorySnapshot, createInitialState } from "./AppState.js";
import type { ParsedSprite } from "../import/parseSpriteC.js";

const MIN_CANVAS_SIZE = 1;
const MAX_CANVAS_SIZE = 2048;
const MIN_PRIMITIVE_SIZE = 1;
const PASTE_OFFSET = 8;
const DEGREES_PER_RADIAN = 180 / Math.PI;
const RADIANS_PER_DEGREE = Math.PI / 180;

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

    if (tool !== null) {
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

    elements.spriteIdInput.value = sprite.spriteId;
    syncCanvasSizeInput();

    canvasView.setupCanvas();
    canvasView.render();
  };

  const importDialog = bindImportDialog(elements, {
    onImport: applyImportedSprite,
  });

  bindToolbar(elements, state, {
    onSelectTool: selectTool,
    onResizeCanvas: (value) => {
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
    onValidateCanvasSize: (value) => parseCanvasSizeInput(value) !== null,
    onApplyColor: (value) => {
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
    onValidateColor: (value) => parseColorInput(value) !== null,
    onScaleSelected: (factor) => {
      scaleSelectedPrimitive(factor);
    },
    onRotateSelected: (degrees) => {
      rotateSelectedPrimitive(degrees);
    },
    onMoveSelectedLayer: (target) => {
      moveSelectedLayer(target);
    },
    onCopyPrimitive: () => {
      copySelectedPrimitive();
    },
    onPastePrimitive: () => {
      pastePrimitive();
    },
    onDeletePrimitive: () => {
      deleteSelectedPrimitive();
    },
    onUndo: () => {
      const snapshot = state.undoStack.pop();

      if (!snapshot) {
        return;
      }

      state.redoStack.push(createHistorySnapshot(state));
      applyHistorySnapshot(state, snapshot);

      elements.spriteIdInput.value = state.spriteId;
      syncCanvasSizeInput();
      clampSelection();
      canvasView.setupCanvas();
      canvasView.render();
    },
    onRedo: () => {
      const snapshot = state.redoStack.pop();

      if (!snapshot) {
        return;
      }

      state.undoStack.push(createHistorySnapshot(state));
      applyHistorySnapshot(state, snapshot);

      elements.spriteIdInput.value = state.spriteId;
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
    onUndo: () => elements.undoButton.click(),
    onRedo: () => elements.redoButton.click(),
    onCopy: copySelectedPrimitive,
    onPaste: pastePrimitive,
    onImport: importDialog.requestImport,
    onShow: showExport,
    onDelete: deleteSelectedPrimitive,
    onClearSelection: () => {
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
    return [...new Set(state.selectedPrimitiveIndexes)]
      .filter((index) => state.primitives[index])
      .sort((a, b) => a - b);
  }

  function getSelectedPrimitives(): SelectedPrimitive[] {
    return getSelectedIndexes().map((index) => ({ index, primitive: state.primitives[index] }));
  }

  function scaleSelectedPrimitive(factor: number): void {
    const selectedPrimitives = getSelectedPrimitives();

    if (selectedPrimitives.length === 0 || !Number.isFinite(factor) || factor <= 0 || factor === 1) {
      return;
    }

    const center = getSelectionCenter(selectedPrimitives);

    for (const { primitive } of selectedPrimitives) {
      const nextW = Math.round(primitive.w * factor);
      const nextH = primitive.kind === "circle" ? primitive.h : Math.round(primitive.h * factor);

      if (!Number.isFinite(nextW) || !Number.isFinite(nextH) || nextW < MIN_PRIMITIVE_SIZE) {
        return;
      }

      if (primitive.kind !== "circle" && nextH < MIN_PRIMITIVE_SIZE) {
        return;
      }
    }

    state.undoStack.push(createHistorySnapshot(state));

    for (const { primitive } of selectedPrimitives) {
      primitive.x = Math.round(center.x + (primitive.x - center.x) * factor);
      primitive.y = Math.round(center.y + (primitive.y - center.y) * factor);
      primitive.w = Math.max(MIN_PRIMITIVE_SIZE, Math.round(primitive.w * factor));

      if (primitive.kind !== "circle") {
        primitive.h = Math.max(MIN_PRIMITIVE_SIZE, Math.round(primitive.h * factor));
      }
    }

    state.redoStack = [];
    canvasView.render();
  }

  function rotateSelectedPrimitive(degrees: number): void {
    const selectedPrimitives = getSelectedPrimitives();

    if (selectedPrimitives.length === 0 || !Number.isFinite(degrees)) {
      updateSelectedPrimitiveControls();
      return;
    }

    const center = getSelectionCenter(selectedPrimitives);
    const angle =
      selectedPrimitives.length === 1
        ? degrees * RADIANS_PER_DEGREE - selectedPrimitives[0].primitive.rotation
        : degrees * RADIANS_PER_DEGREE;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    state.undoStack.push(createHistorySnapshot(state));

    for (const { primitive } of selectedPrimitives) {
      const offsetX = primitive.x - center.x;
      const offsetY = primitive.y - center.y;
      primitive.x = Math.round(center.x + offsetX * cos - offsetY * sin);
      primitive.y = Math.round(center.y + offsetX * sin + offsetY * cos);
      primitive.rotation += angle;
    }

    state.redoStack = [];
    canvasView.render();
  }

  function copySelectedPrimitive(): void {
    const selectedPrimitives = getSelectedPrimitives();

    if (selectedPrimitives.length === 0) {
      return;
    }

    primitiveClipboard = selectedPrimitives.map(({ primitive }) => ({ ...primitive }));
    updateSelectedPrimitiveControls();
  }

  function moveSelectedLayer(target: "back" | "backward" | "forward" | "front"): void {
    const selectedIndexes = getSelectedIndexes();

    if (selectedIndexes.length === 0 || state.primitives.length < 2) {
      updateSelectedPrimitiveControls();
      return;
    }

    const selectedSet = new Set(selectedIndexes);
    const selectedPrimitives = state.primitives.filter((_, index) => selectedSet.has(index));
    const remainingPrimitives = state.primitives.filter((_, index) => !selectedSet.has(index));
    const nextIndex = getNextLayerIndex(selectedIndexes, remainingPrimitives.length, target);

    if (arraysEqual(state.primitives, insertPrimitives(remainingPrimitives, selectedPrimitives, nextIndex))) {
      updateSelectedPrimitiveControls();
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));
    state.primitives = insertPrimitives(remainingPrimitives, selectedPrimitives, nextIndex);
    state.selectedPrimitiveIndexes = selectedPrimitives.map((primitive) => state.primitives.indexOf(primitive));
    state.redoStack = [];
    canvasView.render();
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

  function updateSelectedPrimitiveControls(): void {
    const selectedPrimitives = getSelectedPrimitives();
    const selectedIndexes = selectedPrimitives.map(({ index }) => index);
    const hasSelection = selectedPrimitives.length > 0;
    const isAtBack = selectedIndexes.every((index, position) => index === position);
    const frontStartIndex = state.primitives.length - selectedIndexes.length;
    const isAtFront = selectedIndexes.every((index, position) => index === frontStartIndex + position);

    elements.scaleInput.disabled = !hasSelection;
    elements.rotationInput.disabled = !hasSelection;
    elements.sendToBackButton.disabled = !hasSelection || isAtBack;
    elements.sendBackwardButton.disabled = !hasSelection || isAtBack;
    elements.bringForwardButton.disabled = !hasSelection || isAtFront;
    elements.bringToFrontButton.disabled = !hasSelection || isAtFront;
    elements.copyPrimitiveButton.disabled = !hasSelection;
    elements.deletePrimitiveButton.disabled = !hasSelection;
    elements.pastePrimitiveButton.disabled = primitiveClipboard.length === 0;
    elements.undoButton.disabled = state.undoStack.length === 0;
    elements.redoButton.disabled = state.redoStack.length === 0;

    if (selectedPrimitives.length === 1) {
      elements.rotationInput.value = String(Math.round(selectedPrimitives[0].primitive.rotation * DEGREES_PER_RADIAN));
    } else {
      elements.rotationInput.value = "0";
    }

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
    const fields = value.trim().split(/[x,;\s]+/i).filter(Boolean);

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

  function getNextLayerIndex(
    selectedIndexes: number[],
    remainingLength: number,
    target: "back" | "backward" | "forward" | "front",
  ): number {
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

  function clampSelection(): void {
    state.selectedPrimitiveIndexes = getSelectedIndexes();
  }
}
