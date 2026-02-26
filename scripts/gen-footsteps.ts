// Generate stereo footstep WAV files with pan positions
import { writeFileSync, mkdirSync, existsSync } from "fs"

const SAMPLE_RATE = 22050
const outDir = "assets/sfx"

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

function writeStereoWav(path: string, mono: Float64Array, pan: number) {
  // pan: 0.0 = hard left, 0.5 = center, 1.0 = hard right
  const numSamples = mono.length
  const numChannels = 2
  const bitsPerSample = 16
  const byteRate = SAMPLE_RATE * numChannels * 2
  const dataSize = numSamples * numChannels * 2
  const fileSize = 44 + dataSize - 8

  // Equal-power panning
  const angle = pan * Math.PI / 2
  const gainL = Math.cos(angle)
  const gainR = Math.sin(angle)

  const buf = Buffer.alloc(44 + dataSize)
  buf.write("RIFF", 0)
  buf.writeUInt32LE(fileSize, 4)
  buf.write("WAVE", 8)
  buf.write("fmt ", 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)              // PCM
  buf.writeUInt16LE(numChannels, 22)    // stereo
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(byteRate, 28)
  buf.writeUInt16LE(numChannels * 2, 32)
  buf.writeUInt16LE(bitsPerSample, 34)
  buf.write("data", 36)
  buf.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]!))
    const L = Math.round(s * gainL * 32767)
    const R = Math.round(s * gainR * 32767)
    const off = 44 + i * 4
    buf.writeInt16LE(L, off)
    buf.writeInt16LE(R, off + 2)
  }

  writeFileSync(path, buf)
}

function generateFootstep(seed: number, durationMs: number, pitchHz: number, noiseAmount: number): Float64Array {
  const len = Math.floor(SAMPLE_RATE * durationMs / 1000)
  const samples = new Float64Array(len)

  let h = seed
  const rng = () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
    h = (h ^ (h >>> 13)) >>> 0
    return (h / 0x100000000) * 2 - 1
  }

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE
    const env = Math.exp(-t * (1000 / durationMs) * 5)
    const thump = Math.sin(2 * Math.PI * pitchHz * t) * Math.exp(-t * 30)
    const crunch = rng() * noiseAmount * Math.exp(-t * 50)
    const click = Math.sin(2 * Math.PI * 800 * t) * Math.exp(-t * 200)
    samples[i] = (thump * 0.6 + crunch * 0.3 + click * 0.15) * env * 0.8
  }

  return samples
}

// 4 step variations
const variations = [
  { seed: 1, duration: 80, pitch: 120, noise: 0.5 },
  { seed: 2, duration: 70, pitch: 140, noise: 0.6 },
  { seed: 3, duration: 90, pitch: 110, noise: 0.4 },
  { seed: 4, duration: 75, pitch: 130, noise: 0.55 },
]

// 5 pan positions: 0=left, 25=left-center, 50=center, 75=right-center, 100=right
const panLevels = [0, 25, 50, 75, 100]

let fileCount = 0
for (let i = 0; i < variations.length; i++) {
  const v = variations[i]!
  const mono = generateFootstep(v.seed, v.duration, v.pitch, v.noise)

  for (const p of panLevels) {
    const pan = p / 100
    writeStereoWav(`${outDir}/step${i + 1}_p${p}.wav`, mono, pan)
    fileCount++
  }
}

console.log(`Generated ${fileCount} stereo WAV files in ${outDir}/`)
