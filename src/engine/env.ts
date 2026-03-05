import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { getTermlingsDir } from "./ipc.js"

export type EnvScope = "project" | "termlings"

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < 2) return trimmed

  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    const inner = trimmed.slice(1, -1)
    if (first === "\"") {
      return inner.replace(/\\(["\\$`])/g, "$1")
    }
    return inner
  }
  return trimmed
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) return null

  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed
  const equalsIndex = withoutExport.indexOf("=")
  if (equalsIndex <= 0) return null

  const key = withoutExport.slice(0, equalsIndex).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null

  const rawValue = withoutExport.slice(equalsIndex + 1)
  return { key, value: stripWrappingQuotes(rawValue) }
}

function formatEnvValue(value: string): string {
  const needsQuotes = /[\s#"'\\$`!]/.test(value)
  if (!needsQuotes) return value
  return `"${value.replace(/["\\$`]/g, "\\$&")}"`
}

export function termlingsEnvPath(): string {
  return join(getTermlingsDir(), ".env")
}

export function projectEnvPath(root = process.cwd()): string {
  return join(root, ".env")
}

export function loadTermlingsEnv(override = false): Record<string, string> {
  const path = termlingsEnvPath()
  if (!existsSync(path)) return {}

  let raw = ""
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    return {}
  }

  const loaded: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue

    loaded[parsed.key] = parsed.value
    if (override || !(parsed.key in process.env)) {
      process.env[parsed.key] = parsed.value
    }
  }

  return loaded
}

function writeEnvVarAtPath(path: string, key: string, value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Invalid environment variable name: ${key}`)
  }
  let content = ""
  if (existsSync(path)) {
    content = readFileSync(path, "utf8")
  }

  const line = `${key}=${formatEnvValue(value)}`
  const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`^${keyPattern}=.*$`, "m")

  if (regex.test(content)) {
    content = content.replace(regex, line)
  } else {
    if (content.length > 0 && !content.endsWith("\n")) {
      content += "\n"
    }
    content += line + "\n"
  }

  writeFileSync(path, content)
}

export function writeProjectEnvVar(key: string, value: string, root = process.cwd()): void {
  writeEnvVarAtPath(projectEnvPath(root), key, value)
}

export function writeTermlingsEnvVar(key: string, value: string): void {
  const termlingsDir = getTermlingsDir()
  mkdirSync(termlingsDir, { recursive: true })
  writeEnvVarAtPath(termlingsEnvPath(), key, value)
}

export function writeEnvVarForScope(key: string, value: string, scope: EnvScope): void {
  if (scope === "termlings") {
    writeTermlingsEnvVar(key, value)
    return
  }
  writeProjectEnvVar(key, value)
}
