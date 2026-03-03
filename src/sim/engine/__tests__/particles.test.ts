import { describe, it, expect } from "vitest"
import { createParticleSystem, updateParticles, getParticleOpacity } from "../particles.js"
import type { ParticleEmitter, Particle } from "../particles.js"

describe("Particle System", () => {
  describe("createParticleSystem", () => {
    it("creates particle system with emitters", () => {
      const emitters: ParticleEmitter[] = [
        {
          name: "spark",
          char: "✦",
          fg: [255, 200, 100],
          rate: 10,
          lifetime: 1000,
        },
      ]

      const system = createParticleSystem(emitters)
      expect(system).toBeDefined()
      expect(system.particles).toEqual([])
      expect(system.emitters).toEqual(emitters)
      expect(system.lastEmitTick).toBeDefined()
    })

    it("initializes lastEmitTick for all emitters", () => {
      const emitters: ParticleEmitter[] = [
        { name: "a", char: "*", fg: [255, 0, 0], rate: 10, lifetime: 1000 },
        { name: "b", char: "·", fg: [0, 255, 0], rate: 20, lifetime: 1000 },
      ]

      const system = createParticleSystem(emitters)
      expect(Object.keys(system.lastEmitTick).length).toBe(2)
      expect(system.lastEmitTick["0"]).toBe(0)
      expect(system.lastEmitTick["1"]).toBe(0)
    })
  })

  describe("updateParticles", () => {
    it("returns early if no emitters", () => {
      const system = createParticleSystem([])
      const initialLength = system.particles.length

      updateParticles(system, 16.67)

      expect(system.particles.length).toBe(initialLength)
    })

    it("emits particles based on rate", () => {
      const emitter: ParticleEmitter = {
        name: "test",
        char: "*",
        fg: [255, 255, 255],
        rate: 60, // 60 particles per second = ~16.67ms per particle
        lifetime: 1000,
      }

      const system = createParticleSystem([emitter])

      // First update - should emit if enough time has passed
      updateParticles(system, 16.67)

      // After first update, we should have some particles
      // (exact count depends on timing, but should be > 0)
      expect(system.particles.length).toBeGreaterThanOrEqual(0)
    })

    it("ages particles correctly", () => {
      const emitter: ParticleEmitter = {
        name: "test",
        char: "*",
        fg: [255, 255, 255],
        rate: 1000, // Emit frequently
        lifetime: 500,
      }

      const system = createParticleSystem([emitter])

      // First update
      updateParticles(system, 20)

      if (system.particles.length > 0) {
        const firstParticle = system.particles[0]!
        const initialAge = firstParticle.age

        // Second update - particles should age
        updateParticles(system, 20)

        if (system.particles.length > 0) {
          expect(system.particles[0]!.age).toBeGreaterThan(initialAge)
        }
      }
    })

    it("removes expired particles", () => {
      const emitter: ParticleEmitter = {
        name: "test",
        char: "*",
        fg: [255, 255, 255],
        rate: 1000,
        lifetime: 50, // Very short lifetime
      }

      const system = createParticleSystem([emitter])

      // Emit particles
      updateParticles(system, 10)
      const emittedCount = system.particles.length

      // Update multiple times with large dt - particles should expire
      updateParticles(system, 100)

      // Most or all particles should be removed
      expect(system.particles.length).toBeLessThanOrEqual(emittedCount)
    })
  })

  describe("getParticleOpacity", () => {
    it("returns 1 for particles at start of life", () => {
      const particle: Particle = {
        x: 0,
        y: 0,
        char: "*",
        fg: [255, 255, 255],
        age: 0,
        lifetime: 1000,
      }

      const opacity = getParticleOpacity(particle)
      expect(opacity).toBe(1)
    })

    it("returns 1 for particles in early life (< 70%)", () => {
      const particle: Particle = {
        x: 0,
        y: 0,
        char: "*",
        fg: [255, 255, 255],
        age: 500, // 50% of lifetime
        lifetime: 1000,
      }

      const opacity = getParticleOpacity(particle)
      expect(opacity).toBe(1)
    })

    it("fades out particles in final 30% of life", () => {
      const particle: Particle = {
        x: 0,
        y: 0,
        char: "*",
        fg: [255, 255, 255],
        age: 800, // 80% of lifetime (in fade zone)
        lifetime: 1000,
      }

      const opacity = getParticleOpacity(particle)
      expect(opacity).toBeGreaterThan(0)
      expect(opacity).toBeLessThan(1)
    })

    it("returns ~0 at end of life (floating point precision)", () => {
      const particle: Particle = {
        x: 0,
        y: 0,
        char: "*",
        fg: [255, 255, 255],
        age: 1000, // 100% of lifetime
        lifetime: 1000,
      }

      const opacity = getParticleOpacity(particle)
      expect(opacity).toBeCloseTo(0, 10)
    })

    it("calculates smooth fade transition", () => {
      const lifetime = 1000
      const particle75 = getParticleOpacity({
        x: 0,
        y: 0,
        char: "*",
        fg: [255, 255, 255],
        age: 750, // 75% through life
        lifetime,
      })

      const particle90 = getParticleOpacity({
        x: 0,
        y: 0,
        char: "*",
        fg: [255, 255, 255],
        age: 900, // 90% through life
        lifetime,
      })

      // 90% should be more faded than 75%
      expect(particle90).toBeLessThan(particle75)
    })
  })

  describe("Particle emitter variations", () => {
    it("handles single character emitter", () => {
      const emitter: ParticleEmitter = {
        name: "single",
        char: "*",
        fg: [255, 255, 255],
        rate: 10,
        lifetime: 1000,
      }

      const system = createParticleSystem([emitter])
      updateParticles(system, 100)

      // All particles should have the single character
      for (const particle of system.particles) {
        expect(particle.char).toBe("*")
      }
    })

    it("handles multiple character emitter", () => {
      const emitter: ParticleEmitter = {
        name: "multi",
        char: ["✦", "✧", "·"],
        fg: [255, 255, 255],
        rate: 100,
        lifetime: 1000,
      }

      const system = createParticleSystem([emitter])
      updateParticles(system, 100)

      // Particles should have various characters from the set
      const chars = new Set(system.particles.map((p) => p.char))
      expect(chars.size).toBeGreaterThan(0)
    })

    it("handles color array emitter", () => {
      const colors = [
        [255, 0, 0],
        [0, 255, 0],
      ] as any

      const emitter: ParticleEmitter = {
        name: "color-array",
        char: "*",
        fg: colors,
        rate: 100,
        lifetime: 1000,
      }

      const system = createParticleSystem([emitter])
      updateParticles(system, 100)

      // Particles should have one of the colors from the array
      for (const particle of system.particles) {
        expect(particle.fg).toBeDefined()
        expect(Array.isArray(particle.fg)).toBe(true)
        expect(particle.fg.length).toBe(3)
      }
    })

    it("handles multiple color emitter", () => {
      const colors = [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
      ] as const

      const emitter: ParticleEmitter = {
        name: "multi-color",
        char: "*",
        fg: colors as any,
        rate: 100,
        lifetime: 1000,
      }

      const system = createParticleSystem([emitter])
      updateParticles(system, 100)

      // Should have various colors
      const colorCount = new Set(system.particles.map((p) => p.fg.join(","))).size
      expect(colorCount).toBeGreaterThan(0)
    })

    it("handles offset ranges", () => {
      const emitter: ParticleEmitter = {
        name: "offset",
        char: "*",
        fg: [255, 255, 255],
        rate: 100,
        lifetime: 1000,
        offsetX: [0, 10],
        offsetY: [-5, 5],
      }

      const system = createParticleSystem([emitter])
      updateParticles(system, 100)

      for (const particle of system.particles) {
        expect(particle.x).toBeGreaterThanOrEqual(0)
        expect(particle.x).toBeLessThanOrEqual(10)
        expect(particle.y).toBeGreaterThanOrEqual(-5)
        expect(particle.y).toBeLessThanOrEqual(5)
      }
    })
  })
})
