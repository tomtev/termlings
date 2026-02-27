import { existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { loadMapJson, type LoadedMap } from "./map-loader.js"

// Re-export everything from tilemap-core
export * from "./tilemap-core.js"

/** Load a map from a directory containing map.json */
export function loadMap(dir: string): LoadedMap {
  const mapJsonPath = join(dir, "map.json")
  if (!existsSync(mapJsonPath)) {
    throw new Error(`Map file not found: ${mapJsonPath} (maps must be in JSON format)`)
  }
  return loadMapJson(mapJsonPath)
}

/** Load the built-in default map (src/default-map/map.json) */
export function loadDefaultMap(): LoadedMap {
  const dir = dirname(fileURLToPath(import.meta.url))
  const defaultMapDir = join(dir, "..", "default-map")
  return loadMap(defaultMapDir)
}
