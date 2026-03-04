/**
 * Browser runtime lifecycle management (agent-browser + Chrome CDP)
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { spawnSync } from "child_process"
import { createHash } from "crypto"
import { basename, join } from "path"
import { getTermlingsDir } from "./ipc.js"
import type { BrowserConfig, ProcessState, ActivityLogEntry, ProfileReference, AgentBrowserState } from "./browser-types.js"

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

/**
 * Start headed Chrome with CDP enabled for this workspace.
 */
export async function startBrowser(options: { headless?: boolean } = {}): Promise<{ pid: number; port: number }> {
  await initializeBrowserDirs()

  const config = getBrowserConfig()

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
        // stale endpoint; restart below
      }
    }
  }

  if (!isAgentBrowserAvailable()) {
    throw new Error("agent-browser CLI is required. Install with: npm install -g agent-browser && agent-browser install")
  }

  const spawn = (await import("bun")).spawn
  const availablePort = await findAvailablePort(config.port)
  const profilePath = config.profilePath && config.profilePath.trim().length > 0
    ? config.profilePath
    : getBrowserProfileDir()
  mkdirSync(profilePath, { recursive: true })

  const binary = resolveChromeBinary(config.binaryPath)
  const headless = options.headless === true
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

  let cdpInfo: Record<string, unknown> | null = null
  for (let i = 0; i < 30; i++) {
    try {
      cdpInfo = await fetchCdpVersion(availablePort, 1000)
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  if (!cdpInfo) {
    throw new Error(`Chrome CDP did not become ready on port ${availablePort}.`)
  }

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
}

/**
 * Stop Chrome CDP browser process
 */
export async function stopBrowser(): Promise<void> {
  const state = readProcessState()
  if (!state || !state.pid) return

  const pid = state.pid

  try {
    process.kill(pid, "SIGTERM")
  } catch {
    // ignore
  }

  const startedWait = Date.now()
  while (Date.now() - startedWait < 3000) {
    if (!isProcessAlive(pid)) break
    await new Promise((resolve) => setTimeout(resolve, 120))
  }

  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // ignore
    }
  }

  updateProcessState({
    pid: null,
    port: state.port,
    status: "stopped",
    startedAt: null,
    profilePath: state.profilePath,
    mode: "cdp",
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

/**
 * Get the directory for per-agent browser state files
 */
function getAgentBrowserStateDir(): string {
  return join(getTermlingsBrowserDir(), "agents")
}

/**
 * Update the per-agent browser state file
 * Written on every browser command so the workspace knows which agent is using the browser
 */
export function updateAgentBrowserState(command: string, args: unknown[] = []): void {
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
  error?: string
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
    updateAgentBrowserState(command, args)
  }
}

/**
 * Request human operator intervention via message command
 * Sends message to operator through IPC
 */
export async function requestOperatorIntervention(message: string): Promise<void> {
  const agentName = process.env.TERMLINGS_AGENT_NAME || "Agent"

  logBrowserActivity("request-help", [message], "success")

  const formattedMessage = `🔔 **Browser needs your help** (${agentName})\n\n${message}\n\nRun: \`termlings browser\` commands to interact`

  const { spawn } = await import("bun")

  try {
    spawn(["termlings", "message", "human:default", formattedMessage], {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "ignore"],
    })

    await new Promise((resolve) => setTimeout(resolve, 500))

    console.log(`✓ Operator notified: ${message}`)
    console.log("\nWaiting for operator to interact with browser...")
    console.log("Operator can run: termlings browser tabs list (then use --tab with navigate/screenshot/type/click/extract)")
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
