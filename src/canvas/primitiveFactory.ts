import type { AppState } from "../app/AppState.js";
import type { Point, Primitive } from "../primitives/Primitive.js";

export function createPrimitiveFromDrag(state: AppState, start: Point, end: Point): Primitive {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);

  const width = Math.round(right - left);
  const height = Math.round(bottom - top);
  const size = Math.max(width, height);

  if (state.activeKind === "circle") {
    return {
      kind: "circle",
      x: Math.round((left + right) / 2),
      y: Math.round((top + bottom) / 2),
      w: Math.round(size / 2),
      h: 0,
      rotation: 0,
      color: state.color,
      alpha: state.alpha,
    };
  }

  return {
    kind: state.activeKind,
    x: Math.round((left + right) / 2),
    y: Math.round((top + bottom) / 2),
    w: width,
    h: height,
    rotation: 0,
    color: state.color,
    alpha: state.alpha,
  };
}
