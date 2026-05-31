import type { SceneNode } from "../document/CatPaintDocument.js";
import { createPrimitiveNodes } from "../document/CatPaintDocument.js";
import type { Primitive, PrimitiveKind } from "../primitives/Primitive.js";
import { sanitizeSpriteId } from "../utils/naming.js";
import { ImportError } from "./ImportError.js";

export type ParsedSprite = {
  spriteId: string;
  spriteWidth: number;
  spriteHeight: number;
  pivotX: number;
  pivotY: number;
  nodes: SceneNode[];
};

const commandKinds: Record<string, PrimitiveKind> = {
  SPRITE_CMD_RECT: "rect",
  SPRITE_CMD_CIRCLE: "circle",
  SPRITE_CMD_TRIANGLE: "triangle",
};

export function parseSpriteC(source: string): ParsedSprite {
  const code = stripComments(source);
  const definitionBody = parseDefinitionBody(code);
  const spriteId = parseSpriteId(definitionBody);
  const width = parseDefinitionNumber(definitionBody, "width");
  const height = parseDefinitionNumber(definitionBody, "height");
  const pivotX = parseDefinitionNumber(definitionBody, "pivot_x");
  const pivotY = parseDefinitionNumber(definitionBody, "pivot_y");

  if (width <= 0 || height <= 0) {
    throw new ImportError("Sprite width and height must be greater than zero.");
  }

  const commandBody = parseCommandBody(code);
  const primitives = commandBody === null ? [] : parseCommands(commandBody);

  return {
    spriteId,
    spriteWidth: width,
    spriteHeight: height,
    pivotX,
    pivotY,
    nodes: createPrimitiveNodes(primitives),
  };
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function parseSpriteId(code: string): string {
  const match = /\.id\s*=\s*"([^"]+)"\s*,/.exec(code);

  if (!match) {
    throw new ImportError('Missing sprite id, expected `.id = "player",`.');
  }

  const spriteId = sanitizeSpriteId(match[1]);

  if (!spriteId) {
    throw new ImportError("Sprite id must contain at least one letter, number, dash, or underscore.");
  }

  return spriteId;
}

function parseDefinitionBody(code: string): string {
  const match = /(?:static\s+)?const\s+SpriteDefinition\s+\w+\s*=\s*\{([\s\S]*?)\};/.exec(code);

  if (!match) {
    throw new ImportError("Missing SpriteDefinition.");
  }

  return match[1];
}

function parseDefinitionNumber(code: string, field: "width" | "height" | "pivot_x" | "pivot_y"): number {
  const match = new RegExp(`\\.${field}\\s*=\\s*(-?\\d+)\\s*,`).exec(code);

  if (!match) {
    throw new ImportError(`Missing sprite ${field}.`);
  }

  return Number(match[1]);
}

function parseCommandBody(code: string): string | null {
  const match = /static\s+const\s+SpriteCommand\s+\w+\s*\[\]\s*=\s*\{([\s\S]*?)\};/.exec(code);

  return match?.[1] ?? null;
}

function parseCommands(commandBody: string): Primitive[] {
  const primitives: Primitive[] = [];
  const entries = commandBody.matchAll(/\{([^{}]+)\}/g);

  for (const entry of entries) {
    primitives.push(parseCommand(entry[1]));
  }

  return primitives;
}

function parseCommand(entry: string): Primitive {
  const fields = entry.split(",").map((field) => field.trim()).filter(Boolean);

  if (fields.length !== 6 && fields.length !== 7) {
    throw new ImportError("Each SpriteCommand must contain kind, x, y, w, h, rotation, and color.");
  }

  const kind = parseKind(fields[0]);
  const x = parseInteger(fields[1], "x");
  const y = parseInteger(fields[2], "y");
  const w = parseInteger(fields[3], "w");
  const h = parseInteger(fields[4], "h");
  const rotation = fields.length === 7 ? parseInteger(fields[5], "rotation") / 1000 : 0;
  const { color, alpha } = parseColor(fields.length === 7 ? fields[6] : fields[5]);

  return {
    kind,
    x,
    y,
    w,
    h,
    rotation,
    color,
    alpha,
  };
}

function parseKind(value: string): PrimitiveKind {
  const kind = commandKinds[value];

  if (!kind) {
    throw new ImportError(`Unsupported sprite command kind: ${value}.`);
  }

  return kind;
}

function parseInteger(value: string, fieldName: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw new ImportError(`Invalid ${fieldName} value: ${value}.`);
  }

  return Number(value);
}

function parseColor(value: string): { color: string; alpha: number } {
  const match = /^0x([0-9a-fA-F]{8})$/.exec(value);

  if (!match) {
    throw new ImportError(`Invalid color value: ${value}. Expected 0xRRGGBBAA.`);
  }

  const hex = match[1];

  return {
    color: `#${hex.slice(0, 6).toLowerCase()}`,
    alpha: Number.parseInt(hex.slice(6, 8), 16),
  };
}
