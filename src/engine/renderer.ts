import {
  generateGrid,
  generateGridSmall,
  type Pixel,
} from "../index.js"
import type { RGB, Cell, Entity } from "./types.js"

export type { Cell }

/** Get the 2-char string and colors for a pixel type */
export function pixelCell(
  p: Pixel,
  face: RGB,
  dark: RGB,
  hat: RGB,
  flipped: boolean,
): { chars: string; fg: RGB | null; bg: RGB | null } | null {
  let chars: string
  let fg: RGB | null = null
  let bg: RGB | null = null

  switch (p) {
    case "f": chars = "██"; fg = face; break
    case "l": chars = flipped ? " ▐" : "▌ "; fg = face; break
    case "a": chars = "▄▄"; fg = face; break
    case "e": case "d": chars = "██"; fg = dark; break
    case "s": chars = "▄▄"; fg = dark; bg = face; break
    case "n": chars = "▐▌"; fg = dark; bg = face; break
    case "m": chars = "▀▀"; fg = dark; bg = face; break
    case "q": chars = flipped ? "▖ " : " ▗"; fg = dark; bg = face; break
    case "r": chars = flipped ? " ▗" : "▖ "; fg = dark; bg = face; break
    case "h": chars = "██"; fg = hat; break
    case "k": chars = "▐▌"; fg = hat; break
    case "u": chars = "▀▀"; fg = face; break
    default: return null
  }
  return { chars, fg, bg }
}

/** Resolve a pixel type to its primary color */
export function pixelRgb(p: Pixel, face: RGB, dark: RGB, hat: RGB): RGB | null {
  switch (p) {
    case "f": case "l": case "a": case "u": return face
    case "e": case "d": case "s": case "n": case "m": case "q": case "r": return dark
    case "h": case "k": return hat
    default: return null
  }
}

export function allocBuffer(cols: number, rows: number): Cell[][] {
  const buffer: Cell[][] = []
  for (let y = 0; y < rows; y++) {
    buffer[y] = []
    for (let x = 0; x < cols; x++) {
      buffer[y]![x] = { ch: " ", fg: null, bg: null }
    }
  }
  return buffer
}

export function clearBuffer(buffer: Cell[][], cols: number, rows: number) {
  for (let y = 0; y < rows; y++) {
    const row = buffer[y]!
    for (let x = 0; x < cols; x++) {
      const c = row[x]!
      c.ch = " "
      c.fg = null
      c.bg = null
    }
  }
}

// Pre-allocated render buffer — avoids string/array allocation per frame
let _renderBuf: Buffer | null = null
let _renderBufSize = 0

/** Render buffer to terminal, returns a Buffer for direct stdout.write() */
export function renderBuffer(buffer: Cell[][], cols: number, rows: number): Buffer {
  // Ensure render buffer is large enough (~30 bytes max per cell + 12 per row for cursor positioning)
  const needed = cols * rows * 30 + rows * 12 + 64
  if (!_renderBuf || _renderBufSize < needed) {
    _renderBufSize = needed
    _renderBuf = Buffer.allocUnsafe(_renderBufSize)
  }
  const buf = _renderBuf
  let o = 0 // write offset

  // Track last fg/bg by REFERENCE first (fast path for same RGB tuple),
  // fall back to component comparison only when reference differs.
  let lastFg: RGB | null = null
  let lastBg: RGB | null = null
  let lfr = -1, lfg2 = -1, lfb = -1
  let lbr = -1, lbg2 = -1, lbb = -1

  for (let y = 0; y < rows; y++) {
    // Explicit cursor positioning per row: \x1b[{row};1H (1-based)
    // This is immune to character width issues — no auto-wrap dependency
    buf[o++] = 0x1b; buf[o++] = 0x5b // \x1b[
    o = writeUint(buf, o, y + 1)
    buf[o++] = 0x3b; buf[o++] = 0x31; buf[o++] = 0x48 // ;1H

    const row = buffer[y]!
    for (let x = 0; x < cols; x++) {
      const cell = row[x]!
      const fg = cell.fg
      const bg = cell.bg

      // Fast path: same RGB reference means same color — skip entirely
      if (fg !== lastFg) {
        lastFg = fg
        if (!fg) {
          if (lfr !== -1) {
            buf[o++] = 0x1b; buf[o++] = 0x5b; buf[o++] = 0x33; buf[o++] = 0x39; buf[o++] = 0x6d
            lfr = -1; lfg2 = -1; lfb = -1
          }
        } else {
          const fr = fg[0]!, fc = fg[1]!, fb = fg[2]!
          if (fr !== lfr || fc !== lfg2 || fb !== lfb) {
            buf[o++] = 0x1b; buf[o++] = 0x5b; buf[o++] = 0x33; buf[o++] = 0x38
            buf[o++] = 0x3b; buf[o++] = 0x32; buf[o++] = 0x3b
            o = writeUint(buf, o, fr); buf[o++] = 0x3b
            o = writeUint(buf, o, fc); buf[o++] = 0x3b
            o = writeUint(buf, o, fb); buf[o++] = 0x6d
            lfr = fr; lfg2 = fc; lfb = fb
          }
        }
      }
      if (bg !== lastBg) {
        lastBg = bg
        if (!bg) {
          if (lbr !== -1) {
            buf[o++] = 0x1b; buf[o++] = 0x5b; buf[o++] = 0x34; buf[o++] = 0x39; buf[o++] = 0x6d
            lbr = -1; lbg2 = -1; lbb = -1
          }
        } else {
          const br = bg[0]!, bc2 = bg[1]!, bb = bg[2]!
          if (br !== lbr || bc2 !== lbg2 || bb !== lbb) {
            buf[o++] = 0x1b; buf[o++] = 0x5b; buf[o++] = 0x34; buf[o++] = 0x38
            buf[o++] = 0x3b; buf[o++] = 0x32; buf[o++] = 0x3b
            o = writeUint(buf, o, br); buf[o++] = 0x3b
            o = writeUint(buf, o, bc2); buf[o++] = 0x3b
            o = writeUint(buf, o, bb); buf[o++] = 0x6d
            lbr = br; lbg2 = bc2; lbb = bb
          }
        }
      }

      // Write character (handle multi-byte UTF-8)
      const ch = cell.ch
      const code = ch.charCodeAt(0)
      if (code < 0x80) {
        buf[o++] = code
      } else {
        o += buf.write(ch, o)
      }
    }
    // Erase remainder of line (clears stale content after resize)
    buf[o++] = 0x1b; buf[o++] = 0x5b; buf[o++] = 0x4b // \x1b[K
  }
  if (lfr !== -1) { buf[o++] = 0x1b; buf[o++] = 0x5b; buf[o++] = 0x33; buf[o++] = 0x39; buf[o++] = 0x6d }
  if (lbr !== -1) { buf[o++] = 0x1b; buf[o++] = 0x5b; buf[o++] = 0x34; buf[o++] = 0x39; buf[o++] = 0x6d }

  return buf.subarray(0, o)
}

/** Write unsigned int (0-255) as ASCII digits into buffer */
function writeUint(buf: Buffer, o: number, v: number): number {
  if (v >= 100) { buf[o++] = 48 + ((v / 100) | 0); buf[o++] = 48 + (((v / 10) | 0) % 10); buf[o++] = 48 + (v % 10) }
  else if (v >= 10) { buf[o++] = 48 + ((v / 10) | 0); buf[o++] = 48 + (v % 10) }
  else { buf[o++] = 48 + v }
  return o
}

// Reusable flipped grid — avoids per-frame allocation
function flipGrid(grid: Pixel[][]): Pixel[][] {
  const out: Pixel[][] = new Array(grid.length)
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i]!
    const flipped = new Array(row.length) as Pixel[]
    for (let j = row.length - 1, k = 0; j >= 0; j--, k++) {
      flipped[k] = row[j]!
    }
    out[i] = flipped
  }
  return out
}

// Pack entity animation state into a single number for cache invalidation
function entityCacheKey(e: Entity): number {
  return (e.walkFrame << 16) | (e.talkFrame << 12) | (e.waveFrame << 8) | (e.flipped ? 4 : 0) | (e.backside ? 2 : 0)
}

/** Stamp a sprite into the screen buffer (normal zoom) */
export function stampEntity(
  buffer: Cell[][],
  cols: number,
  rows: number,
  e: Entity,
  cameraX: number,
  cameraY: number,
  scale: number,
) {
  const key = entityCacheKey(e)
  let grid: Pixel[][]
  if (e._cacheKey === key && e._gridCache) {
    grid = e._gridCache as Pixel[][]
  } else {
    const raw = generateGrid(e.traits, e.walkFrame, e.talkFrame, e.waveFrame, e.backside)
    grid = e.flipped ? flipGrid(raw) : raw
    e._gridCache = grid
    e._cacheKey = key
    // Invalidate small cache too since key changed
    e._gridSmallCache = undefined
  }

  const ex = (e.x - cameraX) * scale
  const ey = e.y - cameraY
  const face = e.faceRgb, dark = e.darkRgb, hat = e.hatRgb
  const fl = e.flipped

  for (let gy = 0; gy < grid.length; gy++) {
    const sy = ey + gy
    if (sy < 0 || sy >= rows) continue
    const row = grid[gy]!
    const bufRow = buffer[sy]!
    for (let gx = 0; gx < row.length; gx++) {
      const p = row[gx]!
      if (p === "_") continue

      // Inline pixelCell — no object allocation
      let c0: string, c1: string
      let fg: RGB | null = null
      let bg: RGB | null = null
      switch (p) {
        case "f": c0 = "█"; c1 = "█"; fg = face; break
        case "l": if (fl) { c0 = " "; c1 = "▐" } else { c0 = "▌"; c1 = " " }; fg = face; break
        case "a": c0 = "▄"; c1 = "▄"; fg = face; break
        case "e": case "d": c0 = "█"; c1 = "█"; fg = dark; break
        case "s": c0 = "▄"; c1 = "▄"; fg = dark; bg = face; break
        case "n": c0 = "▐"; c1 = "▌"; fg = dark; bg = face; break
        case "m": c0 = "▀"; c1 = "▀"; fg = dark; bg = face; break
        case "q": if (fl) { c0 = "▖"; c1 = " " } else { c0 = " "; c1 = "▗" }; fg = dark; bg = face; break
        case "r": if (fl) { c0 = " "; c1 = "▗" } else { c0 = "▖"; c1 = " " }; fg = dark; bg = face; break
        case "h": c0 = "█"; c1 = "█"; fg = hat; break
        case "k": c0 = "▐"; c1 = "▌"; fg = hat; break
        case "u": c0 = "▀"; c1 = "▀"; fg = face; break
        default: continue
      }

      const sx = ex + gx * 2
      let bx = sx
      if (bx >= 0 && bx < cols) { const bc = bufRow[bx]!; bc.ch = c0; bc.fg = fg; bc.bg = bg }
      bx = sx + 1
      if (bx >= 0 && bx < cols) { const bc = bufRow[bx]!; bc.ch = c1; bc.fg = fg; bc.bg = bg }
    }
  }
}

// Inline pixel-to-RGB resolution (avoids function call per pixel)
function pxRgb(p: Pixel, face: RGB, dark: RGB, hat: RGB): RGB | null {
  switch (p) {
    case "f": case "l": case "a": case "u": return face
    case "e": case "d": case "s": case "n": case "m": case "q": case "r": return dark
    case "h": case "k": return hat
    default: return null
  }
}

/** Stamp a sprite in small mode (half-block, 1 char per column) */
export function stampEntitySmall(
  buffer: Cell[][],
  cols: number,
  rows: number,
  e: Entity,
  cameraX: number,
  cameraY: number,
) {
  // Cache key for small grids: same animation state but talkFrame always 0 for small
  const key = (e.walkFrame << 16) | (e.waveFrame << 8) | (e.flipped ? 4 : 0) | (e.backside ? 2 : 0)
  let grid: Pixel[][]
  if (e._cacheKeySmall === key && e._gridSmallCache) {
    grid = e._gridSmallCache as Pixel[][]
  } else {
    const raw = generateGridSmall(e.traits, e.walkFrame, 0, e.waveFrame, e.backside)
    grid = e.flipped ? flipGrid(raw) : raw
    e._gridSmallCache = grid
    e._cacheKeySmall = key
  }

  const ex = e.x - cameraX
  const ey = e.y - cameraY
  const squish = e.talkFrame === 1 ? 1 : 0
  const face = e.faceRgb, dark = e.darkRgb, hat = e.hatRgb

  for (let gy = 0; gy < grid.length; gy += 2) {
    const sy = ey + (gy >> 1)
    if (sy < 0 || sy >= rows) continue
    const topRow = grid[gy]!
    const botRow = gy + 1 < grid.length ? grid[gy + 1]! : null
    const bufRow = buffer[sy]!

    for (let gx = squish; gx < topRow.length - squish; gx++) {
      const sx = ex + gx
      if (sx < 0 || sx >= cols) continue

      const top = pxRgb(topRow[gx]!, face, dark, hat)
      const bot = botRow ? pxRgb(botRow[gx]!, face, dark, hat) : null

      if (top || bot) {
        const bc = bufRow[sx]!
        if (top && bot) { bc.ch = "▀"; bc.fg = top; bc.bg = bot }
        else if (top) { bc.ch = "▀"; bc.fg = top; bc.bg = null }
        else { bc.ch = "▄"; bc.fg = bot; bc.bg = null }
      }
    }
  }
}

// Shared static colors for UI (avoid per-frame allocation)
const _borderFg: RGB = [80, 80, 80]
const _dimFg: RGB = [120, 120, 120]
const _activeFg: RGB = [255, 220, 80]

/** Draw border and HUD text onto buffer */
export function stampUI(
  buffer: Cell[][],
  cols: number,
  rows: number,
  hud: { text: string; active?: boolean; fg?: RGB }[],
) {
  const topRow = buffer[0]!
  const botRow = buffer[rows - 1]!
  for (let x = 0; x < cols; x++) {
    const tc = topRow[x]!; tc.ch = x === 0 ? "╭" : x === cols - 1 ? "╮" : "─"; tc.fg = _borderFg; tc.bg = null
    const bc = botRow[x]!; bc.ch = x === 0 ? "╰" : x === cols - 1 ? "╯" : "─"; bc.fg = _borderFg; bc.bg = null
  }
  for (let y = 1; y < rows - 1; y++) {
    const lc = buffer[y]![0]!; lc.ch = "│"; lc.fg = _borderFg; lc.bg = null
    const rc = buffer[y]![cols - 1]!; rc.ch = "│"; rc.fg = _borderFg; rc.bg = null
  }
  let cx = 2
  for (const seg of hud) {
    const fg = seg.fg ?? (seg.active ? _activeFg : _dimFg)
    for (let i = 0; i < seg.text.length; i++) {
      if (cx < cols - 1) {
        const c = botRow[cx]!; c.ch = seg.text[i]!; c.fg = fg; c.bg = null
        cx++
      }
    }
  }
}

/** Stamp text at a position in the buffer */
export function stampText(
  buffer: Cell[][],
  cols: number,
  rows: number,
  x: number,
  y: number,
  text: string,
  fg: RGB,
) {
  if (y < 0 || y >= rows) return
  const row = buffer[y]!
  for (let i = 0; i < text.length; i++) {
    const sx = x + i
    if (sx < 0 || sx >= cols) continue
    const c = row[sx]!; c.ch = text[i]!; c.fg = fg; c.bg = null
  }
}

export interface ChatMessage {
  name: string
  text: string
  time: number
  fg: RGB
}

const _chatDimFg: RGB = [160, 160, 160]

/** Render recent chat messages right-aligned inside the border */
export function stampChatMessages(
  buffer: Cell[][],
  cols: number,
  rows: number,
  messages: ChatMessage[],
) {
  const now = Date.now()
  const maxVisible = rows - 3
  const recent = messages.filter((m) => now - m.time < 30000).slice(-maxVisible)

  for (let i = 0; i < recent.length; i++) {
    const msg = recent[recent.length - 1 - i]!
    const row = rows - 2 - i
    if (row < 1 || row >= rows - 1) continue
    const bufRow = buffer[row]!

    const line = `<${msg.name}> ${msg.text}`
    const x = cols - 2 - line.length
    const nameEnd = msg.name.length + 2
    if (x < 1) {
      const maxLen = cols - 3
      const truncated = line.slice(0, maxLen)
      for (let ci = 0; ci < truncated.length; ci++) {
        const c = bufRow[1 + ci]!; c.ch = truncated[ci]!; c.fg = ci < nameEnd ? msg.fg : _chatDimFg; c.bg = null
      }
    } else {
      for (let ci = 0; ci < line.length; ci++) {
        const sx = x + ci
        if (sx < 1 || sx >= cols - 1) continue
        const c = bufRow[sx]!; c.ch = line[ci]!; c.fg = ci < nameEnd ? msg.fg : _chatDimFg; c.bg = null
      }
    }
  }
}

const _chatLabelFg: RGB = [255, 220, 80]
const _chatTextFg: RGB = [255, 255, 255]

/** Render chat input bar on the bottom row, replacing the HUD */
export function stampChatInput(
  buffer: Cell[][],
  cols: number,
  rows: number,
  text: string,
) {
  const y = rows - 1
  const row = buffer[y]!

  let c = row[0]!; c.ch = "╰"; c.fg = _borderFg; c.bg = null
  c = row[1]!; c.ch = "─"; c.fg = _borderFg; c.bg = null
  c = row[cols - 1]!; c.ch = "╯"; c.fg = _borderFg; c.bg = null

  const label = " [Chat] "
  let cx = 2
  for (let i = 0; i < label.length; i++) {
    if (cx >= cols - 1) break
    c = row[cx]!; c.ch = label[i]!; c.fg = _chatLabelFg; c.bg = null
    cx++
  }

  for (let i = 0; i < text.length; i++) {
    if (cx >= cols - 2) break
    c = row[cx]!; c.ch = text[i]!; c.fg = _chatTextFg; c.bg = null
    cx++
  }

  if (cx < cols - 2) {
    c = row[cx]!; c.ch = "█"; c.fg = _chatTextFg; c.bg = null
    cx++
  }

  if (cx < cols - 1) {
    c = row[cx]!; c.ch = " "; c.fg = _borderFg; c.bg = null
    cx++
  }
  while (cx < cols - 1) {
    c = row[cx]!; c.ch = "─"; c.fg = _borderFg; c.bg = null
    cx++
  }
}
