import type { AppState } from "../app/AppState.js";
import { createHistorySnapshot } from "../app/AppState.js";
import {
  createPrimitiveNode,
  flattenNodes,
  getEditablePrimitiveNodeEntries,
  getPrimitiveCommandsForNode,
  getSceneNodeById,
} from "../document/CatPaintDocument.js";
import type { AppElements } from "../ui/elements.js";
import type { CreateToolKind, Point, Primitive, ToolKind } from "../primitives/Primitive.js";
import { createPrimitiveFromDrag } from "./primitiveFactory.js";
import { drawPrimitive } from "../primitives/drawPrimitive.js";
import { getCanvasContext } from "../ui/dom.js";
import { getSpritePoint } from "./pointer.js";

export type CanvasViewCallbacks = {
  onRender: () => void;
};

type InteractionMode =
  | "idle"
  | "creatingPrimitive"
  | "draggingPrimitives"
  | "draggingSelection"
  | "rotatingSelection"
  | "scalingSelection";

type RectBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type TransformPrimitiveStart = {
  nodeId: string;
  primitive: Primitive;
};

type TransformStart = {
  pivot: Point;
  angle: number;
  distance: number;
  primitives: TransformPrimitiveStart[];
};

type ClickCycleState = {
  point: Point;
  hitNodeIds: string[];
};

type CanvasCursor =
  | "default"
  | "grab"
  | "grabbing"
  | "not-allowed"
  | "crosshair"
  | "ew-resize"
  | "ns-resize"
  | "nwse-resize"
  | "nesw-resize";

type ScaleHandleHit = {
  cursor: CanvasCursor;
};

type PrimitiveHitTarget = {
  locked: boolean;
};

const CLICK_THRESHOLD_PX = 4;
const HANDLE_HIT_RADIUS_PX = 8;
const ROTATE_HANDLE_OFFSET_PX = 24;

export class CanvasView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly state: AppState;
  private readonly callbacks: CanvasViewCallbacks;
  private dragStart: Point | null = null;
  private draftPrimitive: Primitive | null = null;
  private moveStart: Point | null = null;
  private movePrimitiveStarts: Array<{ nodeId: string; point: Point }> = [];
  private selectionStart: Point | null = null;
  private selectionCurrent: Point | null = null;
  private isAddingToSelection = false;
  private interactionMode: InteractionMode = "idle";
  private isMovingPrimitive = false;
  private transformStart: TransformStart | null = null;
  private hasTransformedSelection = false;
  private pointerStartSpritePoint: Point | null = null;
  private pointerStartClientPoint: Point | null = null;
  private pointerStartHitNodeIds: string[] = [];
  private pointerStartSelectedNodeIds: string[] = [];
  private pointerStartShiftKey = false;
  private hasExceededClickThreshold = false;
  private clickCycleState: ClickCycleState | null = null;
  private hoverPoint: Point | null = null;
  private activeInteractionCursor: CanvasCursor | null = null;

  constructor(elements: AppElements, state: AppState, callbacks: CanvasViewCallbacks) {
    this.canvas = elements.canvas;
    this.ctx = getCanvasContext(elements.canvas);
    this.state = state;
    this.callbacks = callbacks;
  }

  bind(): void {
    window.addEventListener("resize", () => {
      this.setupCanvas();
      this.render();
    });

    this.canvas.addEventListener("pointerdown", (event) => {
      const point = this.getSpritePoint(event);
      this.hoverPoint = point;
      const topTarget = this.hitTestTopPrimitive(point);

      if (topTarget?.locked) {
        this.updateCursor();
        return;
      }

      this.canvas.setPointerCapture(event.pointerId);
      const hitNodeIds = this.hitTestAllPrimitives(point);

      if (this.state.activeTool === "rotate" || this.state.activeTool === "scale") {
        this.beginTransform(point, hitNodeIds);
        this.render();
        return;
      }

      if (isCreateToolKind(this.state.activeTool)) {
        this.beginPrimitiveCreation(point);
        return;
      }

      this.beginPointerPress(point, getClientPoint(event), hitNodeIds, event.shiftKey);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      this.hoverPoint = this.getSpritePoint(event);

      if (this.pointerStartSpritePoint && this.pointerStartClientPoint) {
        this.continuePointerPress(this.hoverPoint, getClientPoint(event));
        return;
      }

      if (this.interactionMode === "draggingPrimitives") {
        this.moveSelection(this.hoverPoint);
        return;
      }

      if (this.interactionMode === "draggingSelection") {
        this.selectionCurrent = this.hoverPoint;
        this.render();
        return;
      }

      if (this.interactionMode === "rotatingSelection") {
        this.rotateSelection(this.hoverPoint);
        return;
      }

      if (this.interactionMode === "scalingSelection") {
        this.scaleSelection(this.hoverPoint);
        return;
      }

      if (this.interactionMode !== "creatingPrimitive" || !this.dragStart) {
        this.updateCursor();
        return;
      }

      this.draftPrimitive = createPrimitiveFromDrag(this.state, this.dragStart, this.hoverPoint);
      this.render();
    });

    this.canvas.addEventListener("pointerup", (event) => {
      this.hoverPoint = this.getSpritePoint(event);

      if (this.pointerStartSpritePoint && this.pointerStartClientPoint) {
        this.endPointerPress(this.hoverPoint, getClientPoint(event));
        this.render();
        return;
      }

      if (this.interactionMode === "draggingPrimitives") {
        this.endSelectionMove();
        this.render();
        return;
      }

      if (this.interactionMode === "draggingSelection") {
        this.endBoxSelection();
        this.render();
        return;
      }

      if (this.interactionMode === "rotatingSelection" || this.interactionMode === "scalingSelection") {
        this.endTransform();
        this.render();
        return;
      }

      if (this.interactionMode !== "creatingPrimitive" || !this.dragStart) {
        return;
      }

      const primitive = createPrimitiveFromDrag(this.state, this.dragStart, this.hoverPoint);

      this.dragStart = null;
      this.draftPrimitive = null;
      this.interactionMode = "idle";
      this.activeInteractionCursor = null;

      if (!isDrawablePrimitive(primitive)) {
        this.interactionMode = "idle";
        this.activeInteractionCursor = null;
        this.render();
        return;
      }

      this.state.undoStack.push(createHistorySnapshot(this.state));
      this.state.nodes.push(createPrimitiveNode(primitive, getEditablePrimitiveNodeEntries(this.state.nodes).length));
      this.state.redoStack = [];
      this.render();
    });

    this.canvas.addEventListener("pointerleave", () => {
      if (this.hasActiveInteraction()) {
        this.updateCursor();
        return;
      }

      this.hoverPoint = null;
      this.updateCursor();
    });

    this.canvas.addEventListener("pointercancel", () => {
      this.resetInteraction();
      this.render();
    });
  }

  setupCanvas(): void {
    const workspace = this.canvas.parentElement;

    if (!workspace) {
      return;
    }

    const maxWidth = Math.max(128, workspace.clientWidth - 48);
    const maxHeight = Math.max(128, workspace.clientHeight - 48);
    const scale = Math.min(maxWidth / this.state.spriteWidth, maxHeight / this.state.spriteHeight);
    const displayWidth = Math.max(128, this.state.spriteWidth * scale);
    const displayHeight = Math.max(128, this.state.spriteHeight * scale);

    this.canvas.width = this.state.spriteWidth;
    this.canvas.height = this.state.spriteHeight;

    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;
  }

  render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawCheckerboard();
    this.drawGrid();

    for (const primitive of flattenNodes(this.state.nodes)) {
      drawPrimitive(this.ctx, primitive);
    }

    if (this.draftPrimitive) {
      drawPrimitive(this.ctx, this.draftPrimitive);
    }

    this.drawSelectionBox();
    this.drawSelection();
    this.updateCursor();
    this.callbacks.onRender();
  }

  refreshCursor(): void {
    this.updateCursor();
  }

  hitTestAllPrimitives(point: Point): string[] {
    const hitNodeIds: string[] = [];
    const topTarget = this.hitTestTopPrimitive(point);

    if (topTarget?.locked) {
      return hitNodeIds;
    }

    const entries = getEditablePrimitiveNodeEntries(this.state.nodes).filter((entry) => !entry.locked);

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (isPointInPrimitive(point, entries[index].command)) {
        hitNodeIds.push(entries[index].node.id);
      }
    }

    return hitNodeIds;
  }

  private fillTopmostPrimitive(hitNodeIds: string[]): void {
    const primitive = getEditableCommand(this.state, hitNodeIds[0]);

    if (!primitive || (primitive.color === this.state.color && primitive.alpha === this.state.alpha)) {
      return;
    }

    this.state.undoStack.push(createHistorySnapshot(this.state));
    primitive.color = this.state.color;
    primitive.alpha = this.state.alpha;
    this.state.redoStack = [];
    this.render();
  }

  private beginTransform(point: Point, hitNodeIds: string[]): void {
    this.resetInteraction();

    if (this.state.selectedNodeIds.length === 0 && hitNodeIds.length > 0) {
      const firstHitNodeId = hitNodeIds[0];

      if (firstHitNodeId) {
        this.state.selectedNodeIds = [firstHitNodeId];
      }
    }

    const selectedStarts = getSelectedEditablePrimitiveStarts(this.state);

    if (selectedStarts.length === 0) {
      return;
    }

    const bounds = getPrimitivesBounds(selectedStarts.map((start) => start.primitive));

    if (!bounds) {
      return;
    }

    const pivot = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    const dx = point.x - pivot.x;
    const dy = point.y - pivot.y;

    this.transformStart = {
      pivot,
      angle: Math.atan2(dy, dx),
      distance: Math.hypot(dx, dy),
      primitives: selectedStarts.map((start) => ({ nodeId: start.nodeId, primitive: { ...start.primitive } })),
    };
    this.interactionMode = this.state.activeTool === "rotate" ? "rotatingSelection" : "scalingSelection";
    this.activeInteractionCursor = this.getTransformCursor(point);
    this.hasTransformedSelection = false;
    this.updateCursor();
  }

  private beginPrimitiveCreation(point: Point): void {
    this.resetInteraction();
    this.interactionMode = "creatingPrimitive";
    this.activeInteractionCursor = "crosshair";
    this.dragStart = point;
    this.draftPrimitive = null;
    this.state.selectedNodeIds = [];
    this.updateCursor();
  }

  private beginBoxSelection(point: Point, isAddingToSelection: boolean): void {
    this.resetInteraction();
    this.interactionMode = "draggingSelection";
    this.activeInteractionCursor = "crosshair";
    this.selectionStart = point;
    this.selectionCurrent = point;
    this.isAddingToSelection = isAddingToSelection;

    if (!isAddingToSelection) {
      this.state.selectedNodeIds = [];
    }
  }

  private beginPointerPress(point: Point, clientPoint: Point, hitNodeIds: string[], isRangeSelection: boolean): void {
    this.resetInteraction();
    this.pointerStartSpritePoint = point;
    this.pointerStartClientPoint = clientPoint;
    this.pointerStartHitNodeIds = hitNodeIds;
    this.pointerStartSelectedNodeIds = [...this.state.selectedNodeIds];
    this.pointerStartShiftKey = isRangeSelection;
    this.hasExceededClickThreshold = false;
  }

  private continuePointerPress(point: Point, clientPoint: Point): void {
    if (!this.pointerStartSpritePoint || !this.pointerStartClientPoint) {
      return;
    }

    if (!this.hasExceededClickThreshold) {
      const distance = getDistance(clientPoint, this.pointerStartClientPoint);

      if (distance <= CLICK_THRESHOLD_PX) {
        return;
      }

      this.hasExceededClickThreshold = true;

      if (this.pointerStartHitNodeIds.length === 0 && this.state.activeTool !== "fill") {
        this.beginBoxSelection(this.pointerStartSpritePoint, this.pointerStartShiftKey);
        this.selectionCurrent = point;
        this.render();
        return;
      }

      if (
        this.state.activeTool !== "fill" &&
        this.canDragSelectionFromHits(this.pointerStartHitNodeIds, this.pointerStartSelectedNodeIds)
      ) {
        this.beginSelectionDrag(this.pointerStartSpritePoint, this.pointerStartSelectedNodeIds);
      }
    }

    if (this.interactionMode === "draggingPrimitives") {
      this.moveSelection(point);
    } else if (this.interactionMode === "draggingSelection") {
      this.selectionCurrent = point;
      this.render();
    }
  }

  private endPointerPress(point: Point, clientPoint: Point): void {
    if (!this.pointerStartClientPoint) {
      this.clearPointerPress();
      return;
    }

    const isClick = !this.hasExceededClickThreshold && getDistance(clientPoint, this.pointerStartClientPoint) <= CLICK_THRESHOLD_PX;

    if (this.interactionMode === "draggingPrimitives") {
      this.endSelectionMove();
      this.clearPointerPress();
      return;
    }

    if (this.interactionMode === "draggingSelection") {
      this.endBoxSelection();
      this.clearPointerPress();
      return;
    }

    if (isClick) {
      if (this.state.activeTool === "fill") {
        this.fillTopmostPrimitive(this.hitTestAllPrimitives(point));
      } else {
        this.selectCanvasClick(point, this.pointerStartShiftKey);
      }
    } else {
      this.clickCycleState = null;
    }

    this.clearPointerPress();
  }

  private selectCanvasClick(point: Point, isRangeSelection: boolean): void {
    const hitNodeIds = this.hitTestAllPrimitives(point);

    if (hitNodeIds.length === 0) {
      if (!isRangeSelection) {
        this.state.selectedNodeIds = [];
      }

      this.clickCycleState = null;
      return;
    }

    if (isRangeSelection) {
      const selectedNodeId = hitNodeIds[0];

      if (!selectedNodeId) {
        return;
      }

      const selectedIds = new Set(this.state.selectedNodeIds);

      if (selectedIds.has(selectedNodeId)) {
        selectedIds.delete(selectedNodeId);
      } else {
        selectedIds.add(selectedNodeId);
      }

      this.state.selectedNodeIds = [...selectedIds];
      this.clickCycleState = null;
      return;
    }

    const selectedNodeId = this.getClickCycleSelection(point, hitNodeIds);

    if (selectedNodeId) {
      this.state.selectedNodeIds = [selectedNodeId];
    }
  }

  private getClickCycleSelection(point: Point, hitNodeIds: string[]): string | null {
    const shouldCycle =
      this.clickCycleState !== null &&
      getDistance(point, this.clickCycleState.point) <= getSpriteClickThreshold(this.canvas) &&
      arraysEqual(hitNodeIds, this.clickCycleState.hitNodeIds);
    const selectedNodeId = this.state.selectedNodeIds.length === 1 ? this.state.selectedNodeIds[0] : null;
    const selectedIndex = selectedNodeId === null ? -1 : hitNodeIds.indexOf(selectedNodeId);
    const nextIndex = shouldCycle && selectedIndex !== -1 ? (selectedIndex + 1) % hitNodeIds.length : 0;

    this.clickCycleState = {
      point,
      hitNodeIds: [...hitNodeIds],
    };

    return hitNodeIds[nextIndex] ?? null;
  }

  private canDragSelectionFromHits(hitNodeIds: readonly string[], selectedNodeIds: readonly string[]): boolean {
    const selectedEditableIds = new Set(
      getSelectedEditablePrimitiveStarts(this.state, selectedNodeIds).map((start) => start.nodeId),
    );

    return hitNodeIds.some((nodeId) => selectedEditableIds.has(nodeId));
  }

  private beginSelectionDrag(point: Point, selectedNodeIds: readonly string[]): void {
    this.dragStart = null;
    this.draftPrimitive = null;
    this.moveStart = point;
    this.movePrimitiveStarts = getSelectedEditablePrimitiveStarts(this.state, selectedNodeIds).map(({ nodeId, primitive }) => {
      return { nodeId, point: { x: primitive.x, y: primitive.y } };
    });
    this.isMovingPrimitive = false;
    this.interactionMode = "draggingPrimitives";
    this.activeInteractionCursor = "grabbing";
    this.updateCursor();
  }

  private clearPointerPress(): void {
    this.pointerStartSpritePoint = null;
    this.pointerStartClientPoint = null;
    this.pointerStartHitNodeIds = [];
    this.pointerStartSelectedNodeIds = [];
    this.pointerStartShiftKey = false;
    this.hasExceededClickThreshold = false;
  }

  private moveSelection(point: Point): void {
    if (this.moveStart === null || this.movePrimitiveStarts.length === 0) {
      return;
    }

    const dx = point.x - this.moveStart.x;
    const dy = point.y - this.moveStart.y;

    if (!this.isMovingPrimitive) {
      if (Math.hypot(dx, dy) <= 2) {
        return;
      }

      this.state.undoStack.push(createHistorySnapshot(this.state));
      this.state.redoStack = [];
      this.isMovingPrimitive = true;
    }

    for (const start of this.movePrimitiveStarts) {
      const primitive = getEditableCommand(this.state, start.nodeId);

      if (!primitive) {
        continue;
      }

      primitive.x = start.point.x + dx;
      primitive.y = start.point.y + dy;
    }

    this.render();
  }

  private rotateSelection(point: Point): void {
    if (!this.transformStart) {
      return;
    }

    const dx = point.x - this.transformStart.pivot.x;
    const dy = point.y - this.transformStart.pivot.y;
    const delta = Math.atan2(dy, dx) - this.transformStart.angle;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);

    this.ensureTransformHistory();

    for (const start of this.transformStart.primitives) {
      const primitive = getEditableCommand(this.state, start.nodeId);

      if (!primitive) {
        continue;
      }

      const offsetX = start.primitive.x - this.transformStart.pivot.x;
      const offsetY = start.primitive.y - this.transformStart.pivot.y;
      primitive.x = Math.round(this.transformStart.pivot.x + offsetX * cos - offsetY * sin);
      primitive.y = Math.round(this.transformStart.pivot.y + offsetX * sin + offsetY * cos);
      primitive.rotation = start.primitive.rotation + delta;
    }

    this.render();
  }

  private scaleSelection(point: Point): void {
    if (!this.transformStart || this.transformStart.distance < 0.001) {
      return;
    }

    const distance = Math.hypot(point.x - this.transformStart.pivot.x, point.y - this.transformStart.pivot.y);
    const factor = distance / this.transformStart.distance;

    if (!Number.isFinite(factor) || factor <= 0) {
      return;
    }

    for (const start of this.transformStart.primitives) {
      const nextW = Math.round(start.primitive.w * factor);
      const nextH = start.primitive.kind === "circle" ? start.primitive.h : Math.round(start.primitive.h * factor);

      if (nextW < 1 || (start.primitive.kind !== "circle" && nextH < 1)) {
        return;
      }
    }

    this.ensureTransformHistory();

    for (const start of this.transformStart.primitives) {
      const primitive = getEditableCommand(this.state, start.nodeId);

      if (!primitive) {
        continue;
      }

      primitive.x = Math.round(
        this.transformStart.pivot.x + (start.primitive.x - this.transformStart.pivot.x) * factor,
      );
      primitive.y = Math.round(
        this.transformStart.pivot.y + (start.primitive.y - this.transformStart.pivot.y) * factor,
      );
      primitive.w = Math.max(1, Math.round(start.primitive.w * factor));

      if (primitive.kind !== "circle") {
        primitive.h = Math.max(1, Math.round(start.primitive.h * factor));
      }
    }

    this.render();
  }

  private ensureTransformHistory(): void {
    if (this.hasTransformedSelection) {
      return;
    }

    this.state.undoStack.push(createHistorySnapshot(this.state));
    this.state.redoStack = [];
    this.hasTransformedSelection = true;
  }

  private endSelectionMove(): void {
    this.moveStart = null;
    this.movePrimitiveStarts = [];
    this.interactionMode = "idle";
    this.isMovingPrimitive = false;
    this.activeInteractionCursor = null;
  }

  private endBoxSelection(): void {
    if (!this.selectionStart || !this.selectionCurrent) {
      this.resetInteraction();
      return;
    }

    const selectionBounds = normalizeBounds(this.selectionStart, this.selectionCurrent);
    const selectedIds = getEditablePrimitiveNodeEntries(this.state.nodes).flatMap((entry) => {
      return !entry.locked && boundsIntersect(selectionBounds, getPrimitiveBounds(entry.command)) ? [entry.node.id] : [];
    });

    if (this.isAddingToSelection) {
      this.state.selectedNodeIds = [...new Set([...this.state.selectedNodeIds, ...selectedIds])];
    } else {
      this.state.selectedNodeIds = selectedIds;
    }

    this.resetInteraction();
  }

  private endTransform(): void {
    this.resetInteraction();
  }

  private resetInteraction(): void {
    this.dragStart = null;
    this.draftPrimitive = null;
    this.moveStart = null;
    this.movePrimitiveStarts = [];
    this.selectionStart = null;
    this.selectionCurrent = null;
    this.isAddingToSelection = false;
    this.interactionMode = "idle";
    this.isMovingPrimitive = false;
    this.transformStart = null;
    this.hasTransformedSelection = false;
    this.activeInteractionCursor = null;
    this.clearPointerPress();
  }

  private updateCursor(): void {
    this.canvas.style.cursor = this.calculateCursor();
  }

  private calculateCursor(): CanvasCursor {
    if (this.activeInteractionCursor && this.hasActiveInteraction()) {
      return this.activeInteractionCursor;
    }

    if (!this.hoverPoint) {
      return "default";
    }

    const lockedTarget = this.hitTestTopPrimitive(this.hoverPoint);

    if (lockedTarget?.locked) {
      return "not-allowed";
    }

    if (this.state.activeTool === "rotate") {
      return this.isOverRotateHandle(this.hoverPoint) ? "crosshair" : "default";
    }

    if (this.state.activeTool === "scale") {
      return this.hitTestScaleHandle(this.hoverPoint)?.cursor ?? "default";
    }

    if (this.state.activeTool !== null && this.state.activeTool !== "fill") {
      return "crosshair";
    }

    const hitNodeIds = this.hitTestAllPrimitives(this.hoverPoint);

    if (this.state.activeTool === "fill") {
      return hitNodeIds.length > 0 ? "crosshair" : "default";
    }

    if (this.canDragSelectionFromHits(hitNodeIds, this.state.selectedNodeIds)) {
      return "grab";
    }

    return hitNodeIds.length > 0 ? "grab" : "default";
  }

  private hasActiveInteraction(): boolean {
    return this.interactionMode !== "idle" || this.pointerStartSpritePoint !== null;
  }

  private getTransformCursor(point: Point): CanvasCursor {
    if (this.state.activeTool === "rotate") {
      return "crosshair";
    }

    return this.hitTestScaleHandle(point)?.cursor ?? "nwse-resize";
  }

  private hitTestTopPrimitive(point: Point): PrimitiveHitTarget | null {
    const entries = getEditablePrimitiveNodeEntries(this.state.nodes);

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];

      if (isPointInPrimitive(point, entry.command)) {
        return { locked: entry.locked };
      }
    }

    return null;
  }

  private hitTestScaleHandle(point: Point): ScaleHandleHit | null {
    const bounds = this.getSelectedBounds();

    if (!bounds) {
      return null;
    }

    const radius = getSpriteHandleRadius(this.canvas);
    const handles: Array<{ point: Point; cursor: CanvasCursor }> = [
      { point: { x: bounds.minX, y: bounds.minY }, cursor: "nwse-resize" },
      { point: { x: bounds.maxX, y: bounds.minY }, cursor: "nesw-resize" },
      { point: { x: bounds.minX, y: bounds.maxY }, cursor: "nesw-resize" },
      { point: { x: bounds.maxX, y: bounds.maxY }, cursor: "nwse-resize" },
      { point: { x: bounds.minX, y: (bounds.minY + bounds.maxY) / 2 }, cursor: "ew-resize" },
      { point: { x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2 }, cursor: "ew-resize" },
      { point: { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY }, cursor: "ns-resize" },
      { point: { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY }, cursor: "ns-resize" },
    ];

    for (const handle of handles) {
      if (getDistance(point, handle.point) <= radius) {
        return { cursor: handle.cursor };
      }
    }

    return null;
  }

  private isOverRotateHandle(point: Point): boolean {
    const bounds = this.getSelectedBounds();

    if (!bounds) {
      return false;
    }

    const handle = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: bounds.minY - getSpriteRotateHandleOffset(this.canvas),
    };

    return getDistance(point, handle) <= getSpriteHandleRadius(this.canvas);
  }

  private getSelectedBounds(): RectBounds | null {
    const selectedPrimitives = getSelectedEditablePrimitiveStarts(this.state);

    return getPrimitivesBounds(selectedPrimitives.map((selectedPrimitive) => selectedPrimitive.primitive));
  }

  private drawSelection(): void {
    const selectedPrimitives = getSelectedEditablePrimitiveStarts(this.state);

    if (selectedPrimitives.length === 0) {
      return;
    }

    for (const selectedPrimitive of selectedPrimitives) {
      this.drawPrimitiveSelection(selectedPrimitive.primitive);
    }

    if (selectedPrimitives.length > 1) {
      this.drawGroupSelection(selectedPrimitives.map((selectedPrimitive) => selectedPrimitive.primitive));
    }
  }

  private drawSelectionBox(): void {
    if (this.interactionMode !== "draggingSelection" || !this.selectionStart || !this.selectionCurrent) {
      return;
    }

    const bounds = normalizeBounds(this.selectionStart, this.selectionCurrent);

    this.ctx.save();
    this.ctx.fillStyle = "rgb(255 180 84 / 0.12)";
    this.ctx.strokeStyle = "#ffb454";
    this.ctx.lineWidth = 1.5 / this.getCanvasScale();
    this.ctx.setLineDash([5 / this.getCanvasScale(), 4 / this.getCanvasScale()]);
    this.ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    this.ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    this.ctx.restore();
  }

  private drawPrimitiveSelection(primitive: Primitive): void {
    const inset = 1 / this.getCanvasScale();

    this.ctx.save();
    this.ctx.translate(primitive.x, primitive.y);
    this.ctx.rotate(primitive.rotation);
    this.ctx.strokeStyle = "#2563eb";
    this.ctx.lineWidth = 2 / this.getCanvasScale();
    this.ctx.setLineDash([4 / this.getCanvasScale(), 3 / this.getCanvasScale()]);

    if (primitive.kind === "circle") {
      this.ctx.beginPath();
      this.ctx.arc(0, 0, primitive.w + inset, 0, Math.PI * 2);
      this.ctx.stroke();
    } else {
      this.ctx.strokeRect(
        -primitive.w / 2 - inset,
        -primitive.h / 2 - inset,
        primitive.w + inset * 2,
        primitive.h + inset * 2,
      );
    }

    this.ctx.restore();
  }

  private drawGroupSelection(primitives: Primitive[]): void {
    const bounds = getPrimitivesBounds(primitives);

    if (!bounds) {
      return;
    }

    const inset = 3 / this.getCanvasScale();

    this.ctx.save();
    this.ctx.strokeStyle = "#0f766e";
    this.ctx.lineWidth = 1.5 / this.getCanvasScale();
    this.ctx.setLineDash([6 / this.getCanvasScale(), 4 / this.getCanvasScale()]);
    this.ctx.strokeRect(
      bounds.minX - inset,
      bounds.minY - inset,
      bounds.maxX - bounds.minX + inset * 2,
      bounds.maxY - bounds.minY + inset * 2,
    );
    this.ctx.restore();
  }

  private drawCheckerboard(): void {
    const cellSize = Math.max(2, Math.min(this.state.spriteWidth, this.state.spriteHeight) / 16);

    for (let y = 0; y < this.state.spriteHeight; y += cellSize) {
      for (let x = 0; x < this.state.spriteWidth; x += cellSize) {
        const even = (x / cellSize + y / cellSize) % 2 === 0;
        this.ctx.fillStyle = even ? "#ffffff" : "#e7e7e7";
        this.ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  private drawGrid(): void {
    const step = Math.max(4, Math.min(this.state.spriteWidth, this.state.spriteHeight) / 8);

    this.ctx.save();
    this.ctx.strokeStyle = "rgb(0 0 0 / 0.12)";
    this.ctx.lineWidth = 1 / this.getCanvasScale();

    for (let x = 0; x <= this.state.spriteWidth; x += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.state.spriteHeight);
      this.ctx.stroke();
    }

    for (let y = 0; y <= this.state.spriteHeight; y += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.state.spriteWidth, y);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private getSpritePoint(event: PointerEvent): Point {
    return getSpritePoint(this.canvas, this.state.spriteWidth, this.state.spriteHeight, event);
  }

  private getCanvasScale(): number {
    const rect = this.canvas.getBoundingClientRect();
    return rect.width / this.canvas.width;
  }
}

function isDrawablePrimitive(primitive: Primitive): boolean {
  if (primitive.kind === "circle") {
    return primitive.w > 0;
  }

  return primitive.w > 0 && primitive.h > 0;
}

function getClientPoint(event: PointerEvent): Point {
  return {
    x: event.clientX,
    y: event.clientY,
  };
}

function getDistance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function getSpriteClickThreshold(canvas: HTMLCanvasElement): number {
  return getSpriteDistance(canvas, CLICK_THRESHOLD_PX);
}

function getSpriteHandleRadius(canvas: HTMLCanvasElement): number {
  return getSpriteDistance(canvas, HANDLE_HIT_RADIUS_PX);
}

function getSpriteRotateHandleOffset(canvas: HTMLCanvasElement): number {
  return getSpriteDistance(canvas, ROTATE_HANDLE_OFFSET_PX);
}

function getSpriteDistance(canvas: HTMLCanvasElement, pixels: number): number {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / canvas.width;

  if (!Number.isFinite(scale) || scale <= 0) {
    return pixels;
  }

  return pixels / scale;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getEditableCommand(state: AppState, nodeId: string | undefined): Primitive | null {
  if (!nodeId) {
    return null;
  }

  const entry = getEditablePrimitiveNodeEntries(state.nodes).find((primitiveEntry) => {
    return primitiveEntry.node.id === nodeId && !primitiveEntry.locked;
  });

  return entry?.command ?? null;
}

function getSelectedEditablePrimitiveStarts(
  state: AppState,
  selectedNodeIds: readonly string[] = state.selectedNodeIds,
): TransformPrimitiveStart[] {
  const selectedIds = new Set(selectedNodeIds);
  const seenCommands = new Set<Primitive>();
  const starts: TransformPrimitiveStart[] = [];

  for (const nodeId of selectedIds) {
    const node = getSceneNodeById(state.nodes, nodeId);

    if (!node) {
      continue;
    }

    for (const command of getPrimitiveCommandsForNode(node)) {
      const editableEntry = getEditablePrimitiveNodeEntries(state.nodes).find((entry) => entry.command === command);

      if (editableEntry && !editableEntry.locked && !seenCommands.has(command)) {
        seenCommands.add(command);
        starts.push({ nodeId: editableEntry.node.id, primitive: command });
      }
    }
  }

  return starts;
}

function isPointInPrimitive(point: Point, primitive: Primitive): boolean {
  const localPoint = toPrimitiveLocalPoint(point, primitive);

  if (primitive.kind === "circle") {
    return Math.hypot(localPoint.x, localPoint.y) <= primitive.w;
  }

  return (
    localPoint.x >= -primitive.w / 2 &&
    localPoint.x <= primitive.w / 2 &&
    localPoint.y >= -primitive.h / 2 &&
    localPoint.y <= primitive.h / 2
  );
}

function toPrimitiveLocalPoint(point: Point, primitive: Primitive): Point {
  const dx = point.x - primitive.x;
  const dy = point.y - primitive.y;
  const cos = Math.cos(-primitive.rotation);
  const sin = Math.sin(-primitive.rotation);

  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
}

function getPrimitivesBounds(primitives: Primitive[]): RectBounds | null {
  if (primitives.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const primitive of primitives) {
    const bounds = getPrimitiveBounds(primitive);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  return { minX, minY, maxX, maxY };
}

function getPrimitiveBounds(primitive: Primitive): RectBounds {
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

function isCreateToolKind(tool: ToolKind): tool is CreateToolKind {
  return tool === "rect" || tool === "circle" || tool === "triangle";
}

function normalizeBounds(start: Point, end: Point): RectBounds {
  return {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y),
  };
}

function boundsIntersect(left: RectBounds, right: RectBounds): boolean {
  return left.minX <= right.maxX && left.maxX >= right.minX && left.minY <= right.maxY && left.maxY >= right.minY;
}
