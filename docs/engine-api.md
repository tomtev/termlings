# Termlings Engine API Reference

```ts
import { ... } from "termlings/engine"
```

---

## Types & Interfaces

### Core

#### `RGB`

```ts
type RGB = [number, number, number]
```

A 3-tuple of 0–255 color channel values `[red, green, blue]`.

#### `Cell`

```ts
interface Cell {
  ch: string       // single character to display
  fg: RGB | null   // foreground color
  bg: RGB | null   // background color
}
```

One character-cell in the screen buffer.

#### `TileDef`

```ts
interface TileDef {
  ch: string         // display character
  fg: RGB | null     // foreground color
  bg: RGB | null     // background color
  walkable: boolean  // whether entities can walk through this tile
}
```

Defines how a map tile character is rendered and whether it blocks movement.

#### `SimConfig`

```ts
interface SimConfig {
  frameMs: number         // milliseconds per sim frame
  moveInterval: number    // ticks between movement steps
  holdWindow: number      // ms a key is considered "held" after press
  spriteWidth: number     // entity sprite width in tile columns
  collisionInset: number  // inset for entity collision box
  nameProximity: number   // tile distance within which NPC names show
  animation: {
    walkTicks: number     // ticks per walk animation frame
    talkTicks: number     // ticks per talk animation frame
    waveTicks: number     // ticks per wave animation frame
    idleTicks: number     // ticks per idle shuffle frame
    blinkChance: number   // per-tick probability of idle blink
  }
}
```

#### `DEFAULT_CONFIG`

```ts
const DEFAULT_CONFIG: SimConfig
```

Default sim configuration values:

| Field | Value |
|---|---|
| `frameMs` | `16` |
| `moveInterval` | `30` |
| `holdWindow` | `250` |
| `spriteWidth` | `9` |
| `collisionInset` | `1` |
| `nameProximity` | `20` |
| `animation.walkTicks` | `20` |
| `animation.talkTicks` | `12` |
| `animation.waveTicks` | `36` |
| `animation.idleTicks` | `150` |
| `animation.blinkChance` | `0.015` |

---

### Map

#### `ParsedMap`

```ts
interface ParsedMap {
  tiles: string[][]                              // 2D grid of tile characters
  width: number                                  // map width in tiles
  height: number                                 // map height in tiles
  npcSpawns: { x: number; y: number; name?: string }[]  // NPC spawn points
  playerSpawn: { x: number; y: number }          // player spawn point
  rooms: RoomRegion[]                            // detected room regions
  name?: string                                  // optional map name
  tileDefs: Record<string, TileDef>              // tile definitions used
}
```

Result of parsing a map from text. Contains the tile grid, spawn points, and detected rooms.

#### `LoadedMap`

```ts
interface LoadedMap extends ParsedMap {
  objectDefs: Record<string, FurnitureDef>  // custom object definitions from map.json
  placements: FurniturePlacement[]          // furniture/object placements
  doors: DoorDef[]                          // door definitions
}
```

A fully loaded map with furniture placements and doors. Returned by `loadMap`, `loadDefaultMap`, `loadMapJson`, and `parseMapJson`.

#### `RoomRegion`

```ts
interface RoomRegion {
  name: string  // auto-generated name (e.g. "room1")
  x: number     // left edge (tiles)
  y: number     // top edge (tiles)
  w: number     // width (tiles)
  h: number     // height (tiles)
}
```

A rectangular wall-bounded region detected on the map.

#### `MapJson`

```ts
interface MapJson {
  name?: string
  version?: number
  tiles: Record<string, {
    ch: string
    fg: number[] | null
    bg?: number[] | null
    walkable: boolean
  }>
  grid: string[]
  objects?: Record<string, ObjectJson>
  placements?: { object: string; x: number; y: number }[]
  doors?: { x: number; y: number; orientation: string; length: number; color: number[] }[]
  spawns?: { type: string; x: number; y: number; name?: string }[]
}
```

Schema for the unified `map.json` format.

#### `ObjectJson`

```ts
interface ObjectJson {
  width: number
  height: number
  palette: Record<string, {
    ch: string
    fg: number[] | null
    bg?: number[] | null
    walkable: boolean
  }>
  grid: string[]
}
```

Schema for a custom object definition inside `map.json`.

---

### Entity

#### `Entity`

```ts
interface Entity {
  dna: string               // encoded DNA string
  name?: string             // display name
  x: number                 // tile x position (top-left of sprite)
  y: number                 // tile y position (top-left of sprite)
  walkFrame: number         // current walk animation frame
  talkFrame: number         // current talk animation frame (0 or 1)
  waveFrame: number         // current wave animation frame (0, 1, or 2)
  flipped: boolean          // facing left when true
  backside: boolean         // showing back when true
  traits: DecodedDNA        // decoded trait values
  faceRgb: RGB              // face/body color
  darkRgb: RGB              // dark accent color (eyes, details)
  hatRgb: RGB               // hat color
  legFrames: number         // total leg animation frames for this leg type
  height: number            // sprite height in tile rows
  walking: boolean          // currently walking
  talking: boolean          // currently talking
  waving: boolean           // currently waving
  idle: boolean             // currently idle
  targetX?: number          // NPC wander target x
  targetY?: number          // NPC wander target y
  idleTicks?: number        // NPC idle countdown
}
```

A sim entity (player or NPC) with position, animation state, and appearance.

#### `BubbleInfo`

```ts
interface BubbleInfo {
  x: number     // entity tile x
  y: number     // entity tile y
  text: string  // bubble text content
  fg: RGB       // text color
}
```

Data for rendering a speech bubble above an entity.

#### `ChatMessage`

```ts
interface ChatMessage {
  name: string  // sender name
  text: string  // message content
  time: number  // timestamp (Date.now())
  fg: RGB       // name color
}
```

A chat message for the in-sim chat overlay.

---

### Furniture

#### `FurnitureOverlay`

```ts
interface FurnitureOverlay {
  visual: Map<number, Cell>     // tile key → visual override
  walkable: Map<number, boolean> // tile key → walkability override
}
```

Overlay that modifies tile rendering and walkability for placed furniture. Keys are produced by `tileKey(x, y)`.

#### `FurnitureDef`

```ts
interface FurnitureDef {
  name: string
  width: number
  height: number
  cells: (FurnitureCell | null)[][]  // [row][col], null = transparent
}
```

Definition of a furniture type's visual layout and collision.

#### `FurnitureCell`

```ts
interface FurnitureCell {
  ch: string         // display character
  fg: RGB | null     // foreground color
  bg: RGB | null     // background color
  walkable: boolean  // whether entities can walk on this cell
}
```

A single cell within a furniture definition.

#### `FurniturePlacement`

```ts
interface FurniturePlacement {
  def: string  // key into FURNITURE_DEFS or custom object defs
  x: number    // tile x (top-left)
  y: number    // tile y (top-left)
}
```

A placed instance of a furniture definition on the map.

#### `FURNITURE_DEFS`

```ts
const FURNITURE_DEFS: Record<string, FurnitureDef>
```

Built-in furniture definitions. Keys: `"sofa"`, `"sofa_large"`, `"table"`, `"bookshelf"`, `"chair"`, `"office_chair"`.

---

### Doors

#### `DoorDef`

```ts
interface DoorDef {
  x: number
  y: number
  orientation: "vertical" | "horizontal"
  length: number  // tiles (e.g. 8 for vertical, 16 for horizontal)
  color: RGB      // door color (usually matches adjacent wall)
}
```

Static definition of a door's position and appearance.

#### `DoorState`

```ts
interface DoorState {
  def: DoorDef
  openAmount: number   // 0 = closed, 4 = fully open
  closeTimer: number   // ticks since last entity nearby
}
```

Runtime state for an animated door. Updated each tick by `updateDoors`.

---

### Input

#### `InputState`

```ts
interface InputState {
  lastPressTime: Record<string, number>  // direction → last press timestamp
  pending: Record<string, boolean>       // direction → queued move
  holdWindow: number                     // ms before a key is no longer "held"
  moveInterval: number                   // ticks between moves
}
```

Tracks directional key state for movement input.

#### `KeyHandler`

```ts
type KeyHandler = (key: string, raw: string) => void
```

Callback for non-arrow key presses. `key` is the individual character, `raw` is the full data chunk.

---

### NPC AI

#### `WalkGrid`

```ts
interface WalkGrid {
  data: Uint8Array  // flat array: 1 = a 9-wide entity can stand here
  width: number
  height: number
}
```

Pre-computed walkability grid for pathfinding. A cell is `1` if tiles `x+1` through `x+7` are all walkable (matching the 9-tile entity footprint).

#### `PathfinderState`

```ts
interface PathfinderState {
  gScore: Map<number, number>
  parent: Map<number, number>
  openSet: number[]
  fScore: Map<number, number>
}
```

Reusable A\* allocations. Create once and pass to `findPath` repeatedly to avoid per-call allocation.

#### `NpcAIState`

```ts
interface NpcAIState {
  path: Int16Array | null  // current path (x,y pairs)
  pathIdx: number          // index into path
  stepX: number            // interpolation target x
  stepY: number            // interpolation target y
  stuckTicks: number       // ticks stuck at same position
  phase: "idle" | "walking" | "waiting"
  idleRemaining: number    // ticks left in idle phase
  waitRemaining: number    // ticks left in micro-pause
  retries: number          // consecutive failed pathfind attempts
}
```

Per-NPC AI behavior state machine. Cycles through idle → walking → waiting → idle.

#### `StepResult`

```ts
interface StepResult {
  moved: boolean             // entity position changed this tick
  startedWalking: boolean    // just picked a new path target
  arrivedAtTarget: boolean   // just reached end of path
}
```

Return value from `stepNpc` indicating what happened this tick.

---

## Functions

### Map Loading

#### `loadMap`

```ts
function loadMap(dir: string): LoadedMap
```

Load a map from a directory. Prefers `map.json` (unified format), falls back to `map.txt` + optional `tiles.json` (legacy format).

| Param | Type | Description |
|---|---|---|
| `dir` | `string` | Path to directory containing map files |

**Returns:** `LoadedMap`

#### `loadDefaultMap`

```ts
function loadDefaultMap(): LoadedMap
```

Load the built-in default map bundled with the package (`src/default-map/`).

**Returns:** `LoadedMap`

#### `loadMapJson`

```ts
function loadMapJson(path: string): LoadedMap
```

Load and parse a `map.json` file from disk.

| Param | Type | Description |
|---|---|---|
| `path` | `string` | Absolute path to a `map.json` file |

**Returns:** `LoadedMap`

#### `parseMapJson`

```ts
function parseMapJson(json: MapJson): LoadedMap
```

Parse an already-loaded `MapJson` object into a `LoadedMap`. Useful when you have the JSON in memory.

| Param | Type | Description |
|---|---|---|
| `json` | `MapJson` | Parsed JSON object |

**Returns:** `LoadedMap`

#### `parseObjectDef`

```ts
function parseObjectDef(name: string, obj: ObjectJson): FurnitureDef
```

Parse a custom object definition from `map.json` into a `FurnitureDef`.

| Param | Type | Description |
|---|---|---|
| `name` | `string` | Object name |
| `obj` | `ObjectJson` | Object definition from JSON |

**Returns:** `FurnitureDef`

#### `loadMapFromString`

```ts
function loadMapFromString(raw: string, tileDefs?: Record<string, TileDef>): ParsedMap
```

Parse a raw ASCII map string into a `ParsedMap`. Detects spawn points (`S` for player, `P` for NPCs) and rooms.

| Param | Type | Description |
|---|---|---|
| `raw` | `string` | ASCII map text (newline-separated rows) |
| `tileDefs` | `Record<string, TileDef>` | Tile definitions (defaults to `DEFAULT_TILE_DEFS`) |

**Returns:** `ParsedMap`

---

### Tilemap & Tiles

#### `DEFAULT_TILE_DEFS`

```ts
const DEFAULT_TILE_DEFS: Record<string, TileDef>
```

Built-in tile definitions. Keys include: `" "` (void), `"."` (floor), `"#"` (stone wall), `"B"` (brown wall), `"W"` (white wall), `"G"` (green wall), `"*"` (decoration), `"~"` (water), `","` (grass), `"T"` (tree), `"D"` (door floor), `"P"` (NPC spawn), `"S"` (player spawn), `"n"` (snow), `"e"` (earth), `"p"` (paving), `"h"` (hardwood).

#### `detectRooms`

```ts
function detectRooms(
  tiles: string[][],
  width: number,
  height: number,
  tileDefs: Record<string, TileDef>,
): RoomRegion[]
```

Detect rectangular wall-bounded rooms in a tile grid. A region qualifies as a room if it is at least 11 tiles wide and 6 tiles tall.

| Param | Type | Description |
|---|---|---|
| `tiles` | `string[][]` | 2D tile grid |
| `width` | `number` | Grid width |
| `height` | `number` | Grid height |
| `tileDefs` | `Record<string, TileDef>` | Tile definitions for walkability checks |

**Returns:** `RoomRegion[]`

#### `stampTiles`

```ts
function stampTiles(
  buffer: Cell[][],
  cols: number,
  rows: number,
  tiles: string[][],
  tileDefs: Record<string, TileDef>,
  mapWidth: number,
  mapHeight: number,
  cameraX: number,
  cameraY: number,
  scale: number,
  footprints?: Map<number, number>,
  tick?: number,
  wind?: number,
): void
```

Render visible tiles from the tile map into the screen buffer. Supports ground character variation, footprint flattening, and wind animation for grass tiles.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer to write into |
| `cols` | `number` | Buffer width |
| `rows` | `number` | Buffer height |
| `tiles` | `string[][]` | Map tile grid |
| `tileDefs` | `Record<string, TileDef>` | Tile definitions |
| `mapWidth` | `number` | Map width in tiles |
| `mapHeight` | `number` | Map height in tiles |
| `cameraX` | `number` | Camera x offset (tiles) |
| `cameraY` | `number` | Camera y offset (tiles) |
| `scale` | `number` | Horizontal scale factor (2 at zoom 0, 1 at zoom 1) |
| `footprints` | `Map<number, number>` | Optional tile keys where ground is flattened |
| `tick` | `number` | Optional sim tick for animation |
| `wind` | `number` | Optional wind strength (0–1) for grass sway |

#### `isWalkable`

```ts
function isWalkable(
  tiles: string[][],
  tileDefs: Record<string, TileDef>,
  mapWidth: number,
  mapHeight: number,
  wx: number,
  wy: number,
  furniture?: FurnitureOverlay,
): boolean
```

Check if a tile position is walkable. Furniture overlay takes precedence over tile definitions.

| Param | Type | Description |
|---|---|---|
| `tiles` | `string[][]` | Map tile grid |
| `tileDefs` | `Record<string, TileDef>` | Tile definitions |
| `mapWidth` | `number` | Map width |
| `mapHeight` | `number` | Map height |
| `wx` | `number` | World x position |
| `wy` | `number` | World y position |
| `furniture` | `FurnitureOverlay` | Optional furniture overlay |

**Returns:** `boolean`

---

### Camera

#### `tileScaleX`

```ts
function tileScaleX(zoomLevel: number): number
```

Get the horizontal scale factor for a zoom level. Returns `2` at zoom 0 (normal), `1` at zoom 1 (small).

| Param | Type | Description |
|---|---|---|
| `zoomLevel` | `number` | `0` = normal, `1` = zoomed out |

**Returns:** `number` — scale factor

#### `tileToScreenX`

```ts
function tileToScreenX(tx: number, cameraX: number, zoomLevel: number): number
```

Convert a tile x coordinate to a screen column.

| Param | Type | Description |
|---|---|---|
| `tx` | `number` | Tile x position |
| `cameraX` | `number` | Camera x offset |
| `zoomLevel` | `number` | Current zoom level |

**Returns:** `number` — screen x column

#### `screenToTileX`

```ts
function screenToTileX(sx: number, cameraX: number, zoomLevel: number): number
```

Convert a screen column to a tile x coordinate.

| Param | Type | Description |
|---|---|---|
| `sx` | `number` | Screen column |
| `cameraX` | `number` | Camera x offset |
| `zoomLevel` | `number` | Current zoom level |

**Returns:** `number` — tile x position

#### `computeCamera`

```ts
function computeCamera(
  target: Entity,
  cols: number,
  rows: number,
  zoomLevel: number,
): { cameraX: number; cameraY: number }
```

Compute camera position centered on a target entity.

| Param | Type | Description |
|---|---|---|
| `target` | `Entity` | Entity to center on |
| `cols` | `number` | Screen width in columns |
| `rows` | `number` | Screen height in rows |
| `zoomLevel` | `number` | Current zoom level |

**Returns:** `{ cameraX: number; cameraY: number }`

---

### Entity

#### `spriteHeight`

```ts
function spriteHeight(dna: string): number
```

Get the full sprite height (in tile rows) for a DNA string at normal zoom.

| Param | Type | Description |
|---|---|---|
| `dna` | `string` | Encoded DNA string |

**Returns:** `number` — height in rows

#### `entityHeight`

```ts
function entityHeight(traits: { hat: number }, zoomLevel: number): number
```

Get the rendered entity height for a given hat type and zoom level. At zoom 1, the height is halved (ceiling).

| Param | Type | Description |
|---|---|---|
| `traits` | `{ hat: number }` | Object with hat trait index |
| `zoomLevel` | `number` | Current zoom level |

**Returns:** `number` — height in rows

#### `makeEntity`

```ts
function makeEntity(
  dna: string,
  x: number,
  y: number,
  zoomLevel: number,
  opts?: {
    walking?: boolean
    talking?: boolean
    waving?: boolean
    idle?: boolean
    flipped?: boolean
  },
): Entity
```

Create a new entity from a DNA string. Decodes traits, computes colors, and sets initial animation state.

| Param | Type | Description |
|---|---|---|
| `dna` | `string` | Encoded DNA string |
| `x` | `number` | Initial tile x |
| `y` | `number` | Initial tile y |
| `zoomLevel` | `number` | Current zoom level (affects height) |
| `opts` | `object` | Optional initial animation flags |

**Returns:** `Entity`

#### `updateAnimations`

```ts
function updateAnimations(
  entities: Entity[],
  tick: number,
  config: SimConfig,
): void
```

Update all animation frames for a list of entities in a single pass. Advances walk, talk, wave, and idle frames based on tick intervals. Handles idle blinking.

| Param | Type | Description |
|---|---|---|
| `entities` | `Entity[]` | Entities to animate |
| `tick` | `number` | Current sim tick |
| `config` | `SimConfig` | Sim configuration with animation timing |

#### `stampBubbles`

```ts
function stampBubbles(
  buffer: Cell[][],
  cols: number,
  rows: number,
  bubbles: BubbleInfo[],
  cameraX: number,
  cameraY: number,
  scale: number,
): void
```

Render speech bubbles above entities. Positions text centered above each entity's sprite and pushes overlapping bubbles upward.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer |
| `cols` | `number` | Buffer width |
| `rows` | `number` | Buffer height |
| `bubbles` | `BubbleInfo[]` | Bubble data to render |
| `cameraX` | `number` | Camera x offset |
| `cameraY` | `number` | Camera y offset |
| `scale` | `number` | Horizontal scale factor |

#### `stampNames`

```ts
function stampNames(
  buffer: Cell[][],
  cols: number,
  rows: number,
  npcs: Entity[],
  player: Entity,
  cameraX: number,
  cameraY: number,
  scale: number,
  proximity: number,
): void
```

Show NPC names above their heads when the player is within proximity range.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer |
| `cols` | `number` | Buffer width |
| `rows` | `number` | Buffer height |
| `npcs` | `Entity[]` | NPC entities |
| `player` | `Entity` | Player entity |
| `cameraX` | `number` | Camera x offset |
| `cameraY` | `number` | Camera y offset |
| `scale` | `number` | Horizontal scale factor |
| `proximity` | `number` | Max tile distance for name display |

---

### Rendering

#### `allocBuffer`

```ts
function allocBuffer(cols: number, rows: number): Cell[][]
```

Allocate a 2D screen buffer filled with blank cells.

| Param | Type | Description |
|---|---|---|
| `cols` | `number` | Width in columns |
| `rows` | `number` | Height in rows |

**Returns:** `Cell[][]`

#### `clearBuffer`

```ts
function clearBuffer(buffer: Cell[][], cols: number, rows: number): void
```

Reset all cells in a buffer to blank (space, no color). Reuses the existing allocation.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Buffer to clear |
| `cols` | `number` | Width |
| `rows` | `number` | Height |

#### `renderBuffer`

```ts
function renderBuffer(buffer: Cell[][], cols: number, rows: number): Buffer
```

Render the screen buffer to a Node.js `Buffer` of ANSI escape sequences for direct `stdout.write()`. Uses a pre-allocated internal buffer to avoid per-frame allocation.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer |
| `cols` | `number` | Width |
| `rows` | `number` | Height |

**Returns:** `Buffer` — ANSI-encoded output ready for `process.stdout.write()`

#### `stampEntity`

```ts
function stampEntity(
  buffer: Cell[][],
  cols: number,
  rows: number,
  e: Entity,
  cameraX: number,
  cameraY: number,
  scale: number,
): void
```

Stamp an entity sprite into the screen buffer at normal zoom (2 chars per tile column). Uses cached sprite grids to avoid per-frame regeneration.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer |
| `cols` | `number` | Buffer width |
| `rows` | `number` | Buffer height |
| `e` | `Entity` | Entity to render |
| `cameraX` | `number` | Camera x offset |
| `cameraY` | `number` | Camera y offset |
| `scale` | `number` | Horizontal scale factor |

#### `stampEntitySmall`

```ts
function stampEntitySmall(
  buffer: Cell[][],
  cols: number,
  rows: number,
  e: Entity,
  cameraX: number,
  cameraY: number,
): void
```

Stamp an entity sprite in small/zoomed-out mode using half-block characters (1 char per column, 2 pixel rows per row).

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer |
| `cols` | `number` | Buffer width |
| `rows` | `number` | Buffer height |
| `e` | `Entity` | Entity to render |
| `cameraX` | `number` | Camera x offset |
| `cameraY` | `number` | Camera y offset |

#### `stampUI`

```ts
function stampUI(
  buffer: Cell[][],
  cols: number,
  rows: number,
  hud: { text: string; active?: boolean; fg?: RGB }[],
): void
```

Draw a border and HUD text segments onto the buffer. Renders box-drawing border characters on all four edges and HUD text along the bottom row.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer |
| `cols` | `number` | Buffer width |
| `rows` | `number` | Buffer height |
| `hud` | `{ text, active?, fg? }[]` | HUD text segments; active segments are highlighted |

#### `stampText`

```ts
function stampText(
  buffer: Cell[][],
  cols: number,
  rows: number,
  x: number,
  y: number,
  text: string,
  fg: RGB,
): void
```

Stamp a text string at a position in the buffer.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer |
| `cols` | `number` | Buffer width |
| `rows` | `number` | Buffer height |
| `x` | `number` | Column position |
| `y` | `number` | Row position |
| `text` | `string` | Text to render |
| `fg` | `RGB` | Text color |

#### `stampChatMessages`

```ts
function stampChatMessages(
  buffer: Cell[][],
  cols: number,
  rows: number,
  messages: ChatMessage[],
): void
```

Render recent chat messages right-aligned inside the border. Messages older than 30 seconds are hidden.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer |
| `cols` | `number` | Buffer width |
| `rows` | `number` | Buffer height |
| `messages` | `ChatMessage[]` | All chat messages (filtered internally) |

#### `stampChatInput`

```ts
function stampChatInput(
  buffer: Cell[][],
  cols: number,
  rows: number,
  text: string,
): void
```

Render the chat input bar on the bottom row, replacing the HUD.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer |
| `cols` | `number` | Buffer width |
| `rows` | `number` | Buffer height |
| `text` | `string` | Current input text |

#### `pixelCell`

```ts
function pixelCell(
  p: Pixel,
  face: RGB,
  dark: RGB,
  hat: RGB,
  flipped: boolean,
): { chars: string; fg: RGB | null; bg: RGB | null } | null
```

Convert a sprite pixel type to its 2-character cell representation with colors. Returns `null` for transparent pixels.

| Param | Type | Description |
|---|---|---|
| `p` | `Pixel` | Pixel type character |
| `face` | `RGB` | Face/body color |
| `dark` | `RGB` | Dark accent color |
| `hat` | `RGB` | Hat color |
| `flipped` | `boolean` | Whether sprite is horizontally flipped |

**Returns:** `{ chars: string; fg: RGB | null; bg: RGB | null } | null`

#### `pixelRgb`

```ts
function pixelRgb(p: Pixel, face: RGB, dark: RGB, hat: RGB): RGB | null
```

Resolve a sprite pixel type to its primary color. Returns `null` for transparent pixels.

| Param | Type | Description |
|---|---|---|
| `p` | `Pixel` | Pixel type character |
| `face` | `RGB` | Face/body color |
| `dark` | `RGB` | Dark accent color |
| `hat` | `RGB` | Hat color |

**Returns:** `RGB | null`

---

### Furniture

#### `stampFurniturePiece`

```ts
function stampFurniturePiece(
  buffer: Cell[][],
  cols: number,
  rows: number,
  placement: FurniturePlacement,
  cameraX: number,
  cameraY: number,
  scale: number,
  defs?: Record<string, FurnitureDef>,
): void
```

Render a single furniture piece into the screen buffer. Typically used during the entity z-sort pass so furniture interleaves correctly with entities.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer |
| `cols` | `number` | Buffer width |
| `rows` | `number` | Buffer height |
| `placement` | `FurniturePlacement` | Placement to render |
| `cameraX` | `number` | Camera x offset |
| `cameraY` | `number` | Camera y offset |
| `scale` | `number` | Horizontal scale factor |
| `defs` | `Record<string, FurnitureDef>` | Furniture definitions (defaults to `FURNITURE_DEFS`) |

#### `furnitureSortY`

```ts
function furnitureSortY(
  placement: FurniturePlacement,
  defs?: Record<string, FurnitureDef>,
): number
```

Get the bottom y coordinate of a furniture placement, used as the sort key for z-ordering with entities.

| Param | Type | Description |
|---|---|---|
| `placement` | `FurniturePlacement` | Furniture placement |
| `defs` | `Record<string, FurnitureDef>` | Furniture definitions (defaults to `FURNITURE_DEFS`) |

**Returns:** `number` — bottom y tile coordinate

#### `buildFurnitureOverlay`

```ts
function buildFurnitureOverlay(
  placements: FurniturePlacement[],
  defs?: Record<string, FurnitureDef>,
): FurnitureOverlay
```

Build a `FurnitureOverlay` from a list of placements. The overlay stores per-tile visual and walkability overrides keyed by `tileKey(x, y)`.

| Param | Type | Description |
|---|---|---|
| `placements` | `FurniturePlacement[]` | Furniture placements |
| `defs` | `Record<string, FurnitureDef>` | Furniture definitions (defaults to `FURNITURE_DEFS`) |

**Returns:** `FurnitureOverlay`

---

### Doors

#### `createDoors`

```ts
function createDoors(
  defs: DoorDef[],
  furnitureOverlay: FurnitureOverlay,
): DoorState[]
```

Initialize door states and set their initial closed tiles in the furniture overlay.

| Param | Type | Description |
|---|---|---|
| `defs` | `DoorDef[]` | Door definitions |
| `furnitureOverlay` | `FurnitureOverlay` | Overlay to write closed-door tiles into |

**Returns:** `DoorState[]`

#### `updateDoors`

```ts
function updateDoors(
  doors: DoorState[],
  entities: Entity[],
  furnitureOverlay: FurnitureOverlay,
  tick: number,
): void
```

Update door animations. Doors open when any entity is within 6 tiles of their center, and close after ~1.5 seconds with no nearby entities. Updates the furniture overlay to reflect blocked tiles.

| Param | Type | Description |
|---|---|---|
| `doors` | `DoorState[]` | Door states to update |
| `entities` | `Entity[]` | All entities (player + NPCs) |
| `furnitureOverlay` | `FurnitureOverlay` | Overlay to update |
| `tick` | `number` | Current sim tick |

#### `stampDoors`

```ts
function stampDoors(
  buffer: Cell[][],
  cols: number,
  rows: number,
  doors: DoorState[],
  cameraX: number,
  cameraY: number,
  scale: number,
): void
```

Render door tiles that are still blocked (not fully retracted) into the screen buffer.

| Param | Type | Description |
|---|---|---|
| `buffer` | `Cell[][]` | Screen buffer |
| `cols` | `number` | Buffer width |
| `rows` | `number` | Buffer height |
| `doors` | `DoorState[]` | Door states |
| `cameraX` | `number` | Camera x offset |
| `cameraY` | `number` | Camera y offset |
| `scale` | `number` | Horizontal scale factor |

---

### Input

#### `createInputState`

```ts
function createInputState(config: SimConfig): InputState
```

Create an `InputState` initialized from config values.

| Param | Type | Description |
|---|---|---|
| `config` | `SimConfig` | Sim configuration |

**Returns:** `InputState`

#### `pressDir`

```ts
function pressDir(state: InputState, dir: string): void
```

Record a directional key press. Updates the press timestamp and marks the direction as pending. Also refreshes other held directions within the hold window.

| Param | Type | Description |
|---|---|---|
| `state` | `InputState` | Input state |
| `dir` | `string` | Direction: `"up"`, `"down"`, `"left"`, or `"right"` |

#### `isHeld`

```ts
function isHeld(state: InputState, dir: string): boolean
```

Check if a direction key is currently being held (pressed within the hold window).

| Param | Type | Description |
|---|---|---|
| `state` | `InputState` | Input state |
| `dir` | `string` | Direction to check |

**Returns:** `boolean`

#### `setupInput`

```ts
function setupInput(
  stdin: NodeJS.ReadStream,
  onArrow: (dir: string) => void,
  onKey: KeyHandler,
): () => void
```

Set up raw stdin for keypress handling. Parses ANSI escape sequences for arrow keys and dispatches individual characters to the key handler. Caller must set raw mode before calling.

| Param | Type | Description |
|---|---|---|
| `stdin` | `NodeJS.ReadStream` | Input stream (usually `process.stdin`) |
| `onArrow` | `(dir: string) => void` | Called with `"up"`, `"down"`, `"left"`, or `"right"` |
| `onKey` | `KeyHandler` | Called for each non-arrow keypress |

**Returns:** `() => void` — cleanup function to remove the listener

---

### Sound

#### `playFootstep`

```ts
function playFootstep(screenX: number, screenWidth: number): void
```

Play a footstep sound with positional stereo panning. Throttled to one sound per 250ms. Uses pre-panned WAV files and `afplay` on macOS.

| Param | Type | Description |
|---|---|---|
| `screenX` | `number` | Sound source x position on screen |
| `screenWidth` | `number` | Total screen width in columns |

#### `stepSound`

```ts
function stepSound(screenX: number, screenWidth: number): void
```

Play a player footstep if sound is enabled. Convenience wrapper around `playFootstep` that skips playback when sound is disabled.

| Param | Type | Description |
|---|---|---|
| `screenX` | `number` | Sound source x on screen |
| `screenWidth` | `number` | Total screen width |

#### `npcStepSound`

```ts
function npcStepSound(screenX: number, screenWidth: number): void
```

Play an NPC footstep sound. Separate throttle from player steps (400ms interval). Should only be called for the nearest on-screen NPC to avoid sound spam.

| Param | Type | Description |
|---|---|---|
| `screenX` | `number` | Sound source x on screen |
| `screenWidth` | `number` | Total screen width |

#### `isSoundEnabled`

```ts
function isSoundEnabled(): boolean
```

Check whether sound effects are currently enabled.

**Returns:** `boolean`

#### `toggleSound`

```ts
function toggleSound(): boolean
```

Toggle sound effects on/off.

**Returns:** `boolean` — new enabled state

---

### NPC AI

#### `buildWalkGrid`

```ts
function buildWalkGrid(
  tiles: string[][],
  tileDefs: Record<string, TileDef>,
  mapWidth: number,
  mapHeight: number,
  furniture: FurnitureOverlay,
  doors: DoorDef[],
): WalkGrid
```

Pre-compute a walkability grid for NPC pathfinding. Each cell is marked walkable if all tiles under a 9-wide entity footprint (`x+1` through `x+7`) are walkable. Door tiles are forced walkable so NPCs can plan paths through closed doors.

| Param | Type | Description |
|---|---|---|
| `tiles` | `string[][]` | Map tile grid |
| `tileDefs` | `Record<string, TileDef>` | Tile definitions |
| `mapWidth` | `number` | Map width |
| `mapHeight` | `number` | Map height |
| `furniture` | `FurnitureOverlay` | Furniture overlay |
| `doors` | `DoorDef[]` | Door definitions (tiles forced walkable) |

**Returns:** `WalkGrid`

#### `createPathfinderState`

```ts
function createPathfinderState(): PathfinderState
```

Create a reusable A\* pathfinder state. Allocate once and pass to `findPath` repeatedly to avoid per-call allocation.

**Returns:** `PathfinderState`

#### `findPath`

```ts
function findPath(
  grid: WalkGrid,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  bounds: { x0: number; y0: number; x1: number; y1: number },
  state: PathfinderState,
  maxNodes?: number,
): Int16Array | null
```

A\* pathfinding on the walk grid. 4-directional movement with Manhattan heuristic and binary min-heap. The path is simplified to remove collinear waypoints. Returns `null` if no path exists within the node budget.

| Param | Type | Description |
|---|---|---|
| `grid` | `WalkGrid` | Pre-computed walk grid |
| `sx` | `number` | Start x |
| `sy` | `number` | Start y |
| `gx` | `number` | Goal x |
| `gy` | `number` | Goal y |
| `bounds` | `{ x0, y0, x1, y1 }` | Search bounds (usually room + padding) |
| `state` | `PathfinderState` | Reusable allocations |
| `maxNodes` | `number` | Max nodes to expand (default `2000`) |

**Returns:** `Int16Array | null` — flat array of `[x, y, x, y, ...]` waypoints, or `null` if unreachable. Empty array if already at goal.

#### `createNpcAIState`

```ts
function createNpcAIState(): NpcAIState
```

Create initial NPC AI state with a randomized idle timer.

**Returns:** `NpcAIState`

#### `stepNpc`

```ts
function stepNpc(
  npc: Entity,
  ai: NpcAIState,
  grid: WalkGrid,
  rooms: RoomRegion[],
  pf: PathfinderState,
  canMoveToFn: (x: number, y: number, h: number) => boolean,
): StepResult
```

Advance one tick of NPC AI. Handles the idle → walking → waiting state machine: picks random targets within the NPC's room, pathfinds to them, walks step-by-step, adds micro-pauses, and handles stuck detection with path recomputation or giving up.

| Param | Type | Description |
|---|---|---|
| `npc` | `Entity` | NPC entity to update |
| `ai` | `NpcAIState` | NPC's AI state |
| `grid` | `WalkGrid` | Walk grid for pathfinding |
| `rooms` | `RoomRegion[]` | Map rooms |
| `pf` | `PathfinderState` | Reusable pathfinder state |
| `canMoveToFn` | `(x, y, h) => boolean` | Collision check callback |

**Returns:** `StepResult`

---

### IPC (Agent Control)

#### `AgentCommand`

```ts
interface AgentCommand {
  action: "walk" | "gesture" | "stop" | "say"
  x?: number            // target x (for walk)
  y?: number            // target y (for walk)
  type?: "wave" | "talk" // gesture type
  text?: string         // message text (for say)
  name?: string         // agent display name
  dna?: string          // agent DNA string
  ts: number            // timestamp
}
```

Command sent by an AI agent to control its avatar in the sim.

#### `AgentState`

```ts
interface AgentState {
  entities: AgentStateEntity[]
  map: {
    width: number; height: number; name?: string; tiles?: string[][]; mode?: "simple"
    rooms?: {
      id: number; wallType: string
      bounds: { x: number; y: number; w: number; h: number }
      center: { x: number; y: number }
      doors: { x: number; y: number; toRoom: number | null }[]
    }[]
  }
}
```

World state written by the sim for agent consumption. The `rooms` array is populated via flood-fill room detection when using a tile map.

#### `DetectedRoom`

```ts
interface DetectedRoom {
  id: number
  wallType: string   // "brick" | "stone" | "white" | "green" | "mixed" | "none"
  bounds: { x: number; y: number; w: number; h: number }
  center: { x: number; y: number }
  floorTiles: number
  doors: { x: number; y: number; toRoom: number | null }[]
}
```

A room detected by the flood-fill algorithm in `room-detect.ts`. Construction walls (`#`, `B`, `W`, `G`) form room boundaries and door tiles (`D`) act as connection points between rooms.

#### `RoomMap`

```ts
interface RoomMap {
  rooms: DetectedRoom[]
  outdoorAreas: { bounds: { x: number; y: number; w: number; h: number } }[]
}
```

Result of `detectBuildings()` — all detected indoor rooms and outdoor areas.

#### `AgentStateEntity`

```ts
interface AgentStateEntity {
  sessionId: string
  name: string
  x: number
  y: number
  footY: number
  idle: boolean
  dna: string
}
```

An entity in the world state snapshot.

#### `IPC_DIR`

```ts
const IPC_DIR: string  // ~/.termlings/sim/
```

Directory used for IPC files.

#### `ensureIpcDir`

```ts
function ensureIpcDir(): void
```

Create the IPC directory if it doesn't exist.

#### `writeCommand`

```ts
function writeCommand(sessionId: string, cmd: AgentCommand): void
```

Write a command file for the sim to pick up. The file is written to `~/.termlings/sim/{sessionId}.cmd.json`.

| Param | Type | Description |
|---|---|---|
| `sessionId` | `string` | Agent session identifier |
| `cmd` | `AgentCommand` | Command to send |

#### `pollCommands`

```ts
function pollCommands(): { sessionId: string; cmd: AgentCommand }[]
```

Read and delete all pending command files. Called by the sim every ~0.5 seconds.

**Returns:** Array of `{ sessionId, cmd }` pairs.

#### `writeState`

```ts
function writeState(state: AgentState): void
```

Write the current world state to `~/.termlings/sim/state.json`. Called by the sim every ~2 seconds.

| Param | Type | Description |
|---|---|---|
| `state` | `AgentState` | World state snapshot |

#### `readState`

```ts
function readState(): AgentState | null
```

Read the current world state from `state.json`. Returns `null` if no state file exists.

**Returns:** `AgentState | null`

#### `AgentMessage`

```ts
interface AgentMessage {
  from: string      // sender session ID
  fromName: string  // sender display name
  text: string      // message content
  ts: number        // timestamp
}
```

A message delivered from one agent to another.

#### `writeMessages`

```ts
function writeMessages(sessionId: string, messages: AgentMessage[]): void
```

Append messages to an agent's inbox file (`{sessionId}.msg.json`). Called by the sim when a nearby agent says something.

| Param | Type | Description |
|---|---|---|
| `sessionId` | `string` | Target agent session ID |
| `messages` | `AgentMessage[]` | Messages to deliver |

#### `readMessages`

```ts
function readMessages(sessionId: string): AgentMessage[]
```

Read and delete all pending messages for a session. Returns an empty array if no messages exist.

| Param | Type | Description |
|---|---|---|
| `sessionId` | `string` | Agent session ID |

**Returns:** `AgentMessage[]`

#### `cleanupIpc`

```ts
function cleanupIpc(): void
```

Delete all files in the IPC directory. Called on sim exit.

---

### Room Detection

#### `detectBuildings`

```ts
function detectBuildings(
  tiles: string[][], width: number, height: number,
  tileDefs: Record<string, TileDef>
): RoomMap
```

Flood-fill room detection. Walks every walkable tile using door tiles (`D`) as boundaries. Each connected component of walkable non-door tiles becomes a room. Returns rooms with bounding boxes, wall types, door positions, and connectivity.

#### `roomAt`

```ts
function roomAt(rooms: DetectedRoom[], x: number, y: number): DetectedRoom | null
```

Returns which room a coordinate is inside, or `null` if outdoors.

#### `describeRelative`

```ts
function describeRelative(fx: number, fy: number, tx: number, ty: number): string
```

Returns a human-readable relative position like `"26 tiles NW"` or `"(here)"`.

---

### Utility

#### `tileKey`

```ts
function tileKey(x: number, y: number): number
```

Pack tile coordinates into a single numeric key for use as a `Map` key. Supports maps up to 65536 tiles wide.

| Param | Type | Description |
|---|---|---|
| `x` | `number` | Tile x coordinate |
| `y` | `number` | Tile y coordinate |

**Returns:** `number` — packed key: `(y << 16) | (x & 0xffff)`
