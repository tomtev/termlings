import {
  decodeDNA,
  getTraitColors,
  HATS,
  LEGS,
} from "../index.js"
import type { RGB, Cell, Entity, SimConfig } from "./types.js"

export function spriteHeight(dna: string): number {
  return HATS[decodeDNA(dna).hat]!.length + 7
}

export function entityHeight(traits: { hat: number }, zoomLevel: number): number {
  const full = HATS[traits.hat]!.length + 7
  if (zoomLevel === 1) return Math.ceil(full / 2)
  return full
}

export function makeEntity(
  dna: string,
  x: number,
  y: number,
  zoomLevel: number,
  opts: { walking?: boolean; talking?: boolean; waving?: boolean; idle?: boolean; flipped?: boolean } = {},
): Entity {
  const traits = decodeDNA(dna)
  const { faceRgb, darkRgb, hatRgb } = getTraitColors(traits)
  return {
    dna,
    x,
    y,
    walkFrame: 0,
    talkFrame: 0,
    waveFrame: opts.waving ? 1 : 0,
    flipped: opts.flipped ?? false,
    backside: false,
    traits,
    faceRgb,
    darkRgb,
    hatRgb,
    legFrames: LEGS[traits.legs]!.length,
    height: entityHeight(traits, zoomLevel),
    walking: opts.walking ?? false,
    talking: opts.talking ?? false,
    waving: opts.waving ?? false,
    idle: opts.idle ?? false,
  }
}

/** Update all animation frames for a list of entities (single pass) */
export function updateAnimations(
  entities: Entity[],
  tick: number,
  config: SimConfig,
) {
  const { walkTicks, talkTicks, waveTicks, idleTicks, blinkChance } = config.animation
  const doWalk = tick % walkTicks === 0
  const doTalk = tick % talkTicks === 0
  const doWave = tick % waveTicks === 0
  const doIdle = tick % idleTicks === 0

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!
    if (doWalk && e.walking) {
      e.walkFrame = (e.walkFrame + 1) % e.legFrames
    }
    if (doTalk && e.talking) {
      e.talkFrame = (e.talkFrame + 1) % 2
    }
    if (doWave && e.waving) {
      e.waveFrame = e.waveFrame === 1 ? 2 : 1
    }
  }
}

export interface BubbleInfo {
  x: number
  y: number
  text: string
  fg: RGB
}

/** Render NPC speech bubbles above their names */
export function stampBubbles(
  buffer: Cell[][],
  cols: number,
  rows: number,
  bubbles: BubbleInfo[],
  cameraX: number,
  cameraY: number,
  scale: number,
) {
  const spriteW = 9

  const positioned: { row: number; colStart: number; text: string; fg: RGB }[] = []

  for (const b of bubbles) {
    const spriteScreenW = spriteW * scale
    const entityScreenX = (b.x - cameraX) * scale
    const textLen = b.text.length
    const colStart = Math.round(entityScreenX + spriteScreenW / 2 - textLen / 2)
    const row = b.y - cameraY - 2 // 1 row above name

    positioned.push({ row, colStart, text: b.text, fg: b.fg })
  }

  // Sort by row top-to-bottom
  positioned.sort((a, b) => a.row - b.row)

  // Collision avoidance: push overlapping bubbles up
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      const a = positioned[i]!
      const b = positioned[j]!
      if (a.row === b.row) {
        const aEnd = a.colStart + a.text.length
        const bEnd = b.colStart + b.text.length
        if (a.colStart < bEnd && b.colStart < aEnd) {
          b.row = a.row - 1
        }
      }
    }
  }

  // Render each bubble
  for (const b of positioned) {
    if (b.row < 0 || b.row >= rows || !buffer[b.row]) continue
    const bufRow = buffer[b.row]!
    for (let i = 0; i < b.text.length; i++) {
      const sx = b.colStart + i
      if (sx < 0 || sx >= cols) continue
      const c = bufRow[sx]; if (c) { c.ch = b.text[i]!; c.fg = b.fg; c.bg = null }
    }
  }
}

/** Show NPC names above heads. When player is null (spectator mode), show all names.
 *  labels: optional map of entity → suffix like " (1)" for selection index */
export function stampNames(
  buffer: Cell[][],
  cols: number,
  rows: number,
  npcs: Entity[],
  player: Entity | null,
  cameraX: number,
  cameraY: number,
  scale: number,
  proximity: number,
  labels?: Map<Entity, string>,
) {
  const spriteW = 9

  for (const npc of npcs) {
    if (!npc.name) continue
    if (player) {
      const dx = Math.abs((npc.x + 4) - (player.x + 4))
      const dy = Math.abs((npc.y + npc.height) - (player.y + player.height))
      if (dx > proximity || dy > proximity) continue
    }

    const suffix = labels?.get(npc) ?? ""
    const displayName = npc.name + suffix
    const nameScreenW = displayName.length
    const spriteScreenW = spriteW * scale
    const entityScreenX = (npc.x - cameraX) * scale
    const nameX = Math.round(entityScreenX + spriteScreenW / 2 - nameScreenW / 2)
    const nameY = npc.y - cameraY - 1

    if (nameY < 0 || nameY >= rows || !buffer[nameY]) continue
    const bufRow = buffer[nameY]!
    for (let i = 0; i < displayName.length; i++) {
      const sx = nameX + i
      if (sx < 0 || sx >= cols) continue
      const c = bufRow[sx]; if (c) { c.ch = displayName[i]!; c.fg = npc.faceRgb; c.bg = null }
    }
  }
}
