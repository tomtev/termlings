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
 * Priority:
 * 1. .termlings/maps/cozy-office.json (project custom)
 * 2. templates/maps/cozy-office.json (starter)
 */
export function loadDefaultMap(): LoadedMap {
  // Try project map first
  const projectMapPath = join(process.cwd(), ".termlings", "maps", "cozy-office.json")
  if (existsSync(projectMapPath)) {
    return loadMapFromFile(projectMapPath)
  }

  // Try starter template
  const dir = dirname(fileURLToPath(import.meta.url))
  const starterMapPath = join(dir, "..", "..", "templates", "maps", "cozy-office.json")
  if (existsSync(starterMapPath)) {
    return loadMapFromFile(starterMapPath)
  }

  throw new Error("No map found: expected .termlings/maps/cozy-office.json or templates/maps/cozy-office.json")
}
