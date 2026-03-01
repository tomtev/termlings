import type { Scene, Cell } from "./types.js"
import { renderTerminalSmall, generateRandomDNA } from "../index.js"

export interface InitSceneOptions {
  onConfirm: (confirmed: boolean) => void
}

export class InitScene implements Scene {
  private cols = 80
  private rows = 24
  private dnas: string[]
  private frames = [0, 1, 2, 3]
  private currentFrame = 0
  private tick = 0
  private userInput = ""
  private confirmed: boolean | null = null

  private titleLines = [
    "\x1b[36mtermlings\x1b[0m",
    "\x1b[33mBuild autonomous AI agents & teams\x1b[0m",
  ]
  private promptText = "Create .termlings and initialize first agent? (y/n) "
  private avatarLines: string[] = []
  private startRow = 0

  constructor(private options: InitSceneOptions) {
    // Generate 5 random DNAs
    this.dnas = Array(5)
      .fill(0)
      .map(() => generateRandomDNA())
  }

  init(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows
    this.avatarLines = this.renderFrame(0)
    this.calculateLayout()
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
    this.startRow = Math.max(0, Math.floor((this.rows - totalHeight) / 2))
  }

  update(_tick: number, _cols: number, _rows: number, buffer: Cell[][]): void {
    // Update animation frame every 5 ticks (~60fps / 12 = ~5fps animation)
    if (this.tick % 5 === 0) {
      this.currentFrame = (this.currentFrame + 1) % 4
      this.avatarLines = this.renderFrame(this.frames[this.currentFrame]!)
    }
    this.tick++

    // Render to buffer
    this.renderToBuffer(buffer)
  }

  private renderToBuffer(buffer: Cell[][]): void {
    let row = this.startRow

    // Title
    for (const title of this.titleLines) {
      const visibleTitle = title.replace(/\x1b\[[0-9;]*m/g, "")
      const padding = Math.max(0, Math.floor((this.cols - visibleTitle.length) / 2))
      this.renderTextLine(buffer, row, padding, title)
      row++
    }

    // Spacing
    row++

    // Avatars
    for (const avatarLine of this.avatarLines) {
      const visibleWidth = this.getVisibleWidth(avatarLine)
      const padding = Math.max(0, Math.floor((this.cols - visibleWidth) / 2))
      this.renderTextLine(buffer, row, padding, avatarLine)
      row++
    }

    // Spacing
    row++

    // Prompt with user input
    const displayText = this.promptText + (this.userInput ? this.userInput : "_")
    const visiblePrompt = displayText.replace(/\x1b\[[0-9;]*m/g, "")
    const promptPadding = Math.max(0, Math.floor((this.cols - visiblePrompt.length) / 2))
    this.renderTextLine(buffer, row, promptPadding, displayText)
  }

  private renderTextLine(buffer: Cell[][], row: number, col: number, text: string): void {
    if (row < 0 || row >= buffer.length) return

    let currentCol = col
    let i = 0
    let currentFg: [number, number, number] | null = null

    while (i < text.length && currentCol < this.cols) {
      if (text[i] === "\x1b" && text[i + 1] === "[") {
        // Parse ANSI escape sequence
        i += 2 // Skip \x1b[
        let codeStr = ""
        while (i < text.length && text[i] !== "m") {
          codeStr += text[i]
          i++
        }
        i++ // Skip 'm'

        // Handle color codes: 38;2;R;G;B (foreground RGB)
        if (codeStr.startsWith("38;2;")) {
          const parts = codeStr.split(";")
          if (parts.length >= 5) {
            const r = parseInt(parts[2] || "0")
            const g = parseInt(parts[3] || "0")
            const b = parseInt(parts[4] || "0")
            currentFg = [r, g, b]
          }
        } else if (codeStr === "0") {
          // Reset
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
    this.calculateLayout()
  }

  input(): { onArrow: (dir: string) => void; onKey: (char: string) => void } {
    return {
      onArrow: (_dir: string) => {
        // Ignore arrows
      },
      onKey: (char: string) => {
        if (this.confirmed !== null) return // Already answered

        if (char === "y" || char === "Y") {
          this.confirmed = true
          this.options.onConfirm(true)
        } else if (char === "n" || char === "N") {
          this.confirmed = false
          this.options.onConfirm(false)
        } else if (char === "\u0003") {
          // Ctrl+C
          this.confirmed = false
          this.options.onConfirm(false)
        }
      },
    }
  }

  cleanup(): void {
    // No cleanup needed
  }
}
