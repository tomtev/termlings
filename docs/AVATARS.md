# Avatar System

Each termling is uniquely defined by a **7-character hex DNA string** that deterministically encodes facial features, body type, clothing, and two independent color hues. With ~32 million possible combinations, no two termlings are identical.

## DNA Encoding

DNA is a single 32-bit integer encoded as 7 hex characters, using **mixed-radix encoding** to pack 7 traits into the available space:

### Trait breakdown

| Trait | Variants | Radix | Description |
|-------|----------|-------|-------------|
| eyes | 11 | 11 | normal, wide, close, big, squint, narrow, sleepy, wink, sad, confused, angry |
| mouths | 7 | 7 | smile, smirk, narrow, wide, open, kiss, neutral |
| hats | 24 | 24 | none, tophat, beanie, crown, cap, horns, mohawk, beret, wizard, viking, pirate, jester, halo, tiara, turban, bowler, helmet, etc. |
| bodies | 6 | 6 | normal, narrow, tapered, wide, thin, stocky |
| legs | 6 | 6 | biped, quad, tentacles, thick, thin, wide-stance |
| faceHue | 12 | 12 | 0-330° in 30° steps (red, orange, yellow, green, cyan, blue, magenta, etc.) |
| hatHue | 12 | 12 | independent hue for hat/clothing |

**Total combinations**: `11 × 7 × 24 × 6 × 6 × 12 × 12 = 31,850,496` unique termlings

### DNA examples

```
0a3f201  = Eyes: normal (0), Mouth: smile (a=10), Hat: none (3),
           Body: normal (f=15), Legs: biped (2), FaceHue: red (0), HatHue: cyan (1)

1234567  = Eyes: wide (1), Mouth: smirk (2), Hat: tophat (3),
           Body: narrow (4), Legs: quad (5), FaceHue: yellow (6), HatHue: blue (7)
```

## Name-based DNA

Instead of a random DNA string, you can derive DNA from a **name hash**:

```bash
# Same name always produces the same avatar
npx termlings render Alice
npx termlings render Alice       # Same avatar both times

# Deterministic — Alice always has the same DNA
# Useful for reproducible agent identities
```

The name is hashed, then the hash is used as DNA. This means:
- Consistent avatars across sessions
- Can recreate any agent's avatar just from their name
- No need to store DNA — just the name

## Rendering

### Terminal rendering

Termlings render as **2-cell-wide pixel-art sprites** in the terminal using:
- **Unicode block characters** (█, ▄, ▀, ▓, etc.) for pixels
- **ANSI 256-color RGB mode** for precise coloring (16 million colors)
- **4-frame walking animation** with leg cycling
- **2-frame talking/mouth animation**
- **Wave gesture** with arm movement

### Sprite grid format

Each termling is rendered on a **14×16 grid** (width × height in pixels):

```
Row 0:  [...........]
Row 1:  [....head....]
Row 2:  [..eyes.mouth]
Row 3:  [....hat.....]
Row 4:  [...........] (gap)
Row 5:  [....body....]
Row 6:  [....body....]
Row 7:  [...........] (gap)
Row 8:  [....legs....]
Row 9:  [....legs....]
```

Pixels are stored as **single-character "Pixel" type** with semantic meaning:
- `f` = face
- `e` = eyes
- `m` = mouth
- `h` = hat
- `d` = dark shadow
- `s` = shading
- etc.

### Rendering pipeline

1. **Decode DNA** → Extract trait indices
2. **Look up trait components** → Get pixel definitions for each trait
3. **Composite sprites** → Layer components (eyes, mouth, body, hat) from bottom to top
4. **Apply colors** → Use trait hues to colorize pixels
5. **Rasterize animation frame** → Pick walking/talking frame
6. **Convert to terminal cells** → Map pixels to Unicode blocks and RGB colors

### Animation

**Walking** — 4-frame cycle (idle → stride left → stride right → stride left):
- Legs alternate
- Slight bounce on stride
- Arms counterbalance legs

**Talking** — 2-frame mouth cycle:
- Open mouth (O shape)
- Closed mouth (smile/smirk)
- Head stays still

**Waving** — Gesture animation:
- Arm raised with hand rotated
- Wave cycle with elbow bend
- Returns to idle after animation

## Rendering APIs

### Terminal (ANSI)

```ts
import { renderTerminal, renderTerminalSmall } from 'termlings';

// Full size (14×16, ~4 cells wide in terminal)
const output = renderTerminal(dna, {
  walking: true,
  talking: false,
  waving: false,
  frame: 0,  // animation frame
});
console.log(output);

// Small size (7×8, ~2 cells wide)
const small = renderTerminalSmall(dna, { walking: true });
console.log(small);
```

Output is ANSI escape sequences ready for `console.log()` or `stdout.write()`.

### SVG

```ts
import { renderSVG, renderLayeredSVG } from 'termlings';

// Static SVG
const svg = renderSVG(dna, {
  scale: 8,  // pixels per cell
});
fs.writeFileSync('avatar.svg', svg);

// Animated SVG with CSS keyframes
const animated = renderLayeredSVG(dna, {
  scale: 8,
  walking: true,
  talking: false,
});
fs.writeFileSync('avatar-animated.svg', animated);
```

### Framework components

React, Vue, Svelte, and Ink components wrap the rendering:

```tsx
import { Avatar } from 'termlings/react';

<Avatar
  dna="0a3f201"
  walking={true}
  talking={false}
  waving={false}
  size="lg"
/>
```

## DNA Generation

### Random DNA

```ts
import { generateRandomDNA } from 'termlings';

const randomDna = generateRandomDNA();
// Returns something like "a4f2c18"
```

Generates a random 32-bit integer and encodes as 7 hex characters.

### From name

```ts
import { traitsFromName } from 'termlings';

const dna = traitsFromName('Alice');
// Always produces the same DNA for 'Alice'
```

Uses a hash function to deterministically derive DNA from a name string.

### Custom traits

```ts
import { encodeDNA } from 'termlings';

const dna = encodeDNA({
  eyes: 2,       // index into eyes array
  mouths: 5,     // index into mouths array
  hats: 12,      // tophat
  bodies: 0,     // normal
  legs: 1,       // quad
  faceHue: 6,    // blue
  hatHue: 8,     // magenta
});
```

Manually construct DNA from trait indices.

### Decode DNA

```ts
import { decodeDNA } from 'termlings';

const traits = decodeDNA('0a3f201');
// {
//   eyes: 0,
//   mouths: 10,
//   hats: 3,
//   bodies: 15,
//   legs: 2,
//   faceHue: 0,
//   hatHue: 1
// }
```

Extract individual traits from DNA.

## Creating agents with avatars

### Interactive avatar builder

```bash
npx termlings create my-agent
```

This walks you through:
1. **Reroll avatar** until you like it (random DNA generation)
2. **Set name** (e.g., "Rusty")
3. **Set purpose** (e.g., "explores the world")
4. Saves to `.termlings/my-agent/SOUL.md`
5. Generates `avatar.svg`

### Manual avatar creation

```bash
# Create a specific avatar by DNA
npx termlings create my-agent --dna 0a3f201

# Create by name (deterministic)
npx termlings create my-agent --name "Rusty"
```

## Rendering in the sim

### Terminal rendering

In the game world, termlings are rendered **2 cells wide** with:
- Full RGB colors
- Animation synchronized to game tick (60fps)
- Camera perspective (scaled based on zoom level)

### Small avatar render (startup message)

When an agent joins, the sim prints a startup message with their compact avatar:

```
Joined Termlings [default] with: Rusty
  [compact pixel art avatar in 2×3 cells]
```

Uses `renderTerminalSmall()` for compact startup display.

## Color system

### HSL to RGB conversion

Termlings use **HSL color space** for hues (easier to reason about 0-360°) but convert to RGB for terminal output:

```ts
import { hslToRgb } from 'termlings';

const [r, g, b] = hslToRgb(hue, saturation, lightness);
// Returns [0-255, 0-255, 0-255] for ANSI RGB mode
```

### Trait color hues

- **Face hue**: Primary character color (face, body, eyes)
- **Hat hue**: Independent color for hat/clothing

Both use 12-step hue wheel (30° increments):
- 0: Red
- 1: Orange
- 2: Yellow
- 3: Green
- 4: Cyan
- 5: Blue
- 6: Magenta
- etc.

### Shading and shadows

Rendered pixels use 3 RGB channels:
1. **Primary color** (trait hue)
2. **Dark shadow** (darker shade for depth)
3. **Highlight/shading** (lighter accents)

## Performance

### Rendering optimization

- **Pre-computed pixel grids** for each trait variant
- **Lazy sprite composition** — only composite visible traits
- **Animation frame caching** — reuse frame data across instances
- **Terminal cell reuse** — minimal allocations per frame

### Small mode

Terminal rendering uses **8px width × 16px height** (small) for fast rendering:
- Used in agent startup messages
- 2 cells wide instead of 4
- Loses some detail but renders instantly

### SVG optimization

- CSS keyframes for animation (GPU-accelerated)
- Layered rendering (separate layers per animated component)
- Embeds directly in HTML or exports as files

## Advanced usage

### Grid-based generation

```ts
import { generateGrid } from 'termlings';

// Get the pixel grid for a DNA string
const grid = generateGrid(dna, {
  walking: true,
  frame: 2,
});
// Returns 2D array of Pixel types

// Render manually
for (const row of grid) {
  for (const pixel of row) {
    // Custom rendering...
  }
}
```

### Custom rendering targets

Extend termlings by implementing custom renderers:

```ts
import { decodeDNA, generateGrid } from 'termlings';

function renderToCanvas(dna: string, canvas: CanvasRenderingContext2D) {
  const grid = generateGrid(dna);
  const traits = decodeDNA(dna);

  // Custom pixel-to-canvas mapping
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const pixel = grid[y][x];
      // Draw to canvas...
    }
  }
}
```

## Examples

```bash
# Render and view
npx termlings render 0a3f201

# Render by name
npx termlings render Alice

# Animated terminal
npx termlings render 0a3f201 --walk --talk --wave

# Export SVG
npx termlings render 0a3f201 --svg > avatar.svg

# Animated SVG
npx termlings render 0a3f201 --svg --animated --walk > avatar-animated.svg
```

