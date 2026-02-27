import type { Scene } from "./engine/scene.js"
import { runScene } from "./engine/scene.js"
import type { Cell, RGB, TileDef, Entity, RoomRegion } from "./engine/types.js"
import { DEFAULT_CONFIG } from "./engine/types.js"
import { DEFAULT_TILE_DEFS, stampTiles } from "./engine/tilemap-core.js"
import { stampEntity, stampUI, stampText, enterScreen, exitScreen } from "./engine/renderer.js"
import { makeEntity, updateAnimations } from "./engine/entity.js"
import {
  buildWalkGrid, createPathfinderState, createNpcAIState, stepNpc,
  type WalkGrid, type NpcAIState, type PathfinderState,
} from "./engine/npc-ai.js"
import { generateRandomDNA } from "./index.js"
import { composeText, applyPadding, applyShadow, lerpRgb } from "termfont"
import { readFileSync, readdirSync, existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

// --- Tile defs for title background ---

const flowerDefs: Record<string, Partial<TileDef>> = {
  f: { ch: "✿", fg: [255, 100, 120], walkable: true },
  c: { ch: "❀", fg: [180, 100, 255], walkable: true },
  r: { ch: "✻", fg: [255, 180, 60], walkable: true },
  v: { ch: "♠", fg: [100, 180, 80], walkable: true },
  o: { ch: "✶", fg: [100, 200, 255], walkable: true },
  w: { ch: "✿", fg: [255, 255, 180], walkable: true },
}

const skyDefs: Record<string, Partial<TileDef>> = {
  " ": { ch: " ", fg: null, bg: null, walkable: false },
  "1": { ch: "·", fg: [200, 200, 255], bg: null, walkable: false },
  "2": { ch: "✦", fg: [255, 255, 200], bg: null, walkable: false },
  "3": { ch: "*", fg: [160, 180, 255], bg: null, walkable: false },
}

const titleTileDefs: Record<string, TileDef> = { ...DEFAULT_TILE_DEFS }
for (const [key, partial] of Object.entries(flowerDefs)) {
  const base = titleTileDefs[key] ?? { ch: key, fg: null, bg: null, walkable: true }
  titleTileDefs[key] = { ...base, ...partial }
}
for (const [key, partial] of Object.entries(skyDefs)) {
  const base = titleTileDefs[key] ?? { ch: key, fg: null, bg: null, walkable: false }
  titleTileDefs[key] = { ...base, ...partial }
}

// --- Seeded random for deterministic flower placement ---

function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
    s = s ^ (s >>> 16)
    return (s >>> 0) / 0xffffffff
  }
}

function generateTitleTiles(cols: number, rows: number, horizon: number): string[][] {
  const rand = seededRandom(42)
  const flowers = ["f", "c", "r", "v", "o", "w"]
  const starChars = ["1", "2", "3"] // mapped to star tile defs
  const tiles: string[][] = []
  for (let y = 0; y < rows; y++) {
    tiles[y] = []
    for (let x = 0; x < cols; x++) {
      if (y < horizon) {
        // Sky zone
        if (rand() < 0.03) {
          tiles[y]![x] = starChars[Math.floor(rand() * starChars.length)]!
        } else {
          tiles[y]![x] = " "
        }
      } else {
        // Grass zone
        if (rand() < 0.05) {
          tiles[y]![x] = flowers[Math.floor(rand() * flowers.length)]!
        } else {
          tiles[y]![x] = ","
        }
      }
    }
  }
  return tiles
}

// --- Check if room has agents ---

export function roomHasAgents(room: string): boolean {
  const dir = join(homedir(), ".termlings", "rooms", room)

  // Check for agent command files (agent is trying to connect)
  try {
    if (existsSync(dir)) {
      const files = readdirSync(dir)
      if (files.some(f => f.endsWith(".cmd.json"))) return true
    }
  } catch {}

  // Check for persisted agents from previous session
  try {
    const data = readFileSync(join(dir, "agents.json"), "utf8")
    const agents = JSON.parse(data)
    // agents is now an object keyed by DNA, not an array
    return Object.keys(agents).length > 0
  } catch {
    return false
  }
}

// --- Title colors ---

const titleGreen: RGB = [40, 200, 80]
const titleCyan: RGB = [40, 200, 220]
const shadowColor: RGB = [20, 40, 20]
const dimGray: RGB = [120, 120, 120]
const veryDimGray: RGB = [80, 80, 80]
const readyGreen: RGB = [80, 200, 80]

// --- Build a simple all-walkable grid for the title screen ---

function buildTitleWalkGrid(w: number, h: number): WalkGrid {
  // All tiles walkable — just fill with 1s
  const data = new Uint8Array(w * h)
  // Entity footprint is 9 wide (x+1..x+7), so mark walkable where x+7 < w
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 8; x++) {
      data[y * w + x] = 1
    }
  }
  return { data, width: w, height: h }
}

function createTitleScene(room: string, onReady: () => void): Scene {
  let tiles: string[][] = []
  let _lastHasAgents = false

  // Large wandering entities
  let bigEntities: Entity[] = []
  let bigAI: NpcAIState[] = []
  let walkGrid: WalkGrid | null = null
  let titleRoom: RoomRegion = { name: "title", x: 0, y: 0, w: 80, h: 24 }
  const pf = createPathfinderState()

  // Pre-compose title text
  const rawGrid = composeText("TERMLINGS", { font: "block" })
  const padded = applyPadding(rawGrid, 1)
  const { grid: titleGrid, shadowMask } = applyShadow(padded, 1, 1)
  const titleH = titleGrid.length
  const titleW = titleGrid[0]?.length ?? 0

  // Subtitle text (plain terminal text)
  const subtitle = "Terminal based SIM engine for AI code agents"

  function initBigEntities(cols: number, rows: number) {
    // Walk grid uses tile coordinates (1 tile = 1 col for title screen)
    walkGrid = buildTitleWalkGrid(cols, rows)
    // Constrain NPCs to bottom third of screen
    const bottomY = Math.floor(rows * 0.6)
    titleRoom = { name: "title", x: 0, y: bottomY, w: cols, h: rows - bottomY }

    bigEntities = []
    bigAI = []
    const count = Math.min(4, Math.max(2, Math.floor(cols / 30)))
    for (let i = 0; i < count; i++) {
      // Place in the bottom zone
      const x = Math.floor((cols / (count + 1)) * (i + 1)) - 4
      const y = rows - 14 - Math.floor(Math.random() * 4)
      const e = makeEntity(generateRandomDNA(), x, y, 2, {
        walking: false,
        idle: true,
      })
      e.name = ["Wren", "Dusk", "Haze", "Coral"][i % 4]
      bigEntities.push(e)
      const ai = createNpcAIState()
      ai.idleRemaining = 10 + Math.floor(Math.random() * 30)
      bigAI.push(ai)
    }
  }

  return {
    init(cols, rows) {
      tiles = generateTitleTiles(cols, rows, Math.floor(rows * 0.6))

      // Create large wandering entities
      initBigEntities(cols, rows)
    },

    update(tick, cols, rows, buffer) {
      // Background: animated grass with wind
      stampTiles(
        buffer, cols, rows, tiles, titleTileDefs,
        cols, rows, 0, 0, 1, undefined, tick, 0.8,
      )

      // Step big entities with A* AI (every 3rd tick for moderate speed)
      if (walkGrid && tick % 3 === 0) {
        for (let i = 0; i < bigEntities.length; i++) {
          const canMove = (x: number, y: number, h: number) => {
            const footY = y + h - 1
            if (x < 0 || footY < 0 || x + 8 >= cols || footY >= rows) return false
            return walkGrid!.data[footY * walkGrid!.width + x] === 1
          }
          stepNpc(bigEntities[i]!, bigAI[i]!, walkGrid, [titleRoom], pf, canMove)
        }
      }

      // Animate entities
      updateAnimations(bigEntities, tick, DEFAULT_CONFIG)

      // Stamp large wandering entities (z-sorted by foot Y)
      const sorted = bigEntities.slice().sort((a, b) => (a.y + a.height) - (b.y + b.height))
      for (const e of sorted) {
        stampEntity(buffer, cols, rows, e, 0, 0, 1)
      }

      // --- Big title using half-block rendering ---
      const titleX = Math.floor((cols - titleW) / 2)
      const titleRows = Math.ceil(titleH / 2)
      const contentH = titleRows + 14
      const titleY = Math.max(1, Math.floor((rows - contentH) / 2))

      for (let py = 0; py < titleH; py += 2) {
        const screenRow = titleY + (py >> 1)
        if (screenRow < 0 || screenRow >= rows) continue
        const bufRow = buffer[screenRow]!

        for (let px = 0; px < titleW; px++) {
          const topPixel = titleGrid[py]?.[px] ?? false
          const botPixel = titleGrid[py + 1]?.[px] ?? false
          const topShadow = shadowMask[py]?.[px] ?? false
          const botShadow = shadowMask[py + 1]?.[px] ?? false

          // Compute colors with gradient
          const t = titleW > 1 ? px / (titleW - 1) : 0
          const gradColor = lerpRgb(titleGreen, titleCyan, t) as RGB

          let fg: RGB | null = null
          let bg: RGB | null = null
          let ch = ""

          if (topPixel && botPixel) {
            fg = gradColor; bg = gradColor; ch = "█"
          } else if (topPixel && botShadow) {
            fg = gradColor; bg = shadowColor; ch = "▀"
          } else if (topShadow && botPixel) {
            fg = shadowColor; bg = gradColor; ch = "▀"
          } else if (topPixel) {
            fg = gradColor; ch = "▀"
          } else if (botPixel) {
            fg = gradColor; ch = "▄"
          } else if (topShadow && botShadow) {
            fg = shadowColor; bg = shadowColor; ch = "█"
          } else if (topShadow) {
            fg = shadowColor; ch = "▀"
          } else if (botShadow) {
            fg = shadowColor; ch = "▄"
          } else {
            continue
          }

          const sx = titleX + px
          if (sx < 0 || sx >= cols) continue
          const cell = bufRow[sx]!
          cell.ch = ch
          cell.fg = fg
          if (bg) cell.bg = bg
        }
      }

      // --- Subtitle (plain text) ---
      const subY = titleY + titleRows + 1
      const subX = Math.floor((cols - subtitle.length) / 2)
      const subColor: RGB = [140, 140, 160]
      if (subY > 0 && subY < rows) stampText(buffer, cols, rows, subX, subY, subtitle, subColor)

      // --- Status text ---
      const hintY = subY + 2
      // Poll for agents every ~60 frames (~1 second)
      const hasAgents = tick % 60 === 0 ? roomHasAgents(room) : _lastHasAgents
      _lastHasAgents = hasAgents

      if (hasAgents) {
        // Auto-launch when agent joins
        onReady()
        return
      }

      const waitText = "Waiting for agent..."
      const waitX = Math.floor((cols - waitText.length) / 2)
      if (hintY > 0 && hintY < rows) stampText(buffer, cols, rows, waitX, hintY, waitText, dimGray)

      const cmdY = hintY + 1
      const cmd = room === "default"
        ? "termlings claude --dangerously-skip-permissions"
        : `termlings claude --dangerously-skip-permissions --room ${room}`
      const cmdX = Math.floor((cols - cmd.length) / 2)
      if (cmdY > 0 && cmdY < rows) stampText(buffer, cols, rows, cmdX, cmdY, cmd, veryDimGray)

      // --- Border ---
      stampUI(buffer, cols, rows, [])
    },

    resize(cols, rows) {
      tiles = generateTitleTiles(cols, rows, Math.floor(rows * 0.6))
      // Rebuild walk grid and reposition big entities
      initBigEntities(cols, rows)
    },

    input() {
      return {
        onArrow(_dir: string) {},
        onKey(ch: string) {
          if (ch === "q" || ch === "Q" || ch === "\x03") {
            process.stdout.write(exitScreen())
            process.exit(0)
          }
        },
      }
    },

    cleanup() {
      // Nothing to persist
    },
  }
}

export async function showTitleScreen(room: string): Promise<void> {
  const stdout = process.stdout
  const rows = stdout.rows || 24
  stdout.write(enterScreen(rows))

  return new Promise<void>((resolve) => {
    let handle: { stop: () => void } | null = null
    const scene = createTitleScene(room, () => {
      if (handle) handle.stop()
      resolve()
    })
    handle = runScene(scene)
  })
}
