import type { SimConfig } from "./types.js"

export interface InputState {
  lastPressTime: Record<string, number>
  pending: Record<string, boolean>  // queued moves from key events
  holdWindow: number
  moveInterval: number
}

export function createInputState(config: SimConfig): InputState {
  return {
    lastPressTime: { up: 0, down: 0, left: 0, right: 0 },
    pending: { up: false, down: false, left: false, right: false },
    holdWindow: config.holdWindow,
    moveInterval: config.moveInterval,
  }
}

export function pressDir(state: InputState, dir: string) {
  const now = Date.now()
  state.lastPressTime[dir] = now
  state.pending[dir] = true
  // Keep other held directions alive
  for (const d of ["up", "down", "left", "right"]) {
    if (d !== dir && now - state.lastPressTime[d]! < state.holdWindow) {
      state.lastPressTime[d] = now
    }
  }
}

export function isHeld(state: InputState, dir: string): boolean {
  return Date.now() - state.lastPressTime[dir]! < state.holdWindow
}

export type KeyHandler = (key: string, raw: string) => void

/** Set up raw stdin for keypresses, returns cleanup function.
 *  Caller is responsible for setting raw mode before calling this. */
export function setupInput(
  stdin: NodeJS.ReadStream,
  onArrow: (dir: string) => void,
  onKey: KeyHandler,
) {

  const handler = (data: string) => {
    let i = 0
    while (i < data.length) {
      if (data[i] === "\x1b" && data[i + 1] === "[" && i + 2 < data.length) {
        const code = data[i + 2]
        if (code === "A") onArrow("up")
        else if (code === "B") onArrow("down")
        else if (code === "D") onArrow("left")
        else if (code === "C") onArrow("right")
        i += 3
      } else {
        onKey(data[i]!, data)
        i++
      }
    }
  }

  stdin.on("data", handler)

  return () => {
    stdin.removeListener("data", handler)
  }
}
