/**
 * Generates a village map.json with houses, roads, trees, flowers, and ponds.
 *
 * Usage: bun scripts/generate-village-map.ts
 */
import { writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputPath = join(__dirname, "..", "src", "default-map", "map.json")

// --- Map dimensions ---
const W = 400
const H = 200

// --- Grid helpers ---
const grid: string[][] = []
for (let y = 0; y < H; y++) {
  grid.push(new Array(W).fill(","))
}

function set(x: number, y: number, ch: string) {
  if (y >= 0 && y < H && x >= 0 && x < W) grid[y]![x] = ch
}

function fill(x1: number, y1: number, x2: number, y2: number, ch: string) {
  for (let y = Math.max(0, y1); y <= Math.min(H - 1, y2); y++)
    for (let x = Math.max(0, x1); x <= Math.min(W - 1, x2); x++)
      set(x, y, ch)
}

function hLine(x1: number, x2: number, y: number, ch: string) {
  for (let x = x1; x <= x2; x++) set(x, y, ch)
}

function vLine(x: number, y1: number, y2: number, ch: string) {
  for (let y = y1; y <= y2; y++) set(x, y, ch)
}

// --- Flower types ---
const FLOWER_CHARS = ["*", "f", "c", "r", "v", "o", "w"]
function isFlowerOrGrass(ch: string | undefined): boolean {
  return ch === "," || ch === "T" || (!!ch && FLOWER_CHARS.includes(ch))
}
function randomFlower(): string {
  return FLOWER_CHARS[Math.floor(rng() * FLOWER_CHARS.length)]!
}

// --- Seeded random for reproducible scatter ---
let seed = 42
function rng() {
  seed = (seed * 16807 + 0) % 2147483647
  return (seed - 1) / 2147483646
}

function randInt(min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min
}

// --- House definition ---
interface House {
  name: string
  x: number; y: number
  w: number; h: number
  wall: string
  floor: string
  doorSide: "north" | "south" | "east" | "west"
  doorOffset: number
}

const houses: House[] = [
  // === Top row (y ~10-60) ===
  { name: "Blacksmith",    x: 15,  y: 10,  w: 50, h: 35, wall: "B", floor: "e", doorSide: "south", doorOffset: 25 },
  { name: "Tavern",        x: 100, y: 8,   w: 65, h: 40, wall: "B", floor: "h", doorSide: "south", doorOffset: 32 },
  { name: "Library",       x: 210, y: 10,  w: 55, h: 35, wall: "#", floor: "p", doorSide: "south", doorOffset: 28 },
  { name: "Bakery",        x: 310, y: 12,  w: 45, h: 30, wall: "B", floor: "e", doorSide: "south", doorOffset: 22 },

  // === Middle row (y ~75-130) ===
  { name: "Cottage",       x: 12,  y: 78,  w: 45, h: 35, wall: "B", floor: "e", doorSide: "east",  doorOffset: 18 },
  { name: "Town Hall",     x: 110, y: 72,  w: 70, h: 45, wall: "W", floor: "p", doorSide: "south", doorOffset: 35 },
  { name: "General Store", x: 260, y: 76,  w: 50, h: 38, wall: "#", floor: "p", doorSide: "west",  doorOffset: 19 },
  { name: "Inn",           x: 340, y: 78,  w: 48, h: 35, wall: "B", floor: "h", doorSide: "west",  doorOffset: 18 },

  // === Bottom row (y ~145-190) ===
  { name: "Farm House",    x: 25,  y: 148, w: 50, h: 35, wall: "B", floor: "e", doorSide: "north", doorOffset: 25 },
  { name: "Chapel",        x: 130, y: 145, w: 60, h: 40, wall: "W", floor: "n", doorSide: "north", doorOffset: 30 },
  { name: "Healer",        x: 240, y: 150, w: 48, h: 32, wall: "W", floor: "n", doorSide: "north", doorOffset: 24 },
  { name: "Woodcutter",    x: 330, y: 148, w: 48, h: 35, wall: "B", floor: "e", doorSide: "north", doorOffset: 24 },
]

// --- Draw houses ---
interface DoorInfo {
  x: number; y: number
  orientation: "vertical" | "horizontal"
  length: number
}

const doorInfos: DoorInfo[] = []
const spawns: { type: string; x: number; y: number; name?: string }[] = []

const NPC_NAMES = [
  "Pip", "Mox", "Zara", "Kip", "Luna", "Remy", "Fern", "Ash",
  "Blix", "Coral", "Dex", "Echo", "Fizz", "Glow", "Hex", "Ivy",
  "Jazz", "Kit", "Lux", "Nova", "Opal", "Pix", "Rex", "Sky",
  "Wren", "Thorn", "Ember", "Birch",
]
let npcIdx = 0

for (const house of houses) {
  const { x, y, w, h, wall, floor, doorSide, doorOffset } = house

  // Draw walls (outer rectangle)
  hLine(x, x + w - 1, y, wall)
  hLine(x, x + w - 1, y + h - 1, wall)
  vLine(x, y, y + h - 1, wall)
  vLine(x + w - 1, y, y + h - 1, wall)

  // Fill interior with floor
  fill(x + 1, y + 1, x + w - 2, y + h - 2, floor)

  // Cut door opening (8 D tiles)
  const DOOR_LEN = 8
  const halfDoor = DOOR_LEN / 2

  let doorX: number, doorY: number
  let doorOrient: "vertical" | "horizontal"

  if (doorSide === "south") {
    doorX = x + doorOffset - halfDoor
    doorY = y + h - 1
    doorOrient = "horizontal"
    for (let i = 0; i < DOOR_LEN; i++) set(doorX + i, doorY, "D")
  } else if (doorSide === "north") {
    doorX = x + doorOffset - halfDoor
    doorY = y
    doorOrient = "horizontal"
    for (let i = 0; i < DOOR_LEN; i++) set(doorX + i, doorY, "D")
  } else if (doorSide === "east") {
    doorX = x + w - 1
    doorY = y + doorOffset - halfDoor
    doorOrient = "vertical"
    for (let i = 0; i < DOOR_LEN; i++) set(doorX, doorY + i, "D")
  } else {
    doorX = x
    doorY = y + doorOffset - halfDoor
    doorOrient = "vertical"
    for (let i = 0; i < DOOR_LEN; i++) set(doorX, doorY + i, "D")
  }

  doorInfos.push({ x: doorX, y: doorY, orientation: doorOrient, length: DOOR_LEN })

  // Place 3 NPCs inside each house
  const mx = 6
  spawns.push({ type: "npc", x: x + mx, y: y + mx, name: NPC_NAMES[npcIdx++ % NPC_NAMES.length] })
  spawns.push({ type: "npc", x: x + w - mx - 4, y: y + h - mx - 2, name: NPC_NAMES[npcIdx++ % NPC_NAMES.length] })
  spawns.push({ type: "npc", x: x + Math.floor(w / 2), y: y + Math.floor(h / 2), name: NPC_NAMES[npcIdx++ % NPC_NAMES.length] })
}

// --- Draw roads (`.` tiles) ---
// Road width: 5 tiles for main roads, 3 for branches

function hRoad(x1: number, x2: number, yCenter: number, width = 3) {
  const half = Math.floor(width / 2)
  for (let y = yCenter - half; y <= yCenter + half; y++)
    for (let x = x1; x <= x2; x++)
      if (grid[y]?.[x] === "," || grid[y]?.[x] === "*") set(x, y, ".")
}

function vRoad(xCenter: number, y1: number, y2: number, width = 3) {
  const half = Math.floor(width / 2)
  for (let x = xCenter - half; x <= xCenter + half; x++)
    for (let y = y1; y <= y2; y++)
      if (grid[y]?.[x] === "," || grid[y]?.[x] === "*") set(x, y, ".")
}

// Main east-west roads (5 wide)
hRoad(0, W - 1, 58, 5)     // upper main road
hRoad(0, W - 1, 138, 5)    // lower main road

// Main north-south roads (5 wide)
vRoad(90, 0, H - 1, 5)     // left spine
vRoad(200, 0, H - 1, 5)    // center spine
vRoad(320, 0, H - 1, 5)    // right spine

// --- Branch roads to houses (3 wide) ---

// Top row → upper road
vRoad(40, 45, 58)           // Blacksmith
vRoad(132, 48, 58)          // Tavern
vRoad(238, 45, 58)          // Library
vRoad(332, 42, 58)          // Bakery

// Middle row → roads
hRoad(57, 90, 96)           // Cottage east → left spine
vRoad(145, 117, 138)        // Town Hall south → lower road
hRoad(200, 260, 95)         // General Store west → center spine
hRoad(320, 340, 96)         // Inn west → right spine

// Bottom row → lower road
vRoad(50, 138, 148)         // Farm House north
vRoad(160, 138, 145)        // Chapel north
vRoad(264, 138, 150)        // Healer north
vRoad(354, 138, 148)        // Woodcutter north

// Extra cross-connectors
hRoad(90, 200, 96, 5)       // mid horizontal connector
hRoad(200, 320, 96, 3)      // mid right connector

// --- Village squares (wider paved areas at intersections) ---
fill(85, 53, 97, 63, ".")    // left spine × upper road
fill(195, 53, 207, 63, ".")  // center × upper road
fill(315, 53, 327, 63, ".")  // right × upper road
fill(195, 133, 207, 143, ".") // center × lower road

// --- Draw ponds ---
function drawPond(cx: number, cy: number, rx: number, ry: number) {
  for (let py = cy - ry; py <= cy + ry; py++) {
    for (let px = cx - rx; px <= cx + rx; px++) {
      const dx = (px - cx) / rx
      const dy = (py - cy) / ry
      if (dx * dx + dy * dy <= 1.0 && grid[py]?.[px] === ",") {
        set(px, py, "~")
      }
    }
  }
}

drawPond(300, 58, 15, 8)     // large pond near right spine
drawPond(50, 130, 12, 6)     // pond near farm area
drawPond(370, 130, 10, 5)    // small pond bottom-right

// --- Place trees ---
// Forest border (4 tiles deep)
for (let x = 0; x < W; x++) {
  for (let dy = 0; dy < 4; dy++) {
    if (grid[dy]![x] === ",") set(x, dy, "T")
    if (grid[H - 1 - dy]![x] === ",") set(x, H - 1 - dy, "T")
  }
}
for (let y = 0; y < H; y++) {
  for (let dx = 0; dx < 4; dx++) {
    if (grid[y]![dx] === ",") set(dx, y, "T")
    if (grid[y]![W - 1 - dx] === ",") set(W - 1 - dx, y, "T")
  }
}

// Scattered trees
for (let i = 0; i < 500; i++) {
  const tx = randInt(6, W - 7)
  const ty = randInt(6, H - 7)
  if (grid[ty]![tx] === ",") {
    const neighbors = [
      grid[ty - 1]?.[tx], grid[ty + 1]?.[tx],
      grid[ty]?.[tx - 1], grid[ty]?.[tx + 1],
    ]
    if (neighbors.every(n => isFlowerOrGrass(n))) {
      set(tx, ty, "T")
    }
  }
}

// Tree groves
const groves = [
  { cx: 75, cy: 20, r: 6 },
  { cx: 280, cy: 20, r: 7 },
  { cx: 380, cy: 50, r: 6 },
  { cx: 10, cy: 65, r: 5 },
  { cx: 380, cy: 100, r: 6 },
  { cx: 15, cy: 140, r: 5 },
  { cx: 200, cy: 170, r: 7 },
  { cx: 100, cy: 170, r: 5 },
  { cx: 350, cy: 170, r: 6 },
  { cx: 170, cy: 25, r: 5 },
  { cx: 230, cy: 130, r: 5 },
  { cx: 140, cy: 60, r: 4 },
  { cx: 260, cy: 60, r: 5 },
  { cx: 10, cy: 110, r: 4 },
  { cx: 390, cy: 170, r: 5 },
]
for (const grove of groves) {
  for (let gy = grove.cy - grove.r; gy <= grove.cy + grove.r; gy++) {
    for (let gx = grove.cx - grove.r; gx <= grove.cx + grove.r; gx++) {
      const dx = gx - grove.cx
      const dy = gy - grove.cy
      if (dx * dx + dy * dy <= grove.r * grove.r && grid[gy]?.[gx] === ",") {
        set(gx, gy, "T")
      }
    }
  }
}

// --- Place flowers (multi-color meadows and patches) ---

// Large colorful meadows — dense mixed flowers
const meadows = [
  { cx: 70,  cy: 15,  rx: 12, ry: 6, density: 0.5 },
  { cx: 170, cy: 20,  rx: 10, ry: 5, density: 0.45 },
  { cx: 280, cy: 15,  rx: 10, ry: 5, density: 0.45 },
  { cx: 65,  cy: 70,  rx: 14, ry: 7, density: 0.5 },
  { cx: 220, cy: 70,  rx: 12, ry: 6, density: 0.45 },
  { cx: 350, cy: 65,  rx: 10, ry: 5, density: 0.4 },
  { cx: 180, cy: 130, rx: 14, ry: 7, density: 0.5 },
  { cx: 310, cy: 125, rx: 12, ry: 6, density: 0.45 },
  { cx: 100, cy: 155, rx: 12, ry: 6, density: 0.5 },
  { cx: 300, cy: 160, rx: 10, ry: 5, density: 0.4 },
  { cx: 150, cy: 100, rx: 10, ry: 5, density: 0.4 },
  { cx: 250, cy: 100, rx: 10, ry: 5, density: 0.4 },
]
for (const m of meadows) {
  for (let fy = m.cy - m.ry; fy <= m.cy + m.ry; fy++) {
    for (let fx = m.cx - m.rx; fx <= m.cx + m.rx; fx++) {
      const dx = (fx - m.cx) / m.rx
      const dy = (fy - m.cy) / m.ry
      if (dx * dx + dy * dy <= 1.0 && grid[fy]?.[fx] === "," && rng() < m.density) {
        set(fx, fy, randomFlower())
      }
    }
  }
}

// Single-color flower clusters (themed patches around the map)
const colorPatches: { cx: number; cy: number; r: number; color: string; density: number }[] = [
  // Pink patches
  { cx: 40,  cy: 50,  r: 6, color: "*", density: 0.4 },
  { cx: 370, cy: 140, r: 5, color: "*", density: 0.35 },
  // Yellow sunflower fields
  { cx: 380, cy: 25,  r: 8, color: "f", density: 0.5 },
  { cx: 30,  cy: 120, r: 7, color: "f", density: 0.45 },
  { cx: 200, cy: 170, r: 6, color: "f", density: 0.4 },
  // Blue patches
  { cx: 160, cy: 60,  r: 6, color: "c", density: 0.4 },
  { cx: 320, cy: 100, r: 5, color: "c", density: 0.35 },
  // Red poppy fields
  { cx: 50,  cy: 100, r: 6, color: "r", density: 0.4 },
  { cx: 270, cy: 55,  r: 5, color: "r", density: 0.35 },
  // Purple patches
  { cx: 120, cy: 130, r: 6, color: "v", density: 0.4 },
  { cx: 350, cy: 180, r: 5, color: "v", density: 0.35 },
  // Orange patches
  { cx: 190, cy: 50,  r: 5, color: "o", density: 0.4 },
  { cx: 85,  cy: 180, r: 6, color: "o", density: 0.35 },
  // White daisy fields
  { cx: 240, cy: 35,  r: 6, color: "w", density: 0.4 },
  { cx: 130, cy: 170, r: 5, color: "w", density: 0.35 },
  { cx: 370, cy: 95,  r: 5, color: "w", density: 0.35 },
]
for (const p of colorPatches) {
  for (let fy = p.cy - p.r; fy <= p.cy + p.r; fy++) {
    for (let fx = p.cx - p.r; fx <= p.cx + p.r; fx++) {
      const dx = fx - p.cx
      const dy = fy - p.cy
      if (dx * dx + dy * dy <= p.r * p.r && grid[fy]?.[fx] === "," && rng() < p.density) {
        set(fx, fy, p.color)
      }
    }
  }
}

// Scattered individual flowers across ALL grass (light dusting everywhere)
for (let y = 5; y < H - 5; y++) {
  for (let x = 5; x < W - 5; x++) {
    if (grid[y]![x] === "," && rng() < 0.02) {
      set(x, y, randomFlower())
    }
  }
}

// --- Hedges / gardens ---
// Garden near Town Hall
const thX = 110, thY = 72
hLine(thX - 6, thX - 2, thY - 3, "G")
hLine(thX - 6, thX - 2, thY + 46, "G")
vLine(thX - 6, thY - 3, thY + 46, "G")

// Fenced garden near Farm House
hLine(80, 110, 155, "G")
hLine(80, 110, 170, "G")
vLine(80, 155, 170, "G")
vLine(110, 155, 170, "G")
for (let gy = 156; gy <= 169; gy++) {
  for (let gx = 81; gx <= 109; gx++) {
    if (rng() < 0.45) set(gx, gy, randomFlower())
  }
}

// Hedge maze area near Chapel
hLine(125, 135, 143, "G")
vLine(125, 143, 145, "G")
hLine(125, 135, 145, "G")

// --- Player spawn ---
const playerX = 200
const playerY = 58
set(playerX, playerY, ".")
spawns.unshift({ type: "player", x: playerX, y: playerY })

// --- Outdoor NPCs ---
const outdoorNpcs = [
  { x: 92, y: 58, name: "Sage" },
  { x: 200, y: 138, name: "Willow" },
  { x: 200, y: 96, name: "Brook" },
  { x: 320, y: 58, name: "Flint" },
  { x: 145, y: 58, name: "Reed" },
  { x: 260, y: 96, name: "Hazel" },
]
for (const npc of outdoorNpcs) {
  spawns.push({ type: "npc", x: npc.x, y: npc.y, name: npc.name })
}

// --- Replace P and S with floor chars ---
const cleanGrid: string[] = []
for (let y = 0; y < H; y++) {
  const row = grid[y]!
  const cleaned = row.map((ch, x) => {
    if (ch === "P" || ch === "S") {
      for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
        const n = grid[ny]?.[nx]
        if (n && n !== "P" && n !== "S" && n !== " " && ["e","p","n","h",".","D",",","*","f","c","r","v","o","w"].includes(n)) return n
      }
      return "."
    }
    return ch
  })
  cleanGrid.push(cleaned.join(""))
}

// --- Tile definitions ---
const tiles: Record<string, { ch: string; fg: number[] | null; bg?: number[] | null; walkable: boolean }> = {
  " ": { ch: " ", fg: null, walkable: false },
  ".": { ch: "░", fg: [160, 140, 100], walkable: true },
  ",": { ch: ",", fg: [60, 120, 50], walkable: true },
  "#": { ch: "█", fg: [130, 130, 140], walkable: false },
  "B": { ch: "█", fg: [120, 75, 35], walkable: false },
  "W": { ch: "█", fg: [200, 195, 185], walkable: false },
  "G": { ch: "█", fg: [30, 90, 30], walkable: false },
  "T": { ch: "♣", fg: [30, 80, 30], bg: [20, 45, 20], walkable: false },
  "~": { ch: "~", fg: [60, 130, 210], bg: [15, 35, 70], walkable: false },
  "*": { ch: "*", fg: [240, 100, 150], walkable: true },     // pink
  "f": { ch: "*", fg: [255, 210, 50], walkable: true },      // yellow
  "c": { ch: "*", fg: [80, 140, 240], walkable: true },      // blue
  "r": { ch: "*", fg: [220, 50, 50], walkable: true },       // red
  "v": { ch: "*", fg: [170, 80, 220], walkable: true },      // purple
  "o": { ch: "*", fg: [240, 160, 40], walkable: true },      // orange
  "w": { ch: "*", fg: [230, 230, 240], walkable: true },     // white daisy
  "D": { ch: "·", fg: [120, 85, 50], walkable: true },
  "e": { ch: ".", fg: [120, 85, 50], walkable: true },
  "p": { ch: "·", fg: [100, 100, 110], walkable: true },
  "n": { ch: ".", fg: [140, 60, 60], bg: [25, 18, 18], walkable: true },
  "h": { ch: "─", fg: [140, 100, 60], bg: [40, 28, 15], walkable: true },
}

// --- Doors ---
type RGB = [number, number, number]
const DOOR_COLOR: RGB = [140, 95, 50]

const doors = doorInfos.map(d => ({
  x: d.x,
  y: d.y,
  orientation: d.orientation,
  length: d.length,
  color: [...DOOR_COLOR],
}))

// --- Furniture placements ---
const placements = [
  // Blacksmith (50×35)
  { object: "table", x: 22, y: 18 },
  { object: "table", x: 22, y: 28 },
  { object: "chair", x: 30, y: 19 },
  { object: "bookshelf", x: 17, y: 12 },
  { object: "sofa", x: 40, y: 14 },

  // Tavern (65×40)
  { object: "table", x: 110, y: 16 },
  { object: "table", x: 110, y: 26 },
  { object: "table", x: 130, y: 16 },
  { object: "table", x: 130, y: 26 },
  { object: "chair", x: 118, y: 17 },
  { object: "chair", x: 118, y: 27 },
  { object: "chair", x: 138, y: 17 },
  { object: "chair", x: 138, y: 27 },
  { object: "sofa_large", x: 105, y: 36 },
  { object: "sofa", x: 145, y: 12 },
  { object: "bookshelf", x: 102, y: 10 },

  // Library (55×35)
  { object: "bookshelf", x: 215, y: 14 },
  { object: "bookshelf", x: 215, y: 18 },
  { object: "bookshelf", x: 215, y: 22 },
  { object: "bookshelf", x: 230, y: 14 },
  { object: "bookshelf", x: 230, y: 18 },
  { object: "bookshelf", x: 230, y: 22 },
  { object: "bookshelf", x: 245, y: 14 },
  { object: "bookshelf", x: 245, y: 18 },
  { object: "table", x: 240, y: 30 },
  { object: "chair", x: 248, y: 31 },
  { object: "sofa", x: 220, y: 32 },

  // Bakery (45×30)
  { object: "table", x: 318, y: 20 },
  { object: "table", x: 335, y: 20 },
  { object: "chair", x: 326, y: 21 },
  { object: "bookshelf", x: 314, y: 14 },

  // Cottage (45×35)
  { object: "sofa", x: 18, y: 84 },
  { object: "table", x: 28, y: 94 },
  { object: "chair", x: 36, y: 95 },
  { object: "bookshelf", x: 16, y: 92 },
  { object: "bookshelf", x: 16, y: 100 },

  // Town Hall (70×45)
  { object: "sofa_large", x: 118, y: 78 },
  { object: "sofa_large", x: 118, y: 100 },
  { object: "table", x: 140, y: 86 },
  { object: "table", x: 140, y: 96 },
  { object: "chair", x: 148, y: 87 },
  { object: "chair", x: 148, y: 97 },
  { object: "bookshelf", x: 114, y: 86 },
  { object: "bookshelf", x: 114, y: 92 },
  { object: "bookshelf", x: 114, y: 98 },
  { object: "table", x: 160, y: 80 },

  // General Store (50×38)
  { object: "table", x: 270, y: 84 },
  { object: "table", x: 285, y: 84 },
  { object: "bookshelf", x: 264, y: 80 },
  { object: "bookshelf", x: 264, y: 86 },
  { object: "bookshelf", x: 264, y: 92 },
  { object: "bookshelf", x: 295, y: 80 },
  { object: "chair", x: 278, y: 95 },

  // Inn (48×35)
  { object: "sofa", x: 348, y: 84 },
  { object: "sofa", x: 348, y: 98 },
  { object: "table", x: 362, y: 88 },
  { object: "table", x: 362, y: 98 },
  { object: "chair", x: 370, y: 89 },
  { object: "bookshelf", x: 344, y: 92 },

  // Farm House (50×35)
  { object: "table", x: 35, y: 158 },
  { object: "chair", x: 43, y: 159 },
  { object: "sofa", x: 50, y: 154 },
  { object: "bookshelf", x: 28, y: 152 },

  // Chapel (60×40)
  { object: "bookshelf", x: 136, y: 150 },
  { object: "bookshelf", x: 136, y: 156 },
  { object: "bookshelf", x: 136, y: 162 },
  { object: "bookshelf", x: 136, y: 168 },
  { object: "table", x: 160, y: 170 },
  { object: "sofa_large", x: 150, y: 150 },

  // Healer (48×32)
  { object: "table", x: 250, y: 160 },
  { object: "bookshelf", x: 244, y: 154 },
  { object: "bookshelf", x: 244, y: 160 },
  { object: "chair", x: 258, y: 161 },
  { object: "sofa", x: 268, y: 156 },

  // Woodcutter (48×35)
  { object: "table", x: 340, y: 158 },
  { object: "chair", x: 348, y: 159 },
  { object: "sofa", x: 355, y: 154 },
  { object: "bookshelf", x: 334, y: 152 },
  { object: "bookshelf", x: 334, y: 158 },
]

// --- Assemble map.json ---
const mapJson = {
  name: "Greenhollow Village",
  version: 1,
  tiles,
  grid: cleanGrid,
  objects: {},
  placements,
  doors,
  spawns,
}

writeFileSync(outputPath, JSON.stringify(mapJson, null, 2) + "\n")

console.log(`Wrote ${outputPath}`)
console.log(`  Grid: ${cleanGrid.length} rows × ${cleanGrid[0]?.length ?? 0} cols`)
console.log(`  Tiles: ${Object.keys(tiles).length} types`)
console.log(`  Spawns: ${spawns.length} (${spawns.filter(s => s.type === "player").length} player, ${spawns.filter(s => s.type === "npc").length} NPCs)`)
console.log(`  Placements: ${placements.length}`)
console.log(`  Doors: ${doors.length}`)
console.log(`  Houses: ${houses.length}`)
