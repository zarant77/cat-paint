export type PrimitiveKind = "rect" | "circle" | "triangle";

export type ToolKind = "select" | PrimitiveKind;

export type Primitive = {
  kind: PrimitiveKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  color: string;
  alpha: number;
};

export type Point = {
  x: number;
  y: number;
};
