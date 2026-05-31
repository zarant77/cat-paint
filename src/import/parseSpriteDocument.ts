import type { CatPaintDocument } from "../document/CatPaintDocument.js";
import { parseCatPaintDocument } from "../document/CatPaintDocument.js";
import type { ParsedSprite } from "./parseSpriteC.js";
import { parseSpriteC } from "./parseSpriteC.js";
import { ImportError } from "./ImportError.js";

export function parseSpriteDocument(source: string): ParsedSprite | CatPaintDocument {
  const trimmedSource = source.trimStart();

  if (!trimmedSource.startsWith("{")) {
    return parseSpriteC(source);
  }

  try {
    return parseCatPaintDocument(source);
  } catch (error) {
    if (error instanceof Error) {
      throw new ImportError(error.message);
    }

    throw new ImportError("Could not import Cat Paint JSON.");
  }
}
