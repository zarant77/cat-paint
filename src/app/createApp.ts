import { CanvasView } from "../canvas/CanvasView.js";
import { buildCExport } from "../export/buildCExport.js";
import { buildJsonExport } from "../export/buildJsonExport.js";
import type { CatPaintDocument, GroupNode, SceneNode, SceneNodeEntry } from "../document/CatPaintDocument.js";
import {
  cloneNodes,
  cloneNodesWithNewIds,
  createGroupNode,
  getEditablePrimitiveNodeEntries,
  getPrimitiveCommandsForNode,
  getSceneNodeEntries,
} from "../document/CatPaintDocument.js";
import type { ParsedSprite } from "../import/parseSpriteC.js";
import type { CreateToolKind, Primitive, ToolKind } from "../primitives/Primitive.js";
import { bindKeyboardShortcuts } from "../shortcuts/keyboardShortcuts.js";
import { bindToolbar } from "../ui/bindToolbar.js";
import { bindClearDialog } from "../ui/clearDialog.js";
import { bindPrimitiveList } from "../ui/primitiveList.js";
import { getAppElements } from "../ui/elements.js";
import { bindImportDialog } from "../ui/importDialog.js";
import { applyHistorySnapshot, createHistorySnapshot, createInitialState } from "./AppState.js";

const MIN_CANVAS_SIZE = 1;
const MAX_CANVAS_SIZE = 2048;
const PASTE_OFFSET = 8;

type LayerMoveTarget = "back" | "backward" | "forward" | "front";

type SelectedPrimitive = {
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
  let nodeClipboard: SceneNode[] = [];
  let renderPrimitiveList = (): void => {};

  const updateExport = (): void => {
    syncExportOutputs();
    updateSelectedPrimitiveControls();
    renderPrimitiveList();
  };

  const selectTool = (tool: ToolKind): void => {
    state.activeTool = state.activeTool === tool ? null : tool;

    if (isCreateToolKind(tool)) {
      state.activeKind = tool;
    }

    elements.kindButtons.forEach((button) => {
      button.classList.toggle("is-active", state.activeTool !== null && button.dataset.kind === state.activeTool);
    });

    canvasView.refreshCursor();
  };

  function selectNodeFromList(nodeId: string, options: { shiftKey: boolean }): void {
    const entry = getNodeEntry(nodeId);

    if (!entry) {
      return;
    }

    if (options.shiftKey) {
      const selectedEntries = getSelectedEntries();
      const canMultiSelect = selectedEntries.every((selectedEntry) => selectedEntry.parent === entry.parent);
      const selectedIds = new Set(canMultiSelect ? state.selectedNodeIds : []);

      if (selectedIds.has(nodeId)) {
        selectedIds.delete(nodeId);
      } else {
        selectedIds.add(nodeId);
      }

      state.selectedNodeIds = sortNodeIdsByTreeOrder([...selectedIds]);
    } else {
      state.selectedNodeIds = [nodeId];
    }

    updateSelectedPrimitiveControls();
    renderPrimitiveList();
    canvasView.render();
  }

  function renameNode(nodeId: string, name: string): void {
    const entry = getNodeEntry(nodeId);
    const trimmedName = name.trim();

    if (!entry || trimmedName === "" || entry.node.name === trimmedName) {
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));
    entry.node.name = trimmedName;
    state.redoStack = [];
    canvasView.render();
  }

  const canvasView = new CanvasView(elements, state, {
    onRender: updateExport,
  });

  const clearSprite = (): void => {
    if (state.nodes.length === 0) {
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));
    state.nodes = [];
    state.redoStack = [];
    state.selectedNodeIds = [];
    canvasView.render();
  };

  const clearDialog = bindClearDialog(elements, {
    onConfirm: clearSprite,
  });

  const requestClear = (): void => {
    if (state.nodes.length === 0) {
      return;
    }

    clearDialog.requestClear();
  };

  const showExport = (): void => {
    syncExportOutputs();
    elements.exportDialog.showModal();
  };

  const applyImportedSprite = (sprite: ParsedSprite | CatPaintDocument): void => {
    state.undoStack.push(createHistorySnapshot(state));
    if (isCatPaintDocument(sprite)) {
      state.spriteId = sprite.sprite.id;
      state.spriteWidth = sprite.sprite.width;
      state.spriteHeight = sprite.sprite.height;
      state.pivotX = sprite.sprite.pivotX;
      state.pivotY = sprite.sprite.pivotY;
      state.nodes = cloneNodes(sprite.nodes);
    } else {
      state.spriteId = sprite.spriteId;
      state.spriteWidth = sprite.spriteWidth;
      state.spriteHeight = sprite.spriteHeight;
      state.pivotX = sprite.pivotX;
      state.pivotY = sprite.pivotY;
      state.nodes = cloneNodes(sprite.nodes);
    }
    state.redoStack = [];
    state.selectedNodeIds = [];

    syncCanvasSizeInput();

    canvasView.setupCanvas();
    canvasView.render();
  };

  const importDialog = bindImportDialog(elements, {
    onImport: applyImportedSprite,
  });

  elements.exportJsonTab.addEventListener("click", () => {
    setActiveExportFormat("json");
  });

  elements.exportProcedureTab.addEventListener("click", () => {
    setActiveExportFormat("procedure");
  });

  const primitiveList = bindPrimitiveList(elements, state, {
    onSelectNode: selectNodeFromList,
    onToggleGroup: toggleGroupCollapsed,
    onToggleNodeVisibility: toggleNodeVisibility,
    onToggleNodeLocked: toggleNodeLocked,
    onMoveNode: moveNodeFromList,
    onRenameNode: renameNode,
  });

  renderPrimitiveList = primitiveList.render;

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

    onGroup: (): void => {
      groupSelection();
    },

    onUngroup: (): void => {
      ungroupSelection();
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

      state.selectedNodeIds = [];
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

  function getSelectedPrimitives(): SelectedPrimitive[] {
    const editableCommands = new Set(
      getEditablePrimitiveNodeEntries(state.nodes)
        .filter((entry) => !entry.locked)
        .map((entry) => entry.command),
    );
    const selectedCommands = new Set<Primitive>();

    return getSelectedEditableNodes().flatMap((node) => {
      return getPrimitiveCommandsForNode(node).flatMap((primitive) => {
        if (!editableCommands.has(primitive) || selectedCommands.has(primitive)) {
          return [];
        }

        selectedCommands.add(primitive);
        return [{ primitive }];
      });
    });
  }

  function copySelectedPrimitive(): void {
    const selectedNodes = getSelectedNodes();

    if (selectedNodes.length === 0) {
      return;
    }

    nodeClipboard = cloneNodes(selectedNodes);
    updateSelectedPrimitiveControls();
  }

  function pastePrimitive(): void {
    if (nodeClipboard.length === 0) {
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));

    const pastedNodes = cloneNodesWithNewIds(nodeClipboard, { x: PASTE_OFFSET, y: PASTE_OFFSET });

    state.nodes.push(...pastedNodes);
    state.selectedNodeIds = pastedNodes.map((node) => node.id);
    state.redoStack = [];

    canvasView.render();
  }

  function deleteSelectedPrimitive(): void {
    const selectedIds = new Set(
      getSelectedEntries()
        .filter((entry) => !isNodeOrAncestorLocked(entry) && !hasLockedDescendant(entry.node))
        .map((entry) => entry.node.id),
    );

    if (state.selectedNodeIds.length === 0) {
      state.selectedNodeIds = [];
      updateSelectedPrimitiveControls();
      canvasView.render();
      return;
    }

    if (selectedIds.size === 0) {
      updateSelectedPrimitiveControls();
      canvasView.render();
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));
    state.nodes = removeSelectedNodes(state.nodes, selectedIds);
    state.selectedNodeIds = [];
    state.redoStack = [];

    canvasView.render();
  }

  function toggleNodeVisibility(nodeId: string): void {
    const entry = getNodeEntry(nodeId);

    if (!entry) {
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));
    entry.node.visible = !entry.node.visible;
    state.redoStack = [];

    canvasView.render();
  }

  function toggleNodeLocked(nodeId: string): void {
    const entry = getNodeEntry(nodeId);

    if (!entry) {
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));
    entry.node.locked = !entry.node.locked;
    state.redoStack = [];

    canvasView.render();
  }

  function groupSelection(): void {
    const selectedEntries = getSelectedEntries();

    if (
      selectedEntries.length < 2 ||
      selectedEntries.some((entry) => isNodeOrAncestorLocked(entry)) ||
      !selectedEntries.every((entry) => entry.node.type === "primitive")
    ) {
      updateSelectedPrimitiveControls();
      return;
    }

    const firstEntry = selectedEntries[0];
    const parent = firstEntry.parent;

    if (!selectedEntries.every((entry) => entry.parent === parent)) {
      updateSelectedPrimitiveControls();
      return;
    }

    const selectedIds = new Set(selectedEntries.map((entry) => entry.node.id));
    const siblings = parent ? parent.children : state.nodes;
    const children = siblings.filter((node) => selectedIds.has(node.id));

    if (children.length < 2) {
      return;
    }

    const group = createGroupNode(children, countGroups(state.nodes));

    state.undoStack.push(createHistorySnapshot(state));
    replaceSiblings(parent, groupSelectedSiblings(siblings, selectedIds, group));
    state.selectedNodeIds = [group.id];
    state.collapsedGroupIds = state.collapsedGroupIds.filter((id) => id !== group.id);
    state.redoStack = [];

    canvasView.render();
  }

  function ungroupSelection(): void {
    const selectedEntries = getSelectedEntries();

    const selectedEntry = selectedEntries[0];

    if (
      selectedEntries.length !== 1 ||
      !selectedEntry ||
      isNodeOrAncestorLocked(selectedEntry) ||
      selectedEntry.node.type !== "group"
    ) {
      updateSelectedPrimitiveControls();
      return;
    }

    const group = selectedEntry.node;

    if (group.children.length === 0) {
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));
    replaceSiblings(selectedEntry.parent, ungroupSiblings(getSiblings(selectedEntry.parent), group));
    state.selectedNodeIds = group.children.map((node) => node.id);
    state.collapsedGroupIds = state.collapsedGroupIds.filter((id) => id !== group.id);
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
    const selectedEntries = getSelectedEntries();

    if (selectedEntries.length === 0 || !isSameParentSelection(selectedEntries)) {
      updateSelectedPrimitiveControls();
      return;
    }

    const firstEntry = selectedEntries[0];

    if (!firstEntry) {
      return;
    }

    const parent = firstEntry.parent;
    const siblings = getSiblings(parent);

    if (siblings.length < 2) {
      updateSelectedPrimitiveControls();
      return;
    }

    const selectedIds = new Set(selectedEntries.map((entry) => entry.node.id));
    const selectedIndexes = selectedEntries.map((entry) => entry.index);
    const selectedNodes = siblings.filter((node) => selectedIds.has(node.id));
    const remainingNodes = siblings.filter((node) => !selectedIds.has(node.id));
    const nextIndex = getNextLayerIndex(selectedIndexes, remainingNodes.length, target);
    const nextNodes = insertNodes(remainingNodes, selectedNodes, nextIndex);

    if (arraysEqual(siblings, nextNodes)) {
      updateSelectedPrimitiveControls();
      return;
    }

    state.undoStack.push(createHistorySnapshot(state));
    replaceSiblings(parent, nextNodes);
    state.selectedNodeIds = selectedNodes.map((node) => node.id);
    state.redoStack = [];

    canvasView.render();
  }

  function moveNodeFromList(nodeId: string, direction: "up" | "down"): void {
    const entry = getNodeEntry(nodeId);

    if (!entry) {
      return;
    }

    const siblings = getSiblings(entry.parent);
    const offset = direction === "up" ? -1 : 1;
    const nextIndex = entry.index + offset;

    if (nextIndex < 0 || nextIndex >= siblings.length) {
      updateSelectedPrimitiveControls();
      return;
    }

    const nextSiblings = [...siblings];
    const currentNode = nextSiblings[entry.index];
    const swappedNode = nextSiblings[nextIndex];

    if (!currentNode || !swappedNode) {
      return;
    }

    nextSiblings[entry.index] = swappedNode;
    nextSiblings[nextIndex] = currentNode;

    state.undoStack.push(createHistorySnapshot(state));
    replaceSiblings(entry.parent, nextSiblings);
    state.selectedNodeIds = sortNodeIdsByTreeOrder(state.selectedNodeIds);
    state.redoStack = [];

    canvasView.render();
  }

  function updateSelectedPrimitiveControls(): void {
    const selectedPrimitives = getSelectedPrimitives();
    const selectedEntries = getSelectedEntries();
    const selectedIndexes = selectedEntries.map((entry) => entry.index);
    const firstEntry = selectedEntries[0];
    const siblings = firstEntry && isSameParentSelection(selectedEntries) ? getSiblings(firstEntry.parent) : [];
    const hasSelection = selectedPrimitives.length > 0;
    const isAtBack = selectedIndexes.every((index, position) => index === position);
    const frontStartIndex = siblings.length - selectedIndexes.length;
    const isAtFront = selectedIndexes.every((index, position) => index === frontStartIndex + position);
    const selectedGroupCount = selectedEntries.filter((entry) => entry.node.type === "group").length;
    const canEditSelectedEntries = selectedEntries.every((entry) => !isNodeOrAncestorLocked(entry));
    const canDelete = selectedEntries.some((entry) => !isNodeOrAncestorLocked(entry) && !hasLockedDescendant(entry.node));
    const canGroup =
      selectedEntries.length > 1 &&
      canEditSelectedEntries &&
      isSameParentSelection(selectedEntries) &&
      selectedEntries.every((entry) => entry.node.type === "primitive");
    const canUngroup = selectedEntries.length === 1 && canEditSelectedEntries && firstEntry?.node.type === "group";

    elements.flipHorizontalButton.disabled = !hasSelection;
    elements.flipVerticalButton.disabled = !hasSelection;
    elements.sendToBackButton.disabled = selectedEntries.length === 0 || !isSameParentSelection(selectedEntries) || isAtBack;
    elements.sendBackwardButton.disabled = selectedEntries.length === 0 || !isSameParentSelection(selectedEntries) || isAtBack;
    elements.bringForwardButton.disabled = selectedEntries.length === 0 || !isSameParentSelection(selectedEntries) || isAtFront;
    elements.bringToFrontButton.disabled = selectedEntries.length === 0 || !isSameParentSelection(selectedEntries) || isAtFront;
    elements.groupButton.disabled = !canGroup;
    elements.ungroupButton.disabled = !canUngroup;
    elements.copyPrimitiveButton.disabled = selectedEntries.length === 0;
    elements.deletePrimitiveButton.disabled = !canDelete;
    elements.pastePrimitiveButton.disabled = nodeClipboard.length === 0;
    elements.undoButton.disabled = state.undoStack.length === 0;
    elements.redoButton.disabled = state.redoStack.length === 0;

    if (selectedEntries.length === 0) {
      elements.selectionSummary.textContent = "Selected: none";
    } else if (selectedEntries.length === 1 && selectedGroupCount === 1) {
      elements.selectionSummary.textContent = "Selected: 1 group";
    } else if (selectedEntries.length === 1) {
      elements.selectionSummary.textContent = "Selected: 1 node";
    } else {
      elements.selectionSummary.textContent = `Selected: ${selectedEntries.length} nodes`;
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

  function insertNodes(nodes: SceneNode[], insertedNodes: SceneNode[], index: number): SceneNode[] {
    return [...nodes.slice(0, index), ...insertedNodes, ...nodes.slice(index)];
  }

  function arraysEqual(left: SceneNode[], right: SceneNode[]): boolean {
    return left.length === right.length && left.every((node, index) => node === right[index]);
  }

  function isCreateToolKind(tool: ToolKind): tool is CreateToolKind {
    return tool === "rect" || tool === "circle" || tool === "triangle";
  }

  function clampSelection(): void {
    const nodeIds = new Set(getSceneNodeEntries(state.nodes).map((entry) => entry.node.id));

    state.selectedNodeIds = state.selectedNodeIds.filter((nodeId) => nodeIds.has(nodeId));
  }

  function getSelectedNodes(): SceneNode[] {
    return getSelectedEntries().map((entry) => entry.node);
  }

  function getSelectedEditableNodes(): SceneNode[] {
    return getSelectedEntries().filter((entry) => !isNodeOrAncestorLocked(entry)).map((entry) => entry.node);
  }

  function getSelectedEntries(): SceneNodeEntry[] {
    const selectedIds = new Set(state.selectedNodeIds);

    return getSceneNodeEntries(state.nodes).filter((entry) => selectedIds.has(entry.node.id));
  }

  function getNodeEntry(nodeId: string): SceneNodeEntry | null {
    return getSceneNodeEntries(state.nodes).find((entry) => entry.node.id === nodeId) ?? null;
  }

  function sortNodeIdsByTreeOrder(nodeIds: string[]): string[] {
    const selectedIds = new Set(nodeIds);

    return getSceneNodeEntries(state.nodes).flatMap((entry) => (selectedIds.has(entry.node.id) ? [entry.node.id] : []));
  }

  function toggleGroupCollapsed(nodeId: string): void {
    const collapsedIds = new Set(state.collapsedGroupIds);

    if (collapsedIds.has(nodeId)) {
      collapsedIds.delete(nodeId);
    } else {
      collapsedIds.add(nodeId);
    }

    state.collapsedGroupIds = [...collapsedIds];
    renderPrimitiveList();
  }

  function isSameParentSelection(entries: readonly SceneNodeEntry[]): boolean {
    const firstEntry = entries[0];

    return firstEntry !== undefined && entries.every((entry) => entry.parent === firstEntry.parent);
  }

  function getSiblings(parent: GroupNode | null): SceneNode[] {
    return parent ? parent.children : state.nodes;
  }

  function replaceSiblings(parent: GroupNode | null, nextSiblings: SceneNode[]): void {
    if (parent) {
      parent.children = nextSiblings;
    } else {
      state.nodes = nextSiblings;
    }
  }

  function groupSelectedSiblings(siblings: readonly SceneNode[], selectedIds: ReadonlySet<string>, group: GroupNode): SceneNode[] {
    const groupedSiblings: SceneNode[] = [];
    let didInsertGroup = false;

    for (const node of siblings) {
      if (!selectedIds.has(node.id)) {
        groupedSiblings.push(node);
        continue;
      }

      if (!didInsertGroup) {
        groupedSiblings.push(group);
        didInsertGroup = true;
      }
    }

    return groupedSiblings;
  }

  function ungroupSiblings(siblings: readonly SceneNode[], group: GroupNode): SceneNode[] {
    return siblings.flatMap((node) => (node.id === group.id ? group.children : [node]));
  }

  function countGroups(nodes: readonly SceneNode[]): number {
    return nodes.reduce((count, node) => {
      return count + (node.type === "group" ? 1 + countGroups(node.children) : 0);
    }, 0);
  }

  function isNodeOrAncestorLocked(entry: SceneNodeEntry): boolean {
    if (entry.node.locked) {
      return true;
    }

    let parent = entry.parent;

    while (parent) {
      if (parent.locked) {
        return true;
      }

      const parentEntry = getNodeEntry(parent.id);
      parent = parentEntry?.parent ?? null;
    }

    return false;
  }

  function hasLockedDescendant(node: SceneNode): boolean {
    if (node.type === "primitive") {
      return false;
    }

    return node.children.some((child) => child.locked || hasLockedDescendant(child));
  }

  function syncExportOutputs(): void {
    elements.exportJsonOutput.value = buildJsonExport(state);
    elements.exportProcedureOutput.value = buildCExport(state);
  }

  function getActiveExportFormat(): "json" | "procedure" {
    return elements.exportJsonTab.classList.contains("is-active") ? "json" : "procedure";
  }

  function setActiveExportFormat(format: "json" | "procedure"): void {
    const isJson = format === "json";

    elements.exportJsonTab.classList.toggle("is-active", isJson);
    elements.exportJsonTab.ariaSelected = String(isJson);
    elements.exportProcedureTab.classList.toggle("is-active", !isJson);
    elements.exportProcedureTab.ariaSelected = String(!isJson);
    elements.exportJsonOutput.hidden = !isJson;
    elements.exportProcedureOutput.hidden = isJson;
  }

  function isCatPaintDocument(sprite: ParsedSprite | CatPaintDocument): sprite is CatPaintDocument {
    return "format" in sprite;
  }
}

function removeSelectedNodes(nodes: readonly SceneNode[], selectedIds: ReadonlySet<string>): SceneNode[] {
  const visit = (node: SceneNode): SceneNode | null => {
    if (selectedIds.has(node.id)) {
      return null;
    }

    if (node.type === "primitive") {
      return node;
    }

    const children = node.children.flatMap((child) => {
      const nextChild = visit(child);

      return nextChild ? [nextChild] : [];
    });

    if (children.length === 0) {
      return null;
    }

    return {
      ...node,
      children,
    };
  };

  return nodes.flatMap((node) => {
    const nextNode = visit(node);

    return nextNode ? [nextNode] : [];
  });
}
