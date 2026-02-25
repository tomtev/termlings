import {
  generateGrid,
  generateGridSmall,
  decodeDNA,
  encodeDNA,
  generateRandomDNA,
  traitsFromName,
  getTraitColors,
  LEGS,
  HATS,
  type Pixel,
  type DecodedDNA,
} from "./index.js"

// --- CLI args ---
// Usage: termlings --play [dna] [room]
// Extracts positional args (non-flag) after --play

const rawArgs = process.argv.slice(2)
const positional: string[] = []
for (const a of rawArgs) {
  if (!a.startsWith("-")) positional.push(a)
}
const argDna = positional[0] || null    // player DNA string (7-hex) or name
const argRoom = positional[1] || null   // room seed for deterministic NPC placement
let smallMode = rawArgs.includes("--small")

// --- Terminal setup ---

const stdout = process.stdout
let cols = stdout.columns || 80
let rows = stdout.rows || 24

// Alternate screen + hide cursor
stdout.write("\x1b[?1049h\x1b[?25l")

function cleanup() {
  stdout.write("\x1b[?25h\x1b[?1049l")
  process.exit(0)
}
process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)

// Raw stdin for keypresses
const stdin = process.stdin
stdin.setRawMode!(true)
stdin.resume()
stdin.setEncoding("utf8")

// --- Types ---

type RGB = [number, number, number]

interface Cell {
  ch: string
  fg: RGB | null
  bg: RGB | null
}

interface Entity {
  dna: string
  x: number
  y: number
  walkFrame: number
  talkFrame: number
  waveFrame: number
  flipped: boolean
  traits: DecodedDNA
  faceRgb: RGB
  darkRgb: RGB
  hatRgb: RGB
  legFrames: number
  height: number
  // animation config
  walking: boolean
  talking: boolean
  waving: boolean
  idle: boolean
  // NPC wander AI
  targetX?: number
  targetY?: number
  idleTicks?: number
}

// --- Helpers ---

function spriteHeight(dna: string): number {
  return HATS[decodeDNA(dna).hat].length + 7
}

function makeEntity(
  dna: string,
  x: number,
  y: number,
  opts: { walking?: boolean; talking?: boolean; waving?: boolean; idle?: boolean; flipped?: boolean } = {},
): Entity {
  const traits = decodeDNA(dna)
  const { faceRgb, darkRgb, hatRgb } = getTraitColors(traits)
  const fullHeight = HATS[traits.hat].length + 7
  return {
    dna,
    x,
    y,
    walkFrame: 0,
    talkFrame: 0,
    waveFrame: opts.waving ? 1 : 0,
    flipped: opts.flipped ?? false,
    traits,
    faceRgb,
    darkRgb,
    hatRgb,
    legFrames: LEGS[traits.legs].length,
    height: smallMode ? Math.ceil(fullHeight / 2) : fullHeight,
    walking: opts.walking ?? false,
    talking: opts.talking ?? false,
    waving: opts.waving ?? false,
    idle: opts.idle ?? false,
  }
}

/** Get the 2-char string and colors for a pixel type */
function pixelCell(
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
    default: return null
  }
  return { chars, fg, bg }
}

/** Resolve a pixel type to its primary color */
function pixelRgb(p: Pixel, face: RGB, dark: RGB, hat: RGB): RGB | null {
  switch (p) {
    case "f": case "l": case "a": return face
    case "e": case "d": case "s": case "n": case "m": case "q": case "r": return dark
    case "h": case "k": return hat
    default: return null
  }
}

// --- Screen buffer ---

let buffer: Cell[][] = []

function allocBuffer() {
  buffer = []
  for (let y = 0; y < rows; y++) {
    buffer[y] = []
    for (let x = 0; x < cols; x++) {
      buffer[y][x] = { ch: " ", fg: null, bg: null }
    }
  }
}
allocBuffer()

function clearBuffer() {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = buffer[y][x]
      c.ch = " "
      c.fg = null
      c.bg = null
    }
  }
}

// Handle terminal resize
stdout.on("resize", () => {
  cols = stdout.columns || 80
  rows = stdout.rows || 24
  allocBuffer()
  stdout.write("\x1b[2J")
  player.x = Math.min(player.x, cols - (smallMode ? 10 : 20))
  player.y = Math.min(player.y, rows - player.height - 2)
})

/** Stamp a sprite into the screen buffer */
function stampEntity(e: Entity) {
  const grid = generateGrid(e.traits, e.walkFrame, e.talkFrame, e.waveFrame)
  const rendered = e.flipped ? grid.map((row) => [...row].reverse()) : grid

  for (let gy = 0; gy < rendered.length; gy++) {
    const row = rendered[gy]
    for (let gx = 0; gx < row.length; gx++) {
      const pixel = row[gx]
      if (pixel === "_") continue

      const result = pixelCell(pixel, e.faceRgb, e.darkRgb, e.hatRgb, e.flipped)
      if (!result) continue

      const sx = e.x + gx * 2
      const sy = e.y + gy
      if (sy < 0 || sy >= rows) continue

      for (let ci = 0; ci < 2; ci++) {
        const bx = sx + ci
        if (bx < 0 || bx >= cols) continue
        buffer[sy][bx] = {
          ch: result.chars[ci],
          fg: result.fg,
          bg: result.bg,
        }
      }
    }
  }

  // Shadow row beneath feet
  const shadowY = e.y + rendered.length
  if (shadowY >= 0 && shadowY < rows) {
    let minC = 9, maxC = 0
    for (const row of rendered) {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== "_") {
          if (c < minC) minC = c
          if (c > maxC) maxC = c
        }
      }
    }
    const shadowFg: RGB = [50, 50, 50]
    for (let gx = minC; gx <= maxC; gx++) {
      const sx = e.x + gx * 2
      for (let ci = 0; ci < 2; ci++) {
        const bx = sx + ci
        if (bx >= 0 && bx < cols) {
          buffer[shadowY][bx] = { ch: "░", fg: shadowFg, bg: null }
        }
      }
    }
  }
}

/** Stamp a sprite in small mode (half-block, 1 char per column) */
function stampEntitySmall(e: Entity) {
  // Use compact grid (1-row mouth) — talking shown via horizontal squish
  const grid = generateGridSmall(e.traits, e.walkFrame, 0, e.waveFrame)
  const rendered = e.flipped ? grid.map((row) => [...row].reverse()) : grid

  // When talking, squish by skipping outermost filled columns
  const squish = e.talkFrame === 1 ? 1 : 0

  for (let gy = 0; gy < rendered.length; gy += 2) {
    const topRow = rendered[gy]
    const botRow = gy + 1 < rendered.length ? rendered[gy + 1] : null
    const sy = e.y + Math.floor(gy / 2)
    if (sy < 0 || sy >= rows) continue

    for (let gx = squish; gx < topRow.length - squish; gx++) {
      const sx = e.x + gx
      if (sx < 0 || sx >= cols) continue

      const top = pixelRgb(topRow[gx], e.faceRgb, e.darkRgb, e.hatRgb)
      const bot = botRow ? pixelRgb(botRow[gx], e.faceRgb, e.darkRgb, e.hatRgb) : null

      if (top && bot) {
        buffer[sy][sx] = { ch: "▀", fg: top, bg: bot }
      } else if (top) {
        buffer[sy][sx] = { ch: "▀", fg: top, bg: null }
      } else if (bot) {
        buffer[sy][sx] = { ch: "▄", fg: bot, bg: null }
      }
    }
  }

  // Shadow row
  const shadowY = e.y + Math.ceil(rendered.length / 2)
  if (shadowY >= 0 && shadowY < rows) {
    let minC = 9, maxC = 0
    for (const row of rendered) {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== "_") {
          if (c < minC) minC = c
          if (c > maxC) maxC = c
        }
      }
    }
    const shadowFg: RGB = [50, 50, 50]
    for (let gx = minC; gx <= maxC; gx++) {
      const sx = e.x + gx
      if (sx >= 0 && sx < cols) {
        buffer[shadowY][sx] = { ch: "░", fg: shadowFg, bg: null }
      }
    }
  }
}

/** Render buffer to terminal as one big write */
function renderBuffer() {
  let out = "\x1b[H" // cursor home
  let lastFg: string | null = null
  let lastBg: string | null = null

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = buffer[y][x]
      const fgStr = cell.fg ? `\x1b[38;2;${cell.fg[0]};${cell.fg[1]};${cell.fg[2]}m` : null
      const bgStr = cell.bg ? `\x1b[48;2;${cell.bg[0]};${cell.bg[1]};${cell.bg[2]}m` : null

      if (cell.fg || cell.bg) {
        if (fgStr !== lastFg || bgStr !== lastBg) {
          out += "\x1b[0m"
          if (fgStr) out += fgStr
          if (bgStr) out += bgStr
          lastFg = fgStr
          lastBg = bgStr
        }
      } else if (lastFg || lastBg) {
        out += "\x1b[0m"
        lastFg = null
        lastBg = null
      }
      out += cell.ch
    }
  }
  if (lastFg || lastBg) out += "\x1b[0m"
  stdout.write(out)
}

/** Draw border and HUD text onto buffer */
function stampUI(hud: { text: string; active?: boolean; fg?: RGB }[]) {
  const borderFg: RGB = [80, 80, 80]
  for (let x = 0; x < cols; x++) {
    buffer[0][x] = { ch: x === 0 ? "╭" : x === cols - 1 ? "╮" : "─", fg: borderFg, bg: null }
    buffer[rows - 1][x] = { ch: x === 0 ? "╰" : x === cols - 1 ? "╯" : "─", fg: borderFg, bg: null }
  }
  for (let y = 1; y < rows - 1; y++) {
    buffer[y][0] = { ch: "│", fg: borderFg, bg: null }
    buffer[y][cols - 1] = { ch: "│", fg: borderFg, bg: null }
  }
  const dimFg: RGB = [120, 120, 120]
  const activeFg: RGB = [255, 220, 80]
  let cx = 2
  for (const seg of hud) {
    const fg = seg.fg ?? (seg.active ? activeFg : dimFg)
    for (const ch of seg.text) {
      if (cx < cols - 1) {
        buffer[rows - 1][cx] = { ch, fg, bg: null }
        cx++
      }
    }
  }
}

// --- Game state ---

// Simple seeded PRNG for deterministic rooms
function seededRandom(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = seed.charCodeAt(i) + ((h << 5) - h)
  }
  h = Math.abs(h)
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b)
    h = (h ^ (h >>> 16)) >>> 0
    return h / 0x100000000
  }
}

// Resolve player DNA from arg (hex DNA, name, or random)
function resolvePlayerDna(): string {
  if (!argDna) return generateRandomDNA()
  if (/^[0-9a-f]{6,7}$/i.test(argDna)) return argDna.toLowerCase()
  return encodeDNA(traitsFromName(argDna))
}

// Generate NPC DNAs with unique face hues (excluding player's hue)
function generateNpcDNAs(count: number, playerHue: number, rng: () => number): string[] {
  const hues = Array.from({ length: 12 }, (_, i) => i).filter((h) => h !== playerHue)
  for (let i = hues.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [hues[i], hues[j]] = [hues[j], hues[i]]
  }
  return Array.from({ length: count }, (_, i) => {
    const traits: DecodedDNA = {
      eyes: Math.floor(rng() * 11),
      mouth: Math.floor(rng() * 7),
      hat: Math.floor(rng() * HATS.length),
      body: Math.floor(rng() * 6),
      legs: Math.floor(rng() * 6),
      faceHue: hues[i % hues.length],
      hatHue: Math.floor(rng() * 12),
    }
    return encodeDNA(traits)
  })
}

const playerDna = resolvePlayerDna()
const playerTraits = decodeDNA(playerDna)
const rng = seededRandom(argRoom ?? "default")
const npcDNAs = generateNpcDNAs(5, playerTraits.faceHue, rng)

const player = makeEntity(playerDna, Math.floor(cols / 2) - (smallMode ? 5 : 9), Math.floor(rows / 2) - (smallMode ? 3 : 5))

const npcs: Entity[] = Array.from({ length: 5 }, (_, i) => {
  const spawnMargin = smallMode ? 14 : 30
  const x = 4 + Math.floor(rng() * (cols - spawnMargin))
  const y = 2 + Math.floor(rng() * (rows - (smallMode ? 8 : 16)))
  const e = makeEntity(npcDNAs[i], x, y, { idle: true })
  e.idleTicks = Math.floor(30 + Math.random() * 90)
  return e
})

let isMoving = false
let moveStopTimer: ReturnType<typeof setTimeout> | null = null

// --- Input ---

stdin.on("data", (key: string) => {
  if (key === "q" || key === "\x03") cleanup() // q or Ctrl+C

  const step = smallMode ? 1 : 2
  const spriteW = smallMode ? 10 : 20
  if (key === "\x1b[A") { // up
    player.y = Math.max(1, player.y - 1)
    startMoving()
  } else if (key === "\x1b[B") { // down
    player.y = Math.min(rows - player.height - 2, player.y + 1)
    startMoving()
  } else if (key === "\x1b[D") { // left
    player.x = Math.max(2, player.x - step)
    player.flipped = true
    startMoving()
  } else if (key === "\x1b[C") { // right
    player.x = Math.min(cols - spriteW, player.x + step)
    player.flipped = false
    startMoving()
  } else if (key === "t") {
    player.talking = !player.talking
    if (!player.talking) player.talkFrame = 0
  } else if (key === "w") {
    player.waving = !player.waving
    if (!player.waving) player.waveFrame = 0
    else player.waveFrame = 1
  } else if (key === "z") {
    smallMode = !smallMode
    // Scale positions proportionally (small is half size)
    const scale = smallMode ? 0.5 : 2
    for (const e of [player, ...npcs]) {
      e.x = Math.round(e.x * scale)
      e.y = Math.round(e.y * scale)
      const fullH = HATS[e.traits.hat].length + 7
      e.height = smallMode ? Math.ceil(fullH / 2) : fullH
    }
    stdout.write("\x1b[2J")
  }
})

function startMoving() {
  isMoving = true
  player.walking = true
  if (moveStopTimer) clearTimeout(moveStopTimer)
  moveStopTimer = setTimeout(() => {
    isMoving = false
    player.walking = false
    player.walkFrame = 0
  }, 400)
}

// --- Animation ticks ---

let tick = 0

function updateAnimations() {
  tick++

  // Walk animation (every ~400ms at 30fps = every 12 ticks)
  if (tick % 12 === 0) {
    for (const e of [...npcs, player]) {
      if (e.walking) {
        e.walkFrame = (e.walkFrame + 1) % e.legFrames
      }
    }
  }

  // Talk animation (every ~200ms = every 6 ticks)
  if (tick % 6 === 0) {
    for (const e of [...npcs, player]) {
      if (e.talking) {
        e.talkFrame = (e.talkFrame + 1) % 2
      }
    }
  }

  // Wave animation (every ~600ms = every 18 ticks)
  if (tick % 18 === 0) {
    for (const e of [...npcs, player]) {
      if (e.waving) {
        e.waveFrame = e.waveFrame === 1 ? 2 : 1
      }
    }
  }

  // Idle: slow weight shift (every ~2.5s = every 75 ticks)
  if (tick % 75 === 0) {
    for (const e of [...npcs, player]) {
      if (e.idle || (!e.walking && !e.talking && !e.waving)) {
        e.walkFrame = (e.walkFrame + 1) % e.legFrames
      }
    }
  }

  // Idle blink (random per entity)
  for (const e of [...npcs, player]) {
    if (!e.talking && (e.idle || (!e.walking && !e.waving))) {
      if (Math.random() < 0.03) {
        e.talkFrame = 1
      } else if (e.talkFrame === 1 && Math.random() < 0.3) {
        e.talkFrame = 0
      }
    }
  }

  // NPC wander AI
  for (const npc of npcs) {
    if (npc.idleTicks != null && npc.idleTicks > 0) {
      npc.idleTicks--
      npc.walking = false
      npc.idle = true
      continue
    }

    if (npc.targetX == null || npc.targetY == null) {
      const wanderMargin = smallMode ? 14 : 30
      npc.targetX = 4 + Math.floor(Math.random() * (cols - wanderMargin))
      npc.targetY = 2 + Math.floor(Math.random() * (rows - (smallMode ? 8 : 16)))
      npc.walking = true
      npc.idle = false
      npc.talking = Math.random() < 0.2
      npc.waving = Math.random() < 0.15
      if (npc.waving) npc.waveFrame = 1
    }

    if (tick % 3 === 0) {
      const dx = npc.targetX - npc.x
      const dy = npc.targetY - npc.y

      if (Math.abs(dx) <= 2 && Math.abs(dy) <= 1) {
        npc.targetX = undefined
        npc.targetY = undefined
        npc.walking = false
        npc.talking = false
        npc.waving = false
        npc.waveFrame = 0
        npc.talkFrame = 0
        npc.idle = true
        npc.idleTicks = Math.floor(60 + Math.random() * 150)
      } else {
        const npcStep = smallMode ? 1 : 2
        if (Math.abs(dx) > npcStep) {
          npc.x += dx > 0 ? npcStep : -npcStep
          npc.flipped = dx < 0
        }
        if (Math.abs(dy) > 1) {
          npc.y += dy > 0 ? 1 : -1
        }
      }
    }
  }
}

// --- Render loop ---

const roomLabel = argRoom ?? "default"

function buildHud(): { text: string; active?: boolean; fg?: RGB }[] {
  return [
    { text: " ██ ", fg: player.faceRgb },
    { text: `${playerDna} ` },
    { text: `| room: ${roomLabel} ` },
    { text: "| Arrows: move " },
    { text: "| " },
    { text: "[T]alk", active: player.talking },
    { text: " | " },
    { text: "[W]ave", active: player.waving },
    { text: " | " },
    { text: "[Z]oom", active: smallMode },
    { text: " | Q: quit " },
  ]
}

function frame() {
  updateAnimations()
  clearBuffer()

  const all = [...npcs, player].sort((a, b) => (a.y + a.height) - (b.y + b.height))

  for (const entity of all) {
    if (smallMode) stampEntitySmall(entity)
    else stampEntity(entity)
  }

  stampUI(buildHud())
  renderBuffer()
}

// ~30 fps
setInterval(frame, 33)
