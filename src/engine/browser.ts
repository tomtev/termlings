/**
 * Browser runtime lifecycle management (agent-browser + Chrome CDP)
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { basename, dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { getTermlingsDir } from "./ipc.js"
import type { BrowserConfig, ProcessState, ActivityLogEntry, ProfileReference, AgentBrowserState } from "./browser-types.js"

const ENGINE_FILE_PATH = fileURLToPath(import.meta.url)
const ENGINE_DIR = dirname(ENGINE_FILE_PATH)

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

interface CursorWatcherState {
  pid: number | null
  port: number
  status: "running" | "stopped"
  startedAt: number | null
  signature?: string
}

function getCursorWatcherStatePath(): string {
  return join(getTermlingsBrowserDir(), "cursor-watcher.json")
}

function readCursorWatcherState(): CursorWatcherState | null {
  const path = getCursorWatcherStatePath()
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CursorWatcherState
  } catch {
    return null
  }
}

function writeCursorWatcherState(state: CursorWatcherState): void {
  writeFileSync(getCursorWatcherStatePath(), JSON.stringify(state, null, 2) + "\n")
}

function currentCursorWatcherSignature(cliPath: string): string {
  const sourceFiles = [
    resolve(cliPath),
    ENGINE_FILE_PATH,
    join(ENGINE_DIR, "browser-client.ts"),
    join(ENGINE_DIR, "..", "commands", "browser.ts"),
  ]

  return sourceFiles.map((path) => {
    try {
      return `${path}:${statSync(path).mtimeMs}`
    } catch {
      return `${path}:missing`
    }
  }).join("|")
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

/**
 * Load or create browser configuration
 */
export function getBrowserConfig(): BrowserConfig {
  const configPath = getBrowserConfigPath()
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf8")
      const parsed = JSON.parse(content) as Partial<BrowserConfig>
      return {
        ...DEFAULT_BROWSER_CONFIG,
        ...parsed,
        profilePath: parsed.profilePath && parsed.profilePath.trim().length > 0
          ? parsed.profilePath
          : getBrowserProfileDir(),
      }
    } catch {
      return { ...DEFAULT_BROWSER_CONFIG, profilePath: getBrowserProfileDir() }
    }
  }
  return { ...DEFAULT_BROWSER_CONFIG, profilePath: getBrowserProfileDir() }
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

  const current = getBrowserConfig()
  mkdirSync(current.profilePath, { recursive: true })

  if (!existsSync(getBrowserConfigPath())) {
    updateBrowserConfig({})
  }

  getOrCreateProfileReference()
}

export async function stopInPageCursorWatcher(): Promise<void> {
  const state = readCursorWatcherState()
  if (!state || !state.pid) return
  await terminateProcess(state.pid, 1200)
  writeCursorWatcherState({
    pid: null,
    port: state.port,
    status: "stopped",
    startedAt: null,
    signature: state.signature,
  })
}

export async function ensureInPageCursorWatcher(
  port: number,
  options: { intervalMs?: number } = {},
): Promise<void> {
  const disabled = (process.env.TERMLINGS_BROWSER_INPAGE_CURSOR || "").trim().toLowerCase()
  if (disabled === "0" || disabled === "false" || disabled === "off" || disabled === "no") {
    await stopInPageCursorWatcher()
    return
  }

  const existing = readCursorWatcherState()
  const execPath = process.execPath || "bun"
  const cliPath = process.argv[1] || join(process.cwd(), "bin", "termlings.js")
  const signature = currentCursorWatcherSignature(cliPath)

  if (
    existing
    && existing.status === "running"
    && existing.pid
    && isProcessAlive(existing.pid)
    && existing.port === port
    && existing.signature === signature
  ) {
    return
  }
  if (existing && existing.pid && isProcessAlive(existing.pid)) {
    await terminateProcess(existing.pid, 800)
  }

  const spawn = (await import("bun")).spawn
  const intervalMs = Math.max(80, Math.min(2000, Math.round(options.intervalMs ?? 240)))
  const proc = spawn(
    [
      execPath,
      cliPath,
      "browser",
      "__cursor-watch",
      "--port",
      String(port),
      "--interval-ms",
      String(intervalMs),
    ],
    {
      detached: true,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        ...process.env,
        TERMLINGS_BROWSER_CURSOR_WATCHER: "1",
      },
    },
  )
  proc.unref()

  writeCursorWatcherState({
    pid: proc.pid,
    port,
    status: "running",
    startedAt: Date.now(),
    signature,
  })
}

/**
 * Start headed Chrome with CDP enabled for this workspace.
 */
export async function startBrowser(options: { headless?: boolean } = {}): Promise<{ pid: number; port: number }> {
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
        // Stale process state; terminate the stale process before restart.
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
}

/**
 * Stop Chrome CDP browser process
 */
export async function stopBrowser(): Promise<void> {
  await stopInPageCursorWatcher()

  const state = readProcessState()
  if (!state || !state.pid) return

  const pid = state.pid
  const profilePath = state.profilePath

  await terminateProcess(pid, 3000)

  if (profilePath) {
    cleanupStaleProfileLocks(profilePath)
  }

  updateProcessState(buildStoppedProcessState(state.port, state.profilePath))
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

/**
 * Get the directory for per-agent browser state files
 */
function getAgentBrowserStateDir(): string {
  return join(getTermlingsBrowserDir(), "agents")
}

function extractTabIdFromArgs(args: unknown[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    if (typeof token !== "string") continue
    const trimmed = token.trim()
    if (!trimmed) continue

    if (trimmed.startsWith("--tab=")) {
      const candidate = trimmed.slice("--tab=".length).trim()
      if (/^\d+$/.test(candidate)) return candidate
      continue
    }
    if (trimmed === "--tab" && i + 1 < args.length) {
      const next = args[i + 1]
      if (typeof next === "string") {
        const candidate = next.trim()
        if (/^\d+$/.test(candidate)) return candidate
      }
    }
  }
  return undefined
}

function readAgentBrowserState(sessionId: string): AgentBrowserState | null {
  const path = join(getAgentBrowserStateDir(), `${sessionId}.json`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as AgentBrowserState
  } catch {
    return null
  }
}

function resolveSessionBrowserTabId(sessionId: string): string | undefined {
  const fromAgentState = readAgentBrowserState(sessionId)?.tabId?.trim()
  if (fromAgentState && /^\d+$/.test(fromAgentState)) {
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
    if (direct && /^\d+$/.test(direct)) {
      return direct
    }
    for (const owner of Object.values(owners)) {
      const candidateSessionId = (owner?.sessionId || "").trim()
      const candidateTabId = (owner?.tabId || "").trim()
      if (candidateSessionId === sessionId && /^\d+$/.test(candidateTabId)) {
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

  const dir = getAgentBrowserStateDir()
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    return
  }

  let url: string | undefined
  if (command === "navigate" && args[0] && typeof args[0] === "string") {
    url = args[0]
  }

  const state: AgentBrowserState = {
    sessionId,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
    tabId: (tabId || extractTabIdFromArgs(args) || "").trim() || undefined,
    url,
    lastAction: command,
    lastActionAt: Date.now(),
  }

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

  if (!url) {
    try {
      const existingPath = join(dir, `${sessionId}.json`)
      if (existsSync(existingPath)) {
        const existing = JSON.parse(readFileSync(existingPath, "utf-8")) as AgentBrowserState
        state.url = existing.url
      }
    } catch {
      // ignore
    }
  }

  try {
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify(state, null, 2) + "\n")
  } catch {
    // Ignore write errors
  }
}

/**
 * Read all active agent browser states
 * Returns agents that have used the browser recently (within staleness window)
 */
export function readAgentBrowserStates(stalenessMs: number = 300_000): AgentBrowserState[] {
  const dir = getAgentBrowserStateDir()
  if (!existsSync(dir)) return []

  const results: AgentBrowserState[] = []
  const now = Date.now()

  try {
    const files = readdirSync(dir).filter((f: string) => f.endsWith(".json"))
    for (const file of files) {
      try {
        const content = readFileSync(join(dir, file), "utf-8")
        const state = JSON.parse(content) as AgentBrowserState
        if (now - state.lastActionAt < stalenessMs) {
          results.push(state)
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Ignore
  }

  return results.sort((a, b) => b.lastActionAt - a.lastActionAt)
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
  try {
    mkdirSync(getActivityHistoryDir(), { recursive: true })
    mkdirSync(getAgentActivityHistoryDir(), { recursive: true })
  } catch {
    // Ignore; append calls below will handle failures.
  }

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

  try {
    appendFileSync(getActivityHistoryPath(), JSON.stringify(entry) + "\n")
  } catch {
    // Ignore logging errors
  }

  const agentKey = process.env.TERMLINGS_AGENT_SLUG?.trim()
    || entry.sessionId?.trim()
    || entry.agentName?.trim()
    || "unknown"
  try {
    appendFileSync(getAgentActivityHistoryPath(agentKey), JSON.stringify(entry) + "\n")
  } catch {
    // Ignore logging errors
  }

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
