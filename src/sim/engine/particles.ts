import type { RGB } from "./types.js"

export interface Particle {
  x: number           // relative to object position
  y: number
  char: string
  fg: RGB
  age: number         // in milliseconds
  lifetime: number    // how long particle lives
}

export interface ParticleEmitter {
  name: string
  char: string | string[]    // character(s) to emit (randomly selected)
  fg: RGB | RGB[]            // color(s)
  rate: number               // particles per second
  lifetime: number           // milliseconds each particle lives
  offsetX?: [number, number] // x range relative to object
  offsetY?: [number, number] // y range relative to object
  width?: number             // object width (for bounds)
  height?: number            // object height (for bounds)
}

export interface ObjectWithParticles {
  particles: Particle[]
  emitters: ParticleEmitter[]
  lastEmitTick: Record<string, number> // per-emitter last emit time
}

/**
 * Create a particle system for an object
 */
export function createParticleSystem(emitters: ParticleEmitter[]): ObjectWithParticles {
  return {
    particles: [],
    emitters,
    lastEmitTick: Object.fromEntries(emitters.map((e, i) => [i.toString(), 0]))
  }
}

/**
 * Update particles: emit new ones, age existing ones, remove expired
 */
export function updateParticles(system: ObjectWithParticles, dt: number): void {
  if (!system.emitters || system.emitters.length === 0) return

  const now = Date.now()

  // Emit new particles
  for (let i = 0; i < system.emitters.length; i++) {
    const emitter = system.emitters[i]!
    const lastEmit = system.lastEmitTick[i.toString()] || 0
    const timeSinceEmit = now - lastEmit
    const emitInterval = 1000 / emitter.rate // ms per particle

    if (timeSinceEmit >= emitInterval) {
      // Emit one particle
      const char = Array.isArray(emitter.char)
        ? emitter.char[Math.floor(Math.random() * emitter.char.length)]!
        : emitter.char

      const fg = Array.isArray(emitter.fg)
        ? emitter.fg[Math.floor(Math.random() * emitter.fg.length)]!
        : emitter.fg

      const offsetX = emitter.offsetX
        ? emitter.offsetX[0] + Math.random() * (emitter.offsetX[1] - emitter.offsetX[0])
        : 0

      const offsetY = emitter.offsetY
        ? emitter.offsetY[0] + Math.random() * (emitter.offsetY[1] - emitter.offsetY[0])
        : 0

      system.particles.push({
        x: offsetX,
        y: offsetY,
        char,
        fg,
        age: 0,
        lifetime: emitter.lifetime
      })

      system.lastEmitTick[i.toString()] = now
    }
  }

  // Age and filter particles
  system.particles = system.particles
    .map(p => ({ ...p, age: p.age + dt }))
    .filter(p => p.age < p.lifetime)
}

/**
 * Get opacity/alpha for a particle based on age (fade in/out)
 */
export function getParticleOpacity(particle: Particle): number {
  const progress = particle.age / particle.lifetime
  // Fade out in the last 30% of lifetime
  if (progress > 0.7) {
    return 1 - (progress - 0.7) / 0.3
  }
  return 1
}
