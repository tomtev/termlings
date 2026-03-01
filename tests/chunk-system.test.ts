import { describe, it, expect } from "bun:test";
import {
  CHUNK_SIZE,
  worldToChunk,
  worldToLocal,
  chunkToWorld,
  getChunkPath,
} from "../src/engine/chunk-system.js";

describe("Chunk System", () => {
  describe("worldToChunk", () => {
    it("should convert world coordinates to chunk coordinates", () => {
      // First chunk (0,0): world 0-15
      expect(worldToChunk(0, 0)).toEqual({ chunkX: 0, chunkY: 0 });
      expect(worldToChunk(15, 15)).toEqual({ chunkX: 0, chunkY: 0 });

      // Second chunk (1,0): world 16-31
      expect(worldToChunk(16, 0)).toEqual({ chunkX: 1, chunkY: 0 });
      expect(worldToChunk(31, 15)).toEqual({ chunkX: 1, chunkY: 0 });

      // Chunk (2,3): world 32-47, 48-63
      expect(worldToChunk(32, 48)).toEqual({ chunkX: 2, chunkY: 3 });
    });

    it("should handle negative coordinates", () => {
      expect(worldToChunk(-1, -1)).toEqual({ chunkX: -1, chunkY: -1 });
      expect(worldToChunk(-16, -16)).toEqual({ chunkX: -1, chunkY: -1 });
    });
  });

  describe("worldToLocal", () => {
    it("should convert world coordinates to local chunk coordinates", () => {
      // Within first chunk
      expect(worldToLocal(0, 0)).toEqual({ localX: 0, localY: 0 });
      expect(worldToLocal(15, 15)).toEqual({ localX: 15, localY: 15 });

      // Within second chunk
      expect(worldToLocal(16, 0)).toEqual({ localX: 0, localY: 0 });
      expect(worldToLocal(31, 15)).toEqual({ localX: 15, localY: 15 });

      // Within chunk (2,3)
      expect(worldToLocal(32, 48)).toEqual({ localX: 0, localY: 0 });
      expect(worldToLocal(47, 63)).toEqual({ localX: 15, localY: 15 });
    });
  });

  describe("chunkToWorld", () => {
    it("should convert chunk coordinates to world coordinates", () => {
      expect(chunkToWorld(0, 0)).toEqual({ worldX: 0, worldY: 0 });
      expect(chunkToWorld(1, 0)).toEqual({ worldX: 16, worldY: 0 });
      expect(chunkToWorld(2, 3)).toEqual({ worldX: 32, worldY: 48 });
    });

    it("should handle negative chunk coordinates", () => {
      expect(chunkToWorld(-1, -1)).toEqual({ worldX: -16, worldY: -16 });
    });
  });

  describe("coordinate conversion roundtrip", () => {
    it("should maintain world coordinates through conversion", () => {
      const testCoords = [
        [0, 0],
        [15, 15],
        [16, 16],
        [32, 48],
        [100, 200],
      ];

      for (const [x, y] of testCoords) {
        const { chunkX, chunkY } = worldToChunk(x, y);
        const { localX, localY } = worldToLocal(x, y);
        const { worldX, worldY } = chunkToWorld(chunkX, chunkY);

        // Reconstructed world coords should match original
        expect(worldX + localX).toBe(x);
        expect(worldY + localY).toBe(y);
      }
    });
  });

  describe("getChunkPath", () => {
    it("should generate consistent chunk file paths", () => {
      const path1 = getChunkPath(0, 0);
      const path2 = getChunkPath(0, 0);
      expect(path1).toBe(path2);
      expect(path1).toMatch(/chunk_0_0\.json$/);
    });

    it("should generate different paths for different chunks", () => {
      const path1 = getChunkPath(0, 0);
      const path2 = getChunkPath(1, 0);
      expect(path1).not.toBe(path2);
    });
  });

  describe("CHUNK_SIZE constant", () => {
    it("should be 16", () => {
      expect(CHUNK_SIZE).toBe(16);
    });
  });
});
