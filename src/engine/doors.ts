import { tileKey, type RGB, type Cell, type FurnitureOverlay, type Entity } from "./types.js"

export interface DoorDef {
  x: number
  y: number
  orientation: "vertical" | "horizontal" // vertical = blocks horizontal corridor
  length: number // 8 for vertical, 16 for horizontal
  color: RGB // matches adjacent wall
}

export interface DoorState {
  def: DoorDef
  openAmount: number // 0=closed, 4=fully open
  closeTimer: number // ticks since last entity nearby
  _blocked: number[] // cached blocked indices for current openAmount
}

const OPEN_STEPS = 4
const PROXIMITY = 6
const ANIMATE_INTERVAL = 3 // ticks between animation steps
const CLOSE_DELAY = 90 // ticks (~1.5s at 60fps) before closing starts

export function createDoors(defs: DoorDef[], furnitureOverlay: FurnitureOverlay): DoorState[] {
  const doors = defs.map(def => ({
    def,
    openAmount: 0,
    closeTimer: 0,
    _blocked: getBlockedIndices(def.length, 0),
  }))

  // Set initial closed state in overlay
  for (const door of doors) {
    const { x, y, orientation, length, color } = door.def
    for (let i = 0; i < length; i++) {
      const tx = orientation === "horizontal" ? x + i : x
      const ty = orientation === "vertical" ? y + i : y
      const key = tileKey(tx, ty)
      furnitureOverlay.walkable.set(key, false)
      furnitureOverlay.visual.set(key, { ch: "█", fg: color, bg: null })
    }
  }

  return doors
}

function doorCenter(def: DoorDef): { cx: number; cy: number } {
  if (def.orientation === "vertical") {
    return { cx: def.x, cy: def.y + def.length / 2 }
  } else {
    return { cx: def.x + def.length / 2, cy: def.y }
  }
}

function isEntityNearDoor(entities: Entity[], def: DoorDef): boolean {
  const { cx, cy } = doorCenter(def)
  for (const e of entities) {
    const feetX = e.x + 4
    const feetY = e.y + e.height - 1
    if (Math.abs(feetX - cx) <= PROXIMITY && Math.abs(feetY - cy) <= PROXIMITY) {
      return true
    }
  }
  return false
}

// Get which tile indices are blocked (not retracted) for given openAmount
function getBlockedIndices(length: number, openAmount: number): number[] {
  if (openAmount >= OPEN_STEPS) return []
  const half = Math.floor(length / 2)
  const perSide = Math.floor(length / (2 * OPEN_STEPS))
  const sideRemoved = openAmount * perSide
  const blocked: number[] = []
  for (let i = 0; i < length; i++) {
    if (i < half - sideRemoved || i >= half + sideRemoved) {
      blocked.push(i)
    }
  }
  return blocked
}

export function updateDoors(
  doors: DoorState[],
  entities: Entity[],
  furnitureOverlay: FurnitureOverlay,
  tick: number,
): void {
  for (const door of doors) {
    const nearby = isEntityNearDoor(entities, door.def)
    const prevOpen = door.openAmount

    if (nearby) {
      door.closeTimer = 0
      if (door.openAmount < OPEN_STEPS && tick % ANIMATE_INTERVAL === 0) {
        door.openAmount++
      }
    } else {
      door.closeTimer++
      if (door.closeTimer > CLOSE_DELAY && door.openAmount > 0 && tick % ANIMATE_INTERVAL === 0) {
        door.openAmount--
      }
    }

    // Only update overlay when openAmount actually changed
    if (door.openAmount !== prevOpen) {
      const { x, y, orientation, length, color } = door.def
      // Clear old blocked tiles
      for (const i of door._blocked) {
        const tx = orientation === "horizontal" ? x + i : x
        const ty = orientation === "vertical" ? y + i : y
        const key = tileKey(tx, ty)
        furnitureOverlay.walkable.delete(key)
        furnitureOverlay.visual.delete(key)
      }
      // Recompute and cache new blocked indices
      door._blocked = getBlockedIndices(length, door.openAmount)
      for (const i of door._blocked) {
        const tx = orientation === "horizontal" ? x + i : x
        const ty = orientation === "vertical" ? y + i : y
        const key = tileKey(tx, ty)
        furnitureOverlay.walkable.set(key, false)
        furnitureOverlay.visual.set(key, { ch: "█", fg: color, bg: null })
      }
    }
  }
}

export function stampDoors(
  buffer: Cell[][],
  cols: number,
  rows: number,
  doors: DoorState[],
  cameraX: number,
  cameraY: number,
  scale: number,
): void {
  for (const door of doors) {
    if (door.openAmount >= OPEN_STEPS) continue
    const { x, y, orientation, color } = door.def

    for (const i of door._blocked) {
      const tx = orientation === "horizontal" ? x + i : x
      const ty = orientation === "vertical" ? y + i : y
      const sy = ty - cameraY
      if (sy < 0 || sy >= rows) continue

      const baseSx = (tx - cameraX) * scale
      for (let ci = 0; ci < scale; ci++) {
        const sx = baseSx + ci
        if (sx < 0 || sx >= cols || !buffer[sy]) continue
        const bc = buffer[sy]![sx]
        if (bc) { bc.ch = "█"; bc.fg = color; bc.bg = null }
      }
    }
  }
}
