/**
 * Generate a simple cozy office map with a grid of desks
 * Each desk is a fixed position for an agent
 */
import { writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { homedir } from "os"
import { DEFAULT_TILE_DEFS } from "../src/engine/tilemap-core.js"
import type { ObjectDef } from "../src/engine/objects.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputPath = join(__dirname, "..", "src", "default-map", "map.json")

// Desk grid: 5 columns x 4 rows of desks
const DESK_COLS = 5
const DESK_ROWS = 4
const DESK_WIDTH = 8
const DESK_HEIGHT = 6
const DESK_SPACING_X = 2
const DESK_SPACING_Y = 2

// Map dimensions
const MAP_WIDTH = DESK_COLS * (DESK_WIDTH + DESK_SPACING_X) + 4
const MAP_HEIGHT = DESK_ROWS * (DESK_HEIGHT + DESK_SPACING_Y) + 12 // Extra space for wall and clock

// --- Desk object definition ---
function createDeskObject(): ObjectDef {
  return {
    name: "desk",
    width: DESK_WIDTH,
    height: DESK_HEIGHT,
    cells: [
      [null, null, "S", "S", "S", "S", null, null],
      [null, null, "S", "S", "S", "S", null, null],
      ["V", "V", "V", "V", "V", "V", "V", "V"],
      ["V", null, null, null, null, null, null, "V"],
      ["V", null, null, null, null, null, null, "V"],
      ["V", "V", "V", "V", "V", "V", "V", "V"],
    ],
    cellTypes: {
      "S": { character: "═", fg: [160, 110, 50], bg: null, walkable: false }, // Desk surface - wood
      "V": { character: "║", fg: [100, 60, 20], bg: null, walkable: true },   // Desk legs/frame
    }
  }
}

function saveCustomObject(name: string, def: ObjectDef, room = "default"): void {
  const customObjectsDir = join(homedir(), ".termlings", "rooms", room)
  const customObjectsFile = join(customObjectsDir, "custom-objects.json")

  mkdirSync(customObjectsDir, { recursive: true })

  let objects: Record<string, ObjectDef> = {}
  try {
    const fs = require("fs")
    if (fs.existsSync(customObjectsFile)) {
      const data = fs.readFileSync(customObjectsFile, "utf-8")
      objects = JSON.parse(data)
    }
  } catch (e) {
    // Start fresh
  }

  objects[name] = def
  writeFileSync(customObjectsFile, JSON.stringify(objects, null, 2) + "\n")
}

// Generate grid
const grid: string[] = []

for (let y = 0; y < MAP_HEIGHT; y++) {
  let row = ""
  for (let x = 0; x < MAP_WIDTH; x++) {
    // Entire office is wooden floor (no outer walls)
    row += "e" // Wooden floor
  }
  grid.push(row)
}

// Build tiles from DEFAULT_TILE_DEFS
const tiles: Record<string, any> = {}
for (const [key, def] of Object.entries(DEFAULT_TILE_DEFS)) {
  if (key === "P" || key === "S") continue
  const entry: any = {
    ch: def.ch,
    fg: def.fg ? [...def.fg] : null,
    walkable: def.walkable,
  }
  if (def.bg) entry.bg = [...def.bg]
  tiles[key] = entry
}

// Placements: Grid of desks
const placements = []

// Add desks in a grid
for (let row = 0; row < DESK_ROWS; row++) {
  for (let col = 0; col < DESK_COLS; col++) {
    const x = 2 + col * (DESK_WIDTH + DESK_SPACING_X)
    const y = 5 + row * (DESK_HEIGHT + DESK_SPACING_Y)
    placements.push({ object: "desk", x, y })
  }
}

// Doors (optional, for entry/exit visual)
type RGB = [number, number, number]
const DOOR_COLOR: RGB = [140, 95, 50]

function vDoor(x: number, y: number) {
  return { x, y, orientation: "vertical" as const, length: 8, color: [...DOOR_COLOR] }
}

const doors = [
  // No doors in simple office - it's open
]

// Spawns - agents will be assigned to desks when they join
const spawns = [
  { type: "player", x: 6, y: 8 }, // Player starts at first desk
]

// Assemble map.json
const mapJson = {
  name: "Cozy Office",
  version: 1,
  tiles,
  grid,
  objects: {},
  placements,
  doors,
  spawns,
}

// Save desk custom object
const deskDef = createDeskObject()
saveCustomObject("desk", deskDef, "default")

writeFileSync(outputPath, JSON.stringify(mapJson, null, 2) + "\n")

console.log(`✓ Generated cozy office map: ${outputPath}`)
console.log(`  Grid: ${grid.length} rows × ${grid[0]?.length ?? 0} cols`)
console.log(`  Desk grid: ${DESK_COLS} columns × ${DESK_ROWS} rows (${DESK_COLS * DESK_ROWS} desks)`)
console.log(`  Tiles: ${Object.keys(tiles).length} types`)
console.log(`  Placements: ${placements.length} desks`)
console.log("")
console.log("Layout:")
console.log(`  • Wooden floor throughout (no outer walls)`)
console.log(`  • Desk grid: ${DESK_COLS}x${DESK_ROWS}`)
console.log(`  • Agents assigned to desks when they join`)
