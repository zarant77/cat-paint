import type { Primitive, PrimitiveKind, ToolKind } from "../primitives/Primitive.js";

export type AppState = {
  spriteId: string;
  spriteWidth: number;
  spriteHeight: number;
  pivotX: number;
  pivotY: number;
  activeTool: ToolKind;
  activeKind: PrimitiveKind;
  color: string;
  alpha: number;
  primitives: Primitive[];
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  selectedPrimitiveIndexes: number[];
};

export type HistorySnapshot = {
  spriteId: string;
  spriteWidth: number;
  spriteHeight: number;
  pivotX: number;
  pivotY: number;
  primitives: Primitive[];
  selectedPrimitiveIndexes: number[];
};

export function createInitialState(): AppState {
  return {
    spriteId: "player",
    spriteWidth: 64,
    spriteHeight: 64,
    pivotX: 32,
    pivotY: 32,
    activeTool: null,
    activeKind: "rect",
    color: "#111111",
    alpha: 255,
    primitives: [],
    undoStack: [],
    redoStack: [],
    selectedPrimitiveIndexes: [],
  };
}

export function clonePrimitives(primitives: Primitive[]): Primitive[] {
  return primitives.map((primitive) => ({ ...primitive }));
}

export function createHistorySnapshot(state: AppState): HistorySnapshot {
  return {
    spriteId: state.spriteId,
    spriteWidth: state.spriteWidth,
    spriteHeight: state.spriteHeight,
    pivotX: state.pivotX,
    pivotY: state.pivotY,
    primitives: clonePrimitives(state.primitives),
    selectedPrimitiveIndexes: [...state.selectedPrimitiveIndexes],
  };
}

export function applyHistorySnapshot(state: AppState, snapshot: HistorySnapshot): void {
  state.spriteId = snapshot.spriteId;
  state.spriteWidth = snapshot.spriteWidth;
  state.spriteHeight = snapshot.spriteHeight;
  state.pivotX = snapshot.pivotX;
  state.pivotY = snapshot.pivotY;
  state.primitives = clonePrimitives(snapshot.primitives);
  state.selectedPrimitiveIndexes = [...snapshot.selectedPrimitiveIndexes];
}
