# Cat Paint

A tiny editor for building procedural sprites for Little One.

## Stack

* pnpm
* Vite
* TypeScript
* Canvas 2D
* Static HTML

## Run

```bash
pnpm install
pnpm dev
```

## Goal

Cat Paint builds sprites from simple primitives and exports compact C definitions for Little One.

```text
Cat Paint
    ↓
SpriteCommand[]
    ↓
SpriteDefinition
    ↓
Little One
```

## Supported Primitives

* Rect
* Circle

Planned:

* Line
* Triangle
* Polygon

## Format

Sprite format is defined in:

[SPRITE_FORMAT.md](SPRITE_FORMAT.md)

Both Cat Paint and Little One must follow this specification.

## Export

Cat Paint exports:

```c
SpriteCommand[]
SpriteDefinition
```

The generated code can be copied directly into Little One source files.
