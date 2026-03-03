import type { TileDef } from "./types.js"

// --- Room Detection via Flood-Fill ---

export interface DetectedRoom {
  id: number
  wallType: string // "brick" | "stone" | "white" | "green" | "mixed" | "none"
  bounds: { x: number; y: number; w: number; h: number }
  center: { x: number; y: number }
  floorTiles: number
  doors: { x: number; y: number; toRoom: number | null }[]
}

export interface RoomMap {
  rooms: DetectedRoom[]
  outdoorAreas: { bounds: { x: number; y: number; w: number; h: number } }[]
}

/** Wall chars that count as construction walls (not terrain obstacles) */
const WALL_CHARS = new Set(["#", "B", "W", "G"])

/** Map wall char → wall type label */
const WALL_LABELS: Record<string, string> = {
  B: "brick",
  "#": "stone",
  W: "white",
  G: "green",
}

/**
 * Flood-fill room detection.
 *
 * Walks every walkable tile, using door tiles (`D`) as flood boundaries.
 * Each connected component of walkable-non-door tiles = one room.
 * Then computes bounding box, wall type, door connectivity.
 */
export function detectBuildings(
  tiles: string[][],
  width: number,
  height: number,
  tileDefs: Record<string, TileDef>,
): RoomMap {
  // roomId per tile (-1 = unvisited)
  const roomGrid = new Int16Array(width * height).fill(-1)

  // Track which tiles are walkable (not wall, not void, not water, not tree)
  function isFloor(x: number, y: number): boolean {
    if (x < 0 || x >= width || y < 0 || y >= height) return false
    const ch = tiles[y]![x]!
    if (ch === "D") return false // door = boundary
    const def = tileDefs[ch]
    return def ? def.walkable : false
  }

  function isDoor(x: number, y: number): boolean {
    if (x < 0 || x >= width || y < 0 || y >= height) return false
    return tiles[y]![x] === "D"
  }

  function isWall(x: number, y: number): boolean {
    if (x < 0 || x >= width || y < 0 || y >= height) return false
    return WALL_CHARS.has(tiles[y]![x]!)
  }

  // Flood-fill from (sx, sy), returns list of tile coordinates
  function floodFill(sx: number, sy: number, roomId: number): { x: number; y: number }[] {
    const result: { x: number; y: number }[] = []
    const stack: [number, number][] = [[sx, sy]]

    while (stack.length > 0) {
      const [x, y] = stack.pop()!
      const idx = y * width + x
      if (roomGrid[idx] !== -1) continue
      if (!isFloor(x, y)) continue

      roomGrid[idx] = roomId
      result.push({ x, y })

      stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1])
    }

    return result
  }

  // --- Pass 1: flood-fill all walkable tiles ---
  const roomTiles: { x: number; y: number }[][] = []
  let nextId = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (roomGrid[y * width + x] !== -1) continue
      if (!isFloor(x, y)) continue

      const filled = floodFill(x, y, nextId)
      if (filled.length > 0) {
        roomTiles.push(filled)
        nextId++
      }
    }
  }

  // --- Pass 2: classify each flood region as indoor or outdoor ---
  // floodIdToRoomId maps a flood-fill component index → DetectedRoom.id (or -1 for outdoor)
  const floodIdToRoomId = new Int16Array(roomTiles.length).fill(-1)
  const rooms: DetectedRoom[] = []

  for (let rid = 0; rid < roomTiles.length; rid++) {
    const tileList = roomTiles[rid]!
    if (tileList.length === 0) continue

    // Bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const t of tileList) {
      if (t.x < minX) minX = t.x
      if (t.x > maxX) maxX = t.x
      if (t.y < minY) minY = t.y
      if (t.y > maxY) maxY = t.y
    }

    // Count wall contacts to determine indoor vs outdoor
    const wallCounts: Record<string, number> = {}
    let totalWallTouches = 0

    for (const t of tileList) {
      const neighbors: [number, number][] = [[t.x - 1, t.y], [t.x + 1, t.y], [t.x, t.y - 1], [t.x, t.y + 1]]
      for (const [nx, ny] of neighbors) {
        if (isWall(nx, ny)) {
          const wch = tiles[ny]![nx]!
          wallCounts[wch] = (wallCounts[wch] || 0) + 1
          totalWallTouches++
        }
      }
    }

    // Indoor heuristics:
    // 1. Bounding box shouldn't cover more than 25% of the map (that's outdoor)
    // 2. Walls should touch a significant portion of the perimeter
    const bboxArea = (maxX - minX + 1) * (maxY - minY + 1)
    const mapArea = width * height
    if (bboxArea > mapArea * 0.25) continue // too large to be a room

    const perimeter = 2 * ((maxX - minX + 1) + (maxY - minY + 1))
    const isIndoor = totalWallTouches > perimeter * 0.3

    if (!isIndoor) continue // outdoor region

    // Determine wall type
    let wallType = "none"
    const wallEntries = Object.entries(wallCounts)
    if (wallEntries.length === 1) {
      wallType = WALL_LABELS[wallEntries[0]![0]] || "stone"
    } else if (wallEntries.length > 1) {
      wallEntries.sort((a, b) => b[1] - a[1])
      const dominant = wallEntries[0]![1]
      const total = wallEntries.reduce((s, e) => s + e[1], 0)
      wallType = dominant / total > 0.7
        ? (WALL_LABELS[wallEntries[0]![0]] || "stone")
        : "mixed"
    }

    // Find adjacent door tiles
    const doorSet = new Set<string>()
    const doorList: { x: number; y: number; toRoom: number | null }[] = []

    for (const t of tileList) {
      const neighbors: [number, number][] = [[t.x - 1, t.y], [t.x + 1, t.y], [t.x, t.y - 1], [t.x, t.y + 1]]
      for (const [nx, ny] of neighbors) {
        if (isDoor(nx, ny)) {
          const key = `${nx},${ny}`
          if (!doorSet.has(key)) {
            doorSet.add(key)
            doorList.push({ x: nx, y: ny, toRoom: null })
          }
        }
      }
    }

    const roomId = rooms.length + 1
    floodIdToRoomId[rid] = roomId

    rooms.push({
      id: roomId,
      wallType,
      bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      center: { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) },
      floorTiles: tileList.length,
      doors: doorList,
    })
  }

  // --- Pass 3: resolve door connectivity using flood-ID → room-ID mapping ---
  for (const room of rooms) {
    for (const door of room.doors) {
      const neighbors: [number, number][] = [
        [door.x - 1, door.y], [door.x + 1, door.y],
        [door.x, door.y - 1], [door.x, door.y + 1],
      ]
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const floodId = roomGrid[ny * width + nx]
        if (floodId === -1) continue
        const mappedRoomId = floodIdToRoomId[floodId]
        if (mappedRoomId !== -1 && mappedRoomId !== room.id) {
          door.toRoom = mappedRoomId
          break
        }
      }
    }
  }

  return { rooms, outdoorAreas: [] }
}

/** Returns the room a coordinate is in, or null if outdoors */
export function roomAt(rooms: DetectedRoom[], x: number, y: number): DetectedRoom | null {
  for (const room of rooms) {
    const b = room.bounds
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
      return room
    }
  }
  return null
}

/** Describe relative position from (fx,fy) to (tx,ty) as "N tiles DIR" */
export function describeRelative(fx: number, fy: number, tx: number, ty: number): string {
  const dx = tx - fx
  const dy = ty - fy
  const dist = Math.round(Math.sqrt(dx * dx + dy * dy))

  if (dist === 0) return "(here)"

  // 8-direction from angle
  const angle = Math.atan2(-dy, dx) // -dy because screen Y is inverted
  const deg = ((angle * 180 / Math.PI) + 360) % 360

  let dir: string
  if (deg >= 337.5 || deg < 22.5) dir = "E"
  else if (deg < 67.5) dir = "NE"
  else if (deg < 112.5) dir = "N"
  else if (deg < 157.5) dir = "NW"
  else if (deg < 202.5) dir = "W"
  else if (deg < 247.5) dir = "SW"
  else if (deg < 292.5) dir = "S"
  else dir = "SE"

  return `${dist} tiles ${dir}`
}
