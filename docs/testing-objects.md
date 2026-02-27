# Testing Objects

The termlings project includes comprehensive tools for testing and visualizing objects with custom colors and collision detection.

## Render Command

The `render` command has been extended to support rendering objects with various options.

### List Available Objects

```bash
npx termlings render object --list
```

Shows all available object types organized by category:
- Furniture (sofa, chair, table, etc.)
- Natural (tree, rock, flower_patch, etc.)
- Structures (fence, sign, campfire, etc.)

### Render an Object

```bash
npx termlings render object sofa
npx termlings render object tree
npx termlings render object chair
```

Shows the object rendered in the terminal with full colors.

### Render with Custom Color

```bash
# Render with custom primary color (RGB)
npx termlings render object sofa --color "220,100,60"

# Red sofa
npx termlings render object sofa --color "220,80,80"

# Blue chair
npx termlings render object chair --color "100,150,220"

# Green table
npx termlings render object table --color "80,180,100"
```

The system automatically darkens and lightens the color for depth:
- **Light variant** — 1.3x brighter (highlights)
- **Primary color** — Base color (main surface)
- **Dark variant** — 0.7x darker (shadows/depth)

### Debug Collision Boundaries

```bash
npx termlings render object sofa --debug-collision
npx termlings render object chair --debug-collision
npx termlings render object tree --debug-collision
```

Shows collision information with a legend:
- `·` (dot) = Transparent/empty space
- `█` (block) = Blocking cell (agents can't pass through)
- `░` (light shade) = Walkable cell (agents can stand here)

Use this to verify:
- Which parts of the object are solid
- Where agents can walk on/through furniture
- Correct collision boundaries for pathfinding

### Combined Options

```bash
# Render red sofa with collision debug
npx termlings render object sofa --color "200,80,80" --debug-collision

# Test different colors quickly
npx termlings render object chair --color "100,200,100"  # Green
npx termlings render object chair --color "200,100,100"  # Brown
npx termlings render object chair --color "100,100,200"  # Blue
```

## Color Utility Tests

Run the test suite to verify color functions:

```bash
npm test -- src/engine/__tests__/objects.test.ts
```

Tests cover:
- `darken()` — Reduces brightness by 30%
- `lighten()` — Increases brightness by 30%
- Clamping to [0, 255] range
- Custom darkening/lightening factors
- Visual distinctness of variants

## Examples

### Testing a New Furniture Color

```bash
# Start with a base color
npx termlings render object sofa --color "190,135,10"

# See how it looks with collision debug
npx termlings render object sofa --color "190,135,10" --debug-collision

# Try a warmer tone
npx termlings render object sofa --color "220,140,40"

# Try a cooler tone
npx termlings render object sofa --color "140,160,180"
```

### Verifying Collision Boundaries

```bash
# Check sofa blocking areas
npx termlings render object sofa --debug-collision

# Verify chair seat is walkable
npx termlings render object chair --debug-collision

# Check tree has walkable canopy for walking behind
npx termlings render object tree --debug-collision

# Confirm fence blocks completely
npx termlings render object fence_h --debug-collision
```

### Color Combinations

```bash
# Warm earth tones
npx termlings render object sofa --color "184,115,51"
npx termlings render object table --color "139,90,43"

# Cool tones
npx termlings render object chair --color "100,130,180"
npx termlings render object bookshelf --color "70,100,140"

# Bright accent colors
npx termlings render object campfire --color "255,140,30"
npx termlings render object flower_patch --color "220,100,150"
```

## Color Math

The color system uses simple RGB multiplication for depth:

```javascript
// Lighten: multiply by 1.3 (clamped to 255)
lighten([200, 100, 50]) = [255, 130, 65]

// Darken: multiply by 0.7
darken([200, 100, 50]) = [140, 70, 35]
```

This creates natural-looking depth without needing separate color specifications.

### Why Three Variants?

1. **Dark (0.7x)** — Shadows, depth, blocked areas
2. **Primary (1.0x)** — Main surface, most visible areas
3. **Light (1.3x)** — Highlights, visual pop, important details

The rendering logic applies colors based on the original cell's brightness:
- Very bright cells → Light variant
- Very dark cells → Dark variant
- Mid-tone cells → Primary color

## Troubleshooting

### Color looks wrong

Try with `--debug-collision` to see the structure:
```bash
npx termlings render object sofa --color "200,100,50" --debug-collision
```

The collision view shows what parts are actually being rendered.

### Object doesn't render

Check it exists in the list:
```bash
npx termlings render object --list
```

### Need lighter/darker variants

Adjust the RGB values:
- For lighter: increase each channel (e.g., [200, 100, 50] → [220, 140, 70])
- For darker: decrease each channel (e.g., [200, 100, 50] → [160, 70, 30])

## Integration with Place Command

### Testing Workflow for Agents

```bash
# Step 1: Use --preview to see the object before placing
termlings action place sofa 50,30 --preview

# Step 2: Try different colors with preview
termlings action place sofa 50,30 --color "220,100,60" --preview
termlings action place sofa 50,30 --color "100,150,200" --preview
termlings action place sofa 50,30 --color "80,180,100" --preview

# Step 3: Once happy, place it (remove --preview)
termlings action place sofa 50,30 --color "220,100,60"
```

### Development Workflow (CLI)

For development/testing, use the standalone render command:

```bash
# Test the color with full control
npx termlings render object sofa --color "200,100,60"

# Debug collision boundaries
npx termlings render object sofa --color "200,100,60" --debug-collision

# Use it in the game
termlings action place sofa 50,30 --color "200,100,60"
```
