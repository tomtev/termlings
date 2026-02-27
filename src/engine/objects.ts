import { tileKey, type RGB, type Cell, type ObjectOverlay } from "./types.js"

export interface ObjectCell {
  ch: string
  fg: RGB | null
  bg: RGB | null
  walkable: boolean
}

export interface ObjectDef {
  name: string
  width: number
  height: number
  cells: (ObjectCell | null)[][] // [row][col], null = transparent/no override
}

export interface ObjectPlacement {
  def: string // key into OBJECT_DEFS
  x: number
  y: number
  props?: Record<string, unknown>
  roomId?: number // which logical room this object is in (optional, for compatibility)
}

// --- Color utilities ---

export function lighten(rgb: RGB, factor = 1.3): RGB {
  return [
    Math.min(255, Math.floor(rgb[0] * factor)),
    Math.min(255, Math.floor(rgb[1] * factor)),
    Math.min(255, Math.floor(rgb[2] * factor))
  ]
}

export function darken(rgb: RGB, factor = 0.7): RGB {
  return [
    Math.floor(rgb[0] * factor),
    Math.floor(rgb[1] * factor),
    Math.floor(rgb[2] * factor)
  ]
}

// --- Object cell creation ---

function c(ch: string, fg: RGB | null, bg: RGB | null, walkable: boolean): ObjectCell {
  return { ch, fg, bg, walkable }
}

// Colors
const AMBER: RGB = [190, 135, 10]   // sofa/chair frame
const LIGHT: RGB = [247, 176, 13]   // lighter amber (1.3x brightness)
const DARK: RGB = [133, 95, 7]      // darker amber (0.7x brightness)
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

export const OBJECT_DEFS: Record<string, ObjectDef> = {
  sofa: {
    name: "sofa",
    width: 13,
    height: 4,
    cells: [
      // back cushion row (darker for depth)
      [F(DARK), V(DARK), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(AMBER), V(DARK), V(DARK), F(DARK)],
      // arm rests + seat (solid arms on sides, open seat in middle)
      [F(DARK), F(DARK), _, S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), _, F(DARK), F(DARK), _],
      // seat cushion row (lighter to show cushion detail)
      [_, F(DARK), _, S(AMBER), S(AMBER), S(AMBER), S(AMBER), S(AMBER), S(AMBER), _, F(DARK), _, _],
      // front (open for approach)
      [_, _, _, _, _, _, _, _, _, _, _, _, _],
    ],
  },
  sofa_large: {
    name: "sofa_large",
    width: 21,
    height: 4,
    cells: [
      // back cushion row (darker for depth, with lighter highlights)
      [F(DARK), V(DARK), V(AMBER), V(AMBER), V(AMBER), V(LIGHT), V(AMBER), V(AMBER), V(AMBER), V(LIGHT), V(AMBER), V(AMBER), V(AMBER), V(LIGHT), V(AMBER), V(AMBER), V(AMBER), V(DARK), V(DARK), F(DARK), _],
      // arm rests + seat (solid arms on sides, open seat in middle)
      [F(DARK), F(DARK), _, S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), S(SEAT), _, F(DARK), _],
      // seat cushion row (lighter to show cushion detail with accent)
      [_, F(DARK), _, S(AMBER), S(AMBER), S(AMBER), S(LIGHT), S(AMBER), S(AMBER), S(LIGHT), S(AMBER), S(AMBER), S(LIGHT), S(AMBER), S(AMBER), S(AMBER), S(AMBER), _, F(DARK), _, _],
      // front (open for approach)
      [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    ],
  },
  table: {
    name: "table",
    width: 7,
    height: 3,
    cells: [
      // top surface (lighter for highlights, darker edges for depth)
      [V(WOOD_D), V(WOOD), V(WOOD), V(WOOD), V(WOOD), V(WOOD), V(WOOD_D)],
      // support rails (visual depth)
      [V(WOOD_D), _, _, _, _, _, V(WOOD_D)],
      // legs (blocking)
      [F(WOOD_D), _, _, _, _, _, F(WOOD_D)],
    ],
  },
  bookshelf: {
    name: "bookshelf",
    width: 7,
    height: 3,
    cells: [
      // top frame with darker edges for depth
      [F([50, 35, 18]), V(SHELF), V(SHELF), V(SHELF), V(SHELF), V(SHELF), F([50, 35, 18])],
      // books with varied colors (visual only - walk behind)
      [V([50, 35, 18]), V([130, 50, 40]), V([50, 90, 55]), V([100, 55, 40]), V([60, 70, 110]), V([120, 70, 35]), V([50, 35, 18])],
      // bottom shelf + base (blocking)
      [F([50, 35, 18]), F([90, 65, 45]), F([55, 70, 110]), F([130, 55, 35]), F([80, 95, 50]), F([110, 50, 45]), F([50, 35, 18])],
    ],
  },
  chair: {
    name: "chair",
    width: 3,
    height: 3,
    cells: [
      // back support (darker for depth)
      [F(DARK), V(DARK), F(DARK)],
      // arms + seat (solid arms on sides, walkable seat in middle)
      [F(DARK), S(SEAT), F(DARK)],
      // front (open for approach)
      [_, _, _],
    ],
  },
  office_chair: {
    name: "office_chair",
    width: 3,
    height: 3,
    cells: [
      // back support (darker for depth)
      [F([50, 50, 55]), V([70, 70, 75]), F([50, 50, 55])],
      // arms + seat (solid arms, walkable seat)
      [F([50, 50, 55]), S(GRAY_S), F([50, 50, 55])],
      // front (open for approach)
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

/** Render a single object piece to the buffer (used in entity z-sort pass) */
export function stampObjectPiece(
  buffer: Cell[][],
  cols: number,
  rows: number,
  placement: ObjectPlacement,
  cameraX: number,
  cameraY: number,
  scale: number,
  defs?: Record<string, ObjectDef>,
) {
  const def = (defs ?? OBJECT_DEFS)[placement.def]
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

/** Get the bottom y (sort key) for an object placement */
export function objectSortY(placement: ObjectPlacement, defs?: Record<string, ObjectDef>): number {
  const def = (defs ?? OBJECT_DEFS)[placement.def]
  return def ? placement.y + def.height : placement.y
}

export function buildObjectOverlay(placements: ObjectPlacement[], defs?: Record<string, ObjectDef>): ObjectOverlay {
  const visual = new Map<number, Cell>()
  const walkable = new Map<number, boolean>()

  for (const placement of placements) {
    const def = (defs ?? OBJECT_DEFS)[placement.def]
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

/** Render an object with optional custom color to a terminal grid */
export function renderObjectToTerminal(
  objectType: string,
  color?: RGB,
  defs?: Record<string, ObjectDef>,
  debugCollision = false
): string {
  const def = (defs ?? OBJECT_DEFS)[objectType]
  if (!def) return `Unknown object: ${objectType}`

  const colorMap = color ? {
    primary: color,
    light: lighten(color),
    dark: darken(color)
  } : null

  // Build terminal output
  const lines: string[] = []
  for (let row = 0; row < def.height; row++) {
    const cellRow = def.cells[row]
    if (!cellRow) {
      lines.push("")
      continue
    }

    let line = ""
    for (let col = 0; col < def.width; col++) {
      const cell = cellRow[col]

      // Debug collision mode: show blocking cells
      if (debugCollision) {
        if (!cell) {
          line += "·" // transparent
        } else if (!cell.walkable) {
          line += "█" // blocking
        } else {
          line += "░" // walkable
        }
        continue
      }

      if (!cell) {
        line += " "
        continue
      }

      // Apply color substitution if provided
      let fg = cell.fg
      if (colorMap && cell.fg) {
        // Simple heuristic: darker cells get dark color, bright cells get light color
        const brightness = (cell.fg[0] + cell.fg[1] + cell.fg[2]) / 3
        if (brightness > 150) fg = colorMap.light
        else if (brightness < 100) fg = colorMap.dark
        else fg = colorMap.primary
      }

      const ansi = fg ? `\x1b[38;2;${fg[0]};${fg[1]};${fg[2]}m` : ""
      const reset = fg ? "\x1b[0m" : ""
      line += `${ansi}${cell.ch}${reset}`
    }
    lines.push(line)
  }

  return lines.join("\n")
}
