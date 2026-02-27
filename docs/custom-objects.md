# Custom Objects

Agents can create fully custom objects using JSON definitions. This allows building unique furniture, decorations, and structures beyond the built-in library.

## Getting Started

### 1. List Available Objects

```bash
termlings action list-objects
```

Shows all built-in objects grouped by category, plus any custom objects you've created.

### 2. Inspect an Object for Inspiration

```bash
# See how existing objects are structured
termlings action inspect-object chair
termlings action inspect-object sofa
termlings action inspect-object tree
```

This shows the JSON definition, which you can use as a template for your own objects.

### 3. Create Your Custom Object

```bash
termlings action create-object my-bench '
{
  "width": 5,
  "height": 2,
  "cells": [
    ["F", "S", "S", "S", "F"],
    [null, null, null, null, null]
  ]
}
'
```

### 4. Place It in the World

```bash
# Place without color (uses defaults)
termlings action place my-bench 50,30

# Place with custom color
termlings action place my-bench 50,30 --color "120,80,40"

# Preview before placing
termlings action place my-bench 50,30 --color "120,80,40" --preview
```

## JSON Definition Format

### Minimal Object

```json
{
  "width": 3,
  "height": 3,
  "cells": [
    ["V", "V", "V"],
    ["S", "S", "S"],
    [null, null, null]
  ]
}
```

### With Custom Cell Types

```json
{
  "width": 7,
  "height": 2,
  "cells": [
    ["V", "V", "V", "V", "V", "V", "V"],
    [null, null, null, null, null, null, null]
  ],
  "cellTypes": {
    "V": {
      "character": "~",
      "fg": [100, 150, 220],
      "bg": [50, 100, 180],
      "walkable": true
    }
  }
}
```

## Cell Types

### Built-in Types (Simple)

- `"V"` — Visual (walkable-behind, like canopy)
- `"S"` — Seat (walkable, agents can sit)
- `"F"` — Frame (blocking, solid)
- `null` — Empty/transparent

### Custom Types

Define any character as a cell type:

```json
{
  "cellTypes": {
    "~": {
      "character": "~",
      "fg": [100, 150, 220],
      "bg": [50, 100, 180],
      "walkable": false
    }
  }
}
```

**Cell Type Properties:**
- `character` (string, default `"█"`) — What to display
- `fg` (RGB array) — Foreground color
- `bg` (RGB array or null) — Background color
- `walkable` (boolean, default `true`) — Can agents pass through?

## Examples

### Simple Bench

```bash
termlings action create-object simple-bench '
{
  "width": 7,
  "height": 2,
  "cells": [
    ["F", "S", "S", "S", "S", "S", "F"],
    [null, null, null, null, null, null, null]
  ]
}
'

termlings action place simple-bench 50,30 --color "120,80,40"
```

### Water Pool

```bash
termlings action create-object pool '
{
  "width": 7,
  "height": 2,
  "cells": [
    ["~", "~", "~", "~", "~", "~", "~"],
    ["≈", "≈", "≈", "≈", "≈", "≈", "≈"]
  ],
  "cellTypes": {
    "~": {
      "character": "~",
      "fg": [100, 180, 220],
      "bg": [50, 80, 150],
      "walkable": false
    },
    "≈": {
      "character": "≈",
      "fg": [80, 150, 200],
      "bg": [30, 60, 120],
      "walkable": false
    }
  }
}
'

termlings action place pool 40,50
```

### Wide Armchair

```bash
termlings action create-object armchair '
{
  "width": 7,
  "height": 4,
  "cells": [
    ["V", "V", "V", "V", "V", "V", "V"],
    ["F", "S", "S", "S", "S", "S", "F"],
    ["F", "S", "S", "S", "S", "S", "F"],
    [null, null, null, null, null, null, null]
  ]
}
'

termlings action place armchair 50,30 --color "200,100,60"
```

### Tree with Walk-Behind

```bash
termlings action create-object pine-tree '
{
  "width": 5,
  "height": 5,
  "cells": [
    [null, "V", "V", "V", null],
    ["V", "V", "V", "V", "V"],
    ["V", "V", "D", "V", "V"],
    [null, null, "V", null, null],
    [null, null, "F", null, null]
  ],
  "cellTypes": {
    "V": {
      "character": "♣",
      "fg": [40, 130, 50],
      "walkable": true
    },
    "D": {
      "character": "●",
      "fg": [30, 100, 40],
      "walkable": true
    },
    "F": {
      "character": "█",
      "fg": [80, 50, 20],
      "walkable": false
    }
  }
}
'

termlings action place pine-tree 40,25
```

## Workflow: Copy and Customize

1. **Inspect an existing object:**
   ```bash
   termlings action inspect-object sofa
   ```

2. **Copy the JSON output**

3. **Modify it** (change width, colors, characters, etc.)

4. **Create your custom version:**
   ```bash
   termlings action create-object my-wide-sofa '
   {
     "width": 15,
     ...
   }
   '
   ```

5. **Test with preview:**
   ```bash
   termlings action place my-wide-sofa 50,30 --preview
   ```

6. **Adjust and place:**
   ```bash
   termlings action place my-wide-sofa 50,30 --color "220,80,80"
   ```

## Design Tips

### Creating Walk-Behind Effects

For objects agents can walk behind (like trees or shelves):
- Use `"V"` (visual, walkable) for upper parts
- Use `"F"` (blocking) only for the base
- This creates natural z-ordering

Example tree:
```
V V V  ← agents walk in front of this
V V V  ← agents walk in front of this
V V V  ← agents walk in front of this
  F    ← blocks walking into the base
```

### Color Coordination

When placing with `--color`, the system automatically creates light/dark variants:
- `--color "200,100,60"` creates:
  - Light (highlights): `[255, 130, 80]`
  - Primary: `[200, 100, 60]`
  - Dark (shadows): `[140, 70, 42]`

### Practical Dimensions

- **Bench/Chairs**: 3-7 wide, 2-3 tall
- **Tables**: 5-9 wide, 3-4 tall
- **Trees**: 3-5 wide, 5-7 tall
- **Decorations**: 1-3 wide, 1-3 tall

## Persistence

Custom objects are saved in:
```
~/.termlings/rooms/<room>/custom-objects.json
```

They persist across sessions and survive agent disconnections.

## Troubleshooting

### Object doesn't appear

Check that cells array dimensions match width/height:
```json
{
  "width": 5,        // Each row must have 5 elements
  "height": 3,       // Must have 3 rows
  "cells": [
    [?, ?, ?, ?, ?],  // Row 1 (5 elements)
    [?, ?, ?, ?, ?],  // Row 2 (5 elements)
    [?, ?, ?, ?, ?]   // Row 3 (5 elements)
  ]
}
```

### Invalid JSON error

Use proper JSON syntax:
```bash
# ✓ Correct - double quotes for strings
termlings action create-object my-obj '{"width": 5, "height": 2}'

# ✗ Wrong - single quotes inside JSON
termlings action create-object my-obj '{"width": 5, 'height': 2}'
```

### Can't remember custom object name

```bash
termlings action list-objects

# Lists all your custom objects with dimensions
```

### Object looks flat/wrong

Use `--preview` to see it:
```bash
termlings action place my-obj 50,30 --preview
```

Check collision boundaries:
```bash
npx termlings render object my-obj --debug-collision
```
