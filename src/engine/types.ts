import type { DecodedDNA } from "../index.js"

export type RGB = [number, number, number]

export interface Cell {
  ch: string
  fg: RGB | null
  bg: RGB | null
}

export interface TileDef {
  ch: string
  fg: RGB | null
  bg: RGB | null
  walkable: boolean
}

export interface RoomRegion {
  name: string
  x: number
  y: number
  w: number
  h: number
}

export interface ParsedMap {
  tiles: string[][]
  width: number
  height: number
  npcSpawns: { x: number; y: number; name?: string }[]
  playerSpawn: { x: number; y: number }
  rooms: RoomRegion[]
  name?: string
  tileDefs: Record<string, TileDef>
}

export interface ObjectOverlay {
  visual: Map<number, Cell>
  walkable: Map<number, boolean>
}

/** Pack tile coordinates into a numeric key (supports maps up to 65536 wide) */
export function tileKey(x: number, y: number): number {
  return (y << 16) | (x & 0xffff)
}

export interface Entity {
  dna: string
  name?: string
  x: number
  y: number
  walkFrame: number
  talkFrame: number
  waveFrame: number
  flipped: boolean
  backside: boolean
  traits: DecodedDNA
  faceRgb: RGB
  darkRgb: RGB
  hatRgb: RGB
  legFrames: number
  height: number
  // animation state
  walking: boolean
  talking: boolean
  waving: boolean
  idle: boolean

  // NPC wander AI
  targetX?: number
  targetY?: number
  idleTicks?: number
  // Cached sprite grids (avoid per-frame regeneration)
  _gridCache?: unknown[][]
  _gridSmallCache?: unknown[][]
  _cacheKey?: number // packed animation state for normal grid cache
  _cacheKeySmall?: number // packed animation state for small grid cache
}

export interface SimConfig {
  frameMs: number
  moveInterval: number
  holdWindow: number
  spriteWidth: number
  collisionInset: number
  nameProximity: number
  animation: {
    walkTicks: number
    talkTicks: number
    waveTicks: number
    idleTicks: number

    blinkChance: number
  }
}

export const DEFAULT_CONFIG: SimConfig = {
  frameMs: 16,
  moveInterval: 30,
  holdWindow: 250,
  spriteWidth: 9,
  collisionInset: 1,
  nameProximity: 20,
  animation: {
    walkTicks: 20,
    talkTicks: 12,
    waveTicks: 36,
    idleTicks: 150,

    blinkChance: 0.015,
  },
}
