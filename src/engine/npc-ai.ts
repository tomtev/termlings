import { tileKey, type TileDef, type FurnitureOverlay, type RoomRegion, type Entity } from "./types.js"
import { isWalkable } from "./tilemap-core.js"
import type { DoorDef } from "./doors.js"

// ─── Walk Grid ──────────────────────────────────────────────────────
// Pre-computed Uint8Array: 1 = a 9-wide entity can stand at (x, footY)
// Checks tiles x+1..x+7 are all walkable (matching canMoveTo in game.ts)

export interface WalkGrid {
  data: Uint8Array
  width: number
  height: number
}

export function buildWalkGrid(
  tiles: string[][],
  tileDefs: Record<string, TileDef>,
  mapWidth: number,
  mapHeight: number,
  furniture: FurnitureOverlay,
  doors: DoorDef[],
): WalkGrid {
  const data = new Uint8Array(mapWidth * mapHeight)

  // Collect all door tile positions (force walkable in grid)
  const doorTiles = new Set<number>()
  for (const d of doors) {
    for (let i = 0; i < d.length; i++) {
      const tx = d.orientation === "horizontal" ? d.x + i : d.x
      const ty = d.orientation === "vertical" ? d.y + i : d.y
      doorTiles.add(tileKey(tx, ty))
    }
  }

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      // Check tiles x+1..x+7 (entity footprint)
      let ok = true
      for (let dx = 1; dx < 8; dx++) {
        const wx = x + dx
        if (wx >= mapWidth) { ok = false; break }
        // Door tiles are always walkable in the grid (NPCs plan through them)
        if (doorTiles.has(tileKey(wx, y))) continue
        if (!isWalkable(tiles, tileDefs, mapWidth, mapHeight, wx, y, furniture)) {
          ok = false
          break
        }
      }
      if (ok) data[y * mapWidth + x] = 1
    }
  }

  return { data, width: mapWidth, height: mapHeight }
}

function gridGet(grid: WalkGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return false
  return grid.data[y * grid.width + x] === 1
}

// ─── A* Pathfinder ──────────────────────────────────────────────────
// 4-directional, Manhattan heuristic, binary min-heap, room-bounded

export interface PathfinderState {
  // Reusable allocations (cleared between calls)
  gScore: Map<number, number>
  parent: Map<number, number>
  openSet: number[] // binary heap of packed coords
  fScore: Map<number, number>
}

export function createPathfinderState(): PathfinderState {
  return {
    gScore: new Map(),
    parent: new Map(),
    openSet: [],
    fScore: new Map(),
  }
}

function packCoord(x: number, y: number): number {
  return (y << 16) | (x & 0xffff)
}
function unpackX(v: number): number { return v & 0xffff }
function unpackY(v: number): number { return v >> 16 }

// Binary min-heap operations on fScore
function heapPush(heap: number[], fScore: Map<number, number>, val: number): void {
  heap.push(val)
  let i = heap.length - 1
  const vf = fScore.get(val) ?? Infinity
  while (i > 0) {
    const pi = (i - 1) >> 1
    const pf = fScore.get(heap[pi]!) ?? Infinity
    if (vf >= pf) break
    heap[i] = heap[pi]!
    heap[pi] = val
    i = pi
  }
}

function heapPop(heap: number[], fScore: Map<number, number>): number {
  const top = heap[0]!
  const last = heap.pop()!
  if (heap.length === 0) return top
  heap[0] = last
  let i = 0
  const len = heap.length
  const lf = fScore.get(last) ?? Infinity
  while (true) {
    let smallest = i
    let sf = lf
    const li = 2 * i + 1
    const ri = 2 * i + 2
    if (li < len) {
      const lif = fScore.get(heap[li]!) ?? Infinity
      if (lif < sf) { smallest = li; sf = lif }
    }
    if (ri < len) {
      const rif = fScore.get(heap[ri]!) ?? Infinity
      if (rif < sf) { smallest = ri }
    }
    if (smallest === i) break
    const tmp = heap[i]!
    heap[i] = heap[smallest]!
    heap[smallest] = tmp
    i = smallest
  }
  return top
}

const DX = [1, -1, 0, 0]
const DY = [0, 0, 1, -1]

export function findPath(
  grid: WalkGrid,
  sx: number, sy: number,
  gx: number, gy: number,
  bounds: { x0: number; y0: number; x1: number; y1: number },
  state: PathfinderState,
  maxNodes = 2000,
): Int16Array | null {
  // Clear state
  state.gScore.clear()
  state.parent.clear()
  state.fScore.clear()
  state.openSet.length = 0

  // Clamp goal to walkable
  if (!gridGet(grid, gx, gy)) {
    // Try nearby cells
    let best = -1
    let bestDist = Infinity
    for (let r = 1; r <= 5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
          const nx = gx + dx, ny = gy + dy
          if (gridGet(grid, nx, ny)) {
            const d = Math.abs(dx) + Math.abs(dy)
            if (d < bestDist) { bestDist = d; best = packCoord(nx, ny) }
          }
        }
      }
      if (best !== -1) break
    }
    if (best === -1) return null
    gx = unpackX(best)
    gy = unpackY(best)
  }

  const startKey = packCoord(sx, sy)
  const goalKey = packCoord(gx, gy)

  if (startKey === goalKey) return new Int16Array(0)

  state.gScore.set(startKey, 0)
  const h0 = Math.abs(sx - gx) + Math.abs(sy - gy)
  state.fScore.set(startKey, h0)
  heapPush(state.openSet, state.fScore, startKey)

  let nodesExpanded = 0

  while (state.openSet.length > 0) {
    const current = heapPop(state.openSet, state.fScore)
    if (current === goalKey) {
      return reconstructPath(state.parent, current)
    }

    nodesExpanded++
    if (nodesExpanded >= maxNodes) return null

    const cx = unpackX(current)
    const cy = unpackY(current)
    const cg = state.gScore.get(current)!

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d]!
      const ny = cy + DY[d]!

      // Bounds check (room + padding)
      if (nx < bounds.x0 || nx > bounds.x1 || ny < bounds.y0 || ny > bounds.y1) continue
      if (!gridGet(grid, nx, ny)) continue

      const nKey = packCoord(nx, ny)
      const ng = cg + 1
      const existing = state.gScore.get(nKey)
      if (existing !== undefined && ng >= existing) continue

      state.gScore.set(nKey, ng)
      state.parent.set(nKey, current)
      const nf = ng + Math.abs(nx - gx) + Math.abs(ny - gy)
      state.fScore.set(nKey, nf)
      heapPush(state.openSet, state.fScore, nKey)
    }
  }

  return null // unreachable
}

function reconstructPath(parent: Map<number, number>, goalKey: number): Int16Array {
  // Build raw path backwards
  const raw: number[] = []
  let cur = goalKey
  while (cur !== undefined) {
    raw.push(cur)
    const p = parent.get(cur)
    if (p === undefined) break
    cur = p
  }
  raw.reverse()

  // Simplify: remove collinear waypoints
  if (raw.length <= 2) {
    const result = new Int16Array(raw.length * 2)
    for (let i = 0; i < raw.length; i++) {
      result[i * 2] = unpackX(raw[i]!)
      result[i * 2 + 1] = unpackY(raw[i]!)
    }
    return result
  }

  const simplified: number[] = [raw[0]!]
  for (let i = 1; i < raw.length - 1; i++) {
    const px = unpackX(raw[i - 1]!)
    const py = unpackY(raw[i - 1]!)
    const cx = unpackX(raw[i]!)
    const cy = unpackY(raw[i]!)
    const nx = unpackX(raw[i + 1]!)
    const ny = unpackY(raw[i + 1]!)
    // Keep if direction changes
    if ((cx - px) !== (nx - cx) || (cy - py) !== (ny - cy)) {
      simplified.push(raw[i]!)
    }
  }
  simplified.push(raw[raw.length - 1]!)

  const result = new Int16Array(simplified.length * 2)
  for (let i = 0; i < simplified.length; i++) {
    result[i * 2] = unpackX(simplified[i]!)
    result[i * 2 + 1] = unpackY(simplified[i]!)
  }
  return result
}

// ─── NPC Behavior State Machine ─────────────────────────────────────

export interface NpcAIState {
  path: Int16Array | null
  pathIdx: number         // index into path (each waypoint = 2 entries)
  stepX: number           // current interpolation target x
  stepY: number           // current interpolation target y
  stuckTicks: number
  phase: "idle" | "walking" | "waiting"
  idleRemaining: number
  waitRemaining: number
  retries: number         // consecutive failed pathfind attempts
}

export function createNpcAIState(): NpcAIState {
  return {
    path: null,
    pathIdx: 0,
    stepX: 0,
    stepY: 0,
    stuckTicks: 0,
    phase: "idle",
    idleRemaining: Math.floor(30 + Math.random() * 90),
    waitRemaining: 0,
    retries: 0,
  }
}

export interface StepResult {
  moved: boolean
  startedWalking: boolean   // just picked a new target (check for talk/wave)
  arrivedAtTarget: boolean
}

function pickTargetInRoom(
  room: RoomRegion,
  grid: WalkGrid,
  npc: Entity,
): { x: number; y: number } | null {
  const margin = 2
  const minX = room.x + margin
  const maxX = room.x + room.w - margin - 10
  const minY = room.y + 2
  const maxY = room.y + room.h - npc.height - 3

  // Try up to 15 random positions
  for (let attempt = 0; attempt < 15; attempt++) {
    const tx = minX + Math.floor(Math.random() * Math.max(1, maxX - minX))
    const ty = minY + Math.floor(Math.random() * Math.max(1, maxY - minY))
    const footY = ty + npc.height - 1
    if (gridGet(grid, tx, footY)) {
      return { x: tx, y: footY }
    }
  }
  return null
}

function getRoomBounds(room: RoomRegion, padding: number): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: room.x - padding,
    y0: room.y - padding,
    x1: room.x + room.w + padding,
    y1: room.y + room.h + padding,
  }
}

export function stepNpc(
  npc: Entity,
  ai: NpcAIState,
  grid: WalkGrid,
  rooms: RoomRegion[],
  pf: PathfinderState,
  canMoveToFn: (x: number, y: number, h: number) => boolean,
): StepResult {
  const result: StepResult = { moved: false, startedWalking: false, arrivedAtTarget: false }

  if (ai.phase === "idle") {
    ai.idleRemaining--
    npc.walking = false
    npc.idle = true
    if (ai.idleRemaining > 0) return result

    // Pick a new target
    const footY = npc.y + npc.height - 1
    const room = findRoom(rooms, npc.x + 4, footY)
    if (!room) {
      ai.idleRemaining = 60
      return result
    }

    const target = pickTargetInRoom(room, grid, npc)
    if (!target) {
      ai.retries++
      ai.idleRemaining = ai.retries >= 3 ? 120 + Math.floor(Math.random() * 90) : 20
      if (ai.retries >= 3) ai.retries = 0
      return result
    }

    // A* from current foot position to target foot position
    const startFootY = npc.y + npc.height - 1
    const bounds = getRoomBounds(room, 20)
    const path = findPath(grid, npc.x, startFootY, target.x, target.y, bounds, pf)

    if (!path || path.length === 0) {
      ai.retries++
      ai.idleRemaining = ai.retries >= 3 ? 120 + Math.floor(Math.random() * 90) : 20
      if (ai.retries >= 3) ai.retries = 0
      return result
    }

    ai.path = path
    ai.pathIdx = 0
    ai.stuckTicks = 0
    ai.retries = 0
    ai.phase = "walking"
    npc.walking = true
    npc.idle = false
    result.startedWalking = true
    return result
  }

  if (ai.phase === "waiting") {
    ai.waitRemaining--
    npc.walking = false
    if (ai.waitRemaining <= 0) {
      ai.phase = "walking"
      npc.walking = true
    }
    return result
  }

  // phase === "walking"
  if (!ai.path || ai.pathIdx >= ai.path.length / 2) {
    // Arrived
    result.arrivedAtTarget = true
    ai.path = null
    ai.phase = "idle"
    ai.idleRemaining = 60 + Math.floor(Math.random() * 150)
    npc.walking = false
    npc.talking = false
    npc.waving = false
    npc.waveFrame = 0
    npc.talkFrame = 0
    npc.backside = false
    npc.idle = true
    return result
  }

  // Get next waypoint
  const wpIdx = ai.pathIdx
  const wpX = ai.path[wpIdx * 2]!
  const wpY = ai.path[wpIdx * 2 + 1]!

  // Step one tile toward waypoint (the path is per-tile, so we follow it step by step)
  // We need to interpolate between waypoints for non-adjacent ones (after simplification)
  const footY = npc.y + npc.height - 1
  const dx = wpX - npc.x
  const dy = wpY - footY

  // Check if we've reached this waypoint
  if (dx === 0 && dy === 0) {
    ai.pathIdx++
    ai.stuckTicks = 0
    return result
  }

  // Move one step toward waypoint
  let moved = false
  let newX = npc.x
  let newY = npc.y

  if (dx !== 0) {
    const step = dx > 0 ? 1 : -1
    if (canMoveToFn(npc.x + step, npc.y, npc.height)) {
      newX = npc.x + step
      moved = true
    }
    npc.flipped = dx < 0
  }
  if (dy !== 0) {
    const step = dy > 0 ? 1 : -1
    if (canMoveToFn(newX, npc.y + step, npc.height)) {
      newY = npc.y + step
      moved = true
    }
    npc.backside = dy < 0
  }

  if (moved) {
    npc.x = newX
    npc.y = newY
    ai.stuckTicks = 0
    result.moved = true

    // Micro-pause: ~10% chance per step, 10-20 tick pause
    if (Math.random() < 0.10) {
      ai.phase = "waiting"
      ai.waitRemaining = 10 + Math.floor(Math.random() * 10)
      npc.walking = false
    }
  } else {
    ai.stuckTicks++

    if (ai.stuckTicks < 6) {
      // Wait (door might be opening)
    } else if (ai.stuckTicks < 18) {
      // Recompute path from current position
      const currentFootY = npc.y + npc.height - 1
      const goalX = ai.path[ai.path.length - 2]!
      const goalY = ai.path[ai.path.length - 1]!
      const room = findRoom(rooms, npc.x + 4, currentFootY)
      if (room) {
        const bounds = getRoomBounds(room, 20)
        const newPath = findPath(grid, npc.x, currentFootY, goalX, goalY, bounds, pf)
        if (newPath && newPath.length > 0) {
          ai.path = newPath
          ai.pathIdx = 0
          ai.stuckTicks = 0
        }
      }
    } else {
      // Give up, go idle
      ai.path = null
      ai.phase = "idle"
      ai.idleRemaining = 60 + Math.floor(Math.random() * 90)
      npc.walking = false
      npc.talking = false
      npc.waving = false
      npc.waveFrame = 0
      npc.talkFrame = 0
      npc.backside = false
      npc.idle = true
    }
  }

  return result
}

function findRoom(rooms: RoomRegion[], wx: number, wy: number): RoomRegion | null {
  for (const r of rooms) {
    if (wx >= r.x && wx < r.x + r.w && wy >= r.y && wy < r.y + r.h) return r
  }
  return null
}
