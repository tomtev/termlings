/**
 * Browser runtime lifecycle management (agent-browser + Chrome CDP)
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { basename, join, resolve, sep } from "path"
import { getTermlingsDir } from "./ipc.js"
import type {
  BrowserConfig,
  ProcessState,
  ActivityLogEntry,
  ProfileReference,
  AgentBrowserState,
  AgentBrowserPresenceEndReason,
  AgentBrowserPresenceStatus,
} from "./browser-types.js"

/**
 * Get the browser directory (.termlings/browser)
 */
export function getTermlingsBrowserDir(): string {
  return join(getTermlingsDir(), "browser")
}

/**
 * Get the profile reference file path (.termlings/browser/profile.json)
 */
export function getProfileReferencePath(): string {
  return join(getTermlingsBrowserDir(), "profile.json")
}

/**
 * Get project root directory
 */
function getProjectRootDir(): string {
  return join(getTermlingsDir(), "..")
}

/**
 * Get project-specific profile name.
 * Includes a short hash to avoid collisions between same-named folders.
 */
function getProjectProfileName(): string {
  const projectDir = getProjectRootDir()
  const projectName = basename(projectDir) || "project"
  const safeName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "project"
  const hash = createHash("sha1").update(projectDir).digest("hex").slice(0, 10)
  return `${safeName}-${hash}`
}

/**
 * Get the actual browser profile directory (~/.termlings/chrome-profiles/<project-profile>)
 */
export function getBrowserProfileDir(): string {
  const profileName = getProjectProfileName()
  return join(process.env.HOME || "/tmp", ".termlings", "chrome-profiles", profileName)
}

/**
 * Get or create profile reference
 */
export function getOrCreateProfileReference(): ProfileReference {
  const refPath = getProfileReferencePath()
  const projectDir = getProjectRootDir()
  const projectName = basename(projectDir) || "project"
  const next: ProfileReference = {
    name: getProjectProfileName(),
    location: getBrowserProfileDir(),
    projectName,
    createdAt: Date.now(),
  }

  if (existsSync(refPath)) {
    try {
      const existing = JSON.parse(readFileSync(refPath, "utf8")) as Partial<ProfileReference>
      const merged: ProfileReference = {
        name: next.name,
        location: next.location,
        projectName: next.projectName,
        createdAt: typeof existing.createdAt === "number" ? existing.createdAt : next.createdAt,
        lastUsed: typeof existing.lastUsed === "number" ? existing.lastUsed : undefined,
      }
      writeFileSync(refPath, JSON.stringify(merged, null, 2) + "\n")
      return merged
    } catch {
      // Fall through to write new file below.
    }
  }

  writeFileSync(refPath, JSON.stringify(next, null, 2) + "\n")
  return next
}

/**
 * Update profile reference with last used timestamp
 */
export function updateProfileReference(): void {
  const ref = getOrCreateProfileReference()
  ref.lastUsed = Date.now()
  writeFileSync(getProfileReferencePath(), JSON.stringify(ref, null, 2) + "\n")
}

/**
 * Get the browser config file path
 */
export function getBrowserConfigPath(): string {
  return join(getTermlingsBrowserDir(), "config.json")
}

/**
 * Get the browser process state file path
 */
export function getProcessStatePath(): string {
  return join(getTermlingsBrowserDir(), "process.json")
}

export function getBrowserLifecycleLockPath(): string {
  return join(getTermlingsBrowserDir(), ".lifecycle.lock")
}

/**
 * Get browser history directory (.termlings/browser/history)
 */
export function getActivityHistoryDir(): string {
  return join(getTermlingsBrowserDir(), "history")
}

/**
 * Get browser per-agent history directory (.termlings/browser/history/agent)
 */
export function getAgentActivityHistoryDir(): string {
  return join(getActivityHistoryDir(), "agent")
}

/**
 * Get the browser activity history file path (global stream)
 */
export function getActivityHistoryPath(): string {
  return join(getActivityHistoryDir(), "all.jsonl")
}

function sanitizeHistoryKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown"
}

/**
 * Get the browser activity history file path for one agent.
 */
export function getAgentActivityHistoryPath(agentKey: string): string {
  return join(getAgentActivityHistoryDir(), `${sanitizeHistoryKey(agentKey)}.jsonl`)
}

/**
 * Default browser configuration.
 * Runtime start mode defaults to headed for human-in-loop visibility.
 */
export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  port: 9222,
  binaryPath: "google-chrome",
  autoStart: false,
  profilePath: getBrowserProfileDir(),
  timeout: 30000,
  startupTimeoutMs: 30000,
  startupAttempts: 3,
  startupPollMs: 250,
}

const AGENT_BROWSER_STATE_VERSION = 2
const DEFAULT_AGENT_BROWSER_STALE_MS = 300_000
const BROWSER_LIFECYCLE_LOCK_STALE_MS = 120_000
const BROWSER_LIFECYCLE_LOCK_WAIT_MS = 30_000

/**
 * Load or create browser configuration
 */
export function getBrowserConfig(): BrowserConfig {
  const configPath = getBrowserConfigPath()
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf8")
      const parsed = JSON.parse(content) as Partial<BrowserConfig>
      const resolved = {
        ...DEFAULT_BROWSER_CONFIG,
        ...parsed,
        profilePath: parsed.profilePath && parsed.profilePath.trim().length > 0
          ? parsed.profilePath
          : getBrowserProfileDir(),
      }
      assertSafeBrowserProfilePath(resolved.profilePath)
      return resolved
    } catch {
      return { ...DEFAULT_BROWSER_CONFIG, profilePath: getBrowserProfileDir() }
    }
  }
  const fallback = { ...DEFAULT_BROWSER_CONFIG, profilePath: getBrowserProfileDir() }
  assertSafeBrowserProfilePath(fallback.profilePath)
  return fallback
}

/**
 * Update browser configuration
 */
export function updateBrowserConfig(config: Partial<BrowserConfig>): BrowserConfig {
  const current = getBrowserConfig()
  const updated = {
    ...current,
    ...config,
    profilePath: config.profilePath && config.profilePath.trim().length > 0
      ? config.profilePath
      : current.profilePath,
  }
  assertSafeBrowserProfilePath(updated.profilePath)
  writeFileSync(getBrowserConfigPath(), JSON.stringify(updated, null, 2) + "\n")
  return updated
}

/**
 * Read current process state
 */
export function readProcessState(): ProcessState | null {
  const path = getProcessStatePath()
  if (!existsSync(path)) return null

  try {
    const content = readFileSync(path, "utf8")
    return JSON.parse(content) as ProcessState
  } catch {
    return null
  }
}

/**
 * Update process state file
 */
export function updateProcessState(state: ProcessState): void {
  writeFileSync(getProcessStatePath(), JSON.stringify(state, null, 2) + "\n")
}

/**
 * Check whether agent-browser is available on PATH.
 */
export function isAgentBrowserAvailable(): boolean {
  const proc = spawnSync("agent-browser", ["--version"], { stdio: "ignore" })
  return (proc.status ?? 1) === 0
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function fetchCdpVersion(port: number, timeoutMs: number = 2000): Promise<Record<string, unknown>> {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`CDP endpoint returned ${response.status}`)
  }
  return (await response.json()) as Record<string, unknown>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clampInt(input: unknown, fallback: number, min: number, max: number): number {
  const value = typeof input === "number" ? input : Number.parseInt(String(input ?? ""), 10)
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function getStartupConfig(config: BrowserConfig): { timeoutMs: number; attempts: number; pollMs: number } {
  const timeoutFromConfig = config.startupTimeoutMs ?? config.timeout
  return {
    timeoutMs: clampInt(timeoutFromConfig, 30000, 3000, 120000),
    attempts: clampInt(config.startupAttempts, 3, 1, 8),
    pollMs: clampInt(config.startupPollMs, 250, 80, 2000),
  }
}

function buildStoppedProcessState(port: number, profilePath?: string): ProcessState {
  return {
    pid: null,
    port,
    status: "stopped",
    startedAt: null,
    profilePath,
    mode: "cdp",
  }
}

interface BrowserLifecycleLockMetadata {
  pid: number
  createdAt: number
}

function readBrowserLifecycleLock(lockPath: string): BrowserLifecycleLockMetadata | null {
  if (!existsSync(lockPath)) return null
  try {
    const raw = readFileSync(lockPath, "utf8").trim()
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BrowserLifecycleLockMetadata>
    const pid = typeof parsed.pid === "number" ? parsed.pid : Number.parseInt(String(parsed.pid ?? ""), 10)
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0
    if (!Number.isFinite(pid) || pid <= 0) return null
    if (!Number.isFinite(createdAt) || createdAt <= 0) return null
    return { pid, createdAt }
  } catch {
    return null
  }
}

export async function runWithBrowserLifecycleLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockPath = getBrowserLifecycleLockPath()
  mkdirSync(getTermlingsBrowserDir(), { recursive: true })

  const startedAt = Date.now()
  let lockFd: number | null = null

  while (lockFd === null) {
    try {
      lockFd = openSync(lockPath, "wx")
      try {
        writeFileSync(lockFd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }) + "\n", "utf8")
      } catch (error) {
        try {
          closeSync(lockFd)
        } catch {}
        lockFd = null
        try {
          if (existsSync(lockPath)) unlinkSync(lockPath)
        } catch {}
        throw error
      }
      break
    } catch (error) {
      const maybeErr = error as NodeJS.ErrnoException
      if (maybeErr.code !== "EEXIST") throw error

      const metadata = readBrowserLifecycleLock(lockPath)
      const stale = !metadata
        || !isProcessAlive(metadata.pid)
        || Date.now() - metadata.createdAt > BROWSER_LIFECYCLE_LOCK_STALE_MS
      if (stale) {
        try {
          unlinkSync(lockPath)
        } catch {}
        continue
      }

      if (Date.now() - startedAt > BROWSER_LIFECYCLE_LOCK_WAIT_MS) {
        throw new Error("Timed out waiting for browser lifecycle lock")
      }
      await sleep(120)
    }
  }

  try {
    return await fn()
  } finally {
    try {
      if (lockFd !== null) closeSync(lockFd)
    } catch {}
    try {
      if (existsSync(lockPath)) unlinkSync(lockPath)
    } catch {}
  }
}

export function getBrowserStartupErrorLogPath(): string {
  return join(getTermlingsBrowserDir(), "startup-errors.jsonl")
}

export function parseSingletonLockPid(lockTarget: string): number | null {
  const match = lockTarget.match(/-(\d+)$/)
  if (!match) return null
  const pid = Number.parseInt(match[1]!, 10)
  if (!Number.isFinite(pid) || pid <= 0) return null
  return pid
}

function clearProfileSingletonLocks(profilePath: string): void {
  for (const fileName of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    const lockPath = join(profilePath, fileName)
    if (!existsSync(lockPath)) continue
    try {
      unlinkSync(lockPath)
    } catch {
      // ignore best-effort cleanup
    }
  }
}

function cleanupStaleProfileLocks(profilePath: string): void {
  const singletonLockPath = join(profilePath, "SingletonLock")
  if (!existsSync(singletonLockPath)) return

  let stale = false
  try {
    const target = readlinkSync(singletonLockPath)
    const pid = parseSingletonLockPid(target)
    if (pid && !isProcessAlive(pid)) {
      stale = true
    }
  } catch {
    // If we cannot parse lock ownership safely, leave it untouched.
  }

  if (stale) {
    clearProfileSingletonLocks(profilePath)
  }
}

function listPidsUsingProfile(profilePath: string): number[] {
  const normalized = profilePath.trim()
  if (!normalized) return []

  try {
    const proc = spawnSync("ps", ["-ax", "-o", "pid=,command="], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    })
    if ((proc.status ?? 1) !== 0 || !proc.stdout) return []

    const out = String(proc.stdout)
    const needle = `--user-data-dir=${normalized}`
    const pids = new Set<number>()

    for (const rawLine of out.split("\n")) {
      const line = rawLine.trim()
      if (!line || !line.includes(needle)) continue
      const match = line.match(/^(\d+)\s+/)
      if (!match) continue
      const pid = Number.parseInt(match[1] || "", 10)
      if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) continue
      pids.add(pid)
    }

    return Array.from(pids)
  } catch {
    return []
  }
}

async function terminateProcessesUsingProfile(profilePath: string): Promise<void> {
  const pids = listPidsUsingProfile(profilePath)
  if (pids.length <= 0) return
  for (const pid of pids) {
    await terminateProcess(pid, 1200)
  }
}

async function terminateProcess(pid: number, graceMs: number = 2500): Promise<void> {
  try {
    process.kill(pid, "SIGTERM")
  } catch {
    // ignore
  }

  const startedWait = Date.now()
  while (Date.now() - startedWait < graceMs) {
    if (!isProcessAlive(pid)) return
    await sleep(120)
  }

  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // ignore
    }
  }
}

async function waitForCdpReady(
  pid: number,
  port: number,
  timeoutMs: number,
  pollMs: number,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now()
  let lastError: unknown = null

  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) {
      throw new Error(`Chrome process exited before CDP was ready (pid ${pid}).`)
    }
    try {
      return await fetchCdpVersion(port, Math.min(2000, pollMs * 4))
    } catch (error) {
      lastError = error
    }
    await sleep(pollMs)
  }

  const detail = lastError instanceof Error
    ? lastError.message
    : lastError !== null
      ? String(lastError)
      : "timed out"
  throw new Error(`Timed out waiting for CDP on port ${port} after ${timeoutMs}ms (${detail})`)
}

function appendStartupFailureLog(entry: Record<string, unknown>): void {
  try {
    appendFileSync(getBrowserStartupErrorLogPath(), `${JSON.stringify(entry)}\n`, "utf8")
  } catch {
    // ignore logging failures
  }
}

/**
 * Find an available port (starting from basePort)
 */
async function findAvailablePort(basePort: number = 9222): Promise<number> {
  const net = await import("net")

  for (let port = basePort; port < basePort + 20; port++) {
    const server = net.createServer()

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject)
        server.listen(port, "127.0.0.1", () => {
          server.close()
          resolve()
        })
      })
      return port
    } catch {
      // Port in use, try next
    }
  }

  throw new Error(`Could not find available port in range ${basePort}-${basePort + 19}`)
}

function commandExists(command: string): boolean {
  const proc = spawnSync(command, ["--version"], { stdio: "ignore" })
  return (proc.status ?? 1) === 0
}

function resolveChromeBinary(preferredBinaryPath?: string): string {
  const preferred = (preferredBinaryPath || "").trim()
  if (preferred.length > 0 && preferred !== "google-chrome") {
    if (preferred.includes("/") || preferred.includes("\\")) {
      if (existsSync(preferred)) return preferred
    } else if (commandExists(preferred)) {
      return preferred
    }
  }

  const candidates: string[] = []

  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "google-chrome",
      "chromium",
      "chrome",
    )
  } else if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "chrome",
      "msedge",
    )
  } else {
    candidates.push(
      "google-chrome",
      "google-chrome-stable",
      "chromium-browser",
      "chromium",
      "chrome",
    )
  }

  for (const candidate of candidates) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (existsSync(candidate)) return candidate
      continue
    }
    if (commandExists(candidate)) return candidate
  }

  throw new Error(
    "No Chrome/Chromium binary found. Install Google Chrome (or Chromium) and/or set .termlings/browser/config.json -> binaryPath."
  )
}

function defaultBrowserProfileRoots(): string[] {
  const home = process.env.HOME || ""
  if (!home) return []

  if (process.platform === "darwin") {
    return [
      join(home, "Library", "Application Support", "Google", "Chrome"),
      join(home, "Library", "Application Support", "Chromium"),
    ]
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || ""
    return [
      join(localAppData, "Google", "Chrome", "User Data"),
      join(localAppData, "Chromium", "User Data"),
    ].filter((value) => value.trim().length > 0)
  }

  return [
    join(home, ".config", "google-chrome"),
    join(home, ".config", "chromium"),
  ]
}

export function isDefaultBrowserProfilePath(profilePath: string): boolean {
  const normalized = resolve(String(profilePath || "").trim())
  if (!normalized) return false
  return defaultBrowserProfileRoots().some((root) => {
    const resolvedRoot = resolve(root)
    return normalized === resolvedRoot || normalized.startsWith(`${resolvedRoot}${sep}`)
  })
}

export function assertSafeBrowserProfilePath(profilePath: string): void {
  const trimmed = String(profilePath || "").trim()
  if (!trimmed) {
    throw new Error("Browser profile path must not be empty")
  }
  if (isDefaultBrowserProfilePath(trimmed)) {
    throw new Error(
      `Refusing to use default Chrome/Chromium profile path: ${trimmed}. `
      + `Use the dedicated Termlings profile under ~/.termlings/chrome-profiles/.`
    )
  }
}

/**
 * Check if browser binary is available
 */
export function checkBinaryAvailable(binaryPath: string): boolean {
  try {
    const resolved = resolveChromeBinary(binaryPath)
    return resolved.length > 0
  } catch {
    return false
  }
}

/**
 * Initialize browser directories and configuration
 */
export async function initializeBrowserDirs(): Promise<void> {
  const baseDir = getTermlingsBrowserDir()
  mkdirSync(baseDir, { recursive: true })
  mkdirSync(getActivityHistoryDir(), { recursive: true })
  mkdirSync(getAgentActivityHistoryDir(), { recursive: true })
  mkdirSync(getAgentBrowserStateDir(), { recursive: true })

  const current = getBrowserConfig()
  assertSafeBrowserProfilePath(current.profilePath)
  mkdirSync(current.profilePath, { recursive: true })

  if (!existsSync(getBrowserConfigPath())) {
    updateBrowserConfig({})
  }

  getOrCreateProfileReference()
}

/**
 * Start headed Chrome with CDP enabled for this workspace.
 */
export async function startBrowser(options: { headless?: boolean } = {}): Promise<{ pid: number; port: number }> {
  return await runWithBrowserLifecycleLock(async () => {
    await initializeBrowserDirs()

    const config = getBrowserConfig()
    const startupConfig = getStartupConfig(config)

    const existing = readProcessState()
    if (existing && existing.status === "running" && existing.pid !== null) {
      const alive = isProcessAlive(existing.pid)
      if (alive) {
        try {
          const cdpInfo = await fetchCdpVersion(existing.port, 1500)
          updateProcessState({
            ...existing,
            cdpWsUrl: typeof cdpInfo.webSocketDebuggerUrl === "string"
              ? cdpInfo.webSocketDebuggerUrl
              : existing.cdpWsUrl,
            mode: "cdp",
            profilePath: existing.profilePath || config.profilePath,
          })
          return { pid: existing.pid, port: existing.port }
        } catch {
          await terminateProcess(existing.pid)
          updateProcessState(buildStoppedProcessState(existing.port, existing.profilePath || config.profilePath))
        }
      } else {
        updateProcessState(buildStoppedProcessState(existing.port, existing.profilePath || config.profilePath))
      }
    }

    if (!isAgentBrowserAvailable()) {
      throw new Error("agent-browser CLI is required. Install with: npm install -g agent-browser && agent-browser install")
    }

    const spawn = (await import("bun")).spawn
    const profilePath = config.profilePath && config.profilePath.trim().length > 0
      ? config.profilePath
      : getBrowserProfileDir()
    assertSafeBrowserProfilePath(profilePath)
    mkdirSync(profilePath, { recursive: true })
    await terminateProcessesUsingProfile(profilePath)
    cleanupStaleProfileLocks(profilePath)

    const binary = resolveChromeBinary(config.binaryPath)
    const headless = options.headless === true

    const failures: Array<Record<string, unknown>> = []
    for (let attempt = 1; attempt <= startupConfig.attempts; attempt++) {
      const portBase = config.port + ((attempt - 1) * 20)
      const availablePort = await findAvailablePort(portBase)
      const launchArgs = [
        `--remote-debugging-port=${availablePort}`,
        `--user-data-dir=${profilePath}`,
        "--profile-directory=Default",
        "--no-first-run",
        "--disable-search-engine-choice-screen",
        "--no-default-browser-check",
        ...(headless ? ["--headless=new", "--disable-gpu", "--hide-scrollbars"] : []),
        "about:blank",
      ]

      const proc = spawn([binary, ...launchArgs], {
        detached: true,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        env: {
          ...process.env,
        },
      })
      proc.unref()

      const pid = proc.pid
      updateProcessState({
        pid,
        port: availablePort,
        status: "starting",
        startedAt: null,
        profilePath,
        mode: "cdp",
      })

      try {
        const cdpInfo = await waitForCdpReady(pid, availablePort, startupConfig.timeoutMs, startupConfig.pollMs)
        updateProcessState({
          pid,
          port: availablePort,
          status: "running",
          startedAt: Date.now(),
          url: `http://127.0.0.1:${availablePort}`,
          cdpWsUrl: typeof cdpInfo.webSocketDebuggerUrl === "string" ? cdpInfo.webSocketDebuggerUrl : undefined,
          profilePath,
          mode: "cdp",
        })

        updateProfileReference()

        return { pid, port: availablePort }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const entry: Record<string, unknown> = {
          ts: Date.now(),
          attempt,
          attempts: startupConfig.attempts,
          timeoutMs: startupConfig.timeoutMs,
          pollMs: startupConfig.pollMs,
          pid,
          port: availablePort,
          profilePath,
          binary,
          headless,
          error: errorMessage,
        }
        failures.push(entry)
        appendStartupFailureLog(entry)

        await terminateProcess(pid)
        cleanupStaleProfileLocks(profilePath)

        if (attempt < startupConfig.attempts) {
          await sleep(Math.min(1000, 200 * attempt))
        }
      }
    }

    updateProcessState(buildStoppedProcessState(config.port, profilePath))
    const lastFailure = failures[failures.length - 1]
    const lastError = typeof lastFailure?.error === "string" ? lastFailure.error : "unknown startup error"
    throw new Error(
      `Chrome CDP did not become ready after ${startupConfig.attempts} attempt(s). `
      + `Last error: ${lastError}. `
      + `See ${getBrowserStartupErrorLogPath()} for diagnostics.`
    )
  })
}

/**
 * Stop Chrome CDP browser process
 */
export async function stopBrowser(): Promise<void> {
  await runWithBrowserLifecycleLock(async () => {
    const state = readProcessState()
    if (!state || !state.pid) return

    const pid = state.pid
    const profilePath = state.profilePath

    await terminateProcess(pid, 3000)

    if (profilePath) {
      cleanupStaleProfileLocks(profilePath)
    }

    updateProcessState(buildStoppedProcessState(state.port, state.profilePath))
    closeActiveAgentBrowserStates("closed")
  })
}

/**
 * Check if browser is currently running
 */
export async function isBrowserRunning(): Promise<boolean> {
  const state = readProcessState()
  if (!state || state.status !== "running" || !state.pid) return false
  if (!isProcessAlive(state.pid)) return false

  try {
    await fetchCdpVersion(state.port, 1500)
    return true
  } catch {
    return false
  }
}

export async function waitForBrowserReady(timeoutMs: number = 6000, pollMs: number = 150): Promise<ProcessState | null> {
  const startedAt = Date.now()
  const interval = Math.max(50, pollMs)
  const minimumWaitMs = Math.min(timeoutMs, 800)

  while (Date.now() - startedAt <= timeoutMs) {
    const state = readProcessState()
    if (state && state.status === "running" && state.pid && isProcessAlive(state.pid)) {
      try {
        await fetchCdpVersion(state.port, Math.min(1500, interval * 4))
        return state
      } catch {
        // keep polling
      }
    }

    if (state && state.status === "starting" && state.pid && isProcessAlive(state.pid)) {
      try {
        const cdpInfo = await fetchCdpVersion(state.port, Math.min(1500, interval * 4))
        const runningState: ProcessState = {
          ...state,
          status: "running",
          startedAt: state.startedAt ?? Date.now(),
          url: state.url || `http://127.0.0.1:${state.port}`,
          cdpWsUrl: typeof cdpInfo.webSocketDebuggerUrl === "string" ? cdpInfo.webSocketDebuggerUrl : state.cdpWsUrl,
        }
        updateProcessState(runningState)
        return runningState
      } catch {
        // keep polling
      }
    }

    const lifecycleLockActive = existsSync(getBrowserLifecycleLockPath())
    const stillStarting = state?.status === "starting"
    if (!lifecycleLockActive && !stillStarting && Date.now() - startedAt >= minimumWaitMs) {
      return null
    }

    await sleep(interval)
  }

  return null
}

/**
 * Get the directory for per-agent browser state files
 */
function getAgentBrowserStateDir(): string {
  return join(getTermlingsBrowserDir(), "agents")
}

function agentBrowserStatePath(sessionId: string): string {
  return join(getAgentBrowserStateDir(), `${sessionId}.json`)
}

function extractTabIdFromArgs(args: unknown[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    if (typeof token !== "string") continue
    const trimmed = token.trim()
    if (!trimmed) continue

    if (trimmed.startsWith("--tab=")) {
      const candidate = trimmed.slice("--tab=".length).trim()
      if (candidate) return candidate
      continue
    }
    if (trimmed === "--tab" && i + 1 < args.length) {
      const next = args[i + 1]
      if (typeof next === "string") {
        const candidate = next.trim()
        if (candidate) return candidate
      }
    }
  }
  return undefined
}

function isPresenceStatus(value: unknown): value is AgentBrowserPresenceStatus {
  return value === "active" || value === "idle" || value === "closed"
}

function isPresenceEndReason(value: unknown): value is AgentBrowserPresenceEndReason {
  return value === "idle" || value === "closed"
}

function normalizeAgentBrowserState(raw: unknown, sessionId: string, now = Date.now()): AgentBrowserState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const data = raw as Record<string, unknown>
  const lastActionAt = typeof data.lastActionAt === "number" && Number.isFinite(data.lastActionAt)
    ? data.lastActionAt
    : now
  const lastSeenAt = typeof data.lastSeenAt === "number" && Number.isFinite(data.lastSeenAt)
    ? data.lastSeenAt
    : lastActionAt
  const startedAt = typeof data.startedAt === "number" && Number.isFinite(data.startedAt)
    ? data.startedAt
    : lastSeenAt
  const endedAt = typeof data.endedAt === "number" && Number.isFinite(data.endedAt)
    ? data.endedAt
    : undefined
  const idleAt = typeof data.idleAt === "number" && Number.isFinite(data.idleAt)
    ? data.idleAt
    : undefined
  const status = isPresenceStatus(data.status)
    ? data.status
    : (data.active === false || endedAt
        ? ((isPresenceEndReason(data.endReason) ? data.endReason : idleAt ? "idle" : "closed") as AgentBrowserPresenceStatus)
        : "active")
  const active = typeof data.active === "boolean" ? data.active : status === "active"

  return {
    sessionId,
    agentName: typeof data.agentName === "string" ? data.agentName : undefined,
    agentSlug: typeof data.agentSlug === "string" ? data.agentSlug : undefined,
    agentDna: typeof data.agentDna === "string" ? data.agentDna : undefined,
    tabId: typeof data.tabId === "string" ? data.tabId : undefined,
    url: typeof data.url === "string" ? data.url : undefined,
    status,
    active,
    startedAt,
    lastSeenAt,
    lastAction: typeof data.lastAction === "string" && data.lastAction.trim().length > 0
      ? data.lastAction
      : "unknown",
    lastActionAt,
    idleAt,
    endedAt,
    endReason: isPresenceEndReason(data.endReason) ? data.endReason : undefined,
  }
}

function writeAgentBrowserState(state: AgentBrowserState): void {
  mkdirSync(getAgentBrowserStateDir(), { recursive: true })
  writeFileSync(agentBrowserStatePath(state.sessionId), JSON.stringify({
    version: AGENT_BROWSER_STATE_VERSION,
    ...state,
  }, null, 2) + "\n")
}

function readAgentBrowserState(sessionId: string): AgentBrowserState | null {
  const path = agentBrowserStatePath(sessionId)
  if (!existsSync(path)) return null
  try {
    return normalizeAgentBrowserState(JSON.parse(readFileSync(path, "utf-8")), sessionId)
  } catch {
    return null
  }
}

function appendBrowserActivityEntry(entry: ActivityLogEntry): void {
  try {
    mkdirSync(getActivityHistoryDir(), { recursive: true })
    mkdirSync(getAgentActivityHistoryDir(), { recursive: true })
  } catch {
    // Ignore; append calls below will handle failures.
  }

  try {
    appendFileSync(getActivityHistoryPath(), JSON.stringify(entry) + "\n")
  } catch {
    // Ignore logging errors
  }

  const agentKey = entry.agentSlug?.trim()
    || entry.sessionId?.trim()
    || entry.agentName?.trim()
    || "unknown"
  try {
    appendFileSync(getAgentActivityHistoryPath(agentKey), JSON.stringify(entry) + "\n")
  } catch {
    // Ignore logging errors
  }
}

function emitBrowserPresenceEvent(
  state: Pick<AgentBrowserState, "sessionId" | "agentName" | "agentSlug" | "agentDna">,
  phase: AgentBrowserPresenceEndReason | "opened",
  ts: number,
): void {
  appendBrowserActivityEntry({
    ts,
    sessionId: state.sessionId,
    agentName: state.agentName,
    agentSlug: state.agentSlug,
    agentDna: state.agentDna,
    command: `presence-${phase}`,
    args: [],
    result: "success",
  })
}

function resolveSessionBrowserTabId(sessionId: string): string | undefined {
  const fromAgentState = readAgentBrowserState(sessionId)?.tabId?.trim()
  if (fromAgentState) {
    return fromAgentState
  }

  const ownersPath = join(getTermlingsBrowserDir(), "tab-owners.json")
  if (!existsSync(ownersPath)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(ownersPath, "utf8")) as {
      owners?: Record<string, { tabId?: string; sessionId?: string }>
    }
    const owners = parsed.owners || {}
    const ownerKey = `session:${sessionId}`
    const direct = owners[ownerKey]?.tabId?.trim()
    if (direct) {
      return direct
    }
    for (const owner of Object.values(owners)) {
      const candidateSessionId = (owner?.sessionId || "").trim()
      const candidateTabId = (owner?.tabId || "").trim()
      if (candidateSessionId === sessionId && candidateTabId) {
        return candidateTabId
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

/**
 * Update the per-agent browser state file
 * Written on every browser command so the workspace knows which agent is using the browser
 */
export function updateAgentBrowserState(command: string, args: unknown[] = [], tabId?: string): void {
  const sessionId = process.env.TERMLINGS_SESSION_ID
  if (!sessionId) return

  try {
    mkdirSync(getAgentBrowserStateDir(), { recursive: true })
  } catch {
    return
  }

  let url: string | undefined
  if (command === "navigate" && args[0] && typeof args[0] === "string") {
    url = args[0]
  }

  const now = Date.now()
  const existing = readAgentBrowserState(sessionId)
  const isResumed = !existing || existing.active !== true || existing.status !== "active"

  const state: AgentBrowserState = {
    sessionId,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
    tabId: (tabId || extractTabIdFromArgs(args) || "").trim() || existing?.tabId || undefined,
    url,
    status: "active",
    active: true,
    startedAt: isResumed ? now : (existing?.startedAt || now),
    lastSeenAt: now,
    lastAction: command,
    lastActionAt: now,
    idleAt: undefined,
    endedAt: undefined,
    endReason: undefined,
  }

  if (!state.agentSlug) {
    try {
      const agentsDir = join(getTermlingsDir(), "agents")
      if (existsSync(agentsDir)) {
        const slugs = readdirSync(agentsDir)
        for (const slug of slugs) {
          const soulPath = join(agentsDir, slug, "SOUL.md")
          if (existsSync(soulPath)) {
            const content = readFileSync(soulPath, "utf-8")
            const dnaMatch = content.match(/dna:\s*"?([a-f0-9]+)"?/i)
            if (dnaMatch && dnaMatch[1] === state.agentDna) {
              state.agentSlug = slug
              break
            }
          }
        }
      }
    } catch {
      // Ignore slug resolution errors
    }
  }

  if (!url) {
    state.url = existing?.url
  }

  try {
    writeAgentBrowserState(state)
    if (isResumed) {
      emitBrowserPresenceEvent(state, "opened", now)
    }
  } catch {
    // Ignore write errors
  }
}

/**
 * Read all active agent browser states
 * Returns agents that have used the browser recently (within staleness window)
 */
export function syncAgentBrowserPresence(stalenessMs: number = DEFAULT_AGENT_BROWSER_STALE_MS): AgentBrowserState[] {
  const dir = getAgentBrowserStateDir()
  if (!existsSync(dir)) return []

  const results: AgentBrowserState[] = []
  const now = Date.now()

  try {
    const files = readdirSync(dir).filter((f: string) => f.endsWith(".json"))
    for (const file of files) {
      const sessionId = file.replace(/\.json$/i, "")
      if (!sessionId) continue
      try {
        const content = readFileSync(join(dir, file), "utf-8")
        const state = normalizeAgentBrowserState(JSON.parse(content), sessionId, now)
        if (!state) continue

        if (state.active && now - state.lastSeenAt >= stalenessMs) {
          state.active = false
          state.status = "idle"
          state.idleAt = now
          state.endedAt = now
          state.endReason = "idle"
          writeAgentBrowserState(state)
          emitBrowserPresenceEvent(state, "idle", now)
        }
        results.push(state)
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Ignore
  }

  return results.sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

export function readAgentBrowserStates(stalenessMs: number = DEFAULT_AGENT_BROWSER_STALE_MS): AgentBrowserState[] {
  return syncAgentBrowserPresence(stalenessMs).filter((state) => state.active)
}

export function readAllAgentBrowserStates(stalenessMs: number = DEFAULT_AGENT_BROWSER_STALE_MS): AgentBrowserState[] {
  return syncAgentBrowserPresence(stalenessMs)
}

export function closeActiveAgentBrowserStates(reason: AgentBrowserPresenceEndReason = "closed"): AgentBrowserState[] {
  const states = syncAgentBrowserPresence()
  const now = Date.now()
  const closed: AgentBrowserState[] = []

  for (const state of states) {
    if (!state.active) continue
    state.active = false
    state.status = "closed"
    state.endedAt = now
    state.idleAt = undefined
    state.endReason = reason
    writeAgentBrowserState(state)
    emitBrowserPresenceEvent(state, reason, now)
    closed.push(state)
  }

  return closed
}

/**
 * Log browser activity to history
 */
export function logBrowserActivity(
  command: string,
  args: unknown[] = [],
  result: "success" | "error" | "timeout" = "success",
  error?: string,
  tabId?: string
): void {
  syncAgentBrowserPresence()

  const entry: ActivityLogEntry = {
    ts: Date.now(),
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
    command,
    args,
    result,
    error,
  }

  appendBrowserActivityEntry(entry)

  if (result === "success") {
    updateAgentBrowserState(command, args, tabId)
  }
}

/**
 * Request human operator intervention via message command
 * Sends message to operator through IPC
 */
export async function requestOperatorIntervention(message: string, explicitTabId?: string): Promise<void> {
  const agentName = process.env.TERMLINGS_AGENT_NAME || "Agent"
  const sessionId = (process.env.TERMLINGS_SESSION_ID || "").trim()
  const resolvedTabId = (explicitTabId || "").trim() || (sessionId ? resolveSessionBrowserTabId(sessionId) : undefined)

  logBrowserActivity(
    "request-help",
    resolvedTabId ? [message, `--tab=${resolvedTabId}`] : [message],
    "success",
    undefined,
    resolvedTabId,
  )

  const tabLine = resolvedTabId ? `Tab: \`${resolvedTabId}\`\n\n` : ""
  const runLine = resolvedTabId
    ? `Run: \`termlings browser tabs list\` or use \`--tab ${resolvedTabId}\` with browser commands`
    : "Run: `termlings browser` commands to interact"
  const formattedMessage = `🔔 **Browser needs your help** (${agentName})\n\n${tabLine}${message}\n\n${runLine}`

  const { spawn } = await import("bun")

  try {
    spawn(["termlings", "message", "human:default", formattedMessage], {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "ignore"],
    })

    await new Promise((resolve) => setTimeout(resolve, 500))

    console.log(`✓ Operator notified: ${message}`)
    console.log("\nWaiting for operator to interact with browser...")
    if (resolvedTabId) {
      console.log(`Operator can run: termlings browser tabs list, then use --tab ${resolvedTabId}`)
    } else {
      console.log("Operator can run: termlings browser tabs list (then use --tab with navigate/screenshot/type/click/extract)")
    }
  } catch (e) {
    console.error(`Could not notify operator: ${e}`)
  }
}

/**
 * Detect if page requires login
 * Looks for common login indicators
 */
export async function checkIfLoginRequired(
  client: { extractText: (options?: { tabId?: string }) => Promise<string> },
  tabId?: string
): Promise<boolean> {
  try {
    const text = await client.extractText({ tabId })
    const loginIndicators = [
      /login/i,
      /sign in/i,
      /authenticate/i,
      /password/i,
      /username/i,
      /email.*password/i,
    ]

    return loginIndicators.some((indicator) => indicator.test(text))
  } catch (error) {
    throw new Error(`Could not check login status: ${error}`)
  }
}
