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

/**
 * Load a map from a JSON file (used by loadMap, loadDefaultMap, etc.)
 */
export function loadMapFromFile(filePath: string): LoadedMap {
  if (!existsSync(filePath)) {
    throw new Error(`Map file not found: ${filePath}`)
  }
  return loadMapJson(filePath)
}

/**
 * Load the default map for a project
 * Requires .termlings/map.json (copied from template during init)
 */
export function loadDefaultMap(): LoadedMap {
  const projectMapPath = join(process.cwd(), ".termlings", "map.json")
  if (!existsSync(projectMapPath)) {
    throw new Error(
      `No map found: expected .termlings/map.json\n` +
      `Run 'termlings' to initialize a new project with a default map.`
    )
  }
  return loadMapFromFile(projectMapPath)
}
