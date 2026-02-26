import { tileKey, type RGB, type Cell, type FurnitureOverlay } from "./types.js"

export interface FurnitureCell {
  ch: string
  fg: RGB | null
  bg: RGB | null
  walkable: boolean
}

export interface FurnitureDef {
  name: string
  width: number
  height: number
  cells: (FurnitureCell | null)[][] // [row][col], null = transparent/no override
}

export interface FurniturePlacement {
  def: string // key into FURNITURE_DEFS
  x: number
  y: number
}

function c(ch: string, fg: RGB | null, bg: RGB | null, walkable: boolean): FurnitureCell {
  return { ch, fg, bg, walkable }
}

// Colors
const AMBER: RGB = [190, 135, 10]   // sofa/chair frame
const SEAT: RGB = [140, 100, 8]      // sofa/chair seat (darker amber)
const WOOD: RGB = [120, 80, 40]     // table surface
const WOOD_D: RGB = [90, 60, 25]    // table legs (darker)
const SHELF: RGB = [70, 45, 25]     // bookshelf frame
const GRAY: RGB = [55, 55, 60]      // office chair frame
const GRAY_S: RGB = [70, 70, 75]    // office chair seat

// Shorthand: frame block, seat block, visual-only, null
const F = (fg: RGB) => c("█", fg, null, false)         // solid, blocks
const S = (fg: RGB) => c("█", fg, null, true)           // walkable seat
const V = (fg: RGB) => c("█", fg, null, true)           // visual only, walkable (walk behind)
const _ = null

export const FURNITURE_DEFS: Record<string, FurnitureDef> = {
  sofa: {
    name: "sofa",
    width: 13,
    height: 4,
    cells: [
      // back (visual only — walk behind)
      [V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER)],
      // arms + seat (all blocking)
      [F(AMBER), F(AMBER), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(AMBER), F(AMBER)],
      [F(AMBER), F(AMBER), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(AMBER), F(AMBER)],
      // front (open)
      [_, _, _, _, _, _, _, _, _, _, _, _, _],
    ],
  },
  sofa_large: {
    name: "sofa_large",
    width: 21,
    height: 4,
    cells: [
      // back (visual only — walk behind)
      [V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER)],
      // arms + seat (all blocking)
      [F(AMBER), F(AMBER), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(AMBER), F(AMBER)],
      [F(AMBER), F(AMBER), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(SEAT), F(AMBER), F(AMBER)],
      // front (open)
      [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    ],
  },
  table: {
    name: "table",
    width: 7,
    height: 3,
    cells: [
      // top: visual only — walk behind
      [V(WOOD), V(WOOD), V(WOOD), V(WOOD), V(WOOD), V(WOOD), V(WOOD)],
      // mid: visual only
      [V(WOOD_D), _, _, _, _, _, V(WOOD_D)],
      // bot: legs block
      [F(WOOD_D), _, _, _, _, _, F(WOOD_D)],
    ],
  },
  bookshelf: {
    name: "bookshelf",
    width: 7,
    height: 3,
    cells: [
      // top frame (visual only - walk behind)
      [V(SHELF), V(SHELF), V(SHELF), V(SHELF), V(SHELF), V(SHELF), V(SHELF)],
      // books row 1 (visual only - walk behind)
      [V(SHELF), V([130, 50, 40]), V([50, 90, 55]), V([100, 55, 40]), V([60, 70, 110]), V([120, 70, 35]), V(SHELF)],
      // bottom row (collision)
      [F(SHELF), F([90, 65, 45]), F([55, 70, 110]), F([130, 55, 35]), F([80, 95, 50]), F([110, 50, 45]), F(SHELF)],
    ],
  },
  chair: {
    name: "chair",
    width: 3,
    height: 3,
    cells: [
      // back (visual only)
      [V(AMBER), V(AMBER), V(AMBER)],
      // seat (walkable)
      [V(AMBER), S(SEAT), V(AMBER)],
      // front (open)
      [_, _, _],
    ],
  },
  office_chair: {
    name: "office_chair",
    width: 3,
    height: 3,
    cells: [
      // back (visual only)
      [V(GRAY), V(GRAY), V(GRAY)],
      // seat (walkable)
      [V(GRAY), S(GRAY_S), V(GRAY)],
      // front (open)
      [_, _, _],
    ],
  },
}

/** Render a single furniture piece to the buffer (used in entity z-sort pass) */
export function stampFurniturePiece(
  buffer: Cell[][],
  cols: number,
  rows: number,
  placement: FurniturePlacement,
  cameraX: number,
  cameraY: number,
  scale: number,
  defs?: Record<string, FurnitureDef>,
) {
  const def = (defs ?? FURNITURE_DEFS)[placement.def]
  if (!def) return

  for (let row = 0; row < def.height; row++) {
    const cellRow = def.cells[row]
    if (!cellRow) continue
    const sy = placement.y + row - cameraY
    if (sy < 0 || sy >= rows) continue
    for (let col = 0; col < def.width; col++) {
      const cell = cellRow[col]
      if (!cell) continue
      const baseSx = (placement.x + col - cameraX) * scale
      for (let ci = 0; ci < scale; ci++) {
        const sx = baseSx + ci
        if (sx < 0 || sx >= cols) continue
        const bc = buffer[sy]![sx]!
        bc.ch = cell.ch; bc.fg = cell.fg; bc.bg = cell.bg
      }
    }
  }
}

/** Get the bottom y (sort key) for a furniture placement */
export function furnitureSortY(placement: FurniturePlacement, defs?: Record<string, FurnitureDef>): number {
  const def = (defs ?? FURNITURE_DEFS)[placement.def]
  return def ? placement.y + def.height : placement.y
}

export function buildFurnitureOverlay(placements: FurniturePlacement[], defs?: Record<string, FurnitureDef>): FurnitureOverlay {
  const visual = new Map<number, Cell>()
  const walkable = new Map<number, boolean>()

  for (const placement of placements) {
    const def = (defs ?? FURNITURE_DEFS)[placement.def]
    if (!def) continue

    for (let row = 0; row < def.height; row++) {
      const cellRow = def.cells[row]
      if (!cellRow) continue
      for (let col = 0; col < def.width; col++) {
        const cell = cellRow[col]
        if (!cell) continue
        const key = tileKey(placement.x + col, placement.y + row)
        visual.set(key, { ch: cell.ch, fg: cell.fg, bg: cell.bg })
        walkable.set(key, cell.walkable)
      }
    }
  }

  return { visual, walkable }
}
