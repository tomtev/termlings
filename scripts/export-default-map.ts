/**
 * Migration script: reads src/default-map/map.txt + hardcoded sim data
 * and produces src/default-map/map.json in the unified format.
 *
 * Usage: bun scripts/export-default-map.ts
 */
import { readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { DEFAULT_TILE_DEFS } from "../src/engine/tilemap-core.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const mapTxtPath = join(__dirname, "..", "src", "default-map", "map.txt")
const outputPath = join(__dirname, "..", "src", "default-map", "map.json")

const raw = readFileSync(mapTxtPath, "utf-8")
const lines = raw.split("\n").filter(l => l.length > 0)

// --- NPC names (same order as sim.ts) ---

const NPC_NAMES = [
  "Pip", "Mox", "Zara", "Kip", "Luna", "Remy", "Fern", "Ash",
  "Blix", "Coral", "Dex", "Echo", "Fizz", "Glow", "Hex", "Ivy",
  "Jazz", "Kit", "Lux", "Nova", "Opal", "Pix", "Rex", "Sky",
]

// --- Extract spawns and clean grid ---

function isFloorChar(ch: string): boolean {
  const def = DEFAULT_TILE_DEFS[ch]
  return !!def && def.walkable && ch !== "P" && ch !== "S" && ch !== "D"
}

function findFloorChar(chars: string[], x: number, y: number): string {
  // Look at neighbors to find the room's floor type
  if (x > 0 && isFloorChar(chars[x - 1]!)) return chars[x - 1]!
  if (x < chars.length - 1 && isFloorChar(chars[x + 1]!)) return chars[x + 1]!
  if (y > 0) {
    const above = lines[y - 1]![x]
    if (above && isFloorChar(above)) return above
  }
  if (y < lines.length - 1) {
    const below = lines[y + 1]![x]
    if (below && isFloorChar(below)) return below
  }
  return "." // fallback
}

const spawns: { type: string; x: number; y: number; name?: string }[] = []
let npcIndex = 0
const grid: string[] = []

for (let y = 0; y < lines.length; y++) {
  const chars = lines[y]!.split("")
  for (let x = 0; x < chars.length; x++) {
    if (chars[x] === "S") {
      spawns.push({ type: "player", x, y })
      chars[x] = findFloorChar(chars, x, y)
    } else if (chars[x] === "P") {
      const entry: { type: string; x: number; y: number; name?: string } = {
        type: "npc", x, y,
        name: NPC_NAMES[npcIndex % NPC_NAMES.length],
      }
      spawns.push(entry)
      npcIndex++
      chars[x] = findFloorChar(chars, x, y)
    }
  }
  grid.push(chars.join(""))
}

// --- Build tiles dict (exclude P and S — no longer in grid) ---

const tiles: Record<string, { ch: string; fg: number[] | null; bg?: number[] | null; walkable: boolean }> = {}
for (const [key, def] of Object.entries(DEFAULT_TILE_DEFS)) {
  if (key === "P" || key === "S") continue
  const entry: { ch: string; fg: number[] | null; bg?: number[] | null; walkable: boolean } = {
    ch: def.ch,
    fg: def.fg ? [...def.fg] : null,
    walkable: def.walkable,
  }
  if (def.bg) entry.bg = [...def.bg]
  tiles[key] = entry
}

// --- Furniture placements (from sim.ts hardcoded data) ---

const placements = [
  { object: "sofa_large", x: 3, y: 2 },
  { object: "table", x: 30, y: 15 },
  { object: "bookshelf", x: 70, y: 2 },
  { object: "office_chair", x: 110, y: 3 },
  { object: "sofa", x: 235, y: 2 },
  { object: "bookshelf", x: 206, y: 2 },
  { object: "bookshelf", x: 3, y: 34 },
  { object: "table", x: 30, y: 47 },
  { object: "sofa_large", x: 215, y: 34 },
  { object: "table", x: 210, y: 47 },
  { object: "table", x: 85, y: 72 },
  { object: "chair", x: 100, y: 72 },
  { object: "sofa", x: 140, y: 66 },
  { object: "bookshelf", x: 165, y: 66 },
]

// --- Door definitions (from sim.ts hardcoded data) ---
// Wood color for all doors, full corridor width

type RGB = [number, number, number]
const DOOR_COLOR: RGB = [140, 95, 50]

function vDoor(x: number, y: number) {
  return { x, y, orientation: "vertical" as const, length: 8, color: [...DOOR_COLOR] }
}
function hDoor(x: number, y: number) {
  return { x, y, orientation: "horizontal" as const, length: 16, color: [...DOOR_COLOR] }
}

const doors = [
  // Vertical doors (block horizontal corridors, aligned to D-tile openings)
  // Top row (y=7..14)
  vDoor(51, 7), vDoor(68, 7),
  vDoor(119, 7), vDoor(136, 7),
  vDoor(187, 7), vDoor(204, 7),
  // Middle row (y=39..46)
  vDoor(51, 39), vDoor(68, 39),
  vDoor(119, 39), vDoor(136, 39),
  vDoor(187, 39), vDoor(204, 39),
  // Bottom row (y=71..78)
  vDoor(51, 71), vDoor(68, 71),
  vDoor(119, 71), vDoor(136, 71),
  vDoor(187, 71), vDoor(204, 71),

  // Horizontal doors (block vertical corridors, aligned to D-tile openings)
  // Top↔Mid exits (y=21) and entrances (y=32)
  hDoor(18, 21), hDoor(86, 21),
  hDoor(154, 21), hDoor(222, 21),
  hDoor(18, 32), hDoor(86, 32),
  hDoor(154, 32), hDoor(222, 32),
  // Mid↔Bottom exits (y=53) and entrances (y=64)
  hDoor(18, 53), hDoor(86, 53),
  hDoor(154, 53), hDoor(222, 53),
  hDoor(18, 64), hDoor(86, 64),
  hDoor(154, 64), hDoor(222, 64),
]

// --- Assemble map.json ---

const mapJson = {
  name: "Space Station Alpha",
  version: 1,
  tiles,
  grid,
  objects: {},
  placements,
  doors,
  spawns,
}

writeFileSync(outputPath, JSON.stringify(mapJson, null, 2) + "\n")

console.log(`Wrote ${outputPath}`)
console.log(`  Grid: ${grid.length} rows × ${grid[0]?.length ?? 0} cols`)
console.log(`  Tiles: ${Object.keys(tiles).length} types`)
console.log(`  Spawns: ${spawns.length} (${spawns.filter(s => s.type === "player").length} player, ${spawns.filter(s => s.type === "npc").length} NPCs)`)
console.log(`  Placements: ${placements.length}`)
console.log(`  Doors: ${doors.length}`)
