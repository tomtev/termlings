import { tileKey, type TileDef, type RoomRegion, type ParsedMap, type Cell, type RGB, type FurnitureOverlay } from "./types.js"

export const DEFAULT_TILE_DEFS: Record<string, TileDef> = {
  " ": { ch: " ", fg: null,            bg: null,            walkable: false },
  ".": { ch: "·", fg: [35, 35, 40],   bg: null,            walkable: true  },
  "#": { ch: "█", fg: [80, 100, 130],  bg: null,            walkable: false },
  "B": { ch: "█", fg: [100, 60, 40],   bg: null,            walkable: false },
  "W": { ch: "█", fg: [180, 180, 190], bg: null,            walkable: false },
  "G": { ch: "█", fg: [40, 100, 50],   bg: null,            walkable: false },
  "*": { ch: "*", fg: [255, 200, 80],  bg: null,            walkable: true  },
  "~": { ch: "~", fg: [60, 120, 200],  bg: [20, 40, 80],    walkable: false },
  ",": { ch: ",", fg: [60, 120, 50],   bg: null,            walkable: true  },
  "T": { ch: "♣", fg: [30, 80, 30],   bg: [30, 30, 40],    walkable: false },
  "D": { ch: "·", fg: [35, 35, 40],   bg: null,            walkable: true  },
  "P": { ch: "·", fg: [35, 35, 40],   bg: null,            walkable: true  },
  "S": { ch: "·", fg: [35, 35, 40],   bg: null,            walkable: true  },
  "n": { ch: ".", fg: [180, 195, 210], bg: [20, 25, 35],    walkable: true  },
  "e": { ch: ".", fg: [120, 85, 50],   bg: null,            walkable: true  },
  "p": { ch: "·", fg: [90, 90, 100],  bg: null,            walkable: true  },
  "h": { ch: "─", fg: [140, 100, 60], bg: [40, 28, 15],    walkable: true  },
}

// Ground character variation (keyed by map tile char)
const GROUND_VARIATION: Record<string, {
  chars: string[]
  flatCh: string | null
  flatFg: RGB | null
}> = {
  ",": { chars: [",", ",", "'", "'", "`", ";", ","], flatCh: ".", flatFg: [40, 80, 35] },
  "n": { chars: [".", "*", "'", "·", ".", "`", "."], flatCh: "o", flatFg: [120, 130, 145] },
  "e": { chars: [".", ":", "·", ";", ".", ".", ":"], flatCh: "o", flatFg: [80, 55, 30] },
  "p": { chars: ["·", "·", ".", "·", ":", "·", "."], flatCh: null, flatFg: null },
  "h": { chars: ["─", "─", "═", "─", "─", "│", "─"], flatCh: "o", flatFg: [100, 70, 40] },
}

// Pre-computed sine lookup table (256 entries, -1..1 range) — replaces Math.sin in wind
const _sinLut = new Float32Array(256)
for (let i = 0; i < 256; i++) _sinLut[i] = Math.sin((i / 256) * Math.PI * 2)

// Scratch RGB array reused to avoid per-tile allocation in wind animation
const _windFg: RGB = [0, 0, 0]

function groundHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

/** Parse raw ASCII string into a ParsedMap */
export function loadMapFromString(raw: string, tileDefs?: Record<string, TileDef>): ParsedMap {
  const defs = tileDefs ?? DEFAULT_TILE_DEFS
  const lines = raw.split("\n").filter(l => l.length > 0)

  const height = lines.length
  const width = Math.max(...lines.map(l => l.length))

  const tiles: string[][] = lines.map(l => {
    const row = l.split("")
    while (row.length < width) row.push(" ")
    return row
  })

  const npcSpawns: { x: number; y: number }[] = []
  let playerSpawn = { x: 0, y: 0 }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y]![x] === "P") npcSpawns.push({ x, y })
      if (tiles[y]![x] === "S") playerSpawn = { x, y }
    }
  }

  const rooms = detectRooms(tiles, width, height, defs)

  return { tiles, width, height, npcSpawns, playerSpawn, rooms, tileDefs: defs }
}

/** Simple room detection -- finds rectangular wall-bounded regions */
export function detectRooms(
  tiles: string[][],
  width: number,
  height: number,
  tileDefs: Record<string, TileDef>,
): RoomRegion[] {
  const rooms: RoomRegion[] = []
  const visited = new Set<string>()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = tiles[y]![x]!
      if (ch === " " || visited.has(`${x},${y}`)) continue
      const def = tileDefs[ch]
      if (!def || def.walkable) continue

      let x2 = x
      while (x2 + 1 < width && tiles[y]![x2 + 1] !== " ") x2++

      let y2 = y
      while (y2 + 1 < height && tiles[y2 + 1]?.[x] !== " ") y2++

      const bottomRight = tiles[y2]?.[x2]
      if (x2 - x >= 10 && y2 - y >= 5 && bottomRight && !tileDefs[bottomRight]?.walkable) {
        for (let ry = y; ry <= y2; ry++) {
          for (let rx = x; rx <= x2; rx++) {
            visited.add(`${rx},${ry}`)
          }
        }
        rooms.push({
          name: `room${rooms.length + 1}`,
          x, y,
          w: x2 - x + 1,
          h: y2 - y + 1,
        })
      }
    }
  }

  return rooms
}

/** Render visible tiles from the tile map into the buffer */
export function stampTiles(
  buffer: Cell[][],
  cols: number,
  rows: number,
  tiles: string[][],
  tileDefs: Record<string, TileDef>,
  mapWidth: number,
  mapHeight: number,
  cameraX: number,
  cameraY: number,
  scale: number,
  footprints?: Map<number, number>,
  tick?: number,
  wind?: number,
) {
  const t = tick ?? 0
  const w = wind ?? 0

  for (let sy = 0; sy < rows; sy++) {
    const ty = sy + cameraY
    if (ty < 0 || ty >= mapHeight || !tiles[ty]) continue
    const tileRow = tiles[ty]!
    const bufRow = buffer[sy]!
    let lastTx = -1 // deduplicate tile lookups across scaled columns
    let lastDef: TileDef | undefined
    let lastCh: string | undefined
    let lastVariation: typeof GROUND_VARIATION[string] | undefined
    for (let sx = 0; sx < cols; sx++) {
      const tx = Math.floor(sx / scale) + cameraX
      if (tx < 0 || tx >= mapWidth) continue

      // Cache tile lookup when scale > 1 (same tile spans multiple screen cols)
      if (tx !== lastTx) {
        lastTx = tx
        lastCh = tileRow[tx]
        lastDef = lastCh ? tileDefs[lastCh] : undefined
        lastVariation = lastCh ? GROUND_VARIATION[lastCh] : undefined
      }
      if (!lastCh || !lastDef || (lastDef.ch === " " && !lastDef.bg)) continue

      const cell = bufRow[sx]!
      const variation = lastVariation
      if (variation) {
        const isFlat = variation.flatCh && footprints && footprints.size > 0 && footprints.has(tileKey(tx, ty))
        if (isFlat) {
          cell.ch = variation.flatCh!
          cell.fg = variation.flatFg
          cell.bg = lastDef.bg
        } else {
          const len = variation.chars.length
          const baseIdx = groundHash(tx, ty) % len

          let idx = baseIdx
          let fg = lastDef.fg
          if (lastCh === "," && w > 0) {
            // Fast sine approximation using lookup table (avoids Math.sin per tile)
            const wave = _sinLut[((tx * 19 + ty * 13 + ((t * w) | 0)) & 0xff)]!
            const threshold = 1.0 - w * 0.4
            if (wave > threshold || wave < -threshold) {
              idx = ((baseIdx + (wave > 0 ? 1 : -1)) % len + len) % len
            }
            if (fg) {
              const g = fg[1]! + ((wave * 12 * w) | 0)
              _windFg[0] = fg[0]!
              _windFg[1] = g < 0 ? 0 : g > 255 ? 255 : g
              _windFg[2] = fg[2]!
              fg = _windFg
            }
          }

          cell.ch = variation.chars[idx]!
          cell.fg = fg
          cell.bg = lastDef.bg
        }
      } else {
        cell.ch = lastDef.ch
        cell.fg = lastDef.fg
        cell.bg = lastDef.bg
      }
    }
  }
}

/** Check if a tile position is walkable */
export function isWalkable(
  tiles: string[][],
  tileDefs: Record<string, TileDef>,
  mapWidth: number,
  mapHeight: number,
  wx: number,
  wy: number,
  furniture?: FurnitureOverlay,
): boolean {
  if (wx < 0 || wy < 0 || wy >= mapHeight || wx >= mapWidth) return false
  // Furniture overlay takes precedence
  if (furniture) {
    const fw = furniture.walkable.get(tileKey(wx, wy))
    if (fw !== undefined) return fw
  }
  const ch = tiles[wy]?.[wx]
  if (!ch) return false
  const def = tileDefs[ch]
  return def ? def.walkable : false
}
