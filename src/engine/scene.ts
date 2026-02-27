import type { Cell } from "./types.js"
import { allocBuffer, clearBuffer, renderBuffer } from "./renderer.js"
import { setupInput, type KeyHandler } from "./input.js"

export interface Scene {
  /** Called once when scene starts. Receives initial cols/rows. */
  init(cols: number, rows: number): void
  /** Called every frame (~60fps). Render into buffer. */
  update(tick: number, cols: number, rows: number, buffer: Cell[][]): void
  /** Called on terminal resize. */
  resize(cols: number, rows: number): void
  /** Return input handlers for this scene. */
  input(): { onArrow: (dir: string) => void; onKey: KeyHandler }
  /** Cleanup scene-specific state. */
  cleanup(): void
}

/**
 * Run a scene: manages buffer, input, and render loop.
 * Does NOT manage alt-screen — caller handles terminal state.
 * Returns a handle to stop the scene.
 */
export function runScene(scene: Scene): { stop: () => void } {
  const stdout = process.stdout
  const stdin = process.stdin

  let cols = stdout.columns || 80
  let rows = stdout.rows || 24
  let buffer = allocBuffer(cols, rows)
  let tick = 0
  let stopped = false

  scene.init(cols, rows)

  // Input
  if (stdin.isTTY) stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding("utf8")
  const handlers = scene.input()
  const removeInput = setupInput(stdin, handlers.onArrow, handlers.onKey)

  // Resize
  const onResize = () => {
    cols = stdout.columns || 80
    rows = stdout.rows || 24
    buffer = allocBuffer(cols, rows)
    scene.resize(cols, rows)
  }
  stdout.on("resize", onResize)

  // Render loop
  let timer: ReturnType<typeof setTimeout> | null = null
  const frame = () => {
    if (stopped) return
    clearBuffer(buffer, cols, rows)
    scene.update(tick++, cols, rows, buffer)
    const out = renderBuffer(buffer, cols, rows)
    if (!stdout.destroyed) stdout.write(out)
    timer = setTimeout(frame, 16)
  }
  timer = setTimeout(frame, 0)

  return {
    stop() {
      if (stopped) return
      stopped = true
      if (timer) clearTimeout(timer)
      removeInput()
      stdout.removeListener("resize", onResize)
      if (stdin.isTTY) stdin.setRawMode(false)
      stdin.pause()
      scene.cleanup()
    },
  }
}
