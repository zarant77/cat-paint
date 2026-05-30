import type { Primitive } from "./Primitive.js";

export function drawPrimitive(ctx: CanvasRenderingContext2D, primitive: Primitive): void {
  ctx.save();

  ctx.translate(primitive.x, primitive.y);
  ctx.rotate(primitive.rotation);
  ctx.globalAlpha = primitive.alpha / 255;
  ctx.fillStyle = primitive.color;

  if (primitive.kind === "rect") {
    ctx.fillRect(-primitive.w / 2, -primitive.h / 2, primitive.w, primitive.h);
  }

  if (primitive.kind === "circle") {
    ctx.beginPath();
    ctx.arc(0, 0, primitive.w, 0, Math.PI * 2);
    ctx.fill();
  }

  if (primitive.kind === "triangle") {
    ctx.beginPath();
    ctx.moveTo(0, -primitive.h / 2);
    ctx.lineTo(primitive.w / 2, primitive.h / 2);
    ctx.lineTo(-primitive.w / 2, primitive.h / 2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}
