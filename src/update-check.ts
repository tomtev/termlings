import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"

const PACKAGE_NAME = "termlings"
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 1_800
const CACHE_PATH = join(homedir(), ".termlings", "cache", "update-check.json")
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g

interface UpdateCache {
  checkedAt: number
  latestVersion: string
  skippedVersion?: string
}

export interface UpdateNotice {
  currentVersion: string
  latestVersion: string
  recommendedUpgradeCommand: string
  secondaryUpgradeCommand?: string
  bannerText: string
}

interface UpdateCheckOptions {
  command?: string
  flags?: Set<string>
  now?: number
  timeoutMs?: number
}

let memoryCache: UpdateCache | null = null
let inflight: Promise<UpdateNotice | null> | null = null
let lastPrintedKey: string | null = null

function readCurrentVersion(): string | null {
  try {
    const packageFile = new URL("../package.json", import.meta.url)
    const parsed = JSON.parse(readFileSync(packageFile, "utf8")) as { version?: unknown }
    return typeof parsed.version === "string" ? parsed.version : null
  } catch {
    return null
  }
}

function parseVersion(version: string): [number, number, number] | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return latest.trim() !== current.trim()

  for (let i = 0; i < a.length; i++) {
    if (a[i]! > b[i]!) return true
    if (a[i]! < b[i]!) return false
  }
  return false
}

function shouldSkipCheck(options: UpdateCheckOptions): boolean {
  if (process.env.TERMLINGS_NO_UPDATE_CHECK === "1") return true
  if (process.env.CI === "1" || process.env.CI === "true") return true
  if (process.env.NODE_ENV === "test") return true

  const flags = options.flags
  if (flags?.has("help") || flags?.has("h")) return true
  if (!process.stdout.isTTY && !process.stderr.isTTY) return true

  if (options.command === "scheduler" && (flags?.has("daemon") || flags?.has("d"))) {
    return true
  }

  return false
}

function readDiskCache(): UpdateCache | null {
  if (!existsSync(CACHE_PATH)) return null
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Partial<UpdateCache>
    if (typeof parsed.checkedAt !== "number" || typeof parsed.latestVersion !== "string") return null
    return {
      checkedAt: parsed.checkedAt,
      latestVersion: parsed.latestVersion,
      skippedVersion: typeof parsed.skippedVersion === "string" ? parsed.skippedVersion : undefined,
    }
  } catch {
    return null
  }
}

function writeDiskCache(cache: UpdateCache): void {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true })
    writeFileSync(CACHE_PATH, `${JSON.stringify(cache)}\n`, "utf8")
  } catch {
    // Ignore cache write failures to avoid breaking commands.
  }
}

export function writeSkippedVersion(version: string): void {
  const existing = readDiskCache()
  const cache: UpdateCache = existing
    ? { ...existing, skippedVersion: version }
    : { checkedAt: Date.now(), latestVersion: version, skippedVersion: version }
  writeDiskCache(cache)
}

export function readSkippedVersion(): string | undefined {
  return readDiskCache()?.skippedVersion
}

async function fetchLatestVersion(timeoutMs: number): Promise<string | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(REGISTRY_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    if (!response.ok) return null
    const parsed = await response.json() as { version?: unknown }
    return typeof parsed.version === "string" ? parsed.version : null
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

async function resolveLatestVersion(now: number, timeoutMs: number): Promise<string | null> {
  if (memoryCache && now - memoryCache.checkedAt < CACHE_TTL_MS) {
    return memoryCache.latestVersion
  }

  const diskCache = readDiskCache()
  if (diskCache && now - diskCache.checkedAt < CACHE_TTL_MS) {
    memoryCache = diskCache
    return diskCache.latestVersion
  }

  const fetched = await fetchLatestVersion(timeoutMs)
  if (fetched) {
    const cache = { checkedAt: now, latestVersion: fetched }
    memoryCache = cache
    writeDiskCache(cache)
    return fetched
  }

  if (diskCache) {
    memoryCache = diskCache
    return diskCache.latestVersion
  }

  return null
}

function detectPackageManager(): "bun" | "pnpm" | "yarn" | "npm" {
  const userAgent = (process.env.npm_config_user_agent || "").toLowerCase()
  if (userAgent.includes("bun/")) return "bun"
  if (userAgent.includes("pnpm/")) return "pnpm"
  if (userAgent.includes("yarn/")) return "yarn"
  return "npm"
}

function getUpgradeCommands(): { primary: string; secondary?: string } {
  const pm = detectPackageManager()
  if (pm === "bun") {
    return {
      primary: "bun add -g termlings@latest",
      secondary: "npm install -g termlings@latest",
    }
  }
  if (pm === "pnpm") {
    return {
      primary: "pnpm add -g termlings@latest",
      secondary: "npm install -g termlings@latest",
    }
  }
  if (pm === "yarn") {
    return {
      primary: "yarn global add termlings@latest",
      secondary: "npm install -g termlings@latest",
    }
  }
  return {
    primary: "npm install -g termlings@latest",
    secondary: "bun add -g termlings@latest",
  }
}

export async function getUpdateNotice(options: UpdateCheckOptions = {}): Promise<UpdateNotice | null> {
  if (shouldSkipCheck(options)) return null

  if (inflight) return inflight

  inflight = (async () => {
    const now = options.now ?? Date.now()
    const currentVersion = readCurrentVersion()
    if (!currentVersion) return null

    const latestVersion = await resolveLatestVersion(now, options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    if (!latestVersion) return null
    if (!isNewerVersion(latestVersion, currentVersion)) return null

    const skipped = readSkippedVersion()
    if (skipped && latestVersion === skipped) return null

    const upgrade = getUpgradeCommands()
    return {
      currentVersion,
      latestVersion,
      recommendedUpgradeCommand: upgrade.primary,
      secondaryUpgradeCommand: upgrade.secondary,
      bannerText: `Update available ${currentVersion} -> ${latestVersion}. Upgrade: ${upgrade.primary}`,
    }
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, "")
}

export function printUpdateNotice(notice: UpdateNotice): void {
  const noticeKey = `${notice.currentVersion}->${notice.latestVersion}`
  if (lastPrintedKey === noticeKey) return
  lastPrintedKey = noticeKey

  const supportsColor = Boolean(process.stderr.isTTY) && !process.env.NO_COLOR
  if (!supportsColor) {
    console.error(`[termlings] Update available ${notice.currentVersion} -> ${notice.latestVersion}`)
    console.error(`[termlings] Upgrade: ${notice.recommendedUpgradeCommand}`)
    if (notice.secondaryUpgradeCommand) {
      console.error(`[termlings] Alternative: ${notice.secondaryUpgradeCommand}`)
    }
    return
  }

  const reset = "\x1b[0m"
  const bold = "\x1b[1m"
  const muted = "\x1b[38;5;245m"
  const info = "\x1b[38;5;117m"
  const current = "\x1b[38;5;181m"
  const latest = "\x1b[38;5;121m"
  const command = "\x1b[38;5;228m"

  console.error("")
  console.error(`${info}${bold}termlings update${reset}`)
  console.error(`  ${muted}available:${reset} ${current}${notice.currentVersion}${reset} -> ${latest}${notice.latestVersion}${reset}`)
  console.error(`  ${muted}upgrade:  ${reset} ${command}${bold}${notice.recommendedUpgradeCommand}${reset}`)
  if (notice.secondaryUpgradeCommand) {
    console.error(`  ${muted}alt:      ${reset} ${command}${stripAnsi(notice.secondaryUpgradeCommand)}${reset}`)
  }
  console.error(`  ${muted}disable:  TERMLINGS_NO_UPDATE_CHECK=1${reset}`)
  console.error("")
}
