# SPRITE_FORMAT.md

# Cat Paint ↔ Little One Sprite Format

## Purpose

Cat Paint exports compact procedural sprite source files for Little One.

Little One generates pixel buffers from these sprite definitions during startup and renders cached sprites during gameplay.

---

## Pipeline

```text
Cat Paint
    ↓
*.sprite.c
    ↓
Little One
    ↓
GeneratedSprite
    ↓
Runtime Rendering
```

---

## Philosophy

Store formulas.

Generate pixels once.

Render fast.

Sprites are generated during startup and never rebuilt during the game loop.

---

## File Layout

Cat Paint exports one complete sprite source file.

Suggested Little One location:

```text
src/sprites/definitions/*.sprite.c
```

Example:

```text
src/sprites/definitions/player.sprite.c
src/sprites/definitions/boar.sprite.c
src/sprites/definitions/ork.sprite.c
src/sprites/definitions/rat.sprite.c
src/sprites/definitions/rock.sprite.c
src/sprites/definitions/stump.sprite.c
```

Each `*.sprite.c` file must contain exactly one sprite definition.

---

## Coordinate System

Each sprite has its own local coordinate system.

Origin:

```text
(0,0)
```

Location:

```text
top-left corner of the sprite
```

Direction:

```text
+X → right
+Y ↓ down
```

Coordinates are measured in pixels.

---

## Primitive Positioning

For all primitives:

```text
x,y = geometric center of the primitive
```

Rotation is always applied around the primitive center.

This rule applies to all current and future primitive types.

No primitive-specific coordinate systems.

---

## Pivot

Every sprite contains a pivot point.

Current convention:

```text
pivot = geometric center of the sprite
```

Example:

```c
.width = 64,
.height = 64,

.pivot_x = 32,
.pivot_y = 32,
```

---

## Color Format

RGBA:

```text
0xRRGGBBAA
```

Examples:

```c
0xffffffff // white
0x000000ff // black
0xff0000ff // red
0x00ff00ff // green
0x0000ffff // blue

0x00000000 // transparent
```

---

## Command Types

```c
typedef enum {
    SPRITE_CMD_RECT     = 0,
    SPRITE_CMD_CIRCLE   = 1,
    SPRITE_CMD_TRIANGLE = 2
} SpriteCommandKind;
```

Future:

```c
SPRITE_CMD_LINE
SPRITE_CMD_POLYGON
```

---

## Compact Command Format

```c
#pragma pack(push, 1)

typedef struct {
    uint8_t kind;

    int16_t x;
    int16_t y;

    int16_t w;
    int16_t h;

    int16_t rotation;

    uint32_t color;
} SpriteCommand;

#pragma pack(pop)
```

Size:

```text
15 bytes
```

No strings.

No JSON.

No runtime parsing.

---

## Generic Field Meaning

```text
kind     = primitive type
x        = center x
y        = center y
w        = primitive width parameter
h        = primitive height parameter
rotation = radians * 1000
color    = RGBA
```

---

## Rotation Format

To avoid floats:

```text
rotation = radians * 1000
```

Examples:

```c
0
785
1570
3141
```

Rotation support may be added gradually.

The field exists to keep the format future-proof.

---

## RECT

Rectangle centered at `x,y`.

```c
kind = SPRITE_CMD_RECT

x = center x
y = center y

w = width
h = height

rotation = radians * 1000

color = RGBA
```

Example:

```c
{
    SPRITE_CMD_RECT,
    32,
    32,
    20,
    10,
    0,
    0xff0000ff
}
```

Meaning:

```text
center = (32,32)

width  = 20
height = 10
```

---

## CIRCLE

Circle centered at `x,y`.

```c
kind = SPRITE_CMD_CIRCLE

x = center x
y = center y

w = radius

h = unused

rotation = ignored

color = RGBA
```

Example:

```c
{
    SPRITE_CMD_CIRCLE,
    32,
    32,
    20,
    0,
    0,
    0x000000ff
}
```

---

## TRIANGLE

Triangle centered at `x,y`.

Default orientation:

```text
      ▲
     / \
    /   \
   /_____\
```

Top vertex is centered horizontally.

Base is aligned to the bottom side.

```c
kind = SPRITE_CMD_TRIANGLE

x = center x
y = center y

w = width
h = height

rotation = radians * 1000

color = RGBA
```

Example:

```c
{
    SPRITE_CMD_TRIANGLE,
    32,
    32,
    20,
    30,
    0,
    0x000000ff
}
```

Meaning:

```text
center = (32,32)

width  = 20
height = 30
```

---

## Layering

Commands are rendered in array order.

Later commands are drawn over earlier commands.

Example:

```c
static const SpriteCommand COMMANDS[] = {
    { SPRITE_CMD_CIRCLE,   32, 32, 22, 0, 0, 0x000000ff },

    { SPRITE_CMD_TRIANGLE, 22, 14, 12, 14, 0, 0x000000ff },
    { SPRITE_CMD_TRIANGLE, 42, 14, 12, 14, 0, 0x000000ff },

    { SPRITE_CMD_CIRCLE,   24, 28,  3, 0, 0, 0xffff00ff },
    { SPRITE_CMD_CIRCLE,   40, 28,  3, 0, 0, 0xffff00ff }
};
```

---

## Sprite Definition

```c
typedef struct {
    const char *id;

    int16_t width;
    int16_t height;

    int16_t pivot_x;
    int16_t pivot_y;

    const SpriteCommand *commands;
    int16_t command_count;
} SpriteDefinition;
```

---

## Cat Paint Export Format

Cat Paint exports a complete self-contained `*.sprite.c` file.

Example:

```c
#include "../sprite_definition.h"

static const SpriteCommand COMMANDS[] = {
    { SPRITE_CMD_TRIANGLE, 22, 14, 12, 14, 0, 0x000000ff },
    { SPRITE_CMD_TRIANGLE, 42, 14, 12, 14, 0, 0x000000ff },
    { SPRITE_CMD_CIRCLE,   32, 32, 22, 0, 0, 0x000000ff },
    { SPRITE_CMD_CIRCLE,   24, 28,  3, 0, 0, 0xffff00ff },
    { SPRITE_CMD_CIRCLE,   40, 28,  3, 0, 0, 0xffff00ff }
};

const SpriteDefinition PLAYER_SPRITE = {
    .id = "player",

    .width = 64,
    .height = 64,

    .pivot_x = 32,
    .pivot_y = 32,

    .commands = COMMANDS,
    .command_count = sizeof(COMMANDS) / sizeof(COMMANDS[0]),
};
```

Each exported file must contain:

* include statement
* one `static const SpriteCommand COMMANDS[]`
* one public `const SpriteDefinition NAME_SPRITE`

The exported file must be importable back into Cat Paint.

---

## Import Format

Cat Paint imports a full `*.sprite.c` file.

Import should read:

* sprite id
* width
* height
* pivot
* command list
* command count, if present

Import should support:

```c
static const SpriteCommand COMMANDS[] = {
    { SPRITE_CMD_RECT,     32, 32, 20, 10, 0, 0xff0000ff },
    { SPRITE_CMD_CIRCLE,   32, 32, 20,  0, 0, 0x000000ff },
    { SPRITE_CMD_TRIANGLE, 32, 32, 20, 30, 0, 0x000000ff }
};
```

Cat Paint only needs to support its own exported format.

It does not need to parse arbitrary C code.

---

## Generated Sprite

Generated during Little One startup.

```c
typedef struct {
    const char *id;

    int16_t width;
    int16_t height;

    int16_t pivot_x;
    int16_t pivot_y;

    uint32_t *pixels;
} GeneratedSprite;
```

Transparent pixels:

```c
0x00000000
```

---

## Runtime Rules

Correct:

```c
blit_sprite(framebuffer, sprite, x, y);
```

Wrong:

```c
draw_rect(...);
draw_circle(...);
draw_triangle(...);
```

inside the game loop.

The game loop must render only cached `GeneratedSprite` pixel buffers.

---

## Sprite Registry

Little One registers generated sprites separately from individual sprite files.

Suggested registry shape:

```c
extern const SpriteDefinition PLAYER_SPRITE;
extern const SpriteDefinition BOAR_SPRITE;
extern const SpriteDefinition ORK_SPRITE;
extern const SpriteDefinition RAT_SPRITE;
extern const SpriteDefinition ROCK_SPRITE;
extern const SpriteDefinition STUMP_SPRITE;

const SpriteDefinition *SPRITE_DEFINITIONS[] = {
    &PLAYER_SPRITE,
    &BOAR_SPRITE,
    &ORK_SPRITE,
    &RAT_SPRITE,
    &ROCK_SPRITE,
    &STUMP_SPRITE,
};
```

Cat Paint does not export the registry.

The registry is owned by Little One.

---

## Sprite Cache

Generated sprites are cached.

Each sprite is generated exactly once.

Entities reference sprites by ID.

Example IDs:

```text
player
boar
ork
rat
rock
stump
```

---

## Export Requirements

Cat Paint exports:

* complete `*.sprite.c` source file
* sprite id
* width
* height
* pivot
* commands
* `SpriteDefinition`

Cat Paint does not export image files.

---

## Naming Rules

Allowed sprite ID characters:

```text
a-z
0-9
_
-
```

Examples:

```text
player
black_cat
boar
ork
rat
rock
stump
tree_01
```

Suggested C symbol format:

```text
PLAYER_SPRITE
BLACK_CAT_SPRITE
BOAR_SPRITE
TREE_01_SPRITE
```

---

## Design Goal

Tiny source data.

Tiny APK.

Fast startup.

Fast rendering.

One sprite per file.

No image assets.

No runtime parsers.
