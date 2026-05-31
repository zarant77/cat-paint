import type { AppState } from "../app/AppState.js";
import { buildCatPaintDocument, serializeCatPaintDocument } from "../document/CatPaintDocument.js";

export function buildJsonExport(state: AppState): string {
  return serializeCatPaintDocument(
    buildCatPaintDocument({
      spriteId: state.spriteId,
      spriteWidth: state.spriteWidth,
      spriteHeight: state.spriteHeight,
      pivotX: state.pivotX,
      pivotY: state.pivotY,
      nodes: state.nodes,
    }),
  );
}
