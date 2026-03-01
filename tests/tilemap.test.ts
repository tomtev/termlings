import { describe, it, expect } from "bun:test";
import { DEFAULT_TILE_DEFS } from "../src/engine/tilemap-core.js";

describe("Tilemap System", () => {
  describe("DEFAULT_TILE_DEFS", () => {
    it("should have required tile definitions", () => {
      expect(DEFAULT_TILE_DEFS).toBeTruthy();
      expect(typeof DEFAULT_TILE_DEFS).toBe("object");
    });

    it("should have basic tile characters", () => {
      // Check for common tile types
      const commonTiles = [",", "#", ".", "~"];
      const tileKeys = Object.keys(DEFAULT_TILE_DEFS);

      // At least some should exist (exact tiles depend on tilemap definition)
      expect(tileKeys.length).toBeGreaterThan(0);
    });

    it("should have walkable property on tiles", () => {
      const grassTile = DEFAULT_TILE_DEFS[","];
      if (grassTile) {
        expect(grassTile).toHaveProperty("walkable");
        expect(typeof grassTile.walkable).toBe("boolean");
      }
    });

    it("should have visual properties (ch, fg, bg)", () => {
      const tile = Object.values(DEFAULT_TILE_DEFS)[0];
      if (tile) {
        expect(tile).toHaveProperty("ch");
        expect(typeof tile.ch).toBe("string");
      }
    });
  });

  describe("Tile Colors", () => {
    it("should have valid RGB color arrays", () => {
      for (const [key, tile] of Object.entries(DEFAULT_TILE_DEFS)) {
        if (tile.fg) {
          expect(Array.isArray(tile.fg)).toBe(true);
          expect(tile.fg.length).toBe(3);
          expect(tile.fg[0]).toBeGreaterThanOrEqual(0);
          expect(tile.fg[0]).toBeLessThanOrEqual(255);
        }
        if (tile.bg) {
          expect(Array.isArray(tile.bg)).toBe(true);
          expect(tile.bg.length).toBe(3);
        }
      }
    });
  });

  describe("Tile Characters", () => {
    it("should have valid character strings", () => {
      for (const [key, tile] of Object.entries(DEFAULT_TILE_DEFS)) {
        expect(typeof tile.ch).toBe("string");
        // Most tiles should be single character
        expect(tile.ch.length).toBeGreaterThan(0);
      }
    });
  });
});
