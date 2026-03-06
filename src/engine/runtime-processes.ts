import { existsSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join, resolve } from "path"
import { spawn } from "child_process"
import { ensureWorkspaceDirs } from "../workspace/state.js"

export type ManagedRuntimeProcessKind = "agent" | "scheduler"

export interface ManagedRuntimeProcess {
  key: string
  kind: ManagedRuntimeProcessKind
  pid: number
  command: string
  args: string[]
  cwd: string
  startedAt: number
  updatedAt: number
  agentSlug?: string
  runtimeName?: string
  presetName?: string
}

interface ManagedRuntimeProcessState {
  version: number
  processes: ManagedRuntimeProcess[]
}

interface EnsureManagedProcessOptions {
  key: string
  kind: ManagedRuntimeProcessKind
  args: string[]
  root?: string
  respawn?: boolean
  startupProbeMs?: number
  agentSlug?: string
  runtimeName?: string
  presetName?: string
}

const STATE_VERSION = 1
const DEFAULT_STARTUP_PROBE_MS = 1200
const DETACHED_ENV_BLOCKLIST = new Set<string>([
  "TERMLINGS_SESSION_ID",
  "TERMLINGS_AGENT_NAME",
  "TERMLINGS_AGENT_DNA",
  "TERMLINGS_AGENT_SLUG",
  "TERMLINGS_AGENT_TITLE",
  "TERMLINGS_AGENT_TITLE_SHORT",
  "TERMLINGS_AGENT_ROLE",
  "TERMLINGS_AGENT_MANAGE_AGENTS",
  "TERMLINGS_CONTEXT",
  "TERMLINGS_DESCRIPTION",
  "TERMLINGS_IPC_DIR",
  "TERMLINGS_CONTEXT_PROFILE",
])
const DETACHED_ENV_PREFIX_BLOCKLIST = [
  "CLAUDE_CODE_",
  "CLAUDE_AGENT_SDK_",
  "CODEX_",
  "SUPERSET_",
]
const DETACHED_ENV_EXACT_BLOCKLIST = new Set<string>([
  "CLAUDE_SESSION_ID",
  "CLAUDE_PROJECT_DIR",
  "CLAUDE_REPL_MODE",
  "CLAUDE_AFTER_LAST_COMPACT",
  "CLAUDECODE",
  "TERM_SESSION_ID",
  "ITERM_SESSION_ID",
])

function statePath(root: string): string {
  return join(root, ".termlings", "store", "runtime-processes.json")
}

function legacyRuntimeLogDir(root: string): string {
  return join(root, ".termlings", "store", "runtime-logs")
}

function emptyState(): ManagedRuntimeProcessState {
  return {
    version: STATE_VERSION,
    processes: [],
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function shouldOmitManagedRuntimeEnvKey(key: string): boolean {
  if (DETACHED_ENV_BLOCKLIST.has(key) || DETACHED_ENV_EXACT_BLOCKLIST.has(key)) {
    return true
  }

  return DETACHED_ENV_PREFIX_BLOCKLIST.some((prefix) => key.startsWith(prefix))
}

export function sanitizeManagedRuntimeEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Record<string, string> {
  const envEntries = Object.entries(env)
  const next: Record<string, string> = {}
  for (const [key, rawValue] of envEntries) {
    if (shouldOmitManagedRuntimeEnvKey(key)) continue
    if (typeof rawValue !== "string") continue
    next[key] = rawValue
  }
  return next
}

function buildDetachedEnv(): Record<string, string> {
  return sanitizeManagedRuntimeEnv()
}

function normalizeProcess(raw: unknown): ManagedRuntimeProcess | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const data = raw as Record<string, unknown>

  const key = asString(data.key).trim()
  const kindRaw = asString(data.kind).trim()
  const pid = asNumber(data.pid)
  const command = asString(data.command).trim()
  const args = Array.isArray(data.args) ? data.args.map((part) => asString(part)).filter(Boolean) : []
  const cwd = asString(data.cwd).trim()
  const startedAt = asNumber(data.startedAt)
  const updatedAt = asNumber(data.updatedAt)

  const kind = kindRaw === "agent" || kindRaw === "scheduler" ? kindRaw : ""
  if (!key || !kind || !Number.isFinite(pid) || pid <= 0 || !command || !cwd) return null

  return {
    key,
    kind,
    pid,
    command,
    args,
    cwd,
    startedAt: startedAt > 0 ? startedAt : Date.now(),
    updatedAt: updatedAt > 0 ? updatedAt : Date.now(),
    agentSlug: asString(data.agentSlug).trim() || undefined,
    runtimeName: asString(data.runtimeName).trim() || undefined,
    presetName: asString(data.presetName).trim() || undefined,
  }
}

function cleanupLegacyRuntimeLogs(root: string): void {
  try {
    rmSync(legacyRuntimeLogDir(root), { recursive: true, force: true })
  } catch {}
}

function loadState(root: string): ManagedRuntimeProcessState {
  ensureWorkspaceDirs(root)
  cleanupLegacyRuntimeLogs(root)
  const path = statePath(root)
  if (!existsSync(path)) return emptyState()

  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
    const version = asNumber(raw.version) || STATE_VERSION
    const rawProcesses = Array.isArray(raw.processes) ? raw.processes : []
    const processes = rawProcesses.map((entry) => normalizeProcess(entry)).filter((entry): entry is ManagedRuntimeProcess => Boolean(entry))
    const hadLegacyLogPath = rawProcesses.some((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false
      const candidate = entry as Record<string, unknown>
      return typeof candidate.logPath === "string" && candidate.logPath.trim().length > 0
    })
    const normalizedState = { version, processes }
    if (hadLegacyLogPath || processes.length !== rawProcesses.length) {
      saveState(root, normalizedState)
    }
    return normalizedState
  } catch {
    return emptyState()
  }
}

function saveState(root: string, state: ManagedRuntimeProcessState): void {
  ensureWorkspaceDirs(root)
  cleanupLegacyRuntimeLogs(root)
  writeFileSync(statePath(root), JSON.stringify(state, null, 2) + "\n")
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function tryKill(pid: number, signal: NodeJS.Signals): void {
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal)
      return
    } catch {}
  }

  try {
    process.kill(pid, signal)
  } catch {}
}

export function isRuntimeProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function terminateRuntimeProcess(pid: number, graceMs = 1200): Promise<void> {
  if (!Number.isFinite(pid) || pid <= 0) return

  tryKill(pid, "SIGTERM")

  const deadline = Date.now() + Math.max(0, graceMs)
  while (Date.now() < deadline) {
    if (!isRuntimeProcessAlive(pid)) return
    await delay(80)
  }

  tryKill(pid, "SIGKILL")
}

export function listManagedRuntimeProcesses(root = process.cwd()): ManagedRuntimeProcess[] {
  return loadState(root).processes
}

export function pruneManagedRuntimeProcesses(root = process.cwd()): ManagedRuntimeProcess[] {
  const state = loadState(root)
  const alive = state.processes.filter((processInfo) => isRuntimeProcessAlive(processInfo.pid))
  if (alive.length !== state.processes.length) {
    saveState(root, { ...state, processes: alive })
  }
  return alive
}

function upsertManagedRuntimeProcess(processInfo: ManagedRuntimeProcess, root: string): void {
  const state = loadState(root)
  const next = [...state.processes]
  const index = next.findIndex((item) => item.key === processInfo.key)
  if (index >= 0) {
    next[index] = processInfo
  } else {
    next.push(processInfo)
  }
  saveState(root, { ...state, processes: next })
}

function removeManagedRuntimeProcess(key: string, root: string): void {
  const state = loadState(root)
  const next = state.processes.filter((item) => item.key !== key)
  if (next.length !== state.processes.length) {
    saveState(root, { ...state, processes: next })
  }
}

function resolveCliEntry(root: string): string {
  const entry = (process.argv[1] || "").trim()
  if (entry.length > 0) {
    return resolve(entry)
  }
  return join(root, "bin", "termlings.js")
}

function detachedInvocation(args: string[], root: string): {
  command: string
  commandArgs: string[]
  commandLine: string
} {
  const command = (process.execPath || "").trim() || "bun"
  const cliEntry = resolveCliEntry(root)
  const commandArgs = [cliEntry, ...args]
  return {
    command,
    commandArgs,
    commandLine: `${command} ${commandArgs.join(" ")}`.trim(),
  }
}

function launchDetachedTermlings(
  args: string[],
  root: string,
): { ok: boolean; pid?: number; error?: string; commandLine?: string } {
  const invocation = detachedInvocation(args, root)
  try {
    const child = spawn(invocation.command, invocation.commandArgs, {
      cwd: root,
      detached: true,
      stdio: "ignore",
      env: buildDetachedEnv(),
    })

    child.unref()

    const pid = child.pid
    if (!Number.isFinite(pid) || (pid ?? 0) <= 0) {
      return { ok: false, error: "Failed to start detached process." }
    }

    return { ok: true, pid: pid as number, commandLine: invocation.commandLine }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: message,
    }
  }
}

export async function ensureManagedRuntimeProcess(
  options: EnsureManagedProcessOptions,
): Promise<{ ok: boolean; created: boolean; respawned: boolean; pid?: number; error?: string }> {
  const root = options.root || process.cwd()
  const alive = pruneManagedRuntimeProcesses(root)
  const existing = alive.find((item) => item.key === options.key)
  const shouldRespawn = Boolean(options.respawn)

  if (existing && !shouldRespawn) {
    return { ok: true, created: false, respawned: false, pid: existing.pid }
  }

  if (existing && shouldRespawn) {
    await terminateRuntimeProcess(existing.pid)
    removeManagedRuntimeProcess(existing.key, root)
  }

  const launched = launchDetachedTermlings(options.args, root)
  if (!launched.ok || !launched.pid) {
    return { ok: false, created: false, respawned: false, error: launched.error || "failed to launch process" }
  }

  const startupProbeMs = Number.isFinite(options.startupProbeMs)
    ? Math.max(0, Number(options.startupProbeMs))
    : DEFAULT_STARTUP_PROBE_MS

  if (startupProbeMs > 0) {
    await delay(startupProbeMs)
    if (!isRuntimeProcessAlive(launched.pid)) {
      const details = `Process exited immediately after launch (pid ${launched.pid}).`
      return { ok: false, created: false, respawned: false, error: details }
    }
  }

  const now = Date.now()
  upsertManagedRuntimeProcess(
    {
      key: options.key,
      kind: options.kind,
      pid: launched.pid,
      command: launched.commandLine || `termlings ${options.args.join(" ")}`.trim(),
      args: options.args,
      cwd: root,
      startedAt: now,
      updatedAt: now,
      agentSlug: options.agentSlug,
      runtimeName: options.runtimeName,
      presetName: options.presetName,
    },
    root,
  )

  return {
    ok: true,
    created: true,
    respawned: Boolean(existing && shouldRespawn),
    pid: launched.pid,
  }
}

export function stopManagedRuntimeProcesses(root = process.cwd()): void {
  const state = loadState(root)
  if (state.processes.length === 0) return

  for (const processInfo of state.processes) {
    tryKill(processInfo.pid, "SIGTERM")
  }

  saveState(root, { ...state, processes: [] })
}
