import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import type { ObjectDef, ObjectPlacement } from "./objects.js"

function customObjectsDir(room = "default"): string {
  return join(homedir(), ".termlings", "rooms", room)
}

function customObjectsFile(room = "default"): string {
  return join(customObjectsDir(room), "custom-objects.json")
}

export function loadCustomObjects(room = "default"): Record<string, ObjectDef> {
  const file = customObjectsFile(room)
  if (!existsSync(file)) return {}

  try {
    const data = readFileSync(file, "utf-8")
    return JSON.parse(data)
  } catch (e) {
    console.error(`Error loading custom objects: ${e}`)
    return {}
  }
}

export function saveCustomObjects(objects: Record<string, ObjectDef>, room = "default"): void {
  mkdirSync(customObjectsDir(room), { recursive: true })
  const file = customObjectsFile(room)
  writeFileSync(file, JSON.stringify(objects, null, 2) + "\n")
}

export function createCustomObject(
  name: string,
  definition: unknown,
  room = "default"
): { success: boolean; error?: string } {
  // Validate definition structure
  if (typeof definition !== "object" || !definition) {
    return { success: false, error: "Definition must be an object" }
  }

  const def = definition as Record<string, unknown>

  // Validate required fields
  if (typeof def.width !== "number" || def.width < 1) {
    return { success: false, error: "width must be a positive number" }
  }
  if (typeof def.height !== "number" || def.height < 1) {
    return { success: false, error: "height must be a positive number" }
  }
  if (!Array.isArray(def.cells)) {
    return { success: false, error: "cells must be an array" }
  }

  // Validate cells structure
  const width = def.width as number
  const height = def.height as number
  const cells = def.cells as unknown[]

  if (cells.length !== height) {
    return { success: false, error: `cells must have ${height} rows (got ${cells.length})` }
  }

  for (let i = 0; i < cells.length; i++) {
    if (!Array.isArray(cells[i])) {
      return { success: false, error: `cells[${i}] must be an array` }
    }
    const row = cells[i] as unknown[]
    if (row.length !== width) {
      return {
        success: false,
        error: `cells[${i}] must have ${width} columns (got ${row.length})`
      }
    }
  }

  // Parse cell types and build ObjectDef
  const cellTypeMap = parseDefinitionCellTypes(def)
  const builtCells = buildCellsArray(cells, width, height, cellTypeMap)

  if (!builtCells) {
    return { success: false, error: "Invalid cell type definitions" }
  }

  const objectDef: ObjectDef = {
    name,
    width,
    height,
    cells: builtCells
  }

  // Save custom object
  const objects = loadCustomObjects(room)
  objects[name] = objectDef
  saveCustomObjects(objects, room)

  return { success: true }
}

interface CellTypeDefinition {
  character?: string
  fg?: [number, number, number]
  bg?: [number, number, number] | null
  walkable?: boolean
}

function parseDefinitionCellTypes(def: Record<string, unknown>): Map<string, CellTypeDefinition> {
  const map = new Map<string, CellTypeDefinition>()

  // Default cell types
  map.set("V", { character: "█", fg: [100, 100, 100], bg: null, walkable: true })
  map.set("S", { character: "█", fg: [140, 100, 8], bg: null, walkable: true })
  map.set("F", { character: "█", fg: [190, 135, 10], bg: null, walkable: false })

  // Override with user-defined cellTypes
  if (def.cellTypes && typeof def.cellTypes === "object") {
    const cellTypes = def.cellTypes as Record<string, unknown>
    for (const [key, value] of Object.entries(cellTypes)) {
      if (typeof value === "object" && value !== null) {
        const typeDef = value as Record<string, unknown>
        map.set(key, {
          character: typeof typeDef.character === "string" ? typeDef.character : "█",
          fg: isRGB(typeDef.fg) ? (typeDef.fg as [number, number, number]) : [100, 100, 100],
          bg: isRGB(typeDef.bg) || typeDef.bg === null ? (typeDef.bg as [number, number, number] | null) : null,
          walkable: typeof typeDef.walkable === "boolean" ? typeDef.walkable : true
        })
      }
    }
  }

  return map
}

function isRGB(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(v => typeof v === "number" && v >= 0 && v <= 255)
  )
}

function buildCellsArray(
  cells: unknown[],
  width: number,
  height: number,
  cellTypeMap: Map<string, CellTypeDefinition>
): Array<Array<{ ch: string; fg: [number, number, number] | null; bg: [number, number, number] | null; walkable: boolean } | null>> | null {
  const builtCells: Array<Array<{ ch: string; fg: [number, number, number] | null; bg: [number, number, number] | null; walkable: boolean } | null>> = []

  for (let row = 0; row < height; row++) {
    const cellRow = cells[row] as unknown[]
    const builtRow: Array<{ ch: string; fg: [number, number, number] | null; bg: [number, number, number] | null; walkable: boolean } | null> = []

    for (let col = 0; col < width; col++) {
      const cellValue = cellRow[col]

      if (cellValue === null) {
        builtRow.push(null)
      } else if (typeof cellValue === "string") {
        const typeDef = cellTypeMap.get(cellValue)
        if (!typeDef) {
          return null
        }
        builtRow.push({
          ch: typeDef.character || "█",
          fg: typeDef.fg || null,
          bg: typeDef.bg || null,
          walkable: typeDef.walkable !== false
        })
      } else {
        return null
      }
    }

    builtCells.push(builtRow)
  }

  return builtCells
}
