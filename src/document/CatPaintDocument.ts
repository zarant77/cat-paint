import type { Primitive } from "../primitives/Primitive.js";
import { sanitizeSpriteId } from "../utils/naming.js";

export const CAT_PAINT_FORMAT = "cat-paint-sprite";
export const CAT_PAINT_VERSION = 1;

export type SpriteCommand = Primitive;

export type PrimitiveNode = {
  id: string;
  type: "primitive";
  name: string;
  visible: boolean;
  locked: boolean;
  command: SpriteCommand;
};

export type GroupNode = {
  id: string;
  type: "group";
  name: string;
  visible: boolean;
  locked: boolean;
  children: SceneNode[];
};

export type SceneNode = PrimitiveNode | GroupNode;

export type CatPaintDocument = {
  format: typeof CAT_PAINT_FORMAT;
  version: typeof CAT_PAINT_VERSION;
  sprite: {
    id: string;
    width: number;
    height: number;
    pivotX: number;
    pivotY: number;
  };
  nodes: SceneNode[];
};

export type PrimitiveNodeEntry = {
  node: PrimitiveNode;
  command: SpriteCommand;
};

export type SceneNodeEntry = {
  node: SceneNode;
  parent: GroupNode | null;
  index: number;
  depth: number;
};

export type EditablePrimitiveNodeEntry = PrimitiveNodeEntry & {
  locked: boolean;
};

export function createPrimitiveNode(command: SpriteCommand, index: number): PrimitiveNode {
  return {
    id: createNodeId("primitive"),
    type: "primitive",
    name: `Primitive ${index + 1}`,
    visible: true,
    locked: false,
    command: { ...command },
  };
}

export function createGroupNode(children: readonly SceneNode[], index: number): GroupNode {
  if (children.length === 0) {
    throw new Error("Group nodes must contain at least one child.");
  }

  return {
    id: createNodeId("group"),
    type: "group",
    name: `Group ${index + 1}`,
    visible: true,
    locked: false,
    children: cloneNodes(children),
  };
}

export function createPrimitiveNodes(commands: readonly SpriteCommand[]): PrimitiveNode[] {
  return commands.map((command, index) => createPrimitiveNode(command, index));
}

export function cloneNodes(nodes: readonly SceneNode[]): SceneNode[] {
  return nodes.map(cloneNode);
}

export function cloneNodesWithNewIds(nodes: readonly SceneNode[], offset: { x: number; y: number }): SceneNode[] {
  return nodes.map((node) => cloneNodeWithNewIds(node, offset));
}

export function flattenNodes(nodes: readonly SceneNode[]): SpriteCommand[] {
  const commands: SpriteCommand[] = [];

  for (const node of nodes) {
    if (!node.visible) {
      continue;
    }

    if (node.type === "primitive") {
      commands.push(node.command);
      continue;
    }

    commands.push(...flattenNodes(node.children));
  }

  return commands;
}

export function getSceneNodeEntries(nodes: readonly SceneNode[]): SceneNodeEntry[] {
  return collectSceneNodeEntries(nodes, null, 0);
}

export function getSceneNodeById(nodes: readonly SceneNode[], nodeId: string): SceneNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    if (node.type === "group") {
      const child = getSceneNodeById(node.children, nodeId);

      if (child) {
        return child;
      }
    }
  }

  return null;
}

export function getPrimitiveNodeEntries(nodes: readonly SceneNode[]): PrimitiveNodeEntry[] {
  const entries: PrimitiveNodeEntry[] = [];

  for (const node of nodes) {
    if (node.type === "primitive") {
      entries.push({ node, command: node.command });
    } else {
      entries.push(...getPrimitiveNodeEntries(node.children));
    }
  }

  return entries;
}

export function getEditablePrimitiveNodeEntries(nodes: readonly SceneNode[]): EditablePrimitiveNodeEntry[] {
  return collectEditablePrimitiveNodeEntries(nodes, false);
}

export function getPrimitiveCommandsForNode(node: SceneNode): SpriteCommand[] {
  if (node.type === "primitive") {
    return [node.command];
  }

  return getPrimitiveNodeEntries(node.children).map((entry) => entry.command);
}

export function getVisiblePrimitiveNodeEntries(nodes: readonly SceneNode[]): PrimitiveNodeEntry[] {
  const entries: PrimitiveNodeEntry[] = [];

  for (const node of nodes) {
    if (!node.visible) {
      continue;
    }

    if (node.type === "primitive") {
      entries.push({ node, command: node.command });
    } else {
      entries.push(...getVisiblePrimitiveNodeEntries(node.children));
    }
  }

  return entries;
}

export function buildCatPaintDocument(input: {
  spriteId: string;
  spriteWidth: number;
  spriteHeight: number;
  pivotX: number;
  pivotY: number;
  nodes: readonly SceneNode[];
}): CatPaintDocument {
  return {
    format: CAT_PAINT_FORMAT,
    version: CAT_PAINT_VERSION,
    sprite: {
      id: sanitizeSpriteId(input.spriteId || "sprite"),
      width: input.spriteWidth,
      height: input.spriteHeight,
      pivotX: input.pivotX,
      pivotY: input.pivotY,
    },
    nodes: cloneNodes(input.nodes),
  };
}

export function serializeCatPaintDocument(document: CatPaintDocument): string {
  return JSON.stringify(document, null, 2);
}

export function parseCatPaintDocument(source: string): CatPaintDocument {
  let value: unknown;

  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("Could not parse Cat Paint JSON.");
  }

  const document = readRecord(value, "Cat Paint document");
  const format = readString(document.format, "format");

  if (format !== CAT_PAINT_FORMAT) {
    throw new Error(`Unsupported Cat Paint format: ${format}.`);
  }

  const version = readNumber(document.version, "version");

  if (version !== CAT_PAINT_VERSION) {
    throw new Error(`Unsupported Cat Paint document version: ${version}.`);
  }

  const sprite = readRecord(document.sprite, "sprite");
  const spriteId = sanitizeSpriteId(readString(sprite.id, "sprite.id"));

  if (!spriteId) {
    throw new Error("Sprite id must contain at least one letter, number, dash, or underscore.");
  }

  const width = readInteger(sprite.width, "sprite.width");
  const height = readInteger(sprite.height, "sprite.height");

  if (width <= 0 || height <= 0) {
    throw new Error("Sprite width and height must be greater than zero.");
  }

  return {
    format: CAT_PAINT_FORMAT,
    version: CAT_PAINT_VERSION,
    sprite: {
      id: spriteId,
      width,
      height,
      pivotX: readInteger(sprite.pivotX, "sprite.pivotX"),
      pivotY: readInteger(sprite.pivotY, "sprite.pivotY"),
    },
    nodes: readNodes(document.nodes, "nodes"),
  };
}

function cloneNode(node: SceneNode): SceneNode {
  if (node.type === "primitive") {
    return {
      ...node,
      command: { ...node.command },
    };
  }

  return {
    ...node,
    children: cloneNodes(node.children),
  };
}

function cloneNodeWithNewIds(node: SceneNode, offset: { x: number; y: number }): SceneNode {
  if (node.type === "primitive") {
    return {
      ...node,
      id: createNodeId("primitive"),
      command: {
        ...node.command,
        x: node.command.x + offset.x,
        y: node.command.y + offset.y,
      },
    };
  }

  return {
    ...node,
    id: createNodeId("group"),
    children: cloneNodesWithNewIds(node.children, offset),
  };
}

function collectSceneNodeEntries(nodes: readonly SceneNode[], parent: GroupNode | null, depth: number): SceneNodeEntry[] {
  const entries: SceneNodeEntry[] = [];

  nodes.forEach((node, index) => {
    entries.push({ node, parent, index, depth });

    if (node.type === "group") {
      entries.push(...collectSceneNodeEntries(node.children, node, depth + 1));
    }
  });

  return entries;
}

function collectEditablePrimitiveNodeEntries(
  nodes: readonly SceneNode[],
  isAncestorLocked: boolean,
): EditablePrimitiveNodeEntry[] {
  const entries: EditablePrimitiveNodeEntry[] = [];

  for (const node of nodes) {
    if (!node.visible) {
      continue;
    }

    const locked = isAncestorLocked || node.locked;

    if (node.type === "primitive") {
      entries.push({ node, command: node.command, locked });
    } else {
      entries.push(...collectEditablePrimitiveNodeEntries(node.children, locked));
    }
  }

  return entries;
}

function readNodes(value: unknown, fieldName: string): SceneNode[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  return value.map((node, index) => readNode(node, `${fieldName}[${index}]`));
}

function readNode(value: unknown, fieldName: string): SceneNode {
  const node = readRecord(value, fieldName);
  const type = readString(node.type, `${fieldName}.type`);
  const common = {
    id: readString(node.id, `${fieldName}.id`),
    name: readString(node.name, `${fieldName}.name`),
    visible: readBoolean(node.visible, `${fieldName}.visible`),
    locked: readBoolean(node.locked, `${fieldName}.locked`),
  };

  if (type === "primitive") {
    return {
      ...common,
      type,
      command: readCommand(node.command, `${fieldName}.command`),
    };
  }

  if (type === "group") {
    const children = readNodes(node.children, `${fieldName}.children`);

    if (children.length === 0) {
      throw new Error(`${fieldName}.children must contain at least one node.`);
    }

    return {
      ...common,
      type,
      children,
    };
  }

  throw new Error(`Unsupported node type at ${fieldName}: ${type}.`);
}

function readCommand(value: unknown, fieldName: string): SpriteCommand {
  const command = readRecord(value, fieldName);
  const kind = readString(command.kind, `${fieldName}.kind`);

  if (kind !== "rect" && kind !== "circle" && kind !== "triangle") {
    throw new Error(`Unsupported primitive kind at ${fieldName}.kind: ${kind}.`);
  }

  return {
    kind,
    x: readNumber(command.x, `${fieldName}.x`),
    y: readNumber(command.y, `${fieldName}.y`),
    w: readNumber(command.w, `${fieldName}.w`),
    h: readNumber(command.h, `${fieldName}.h`),
    rotation: readNumber(command.rotation, `${fieldName}.rotation`),
    color: readColor(command.color, `${fieldName}.color`),
    alpha: readNumber(command.alpha, `${fieldName}.alpha`),
  };
}

function readRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  return value;
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }

  return value;
}

function readNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }

  return value;
}

function readInteger(value: unknown, fieldName: string): number {
  const number = readNumber(value, fieldName);

  if (!Number.isInteger(number)) {
    throw new Error(`${fieldName} must be an integer.`);
  }

  return number;
}

function readColor(value: unknown, fieldName: string): string {
  const color = readString(value, fieldName);

  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error(`${fieldName} must be a #RRGGBB color.`);
  }

  return color.toLowerCase();
}

function createNodeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
