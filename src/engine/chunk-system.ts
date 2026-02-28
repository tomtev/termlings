import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "fs"
import { join } from "path"
import { getDataDir } from "./ipc.js"
import type { ObjectPlacement } from "./objects.js"

export const CHUNK_SIZE = 16

export interface ChunkData {
  chunkX: number
  chunkY: number
  tileX: number
  tileY: number
  width: number
  height: number
  placements: ObjectPlacement[]
}

// In-memory chunk registry (LRU cache)
const loadedChunks = new Map<string, ChunkData>()
const CHUNK_CACHE_SIZE = 100

/**
 * Get cache key for a chunk
 */
function getCacheKey(chunkX: number, chunkY: number): string {
  return `${chunkX},${chunkY}`
}

/**
 * Get the directory where chunks are stored
 */
function getChunkDir(): string {
  return join(process.cwd(), ".termlings", "map")
}

/**
 * Get the file path for a specific chunk
 */
export function getChunkPath(chunkX: number, chunkY: number): string {
  return join(getChunkDir(), `chunk_${chunkX}_${chunkY}.json`)
}

/**
 * Create chunk directory if it doesn't exist
 */
function ensureChunkDir(): void {
  const dir = getChunkDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Convert world coordinates to chunk coordinates
 */
export function worldToChunk(
  worldX: number,
  worldY: number
): { chunkX: number; chunkY: number } {
  return {
    chunkX: Math.floor(worldX / CHUNK_SIZE),
    chunkY: Math.floor(worldY / CHUNK_SIZE),
  }
}

/**
 * Convert world coordinates to local chunk coordinates
 */
export function worldToLocal(
  worldX: number,
  worldY: number
): { localX: number; localY: number } {
  return {
    localX: worldX % CHUNK_SIZE,
    localY: worldY % CHUNK_SIZE,
  }
}

/**
 * Convert chunk coordinates to world coordinates (top-left corner)
 */
export function chunkToWorld(
  chunkX: number,
  chunkY: number
): { worldX: number; worldY: number } {
  return {
    worldX: chunkX * CHUNK_SIZE,
    worldY: chunkY * CHUNK_SIZE,
  }
}

/**
 * Load a chunk from disk
 */
export function loadChunk(chunkX: number, chunkY: number): ChunkData | null {
  const key = getCacheKey(chunkX, chunkY)

  // Check if already in memory
  if (loadedChunks.has(key)) {
    return loadedChunks.get(key)!
  }

  const path = getChunkPath(chunkX, chunkY)
  if (!existsSync(path)) {
    return null
  }

  try {
    const data = readFileSync(path, "utf8")
    const chunk = JSON.parse(data) as ChunkData
    loadedChunks.set(key, chunk)

    // Evict oldest chunk if cache is full
    if (loadedChunks.size > CHUNK_CACHE_SIZE) {
      const firstKey = loadedChunks.keys().next().value
      loadedChunks.delete(firstKey)
    }

    return chunk
  } catch (e) {
    console.error(`Error loading chunk ${chunkX},${chunkY}: ${e}`)
    return null
  }
}

/**
 * Save a chunk to disk and keep in memory
 */
export function saveChunk(chunk: ChunkData): void {
  ensureChunkDir()

  const key = getCacheKey(chunk.chunkX, chunk.chunkY)
  loadedChunks.set(key, chunk)

  // Evict oldest chunk if cache is full
  if (loadedChunks.size > CHUNK_CACHE_SIZE) {
    const firstKey = loadedChunks.keys().next().value
    loadedChunks.delete(firstKey)
  }

  const path = getChunkPath(chunk.chunkX, chunk.chunkY)
  try {
    writeFileSync(path, JSON.stringify(chunk) + "\n")
  } catch (e) {
    console.error(`Error saving chunk ${chunk.chunkX},${chunk.chunkY}: ${e}`)
  }
}

/**
 * Delete a chunk from disk and memory
 */
export function deleteChunk(chunkX: number, chunkY: number): void {
  const key = getCacheKey(chunkX, chunkY)
  loadedChunks.delete(key)

  const path = getChunkPath(chunkX, chunkY)
  if (existsSync(path)) {
    try {
      unlinkSync(path)
    } catch (e) {
      console.error(`Error deleting chunk ${chunkX},${chunkY}: ${e}`)
    }
  }
}

/**
 * Get or create a chunk, loading from disk if needed
 */
export function ensureChunkLoaded(chunkX: number, chunkY: number): ChunkData {
  let chunk = loadChunk(chunkX, chunkY)

  if (!chunk) {
    // Create new chunk if it doesn't exist
    const { worldX, worldY } = chunkToWorld(chunkX, chunkY)
    chunk = {
      chunkX,
      chunkY,
      tileX: worldX,
      tileY: worldY,
      width: CHUNK_SIZE,
      height: CHUNK_SIZE,
      placements: [],
    }
    saveChunk(chunk)
  }

  return chunk
}

/**
 * Get all chunks within a region
 */
export function getChunksByRegion(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): ChunkData[] {
  const { chunkX: minChunkX, chunkY: minChunkY } = worldToChunk(x1, y1)
  const { chunkX: maxChunkX, chunkY: maxChunkY } = worldToChunk(x2, y2)

  const chunks: ChunkData[] = []
  for (let cx = minChunkX; cx <= maxChunkX; cx++) {
    for (let cy = minChunkY; cy <= maxChunkY; cy++) {
      const chunk = loadChunk(cx, cy)
      if (chunk) {
        chunks.push(chunk)
      }
    }
  }
  return chunks
}

/**
 * Find a placement in a chunk at world coordinates
 */
export function findPlacementInChunk(
  chunkX: number,
  chunkY: number,
  worldX: number,
  worldY: number
): ObjectPlacement | null {
  const chunk = loadChunk(chunkX, chunkY)
  if (!chunk) return null

  return chunk.placements.find((p) => p.x === worldX && p.y === worldY) || null
}

/**
 * Load all persisted chunks from disk
 */
export function loadAllChunks(): ObjectPlacement[] {
  ensureChunkDir()

  const placements: ObjectPlacement[] = []
  const mapDir = getChunkDir()

  if (!existsSync(mapDir)) {
    return placements
  }

  const files = readdirSync(mapDir)
  for (const file of files) {
    if (!file.startsWith("chunk_") || !file.endsWith(".json")) continue

    // Parse filename to get chunk coordinates
    const match = file.match(/chunk_(-?\d+)_(-?\d+)\.json/)
    if (!match) continue

    const chunkX = parseInt(match[1]!, 10)
    const chunkY = parseInt(match[2]!, 10)

    const chunk = loadChunk(chunkX, chunkY)
    if (chunk) {
      placements.push(...chunk.placements)
    }
  }

  return placements
}

/**
 * Initialize chunks from initial map placements
 */
export function initializeChunksFromPlacements(
  initialPlacements: ObjectPlacement[]
): void {
  const chunkMap = new Map<string, ChunkData>()

  // Organize placements by chunk
  for (const placement of initialPlacements) {
    const { chunkX, chunkY } = worldToChunk(placement.x, placement.y)
    const key = getCacheKey(chunkX, chunkY)

    if (!chunkMap.has(key)) {
      const { worldX, worldY } = chunkToWorld(chunkX, chunkY)
      chunkMap.set(key, {
        chunkX,
        chunkY,
        tileX: worldX,
        tileY: worldY,
        width: CHUNK_SIZE,
        height: CHUNK_SIZE,
        placements: [],
      })
    }

    chunkMap.get(key)!.placements.push(placement)
  }

  // Save all chunks to disk
  for (const chunk of chunkMap.values()) {
    saveChunk(chunk)
  }
}

/**
 * Clear all chunks from memory cache
 */
export function clearChunkCache(): void {
  loadedChunks.clear()
}

/**
 * Get all placements from chunks organized by chunk
 */
export function getAllChunkPlacements(): Map<string, ObjectPlacement[]> {
  const result = new Map<string, ObjectPlacement[]>()

  for (const [key, chunk] of loadedChunks) {
    result.set(key, [...chunk.placements])
  }

  return result
}
