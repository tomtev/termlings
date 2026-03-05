import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync } from "fs"

export function parseJsonLines<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return []
  try {
    const raw = readFileSync(filePath, "utf8")
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as T)
  } catch {
    return []
  }
}

export function readLastJsonLines<T>(filePath: string, limit: number): T[] {
  if (!existsSync(filePath)) return []
  if (!Number.isFinite(limit) || limit <= 0) return []

  let fd: number | null = null
  try {
    fd = openSync(filePath, "r")
    const stats = fstatSync(fd)
    if (stats.size <= 0) return []

    const out: T[] = []
    const chunkSize = 64 * 1024
    const buffer = Buffer.allocUnsafe(chunkSize)
    let position = stats.size
    let remainder = ""

    while (position > 0 && out.length < limit) {
      const nextPosition = Math.max(0, position - chunkSize)
      const bytesToRead = position - nextPosition
      const bytesRead = readSync(fd, buffer, 0, bytesToRead, nextPosition)
      if (bytesRead <= 0) break

      position = nextPosition
      const chunk = buffer.toString("utf8", 0, bytesRead)
      const text = `${chunk}${remainder}`
      const lines = text.split("\n")
      remainder = lines.shift() ?? ""

      for (let index = lines.length - 1; index >= 0 && out.length < limit; index -= 1) {
        const line = lines[index]?.trim()
        if (!line) continue
        try {
          out.push(JSON.parse(line) as T)
        } catch {
          // Ignore malformed lines in append-only logs.
        }
      }
    }

    const trailing = remainder.trim()
    if (out.length < limit && trailing) {
      try {
        out.push(JSON.parse(trailing) as T)
      } catch {
        // Ignore malformed tail line.
      }
    }

    out.reverse()
    return out
  } catch {
    return []
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {}
    }
  }
}
