import { describe, it, expect } from "vitest"
import { lighten, darken, renderObjectToTerminal, OBJECT_DEFS } from "../objects.js"
import type { RGB } from "../types.js"

describe("Color utilities", () => {
  describe("darken", () => {
    it("darkens a color by 30% (factor 0.7)", () => {
      const color: RGB = [200, 150, 100]
      const result = darken(color)
      expect(result).toEqual([140, 105, 70])
    })

    it("handles custom factor", () => {
      const color: RGB = [100, 100, 100]
      const result = darken(color, 0.5)
      expect(result).toEqual([50, 50, 50])
    })

    it("clamps to 0", () => {
      const color: RGB = [10, 10, 10]
      const result = darken(color, 0.5)
      expect(result).toEqual([5, 5, 5])
    })
  })

  describe("lighten", () => {
    it("lightens a color by 30% (factor 1.3)", () => {
      const color: RGB = [200, 150, 100]
      const result = lighten(color)
      expect(result).toEqual([255, 195, 130])
    })

    it("clamps to 255", () => {
      const color: RGB = [200, 200, 200]
      const result = lighten(color)
      expect(result).toEqual([255, 255, 255])
    })

    it("handles custom factor", () => {
      const color: RGB = [100, 100, 100]
      const result = lighten(color, 1.5)
      expect(result).toEqual([150, 150, 150])
    })
  })

  describe("color variations", () => {
    it("creates visually distinct light, primary, and dark variants", () => {
      const primary: RGB = [200, 100, 50]
      const light = lighten(primary)
      const dark = darken(primary)

      // Light should be brighter
      expect(light[0] + light[1] + light[2]).toBeGreaterThan(
        primary[0] + primary[1] + primary[2]
      )

      // Dark should be dimmer
      expect(dark[0] + dark[1] + dark[2]).toBeLessThan(
        primary[0] + primary[1] + primary[2]
      )
    })
  })
})

describe("Object rendering", () => {
  it("renders a known object type", () => {
    const output = renderObjectToTerminal("chair")
    expect(output).toBeTruthy()
    expect(output.length).toBeGreaterThan(0)
  })

  it("renders with custom color", () => {
    const customColor: RGB = [255, 0, 0]
    const output = renderObjectToTerminal("chair", customColor)
    expect(output).toBeTruthy()
    // Should contain ANSI color codes
    expect(output).toContain("\x1b[38;2;")
  })

  it("returns error for unknown object", () => {
    const output = renderObjectToTerminal("nonexistent")
    expect(output).toContain("Unknown object")
  })

  it("renders all built-in objects without error", () => {
    for (const objectType of Object.keys(OBJECT_DEFS)) {
      const output = renderObjectToTerminal(objectType)
      expect(output).toBeTruthy()
      expect(output).not.toContain("Unknown object")
    }
  })

  it("renders objects with various colors", () => {
    const colors: RGB[] = [
      [255, 100, 100], // Red
      [100, 255, 100], // Green
      [100, 100, 255], // Blue
    ]

    for (const color of colors) {
      const output = renderObjectToTerminal("sofa", color)
      expect(output).toBeTruthy()
      expect(output).toContain("\x1b[38;2;")
    }
  })
})
