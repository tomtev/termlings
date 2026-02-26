import { readFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { TileDef } from "./types.js"
import { DEFAULT_TILE_DEFS, loadMapFromString } from "./tilemap-core.js"
import { loadMapJson, type LoadedMap } from "./map-loader.js"

// Re-export everything from tilemap-core
export * from "./tilemap-core.js"

/** Load a map from a directory containing map.json, or map.txt + optional tiles.json */
export function loadMap(dir: string): LoadedMap {
  // Prefer map.json (unified format)
  const mapJsonPath = join(dir, "map.json")
  if (existsSync(mapJsonPath)) {
    return loadMapJson(mapJsonPath)
  }

  // Fall back to map.txt + tiles.json (legacy format)
  const mapPath = join(dir, "map.txt")
  if (!existsSync(mapPath)) {
    throw new Error(`Map file not found: ${mapPath}`)
  }
  const raw = readFileSync(mapPath, "utf-8")

  let customTiles: Record<string, Partial<TileDef>> = {}
  let name: string | undefined
  const tilesJsonPath = join(dir, "tiles.json")
  if (existsSync(tilesJsonPath)) {
    const json = JSON.parse(readFileSync(tilesJsonPath, "utf-8"))
    if (json.tiles) customTiles = json.tiles
    if (json.name) name = json.name
  }

  // Merge custom tile defs with defaults
  const tileDefs = { ...DEFAULT_TILE_DEFS }
  for (const [key, partial] of Object.entries(customTiles)) {
    const base = tileDefs[key] ?? { ch: key, fg: null, bg: null, walkable: false }
    tileDefs[key] = { ...base, ...partial }
  }

  const result = loadMapFromString(raw, tileDefs)
  if (name) result.name = name
  return { ...result, objectDefs: {}, placements: [], doors: [] }
}

/** Load the built-in default map (src/default-map/) */
export function loadDefaultMap(): LoadedMap {
  const dir = dirname(fileURLToPath(import.meta.url))
  const defaultMapDir = join(dir, "..", "default-map")

  // Prefer map.json (unified format)
  const mapJsonPath = join(defaultMapDir, "map.json")
  if (existsSync(mapJsonPath)) {
    return loadMapJson(mapJsonPath)
  }

  // Fall back to map.txt
  const mapTxtPath = join(defaultMapDir, "map.txt")
  if (existsSync(mapTxtPath)) {
    return loadMap(defaultMapDir)
  }

  // Legacy fallback
  const raw = readFileSync(join(dir, "..", "world.txt"), "utf-8")
  const result = loadMapFromString(raw, DEFAULT_TILE_DEFS)
  return { ...result, objectDefs: {}, placements: [], doors: [] }
}
