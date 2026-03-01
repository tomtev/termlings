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
  enterAnimationDuration?: number // milliseconds for entrance animation (default: 400ms)
  exitAnimationDuration?: number  // milliseconds for exit animation (default: 400ms)
}

export interface ObjectPlacement {
  def: string // key into OBJECT_DEFS
  x: number
  y: number
  props?: Record<string, unknown>
  roomId?: number // which logical room this object is in (optional, for compatibility)
  createdAt?: number // timestamp when object was placed (for entrance animation)
  destroyingAt?: number // timestamp when object started destruction (for exit animation)
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




// Objects are loaded from project folder, not hard-coded
// Use loadStarterObjects() to get defaults or loadProjectObjects() to load from .termlings/objects/
export const OBJECT_DEFS: Record<string, ObjectDef> = {}

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
  animationProgress?: number, // 0-1 for entrance/exit animation
) {
  const def = (defs ?? OBJECT_DEFS)[placement.def]
  if (!def) return

  // If animation progress is 0, render nothing (object not visible)
  if (animationProgress === 0) return

  for (let row = 0; row < def.height; row++) {
    const cellRow = def.cells[row]
    if (!cellRow) continue
    const sy = placement.y + row - cameraY
    if (sy < 0 || sy >= rows || !buffer[sy]) continue
    for (let col = 0; col < def.width; col++) {
      const cell = cellRow[col]
      if (!cell) continue

      // Apply animation fade during entrance/exit
      let displayCell = cell
      if (animationProgress !== undefined && animationProgress < 1) {
        // Fade opacity based on animation progress
        // For now, we skip rendering if progress is too low (creates a fade-in effect)
        const opacityThreshold = 0.2
        if (animationProgress < opacityThreshold) continue
      }

      const baseSx = (placement.x + col - cameraX) * scale
      for (let ci = 0; ci < scale; ci++) {
        const sx = baseSx + ci
        if (sx < 0 || sx >= cols) continue
        const bc = buffer[sy]![sx]
        if (bc) { bc.ch = displayCell.ch; bc.fg = displayCell.fg; bc.bg = displayCell.bg }
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
