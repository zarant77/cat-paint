import type { AppState } from "../app/AppState.js";
import { flattenNodes } from "../document/CatPaintDocument.js";
import type { PrimitiveKind } from "../primitives/Primitive.js";
import { clamp } from "../utils/clamp.js";
import { sanitizeSpriteId, toCSymbol } from "../utils/naming.js";

export function buildCExport(state: AppState): string {
  const spriteId = sanitizeSpriteId(state.spriteId || "sprite");
  const symbol = `${toCSymbol(spriteId).toUpperCase()}_SPRITE`;

  const commandLines = flattenNodes(state.nodes).map((primitive) => {
    const kind = toCCommandKind(primitive.kind);
    const color = toRgbaHex(primitive.color, primitive.alpha);
    const rotation = Math.round(primitive.rotation * 1000);

    return `    { ${kind}, ${primitive.x}, ${primitive.y}, ${primitive.w}, ${primitive.h}, ${rotation}, ${color} },`;
  });

  return [
    `#include "../sprite_definition.h"`,
    ``,
    `static const SpriteCommand COMMANDS[] = {`,
    ...commandLines,
    `};`,
    ``,
    `const SpriteDefinition ${symbol} = {`,
    `    .id = "${spriteId}",`,
    ``,
    `    .width = ${state.spriteWidth},`,
    `    .height = ${state.spriteHeight},`,
    ``,
    `    .pivot_x = ${state.pivotX},`,
    `    .pivot_y = ${state.pivotY},`,
    ``,
    `    .commands = COMMANDS,`,
    `    .command_count = sizeof(COMMANDS) / sizeof(COMMANDS[0]),`,
    `};`,
  ].join("\n");
}

export function toCCommandKind(kind: PrimitiveKind): string {
  if (kind === "rect") {
    return "SPRITE_CMD_RECT";
  }

  if (kind === "circle") {
    return "SPRITE_CMD_CIRCLE";
  }

  return "SPRITE_CMD_TRIANGLE";
}

export function toRgbaHex(color: string, alpha: number): string {
  const hex = color.replace("#", "");
  const safeAlpha = clamp(alpha, 0, 255).toString(16).padStart(2, "0");

  return `0x${hex}${safeAlpha}`;
}
