import type { Point } from "../primitives/Primitive.js";
import { clamp } from "../utils/clamp.js";

export function getSpritePoint(
  canvas: HTMLCanvasElement,
  spriteWidth: number,
  spriteHeight: number,
  event: PointerEvent,
): Point {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * spriteWidth;
  const y = ((event.clientY - rect.top) / rect.height) * spriteHeight;

  return {
    x: clamp(Math.round(x), 0, spriteWidth),
    y: clamp(Math.round(y), 0, spriteHeight),
  };
}
