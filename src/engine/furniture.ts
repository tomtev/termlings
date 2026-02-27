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

// Natural / buildable colors
const LEAF: RGB = [40, 130, 50]     // tree foliage
const LEAF_D: RGB = [30, 100, 40]   // darker foliage
const TRUNK: RGB = [100, 65, 30]    // tree trunk
const TRUNK_D: RGB = [80, 50, 20]   // trunk base (darker)
const PINE: RGB = [25, 90, 35]      // pine needles
const PINE_D: RGB = [18, 70, 28]    // dark pine
const STONE: RGB = [120, 120, 125]  // rock surface
const STONE_D: RGB = [90, 90, 95]   // rock base
const FENCE: RGB = [140, 100, 50]   // fence planks
const SIGN_F: RGB = [160, 130, 70]  // sign face
const SIGN_P: RGB = [100, 70, 35]   // sign post
const FLAME: RGB = [230, 140, 30]   // campfire flames
const FLAME_D: RGB = [200, 80, 20]  // campfire ember
const STONE_R: RGB = [100, 100, 105] // campfire ring stones
const FLOWER_P: RGB = [220, 80, 120] // pink flower
const FLOWER_Y: RGB = [240, 210, 50] // yellow flower
const FLOWER_B: RGB = [100, 140, 220] // blue flower

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

  // --- Natural / buildable objects ---

  tree: {
    name: "tree",
    width: 5,
    height: 5,
    cells: [
      // canopy row 1 (visual only — walk behind)
      [_, V(LEAF), V(LEAF), V(LEAF), _],
      // canopy row 2
      [V(LEAF), V(LEAF_D), V(LEAF), V(LEAF_D), V(LEAF)],
      // canopy row 3
      [V(LEAF), V(LEAF), V(LEAF_D), V(LEAF), V(LEAF)],
      // trunk (visual only)
      [_, _, V(TRUNK), _, _],
      // trunk base (blocking)
      [_, _, F(TRUNK_D), _, _],
    ],
  },
  pine_tree: {
    name: "pine_tree",
    width: 3,
    height: 6,
    cells: [
      // tip (visual only)
      [_, V(PINE), _],
      // upper needles
      [V(PINE), V(PINE_D), V(PINE)],
      // mid needles
      [V(PINE_D), V(PINE), V(PINE_D)],
      // lower needles
      [V(PINE), V(PINE_D), V(PINE)],
      // trunk (visual only)
      [_, V(TRUNK), _],
      // trunk base (blocking)
      [_, F(TRUNK_D), _],
    ],
  },
  rock: {
    name: "rock",
    width: 3,
    height: 2,
    cells: [
      // top (visual only — walk behind)
      [V(STONE), V(STONE), V(STONE)],
      // base (blocking)
      [F(STONE_D), F(STONE_D), F(STONE_D)],
    ],
  },
  fence_h: {
    name: "fence_h",
    width: 5,
    height: 1,
    cells: [
      // all blocking
      [F(FENCE), F(FENCE), F(FENCE), F(FENCE), F(FENCE)],
    ],
  },
  fence_v: {
    name: "fence_v",
    width: 1,
    height: 5,
    cells: [
      [F(FENCE)],
      [F(FENCE)],
      [F(FENCE)],
      [F(FENCE)],
      [F(FENCE)],
    ],
  },
  sign: {
    name: "sign",
    width: 3,
    height: 2,
    cells: [
      // sign face (visual only — walk behind)
      [V(SIGN_F), V(SIGN_F), V(SIGN_F)],
      // post (blocking)
      [_, F(SIGN_P), _],
    ],
  },
  campfire: {
    name: "campfire",
    width: 3,
    height: 2,
    cells: [
      // flames (visual only)
      [V(FLAME), V(FLAME_D), V(FLAME)],
      // stone ring (blocking)
      [F(STONE_R), F(STONE_R), F(STONE_R)],
    ],
  },
  flower_patch: {
    name: "flower_patch",
    width: 3,
    height: 1,
    cells: [
      // decorative ground cover (all walkable)
      [V(FLOWER_P), V(FLOWER_Y), V(FLOWER_B)],
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
    if (sy < 0 || sy >= rows || !buffer[sy]) continue
    for (let col = 0; col < def.width; col++) {
      const cell = cellRow[col]
      if (!cell) continue
      const baseSx = (placement.x + col - cameraX) * scale
      for (let ci = 0; ci < scale; ci++) {
        const sx = baseSx + ci
        if (sx < 0 || sx >= cols) continue
        const bc = buffer[sy]![sx]
        if (bc) { bc.ch = cell.ch; bc.fg = cell.fg; bc.bg = cell.bg }
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
