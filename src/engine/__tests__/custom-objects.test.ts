import { describe, it, expect } from "vitest"
import { createCustomObject, loadCustomObjects } from "../custom-objects.js"
import type { ObjectDef } from "../types.js"

describe("Custom Objects", () => {
  describe("createCustomObject validation", () => {
    it("rejects non-object definitions", () => {
      const result = createCustomObject("test", "not an object")
      expect(result.success).toBe(false)
      expect(result.error).toContain("Definition must be an object")
    })

    it("rejects missing width", () => {
      const result = createCustomObject("test", { height: 2, cells: [] })
      expect(result.success).toBe(false)
      expect(result.error).toContain("width")
    })

    it("rejects invalid width (zero)", () => {
      const result = createCustomObject("test", { width: 0, height: 2, cells: [] })
      expect(result.success).toBe(false)
    })

    it("rejects missing height", () => {
      const result = createCustomObject("test", { width: 3, cells: [] })
      expect(result.success).toBe(false)
      expect(result.error).toContain("height")
    })

    it("rejects missing cells", () => {
      const result = createCustomObject("test", { width: 3, height: 2 })
      expect(result.success).toBe(false)
      expect(result.error).toContain("cells")
    })

    it("rejects cells with wrong row count", () => {
      const result = createCustomObject("test", {
        width: 3,
        height: 2,
        cells: [["A", "B", "C"]], // Only 1 row, need 2
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain("rows")
    })

    it("rejects rows with wrong column count", () => {
      const result = createCustomObject("test", {
        width: 3,
        height: 2,
        cells: [
          ["A", "B"], // 2 cols, need 3
          ["C", "D", "E"],
        ],
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain("columns")
    })
  })

  describe("Custom object cell types", () => {
    it("handles default cell types (V, S, F)", () => {
      const result = createCustomObject("bench", {
        width: 3,
        height: 1,
        cells: [["V", "S", "F"]],
      })
      expect(result.success).toBe(true)
    })

    it("handles custom cell type definitions", () => {
      const result = createCustomObject("colored-bench", {
        width: 3,
        height: 1,
        cells: [["X", "Y", "Z"]],
        cellTypes: {
          X: { character: "█", fg: [255, 0, 0], walkable: false },
          Y: { character: "▓", fg: [0, 255, 0], walkable: true },
          Z: { character: "░", fg: [0, 0, 255], bg: [50, 50, 50], walkable: false },
        },
      })
      expect(result.success).toBe(true)
    })

    it("handles null cells (transparent)", () => {
      const result = createCustomObject("sparse", {
        width: 3,
        height: 2,
        cells: [
          ["A", null, "B"],
          [null, null, null],
        ],
        cellTypes: {
          A: { character: "█", fg: [255, 0, 0], walkable: false },
          B: { character: "█", fg: [0, 255, 0], walkable: false },
        },
      })
      expect(result.success).toBe(true)
    })
  })

  describe("Built-in cell type defaults", () => {
    it("creates valid V (void) cells", () => {
      const result = createCustomObject("test", {
        width: 1,
        height: 1,
        cells: [["V"]],
      })
      expect(result.success).toBe(true)
    })

    it("creates valid S (seat/surface) cells", () => {
      const result = createCustomObject("test", {
        width: 1,
        height: 1,
        cells: [["S"]],
      })
      expect(result.success).toBe(true)
    })

    it("creates valid F (floor) cells", () => {
      const result = createCustomObject("test", {
        width: 1,
        height: 1,
        cells: [["F"]],
      })
      expect(result.success).toBe(true)
    })
  })

  describe("Object definition structure", () => {
    it("creates object with proper structure", () => {
      const result = createCustomObject("table", {
        width: 4,
        height: 2,
        cells: [
          ["A", "A", "A", "A"],
          ["F", "F", "F", "F"],
        ],
        cellTypes: {
          A: { character: "█", fg: [139, 69, 19], walkable: false },
          F: { character: "░", fg: [200, 170, 140], walkable: true },
        },
      })

      expect(result.success).toBe(true)
    })
  })

  describe("Custom object constraints", () => {
    it("allows reasonably-sized objects", () => {
      // Medium-sized object with defined cell types
      const result = createCustomObject("medium", {
        width: 8,
        height: 8,
        cells: Array(8)
          .fill(null)
          .map(() => Array(8).fill("X")),
        cellTypes: {
          X: { character: "█", fg: [200, 100, 50], walkable: false },
        },
      })

      expect(result.success).toBe(true)
    })

    it("allows single-cell objects", () => {
      const result = createCustomObject("tiny", {
        width: 1,
        height: 1,
        cells: [["X"]],
        cellTypes: {
          X: { character: "█", fg: [255, 255, 255], walkable: false },
        },
      })
      expect(result.success).toBe(true)
    })
  })
})
