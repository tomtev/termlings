/**
 * PinchTab browser server lifecycle management
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
} from "fs"
import { join } from "path"
import { getTermlingsDir } from "./ipc.js"
import type { BrowserConfig, ProcessState, ActivityLogEntry } from "./browser-types.js"

/**
 * Get the browser directory (.termlings/browser)
 */
export function getTermlingsBrowserDir(): string {
  return join(getTermlingsDir(), "browser")
}

/**
 * Get the browser profile directory (.termlings/browser/profile)
 */
export function getBrowserProfileDir(): string {
  return join(getTermlingsBrowserDir(), "profile")
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
 * Get the browser activity history file path
 */
export function getActivityHistoryPath(): string {
  return join(getTermlingsBrowserDir(), "history.jsonl")
}

/**
 * Default browser configuration
 * Headless mode by default (macOS has display conflicts with headed mode)
 */
export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  port: 8222,
  binaryPath: "pinchtab",
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
      return JSON.parse(content)
    } catch {
      return DEFAULT_BROWSER_CONFIG
    }
  }
  return DEFAULT_BROWSER_CONFIG
}

/**
 * Update browser configuration
 */
export function updateBrowserConfig(config: Partial<BrowserConfig>): BrowserConfig {
  const current = getBrowserConfig()
  const updated = { ...current, ...config }
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
    return JSON.parse(content)
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
 * Find an available port (starting from basePort)
 */
async function findAvailablePort(basePort: number = 8222): Promise<number> {
  const net = await import("net")

  for (let port = basePort; port < basePort + 10; port++) {
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

  throw new Error(`Could not find available port in range ${basePort}-${basePort + 9}`)
}

/**
 * Check if PinchTab binary is available
 */
export function checkBinaryAvailable(binaryPath: string): boolean {
  // Try to find the binary in PATH
  try {
    // In a real implementation, we'd check if the binary exists
    // For now, we'll just return true and let the spawn fail gracefully
    return true
  } catch {
    return false
  }
}

/**
 * Get project-specific profile name
 * Each project gets its own isolated profile for separate cookies, auth, and history
 */
function getProjectProfileName(): string {
  // Get the parent directory of .termlings (the actual project directory)
  const termligsDir = getTermlingsDir()
  const projectDir = join(termligsDir, "..")
  const projectName = projectDir.split("/").pop() || "project"
  return `project-${projectName}`
}

/**
 * Initialize browser directories and configuration
 */
export function initializeBrowserDirs(): void {
  const baseDir = getTermlingsBrowserDir()
  mkdirSync(baseDir, { recursive: true })
  mkdirSync(getBrowserProfileDir(), { recursive: true })

  // Create config if it doesn't exist
  if (!existsSync(getBrowserConfigPath())) {
    updateBrowserConfig({})
  }
}

/**
 * Start the PinchTab browser server (orchestrator)
 * The orchestrator manages instances and profiles via REST API
 */
export async function startBrowser(): Promise<{ pid: number; port: number }> {
  const config = getBrowserConfig()

  // Check if already running
  const existing = readProcessState()
  if (existing && existing.status === "running" && existing.pid !== null) {
    // Verify it's actually running with a health check
    try {
      const response = await fetch(`http://127.0.0.1:${existing.port}/health`, {
        signal: AbortSignal.timeout(2000),
      })
      if (response.ok) {
        return { pid: existing.pid, port: existing.port }
      }
    } catch {
      // Process is stale, will restart below
    }
  }

  // Find an available port before spawning PinchTab
  const spawn = (await import("bun")).spawn
  const headless = process.env.BRIDGE_HEADLESS ?? "true"
  const basePort = config.port
  const availablePort = await findAvailablePort(basePort)
  const profileName = getProjectProfileName() // Per-project profile with separate state

  const proc = spawn([config.binaryPath], {
    env: {
      ...process.env,
      BRIDGE_HEADLESS: headless,
      BRIDGE_PORT: String(availablePort),
      BRIDGE_PROFILE: profileName,
      BRIDGE_MODE: "dashboard", // Enable orchestrator dashboard for profile management
    },
  })

  const pid = proc.pid

  // Wait for orchestrator to start
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Verify orchestrator is running on the port we told it to use
  let serverReady = false
  for (let i = 0; i < 10; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${availablePort}/health`, {
        signal: AbortSignal.timeout(1000),
      })
      if (response.ok) {
        serverReady = true
        break
      }
    } catch {
      // Server not ready yet, try again
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  if (!serverReady) {
    throw new Error(
      `Browser server failed to start on port ${availablePort}. Is PinchTab installed? Install with: npm install -g pinchtab`
    )
  }

  // Update process state with URL for easy access
  updateProcessState({
    pid,
    port: availablePort,
    status: "running",
    startedAt: Date.now(),
    url: `http://127.0.0.1:${availablePort}`,
  })

  return { pid, port: availablePort }
}

/**
 * Stop the PinchTab browser server
 */
export async function stopBrowser(): Promise<void> {
  const state = readProcessState()
  if (!state || !state.pid) return

  try {
    // Try graceful shutdown via HTTP first
    try {
      await fetch(`http://127.0.0.1:${state.port}/exit`, {
        method: "POST",
        signal: AbortSignal.timeout(2000),
      })
    } catch {
      // Fallback to process kill
      process.kill(state.pid, "SIGTERM")
    }

    // Wait for process to exit
    await new Promise((resolve) => setTimeout(resolve, 500))
  } catch {
    // Ignore errors during shutdown
  }

  // Update process state
  updateProcessState({
    pid: null,
    port: state.port,
    status: "stopped",
    startedAt: null,
  })
}

/**
 * Check if browser is currently running
 */
export async function isBrowserRunning(): Promise<boolean> {
  const state = readProcessState()
  if (!state || state.status !== "running" || !state.pid) return false

  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return response.ok
  } catch {
    return false
  }
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
  const entry: ActivityLogEntry = {
    ts: Date.now(),
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentName: process.env.TERMLINGS_AGENT_NAME,
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
}

/**
 * Request human operator intervention via action send
 * Sends message to operator through IPC
 */
export async function requestOperatorIntervention(message: string): Promise<void> {
  const agentName = process.env.TERMLINGS_AGENT_NAME || "Agent"

  // Log the request
  logBrowserActivity("request-help", [message], "success")

  // Send message to operator via termlings action send
  const formattedMessage = `🔔 **Browser needs your help** (${agentName})\n\n${message}\n\nRun: \`termlings browser\` commands to interact`

  const { spawn } = await import("bun")

  try {
    const proc = spawn(["termlings", "action", "send", "human:default", formattedMessage], {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "ignore"],
    })

    // Wait briefly for the send to complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    console.log(`✓ Operator notified: ${message}`)
    console.log(`\nWaiting for operator to interact with browser...`)
    console.log(`Operator can run: termlings browser <navigate|screenshot|type|click|extract>`)
  } catch (e) {
    console.error(`Could not notify operator: ${e}`)
  }
}

/**
 * Detect if page requires login
 * Looks for common login indicators
 */
export async function checkIfLoginRequired(
  client: any
): Promise<boolean> {
  try {
    const text = await client.extractText()
    const loginIndicators = [
      /login/i,
      /sign in/i,
      /authenticate/i,
      /password/i,
      /username/i,
      /email.*password/i,
    ]

    return loginIndicators.some((indicator) => indicator.test(text))
  } catch {
    return false
  }
}
