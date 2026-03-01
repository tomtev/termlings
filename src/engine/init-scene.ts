import type { Scene, Cell, TileDef, RGB, Entity, RoomRegion } from "./types.js"
import { DEFAULT_TILE_DEFS, stampTiles } from "./tilemap-core.js"
import { DEFAULT_CONFIG } from "./types.js"
import { renderTerminalSmall, generateRandomDNA } from "../index.js"
import { makeEntity, updateAnimations } from "./entity.js"
import { buildWalkGrid, createNpcAIState, stepNpc, createPathfinderState, type NpcAIState, type WalkGrid } from "./npc-ai.js"
import { stampEntity } from "./renderer.js"

export interface InitSceneOptions {
  onConfirm: (confirmed: boolean) => void
}

// Seeded random for consistent background
function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
    s = s ^ (s >>> 16)
    return (s >>> 0) / 0xffffffff
  }
}

// Generate decorative background tiles (grass + sky)
function generateInitTiles(cols: number, rows: number): string[][] {
  const rand = seededRandom(42)
  const flowers = ["f", "c", "r", "v", "o", "w"]
  const stars = ["1", "2", "3"]
  const horizon = Math.floor(rows * 0.5)

  const tiles: string[][] = []
  for (let y = 0; y < rows; y++) {
    tiles[y] = []
    for (let x = 0; x < cols; x++) {
      if (y < horizon) {
        // Sky with stars
        if (rand() < 0.03) {
          tiles[y]![x] = stars[Math.floor(rand() * stars.length)]!
        } else {
          tiles[y]![x] = " "
        }
      } else {
        // Grass with flowers
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

// Tile definitions (matching title screen)
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

const initTileDefs: Record<string, TileDef> = { ...DEFAULT_TILE_DEFS }
for (const [key, partial] of Object.entries(flowerDefs)) {
  const base = initTileDefs[key] ?? { ch: key, fg: null, bg: null, walkable: true }
  initTileDefs[key] = { ...base, ...partial }
}
for (const [key, partial] of Object.entries(skyDefs)) {
  const base = initTileDefs[key] ?? { ch: key, fg: null, bg: null, walkable: false }
  initTileDefs[key] = { ...base, ...partial }
}

export class InitScene implements Scene {
  private cols = 80
  private rows = 24
  private dnas: string[]
  private frames = [0, 1, 2, 3]
  private currentFrame = 0
  private tick = 0
  private confirmed: boolean | null = null
  private tiles: string[][] = []

  private titleLines = [
    { text: "termlings", fg: [54, 184, 207] as RGB },
    { text: "Build autonomous AI agents & teams", fg: [215, 192, 64] as RGB },
  ]
  private promptText = "Create .termlings and initialize first agent? (y/n) "
  private avatarLines: string[] = []
  private avatarStartRow = 0

  // Walking entities
  private entities: Entity[] = []
  private entityAI: NpcAIState[] = []
  private walkGrid: WalkGrid | null = null
  private room: RoomRegion = { name: "init", x: 0, y: 0, w: 80, h: 24 }
  private pf = createPathfinderState()

  constructor(private options: InitSceneOptions) {
    this.dnas = Array(5)
      .fill(0)
      .map(() => generateRandomDNA())
  }

  init(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows
    this.tiles = generateInitTiles(cols, rows)
    this.avatarLines = this.renderFrame(0)
    this.calculateLayout()
    this.initEntities()
  }

  private initEntities(): void {
    // Create walking entities in the grass area
    this.walkGrid = buildWalkGrid(this.cols, this.rows, [])
    const grassStart = Math.floor(this.rows * 0.5)
    this.room = { name: "init", x: 0, y: grassStart, w: this.cols, h: this.rows - grassStart }

    // Create 2-3 walking avatars
    const count = Math.min(3, Math.max(2, Math.floor(this.cols / 30)))
    for (let i = 0; i < count; i++) {
      const x = Math.floor((this.cols / (count + 1)) * (i + 1)) - 4
      const y = this.rows - 8 - Math.floor(Math.random() * 3)
      const dna = generateRandomDNA()
      const entity = makeEntity(dna, x, y, 2, { walking: false, idle: true })
      this.entities.push(entity)

      const ai = createNpcAIState()
      ai.idleRemaining = 10 + Math.floor(Math.random() * 20)
      this.entityAI.push(ai)
    }
  }

  private getVisibleWidth(str: string): number {
    return str.replace(/\x1b\[[0-9;]*m/g, "").length
  }

  private renderFrame(frame: number): string[] {
    const avatars = this.dnas.map((dna) => renderTerminalSmall(dna, frame))
    const allLines = avatars.map((a) => a.split("\n").filter((l) => l.trim()))
    const maxWidths = allLines.map(
      (lines) => Math.max(...lines.map((l) => this.getVisibleWidth(l)), 0)
    )
    const maxLines = Math.max(...allLines.map((l) => l.length))
    const topPadding = allLines.map((lines) => maxLines - lines.length)

    const result: string[] = []
    for (let i = 0; i < maxLines; i++) {
      let row = ""
      for (let j = 0; j < allLines.length; j++) {
        let line = ""
        if (i >= topPadding[j]!) {
          line = allLines[j]![i - topPadding[j]!] || ""
        }
        const width = maxWidths[j]!
        row += line + " ".repeat(Math.max(2, width - this.getVisibleWidth(line) + 2))
      }
      result.push(row)
    }
    return result
  }

  private calculateLayout(): void {
    const titleHeight = this.titleLines.length + 1
    const avatarHeight = this.avatarLines.length
    const totalHeight = titleHeight + avatarHeight + 3
    this.avatarStartRow = Math.max(0, Math.floor((this.rows - totalHeight) / 2))
  }

  update(_tick: number, _cols: number, _rows: number, buffer: Cell[][]): void {
    // Render background tiles
    stampTiles(buffer, this.cols, this.rows, this.tiles, initTileDefs, this.cols, this.rows, 0, 0, 1)

    // Step walking entities (every 3rd tick for moderate speed)
    if (this.walkGrid && this.tick % 3 === 0) {
      for (let i = 0; i < this.entities.length; i++) {
        const canMove = (x: number, y: number, h: number) => {
          const footY = y + h - 1
          if (x < 0 || footY < 0 || x + 8 >= this.cols || footY >= this.rows) return false
          return this.walkGrid!.data[footY * this.walkGrid!.width + x] === 1
        }
        stepNpc(this.entities[i]!, this.entityAI[i]!, this.walkGrid, [this.room], this.pf, canMove)
      }
    }

    // Update animations for walking entities
    updateAnimations(this.entities, this.tick, DEFAULT_CONFIG)

    // Render walking entities (z-sorted by foot Y)
    const sorted = this.entities.slice().sort((a, b) => (a.y + a.height) - (b.y + b.height))
    for (const e of sorted) {
      stampEntity(buffer, this.cols, this.rows, e, 0, 0, 1)
    }

    // Update animation frame every 5 ticks
    if (this.tick % 5 === 0) {
      this.currentFrame = (this.currentFrame + 1) % 4
      this.avatarLines = this.renderFrame(this.frames[this.currentFrame]!)
    }
    this.tick++

    // Render title, avatars, and prompt
    this.renderContent(buffer)
  }

  private renderContent(buffer: Cell[][]): void {
    let row = this.avatarStartRow

    // Title
    for (const titleLine of this.titleLines) {
      const visibleTitle = titleLine.text
      const padding = Math.max(0, Math.floor((this.cols - visibleTitle.length) / 2))
      this.stampTextLine(buffer, row, padding, titleLine.text, titleLine.fg)
      row++
    }

    // Spacing
    row++

    // Avatars
    for (const avatarLine of this.avatarLines) {
      const visibleWidth = this.getVisibleWidth(avatarLine)
      const padding = Math.max(0, Math.floor((this.cols - visibleWidth) / 2))
      this.stampTextLineWithANSI(buffer, row, padding, avatarLine)
      row++
    }

    // Spacing
    row++

    // Prompt
    const displayText = this.promptText + (this.confirmed === null ? "_" : "")
    const visiblePrompt = displayText.replace(/\x1b\[[0-9;]*m/g, "")
    const promptPadding = Math.max(0, Math.floor((this.cols - visiblePrompt.length) / 2))
    this.stampTextLine(buffer, row, promptPadding, displayText, [200, 200, 200])
  }

  private stampTextLine(buffer: Cell[][], row: number, col: number, text: string, fg: RGB): void {
    if (row < 0 || row >= buffer.length) return
    const bufferRow = buffer[row]!
    for (let i = 0; i < text.length && col + i < this.cols; i++) {
      bufferRow[col + i] = { ch: text[i]!, fg, bg: null }
    }
  }

  private stampTextLineWithANSI(buffer: Cell[][], row: number, col: number, text: string): void {
    if (row < 0 || row >= buffer.length) return

    let currentCol = col
    let i = 0
    let currentFg: RGB | null = null

    while (i < text.length && currentCol < this.cols) {
      if (text[i] === "\x1b" && text[i + 1] === "[") {
        i += 2
        let codeStr = ""
        while (i < text.length && text[i] !== "m") {
          codeStr += text[i]
          i++
        }
        i++

        if (codeStr.startsWith("38;2;")) {
          const parts = codeStr.split(";")
          if (parts.length >= 5) {
            const r = parseInt(parts[2] || "0")
            const g = parseInt(parts[3] || "0")
            const b = parseInt(parts[4] || "0")
            currentFg = [r, g, b]
          }
        } else if (codeStr === "0") {
          currentFg = null
        }
        continue
      }

      if (currentCol < buffer[row]!.length) {
        buffer[row]![currentCol] = {
          ch: text[i]!,
          fg: currentFg,
          bg: null,
        }
      }
      currentCol++
      i++
    }
  }

  resize(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows
    this.tiles = generateInitTiles(cols, rows)
    this.calculateLayout()
    this.initEntities()
  }

  input(): { onArrow: (dir: string) => void; onKey: (char: string) => void } {
    return {
      onArrow: () => {},
      onKey: (char: string) => {
        if (this.confirmed !== null) return

        if (char === "y" || char === "Y") {
          this.confirmed = true
          this.options.onConfirm(true)
        } else if (char === "n" || char === "N") {
          this.confirmed = false
          this.options.onConfirm(false)
        } else if (char === "\u0003") {
          this.confirmed = false
          this.options.onConfirm(false)
        }
      },
    }
  }

  cleanup(): void {}
}
