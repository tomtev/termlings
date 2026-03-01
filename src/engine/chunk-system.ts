import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "fs"
import { join } from "path"
import { getDataDir } from "./ipc.js"
import type { ObjectPlacement } from "./objects.js"
import type { Entity } from "./types.js"

export const CHUNK_SIZE = 16

/**
 * Chunk entity - lightweight version of Entity stored in chunks
 * Contains just the data needed for persistence and spatial queries
 */
export interface ChunkEntity {
  sessionId: string
  name?: string
  dna: string
  x: number
  y: number
}

export interface ChunkData {
  chunkX: number
  chunkY: number
  tileX: number
  tileY: number
  width: number
  height: number
  placements: ObjectPlacement[]
  entities: ChunkEntity[]
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
      entities: [],
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
        entities: [],
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

  loadedChunks.forEach((chunk, key) => {
    result.set(key, [...chunk.placements])
  })

  return result
}

/**
 * Add or update an entity in a chunk
 */
export function addEntityToChunk(chunkX: number, chunkY: number, entity: ChunkEntity): void {
  const chunk = ensureChunkLoaded(chunkX, chunkY)

  // Remove existing entity with same sessionId if present
  chunk.entities = chunk.entities.filter(e => e.sessionId !== entity.sessionId)

  // Add new entity
  chunk.entities.push(entity)
  saveChunk(chunk)
}

/**
 * Remove an entity from a chunk
 */
export function removeEntityFromChunk(chunkX: number, chunkY: number, sessionId: string): void {
  const chunk = loadChunk(chunkX, chunkY)
  if (!chunk) return

  const originalLen = chunk.entities.length
  chunk.entities = chunk.entities.filter(e => e.sessionId !== sessionId)

  // Only save if something was removed
  if (chunk.entities.length < originalLen) {
    saveChunk(chunk)
  }
}

/**
 * Move an entity from one chunk to another
 */
export function moveEntityToChunk(
  oldChunkX: number,
  oldChunkY: number,
  newChunkX: number,
  newChunkY: number,
  entity: ChunkEntity
): void {
  // Remove from old chunk
  removeEntityFromChunk(oldChunkX, oldChunkY, entity.sessionId)

  // Add to new chunk
  addEntityToChunk(newChunkX, newChunkY, entity)
}

/**
 * Get all entities in a specific chunk
 */
export function getEntitiesInChunk(chunkX: number, chunkY: number): ChunkEntity[] {
  const chunk = loadChunk(chunkX, chunkY)
  return chunk ? [...chunk.entities] : []
}

/**
 * Get all entities in a rectangular region (by chunk bounds)
 */
export function getEntitiesInRegion(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): ChunkEntity[] {
  const chunks = getChunksByRegion(x1, y1, x2, y2)
  const entities: ChunkEntity[] = []

  for (const chunk of chunks) {
    entities.push(...chunk.entities)
  }

  return entities
}

/**
 * Get an entity from any chunk by sessionId
 */
export function findEntity(sessionId: string): { entity: ChunkEntity; chunkX: number; chunkY: number } | null {
  // Search loaded chunks only (avoid loading all chunks)
  let result: { entity: ChunkEntity; chunkX: number; chunkY: number } | null = null
  loadedChunks.forEach((chunk) => {
    if (!result) {
      const entity = chunk.entities.find(e => e.sessionId === sessionId)
      if (entity) {
        result = { entity, chunkX: chunk.chunkX, chunkY: chunk.chunkY }
      }
    }
  })
  return result
}

/**
 * Load all persisted entities from chunks into a flat array
 */
export function loadAllChunkEntities(): ChunkEntity[] {
  ensureChunkDir()

  const entities: ChunkEntity[] = []
  const mapDir = getChunkDir()

  if (!existsSync(mapDir)) {
    return entities
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
      entities.push(...chunk.entities)
    }
  }

  return entities
}
