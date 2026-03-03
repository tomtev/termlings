import { resolve, dirname, join } from "path"
import { fileURLToPath } from "url"
import { existsSync } from "fs"

const __dir = dirname(fileURLToPath(import.meta.url))
const sfxDir = resolve(__dir, "../../assets/sfx")

const PAN_LEVELS = [0, 25, 50, 75, 100]
const STEP_COUNT = 4

/** Resolve the closest pre-panned WAV file for a given pan value */
function panFile(base: string, pan: number): string {
  // pan: 0.0 = left, 0.5 = center, 1.0 = right
  const p = Math.max(0, Math.min(100, Math.round(pan * 100)))
  // Find closest pan level
  let closest = PAN_LEVELS[0]!
  let minDist = Math.abs(p - closest)
  for (const lvl of PAN_LEVELS) {
    const dist = Math.abs(p - lvl)
    if (dist < minDist) {
      closest = lvl
      minDist = dist
    }
  }
  return join(sfxDir, `${base}_p${closest}.wav`)
}

let stepIndex = 0
let lastStepTime = 0
const MIN_STEP_INTERVAL = 250 // ms between player footstep sounds

let npcStepIndex = 0
let lastNpcStepTime = 0
const NPC_STEP_INTERVAL = 400 // ms between NPC footstep sounds (less frequent)

/**
 * Play a footstep sound with positional panning.
 * @param screenX - the sound source x position on screen (0 = left edge)
 * @param screenWidth - the total screen width in columns
 */
export function playFootstep(screenX: number, screenWidth: number) {
  const now = Date.now()
  if (now - lastStepTime < MIN_STEP_INTERVAL) return
  lastStepTime = now

  const pan = screenWidth > 0 ? Math.max(0, Math.min(1, screenX / screenWidth)) : 0.5
  stepIndex = (stepIndex + 1) % STEP_COUNT
  const file = panFile(`step${stepIndex + 1}`, pan)

  if (!existsSync(file)) return

  try {
    Bun.spawn(["afplay", file], {
      stdout: "ignore",
      stderr: "ignore",
    })
  } catch {
    // Silently fail if afplay not available
  }
}

let soundEnabled = true

export function isSoundEnabled(): boolean {
  return soundEnabled
}

export function toggleSound(): boolean {
  soundEnabled = !soundEnabled
  return soundEnabled
}

/**
 * Play a footstep if sound is enabled.
 * @param screenX - sound source x on screen
 * @param screenWidth - total screen width
 */
export function stepSound(screenX: number, screenWidth: number) {
  if (!soundEnabled) return
  playFootstep(screenX, screenWidth)
}

/**
 * Play an NPC footstep sound (separate throttle, less frequent).
 * Only call for the nearest on-screen NPC to avoid sound spam.
 */
export function npcStepSound(screenX: number, screenWidth: number) {
  if (!soundEnabled) return
  const now = Date.now()
  if (now - lastNpcStepTime < NPC_STEP_INTERVAL) return
  lastNpcStepTime = now

  const pan = screenWidth > 0 ? Math.max(0, Math.min(1, screenX / screenWidth)) : 0.5
  npcStepIndex = (npcStepIndex + 1) % STEP_COUNT
  const file = panFile(`step${npcStepIndex + 1}`, pan)

  if (!existsSync(file)) return

  try {
    Bun.spawn(["afplay", file], {
      stdout: "ignore",
      stderr: "ignore",
    })
  } catch {
    // Silently fail if afplay not available
  }
}
