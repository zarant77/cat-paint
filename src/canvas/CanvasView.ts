import type { AppState } from "../app/AppState.js";
import { createHistorySnapshot } from "../app/AppState.js";
import type { AppElements } from "../ui/elements.js";
import type { Point, Primitive } from "../primitives/Primitive.js";
import { createPrimitiveFromDrag } from "./primitiveFactory.js";
import { drawPrimitive } from "../primitives/drawPrimitive.js";
import { getCanvasContext } from "../ui/dom.js";
import { getSpritePoint } from "./pointer.js";

export type CanvasViewCallbacks = {
  onRender: () => void;
};

type InteractionMode = "idle" | "creatingPrimitive" | "draggingPrimitives" | "draggingSelection";

type RectBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export class CanvasView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly state: AppState;
  private readonly callbacks: CanvasViewCallbacks;
  private dragStart: Point | null = null;
  private draftPrimitive: Primitive | null = null;
  private moveStart: Point | null = null;
  private movePrimitiveStarts: Array<{ index: number; point: Point }> = [];
  private pendingSingleSelectionIndex: number | null = null;
  private selectionStart: Point | null = null;
  private selectionCurrent: Point | null = null;
  private isAddingToSelection = false;
  private interactionMode: InteractionMode = "idle";
  private isMovingPrimitive = false;

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
      this.canvas.setPointerCapture(event.pointerId);
      const point = this.getSpritePoint(event);
      const hitIndexes = this.hitTestAllPrimitives(point);

      if (hitIndexes.length > 0) {
        this.beginSelection(point, event.shiftKey, hitIndexes);
        this.render();
        return;
      }

      if (this.state.activeTool !== null) {
        this.beginPrimitiveCreation(point);
        return;
      }

      this.beginBoxSelection(point, event.shiftKey);
      this.render();
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (this.interactionMode === "draggingPrimitives") {
        this.moveSelection(this.getSpritePoint(event));
        return;
      }

      if (this.interactionMode === "draggingSelection") {
        this.selectionCurrent = this.getSpritePoint(event);
        this.render();
        return;
      }

      if (this.interactionMode !== "creatingPrimitive" || !this.dragStart) {
        return;
      }

      const current = this.getSpritePoint(event);
      this.draftPrimitive = createPrimitiveFromDrag(this.state, this.dragStart, current);
      this.render();
    });

    this.canvas.addEventListener("pointerup", (event) => {
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

      if (this.interactionMode !== "creatingPrimitive" || !this.dragStart) {
        return;
      }

      const current = this.getSpritePoint(event);
      const primitive = createPrimitiveFromDrag(this.state, this.dragStart, current);

      this.dragStart = null;
      this.draftPrimitive = null;
      this.interactionMode = "idle";

      if (!isDrawablePrimitive(primitive)) {
        this.interactionMode = "idle";
        this.render();
        return;
      }

      this.state.undoStack.push(createHistorySnapshot(this.state));
      this.state.primitives.push(primitive);
      this.state.redoStack = [];
      this.render();
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

    for (const primitive of this.state.primitives) {
      drawPrimitive(this.ctx, primitive);
    }

    if (this.draftPrimitive) {
      drawPrimitive(this.ctx, this.draftPrimitive);
    }

    this.drawSelectionBox();
    this.drawSelection();
    this.callbacks.onRender();
  }

  hitTestAllPrimitives(point: Point): number[] {
    const hitIndexes: number[] = [];

    for (let index = this.state.primitives.length - 1; index >= 0; index -= 1) {
      if (isPointInPrimitive(point, this.state.primitives[index])) {
        hitIndexes.push(index);
      }
    }

    return hitIndexes;
  }

  private beginPrimitiveCreation(point: Point): void {
    this.resetInteraction();
    this.interactionMode = "creatingPrimitive";
    this.dragStart = point;
    this.draftPrimitive = null;
    this.state.selectedPrimitiveIndexes = [];
  }

  private beginBoxSelection(point: Point, isAddingToSelection: boolean): void {
    this.resetInteraction();
    this.interactionMode = "draggingSelection";
    this.selectionStart = point;
    this.selectionCurrent = point;
    this.isAddingToSelection = isAddingToSelection;

    if (!isAddingToSelection) {
      this.state.selectedPrimitiveIndexes = [];
    }
  }

  private beginSelection(point: Point, isRangeSelection: boolean, hitIndexes: number[]): void {
    this.dragStart = null;
    this.draftPrimitive = null;
    this.moveStart = null;
    this.movePrimitiveStarts = [];
    this.pendingSingleSelectionIndex = null;
    this.isMovingPrimitive = false;
    this.interactionMode = "draggingPrimitives";

    if (hitIndexes.length === 0) {
      this.state.selectedPrimitiveIndexes = [];
      return;
    }

    if (isRangeSelection) {
      const selectedIndex = hitIndexes[0];
      const selectedIndexes = new Set(this.state.selectedPrimitiveIndexes);

      if (selectedIndexes.has(selectedIndex)) {
        selectedIndexes.delete(selectedIndex);
      } else {
        selectedIndexes.add(selectedIndex);
      }

      this.state.selectedPrimitiveIndexes = sortIndexes([...selectedIndexes]);
      this.interactionMode = "idle";
      return;
    }

    const selectedHitIndex = hitIndexes.find((index) => this.state.selectedPrimitiveIndexes.includes(index));
    const currentIndex = this.state.selectedPrimitiveIndexes.length === 1 ? this.state.selectedPrimitiveIndexes[0] : null;
    const hitPosition = currentIndex === null ? -1 : hitIndexes.indexOf(currentIndex);
    const selectedIndex =
      selectedHitIndex === undefined || this.state.selectedPrimitiveIndexes.length === 1
        ? hitIndexes[hitPosition === -1 ? 0 : (hitPosition + 1) % hitIndexes.length]
        : selectedHitIndex;

    if (!this.state.selectedPrimitiveIndexes.includes(selectedIndex)) {
      this.state.selectedPrimitiveIndexes = [selectedIndex];
    } else if (this.state.selectedPrimitiveIndexes.length > 1) {
      this.pendingSingleSelectionIndex = selectedIndex;
    }

    this.moveStart = point;
    this.movePrimitiveStarts = this.state.selectedPrimitiveIndexes.flatMap((index) => {
      const primitive = this.state.primitives[index];

      if (!primitive) {
        return [];
      }

      return [{ index, point: { x: primitive.x, y: primitive.y } }];
    });
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
      this.pendingSingleSelectionIndex = null;
      this.isMovingPrimitive = true;
    }

    for (const start of this.movePrimitiveStarts) {
      const primitive = this.state.primitives[start.index];

      if (!primitive) {
        continue;
      }

      primitive.x = start.point.x + dx;
      primitive.y = start.point.y + dy;
    }

    this.render();
  }

  private endSelectionMove(): void {
    if (!this.isMovingPrimitive && this.pendingSingleSelectionIndex !== null) {
      this.state.selectedPrimitiveIndexes = [this.pendingSingleSelectionIndex];
    }

    this.moveStart = null;
    this.movePrimitiveStarts = [];
    this.pendingSingleSelectionIndex = null;
    this.interactionMode = "idle";
    this.isMovingPrimitive = false;
  }

  private endBoxSelection(): void {
    if (!this.selectionStart || !this.selectionCurrent) {
      this.resetInteraction();
      return;
    }

    const selectionBounds = normalizeBounds(this.selectionStart, this.selectionCurrent);
    const selectedIndexes = this.state.primitives.flatMap((primitive, index) => {
      return boundsIntersect(selectionBounds, getPrimitiveBounds(primitive)) ? [index] : [];
    });

    if (this.isAddingToSelection) {
      this.state.selectedPrimitiveIndexes = sortIndexes([...this.state.selectedPrimitiveIndexes, ...selectedIndexes]);
    } else {
      this.state.selectedPrimitiveIndexes = selectedIndexes;
    }

    this.resetInteraction();
  }

  private resetInteraction(): void {
    this.dragStart = null;
    this.draftPrimitive = null;
    this.moveStart = null;
    this.movePrimitiveStarts = [];
    this.pendingSingleSelectionIndex = null;
    this.selectionStart = null;
    this.selectionCurrent = null;
    this.isAddingToSelection = false;
    this.interactionMode = "idle";
    this.isMovingPrimitive = false;
  }

  private drawSelection(): void {
    const selectedIndexes = this.state.selectedPrimitiveIndexes.filter((index) => this.state.primitives[index]);

    if (selectedIndexes.length === 0) {
      return;
    }

    for (const selectedIndex of selectedIndexes) {
      this.drawPrimitiveSelection(this.state.primitives[selectedIndex]);
    }

    if (selectedIndexes.length > 1) {
      this.drawGroupSelection(selectedIndexes);
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

  private drawGroupSelection(selectedIndexes: number[]): void {
    const bounds = getPrimitivesBounds(selectedIndexes.map((index) => this.state.primitives[index]));

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

function sortIndexes(indexes: number[]): number[] {
  return [...new Set(indexes)].sort((a, b) => a - b);
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
