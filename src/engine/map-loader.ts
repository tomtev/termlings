import { readFileSync } from "fs"
import type { TileDef, ParsedMap, RGB } from "./types.js"
import { loadMapFromString } from "./tilemap-core.js"
import type { ObjectDef, ObjectCell, ObjectPlacement } from "./objects.js"
import { OBJECT_DEFS } from "./objects.js"
import type { DoorDef } from "./doors.js"

// --- JSON schema types ---

export interface MapJson {
  name?: string
  version?: number
  tiles: Record<string, { ch: string; fg: number[] | null; bg?: number[] | null; walkable: boolean }>
  grid: string[]
  objects?: Record<string, ObjectJson>
  placements?: { object: string; x: number; y: number }[]
  doors?: { x: number; y: number; orientation: string; length: number; color: number[] }[]
  spawns?: { type: string; x: number; y: number; name?: string }[]
}

export interface ObjectJson {
  width: number
  height: number
  palette: Record<string, { ch: string; fg: number[] | null; bg?: number[] | null; walkable: boolean }>
  grid: string[]
}

export interface LoadedMap extends ParsedMap {
  objectDefs: Record<string, ObjectDef>
  placements: ObjectPlacement[]
  doors: DoorDef[]
}

// --- Helpers ---

function toRgb(arr: number[] | null | undefined): RGB | null {
  if (!arr || arr.length < 3) return null
  return [arr[0]!, arr[1]!, arr[2]!]
}

// --- Parsing ---

export function parseObjectDef(name: string, obj: ObjectJson): ObjectDef {
  const cells: (ObjectCell | null)[][] = []
  for (let row = 0; row < obj.grid.length; row++) {
    const line = obj.grid[row]!
    const cellRow: (ObjectCell | null)[] = []
    for (let col = 0; col < obj.width; col++) {
      const ch = line[col] ?? " "
      if (ch === " ") {
        cellRow.push(null)
      } else {
        const palEntry = obj.palette[ch]
        if (!palEntry) {
          cellRow.push(null)
        } else {
          cellRow.push({
            ch: palEntry.ch,
            fg: toRgb(palEntry.fg),
            bg: toRgb(palEntry.bg),
            walkable: palEntry.walkable,
          })
        }
      }
    }
    cells.push(cellRow)
  }
  return { name, width: obj.width, height: obj.grid.length, cells }
}

export function parseMapJson(json: MapJson): LoadedMap {
  // Build tileDefs
  const tileDefs: Record<string, TileDef> = {}
  for (const [key, td] of Object.entries(json.tiles)) {
    tileDefs[key] = {
      ch: td.ch,
      fg: toRgb(td.fg),
      bg: toRgb(td.bg),
      walkable: td.walkable,
    }
  }

  // Parse main grid
  const parsed = loadMapFromString(json.grid.join("\n"), tileDefs)
  if (json.name) parsed.name = json.name

  // Override spawns from JSON if present
  if (json.spawns) {
    const npcSpawns: { x: number; y: number; name?: string }[] = []
    for (const sp of json.spawns) {
      if (sp.type === "player") {
        parsed.playerSpawn = { x: sp.x, y: sp.y }
      } else if (sp.type === "npc") {
        npcSpawns.push({ x: sp.x, y: sp.y, name: sp.name })
      }
    }
    if (npcSpawns.length > 0) {
      parsed.npcSpawns = npcSpawns
    }
  }

  // Parse objects
  const objectDefs: Record<string, ObjectDef> = {}
  if (json.objects) {
    for (const [name, obj] of Object.entries(json.objects)) {
      objectDefs[name] = parseObjectDef(name, obj)
    }
  }

  // Parse placements — look up in objectDefs first, then OBJECT_DEFS
  const placements: ObjectPlacement[] = []
  if (json.placements) {
    for (const p of json.placements) {
      placements.push({ def: p.object, x: p.x, y: p.y })
    }
  }

  // Parse doors
  const doors: DoorDef[] = []
  if (json.doors) {
    for (const d of json.doors) {
      doors.push({
        x: d.x,
        y: d.y,
        orientation: d.orientation as "vertical" | "horizontal",
        length: d.length,
        color: toRgb(d.color) ?? [128, 128, 128],
      })
    }
  }

  return {
    ...parsed,
    objectDefs,
    placements,
    doors,
  }
}

export function loadMapJson(path: string): LoadedMap {
  const raw = readFileSync(path, "utf-8")
  const json: MapJson = JSON.parse(raw)
  return parseMapJson(json)
}
