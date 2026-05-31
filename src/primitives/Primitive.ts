export type PrimitiveKind = "rect" | "circle" | "triangle";

export type CreateToolKind = PrimitiveKind;

export type EditToolKind = "fill" | "rotate" | "scale" | "eyedropper";

export type ToolKind = CreateToolKind | EditToolKind | null;

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
