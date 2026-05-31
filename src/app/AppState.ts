import type { SceneNode } from "../document/CatPaintDocument.js";
import { cloneNodes } from "../document/CatPaintDocument.js";
import type { PrimitiveKind, ToolKind } from "../primitives/Primitive.js";

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
  nodes: SceneNode[];
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  selectedNodeIds: string[];
  collapsedGroupIds: string[];
};

export type HistorySnapshot = {
  spriteId: string;
  spriteWidth: number;
  spriteHeight: number;
  pivotX: number;
  pivotY: number;
  nodes: SceneNode[];
  selectedNodeIds: string[];
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
    nodes: [],
    undoStack: [],
    redoStack: [],
    selectedNodeIds: [],
    collapsedGroupIds: [],
  };
}

export function createHistorySnapshot(state: AppState): HistorySnapshot {
  return {
    spriteId: state.spriteId,
    spriteWidth: state.spriteWidth,
    spriteHeight: state.spriteHeight,
    pivotX: state.pivotX,
    pivotY: state.pivotY,
    nodes: cloneNodes(state.nodes),
    selectedNodeIds: [...state.selectedNodeIds],
  };
}

export function applyHistorySnapshot(state: AppState, snapshot: HistorySnapshot): void {
  state.spriteId = snapshot.spriteId;
  state.spriteWidth = snapshot.spriteWidth;
  state.spriteHeight = snapshot.spriteHeight;
  state.pivotX = snapshot.pivotX;
  state.pivotY = snapshot.pivotY;
  state.nodes = cloneNodes(snapshot.nodes);
  state.selectedNodeIds = [...snapshot.selectedNodeIds];
}
