import type { AgentAdapter } from "./types.js"
import { createHash, randomBytes } from "crypto"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, unlinkSync, writeFileSync } from "fs"
import { homedir } from "os"
import { resolve as resolvePath, join as joinPath } from "path"
import { readMessages, getIpcDir } from "../engine/ipc.js"
import { resolveWorkspaceAppsForAgent } from "../engine/apps.js"
import { sanitizeManagedRuntimeEnv } from "../engine/runtime-processes.js"
import { renderManageAgentsContext, renderSystemContext } from "../system-context.js"
import {
  appendWorkspaceMessage,
  ensureWorkspaceDirs,
  removeSession,
  upsertSession,
} from "../workspace/state.js"

const RANDOM_NAMES = [
  "Pixel", "Sprout", "Ember", "Nimbus", "Glitch",
  "Ziggy", "Quill", "Cosmo", "Maple", "Flint",
  "Wren", "Dusk", "Byte", "Fern", "Spark",
  "Nova", "Haze", "Basil", "Reef", "Orbit",
  "Sage", "Rusty", "Coral", "Luna", "Cinder",
  "Pip", "Storm", "Ivy", "Blaze", "Mochi",
]

const TERMINAL_TYPING_IDLE_MS = 3500
const TERMINAL_TYPING_WRITE_THROTTLE_MS = 1500
const INJECT_WHEN_IDLE_MS = 1200
const RESIZE_ACTIVITY_SUPPRESS_MS = 1500
const RUNTIME_SESSION_DISCOVERY_WINDOW_MS = 45_000
const RUNTIME_SESSION_DISCOVERY_POLL_MS = 750
const RUNTIME_SESSION_FILE_SCAN_LIMIT = 20
const RUNTIME_SESSION_PREFIX_BYTES = 64 * 1024

function pickRandomName(): string {
  const idx = Math.floor(Math.random() * RANDOM_NAMES.length)
  return RANDOM_NAMES[idx]!
}

function runtimeLabelForAdapter(adapter: AgentAdapter): string {
  const bin = (adapter.bin || "").trim().toLowerCase()
  if (bin === "claude") return "Claude"
  if (bin === "codex") return "Codex"

  const fallback = (adapter.defaultName || "").trim()
  return fallback || adapter.bin || "Unknown"
}

function loadVisionAddendum(): string {
  try {
    const visionPath = resolvePath(".termlings", "VISION.md")
    if (!existsSync(visionPath)) return ""
    const vision = readFileSync(visionPath, "utf8").trim()
    if (!vision) return ""
    return `\n\n<TERMLINGS-VISION>\n${vision}\n</TERMLINGS-VISION>\n`
  } catch {
    return ""
  }
}

function parseSoul(): { name: string; dna: string } {
  const slug = (process.env.TERMLINGS_AGENT_SLUG || "").trim()
  if (!slug) return { name: "", dna: "" }
  const soulPath = resolvePath(".termlings", "agents", slug, "SOUL.md")
  if (!existsSync(soulPath)) return { name: "", dna: "" }
  try {
    const content = readFileSync(soulPath, "utf8")
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    const yaml = frontmatterMatch?.[1] ?? ""
    const nameMatch = yaml.match(/^name:\s*(.+)$/m)
    const dnaMatch = yaml.match(/^dna:\s*(.+)$/m)
    return {
      name: nameMatch ? nameMatch[1]!.trim().replace(/^['"]|['"]$/g, "") : "",
      dna: dnaMatch ? dnaMatch[1]!.trim().replace(/^['"]|['"]$/g, "") : "",
    }
  } catch {
    return { name: "", dna: "" }
  }
}

function runtimeSessionDirForBin(bin: string, cwd: string): string | null {
  const normalized = (bin || "").trim().toLowerCase()
  if (normalized === "claude") {
    return joinPath(homedir(), ".claude", "projects", cwd.replace(/\//g, "-"))
  }
  if (normalized === "codex") {
    const now = new Date()
    const y = String(now.getFullYear())
    const m = String(now.getMonth() + 1).padStart(2, "0")
    const d = String(now.getDate()).padStart(2, "0")
    return joinPath(homedir(), ".codex", "sessions", y, m, d)
  }
  return null
}

function listRuntimeJsonlFiles(bin: string, cwd: string): string[] {
  const dir = runtimeSessionDirForBin(bin, cwd)
  if (!dir || !existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => joinPath(dir, name))
  } catch {
    return []
  }
}

function newestRuntimeJsonlFiles(bin: string, cwd: string, limit = RUNTIME_SESSION_FILE_SCAN_LIMIT): string[] {
  const files = listRuntimeJsonlFiles(bin, cwd)
  const withMtime: Array<{ path: string; mtime: number }> = []
  for (const filePath of files) {
    try {
      const stat = statSync(filePath)
      withMtime.push({ path: filePath, mtime: stat.mtimeMs })
    } catch {}
  }
  withMtime.sort((a, b) => b.mtime - a.mtime)
  return withMtime.slice(0, limit).map((entry) => entry.path)
}

function readFilePrefix(filePath: string, maxBytes = RUNTIME_SESSION_PREFIX_BYTES): string {
  let fd: number | null = null
  try {
    fd = openSync(filePath, "r")
    const buffer = Buffer.allocUnsafe(maxBytes)
    const bytesRead = readSync(fd, buffer, 0, maxBytes, 0)
    if (bytesRead <= 0) return ""
    return buffer.subarray(0, bytesRead).toString("utf8")
  } catch {
    return ""
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {}
    }
  }
}

function readFileTail(filePath: string, maxBytes = RUNTIME_SESSION_PREFIX_BYTES): string {
  let fd: number | null = null
  try {
    const size = statSync(filePath).size
    if (!Number.isFinite(size) || size <= 0) return ""
    const bytesToRead = Math.min(maxBytes, Math.max(0, size))
    const start = Math.max(0, size - bytesToRead)
    fd = openSync(filePath, "r")
    const buffer = Buffer.allocUnsafe(bytesToRead)
    const bytesRead = readSync(fd, buffer, 0, bytesToRead, start)
    if (bytesRead <= 0) return ""
    return buffer.subarray(0, bytesRead).toString("utf8")
  } catch {
    return ""
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {}
    }
  }
}

function fileContainsSessionMarker(filePath: string, marker: string): boolean {
  if (!marker) return false
  const prefix = readFilePrefix(filePath)
  if (prefix.includes(marker)) return true
  return readFileTail(filePath).includes(marker)
}

function extractRuntimeSessionId(filePath: string): string | undefined {
  const prefix = readFilePrefix(filePath)
  if (!prefix) return undefined
  const lines = prefix.split(/\r?\n/).slice(0, 80)
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      if (typeof parsed.sessionId === "string" && parsed.sessionId.trim().length > 0) {
        return parsed.sessionId.trim()
      }
      const payload = parsed.payload
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const payloadSessionId = (payload as Record<string, unknown>).sessionId
        if (typeof payloadSessionId === "string" && payloadSessionId.trim().length > 0) {
          return payloadSessionId.trim()
        }
        const payloadId = (payload as Record<string, unknown>).id
        if (typeof payloadId === "string" && payloadId.trim().length > 0) {
          return payloadId.trim()
        }
      }
    } catch {}
  }
  return undefined
}

function hasArgFlag(args: string[], flag: string): boolean {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`))
}

function readArgValue(args: string[], longFlag: string, shortFlag?: string): string {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === longFlag || (shortFlag && arg === shortFlag)) {
      const next = args[i + 1]
      if (next && !next.startsWith("-")) return next
      return ""
    }
    if (arg.startsWith(`${longFlag}=`)) return arg.slice(longFlag.length + 1)
    if (shortFlag && arg.startsWith(`${shortFlag}=`)) return arg.slice(shortFlag.length + 1)
  }
  return ""
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

export function composeLaunchArgs(
  adapter: AgentAdapter,
  context: string,
  runtimeSessionArgs: string[],
  passthroughArgs: string[],
): string[] {
  const contextArgs = adapter.contextArgs(context)

  // Codex accepts the initial prompt as a trailing positional argument.
  // Keeping it at the end lets preset flags and `resume --last` stay valid.
  if (adapter.bin === "codex") {
    return [...runtimeSessionArgs, ...passthroughArgs, ...contextArgs]
  }

  return [...contextArgs, ...runtimeSessionArgs, ...passthroughArgs]
}

function shouldInjectClaudeSessionId(args: string[]): boolean {
  if (hasArgFlag(args, "--session-id")) return false
  if (hasArgFlag(args, "--resume") || hasArgFlag(args, "--continue") || hasArgFlag(args, "--from-pr")) return false
  if (args.includes("-r") || args.includes("-c")) return false
  return true
}

function extractClaudeSessionRefFromArgs(args: string[]): string {
  const explicitSession = readArgValue(args, "--session-id")
  if (isUuidLike(explicitSession)) return explicitSession.trim()

  const resumeValue = readArgValue(args, "--resume", "-r")
  if (isUuidLike(resumeValue)) return resumeValue.trim()

  return ""
}

function uuidFromSeed(seed: string): string {
  const digest = createHash("sha256").update(seed).digest()
  const bytes = Uint8Array.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // version 4 layout
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // variant
  const hex = Buffer.from(bytes).toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * Launch a local agent soul with specified command (default: claude)
 */
export async function launchLocalAgent(
  localAgent: any,
  passthroughArgs: string[],
  termlingOpts: Record<string, string>,
  runtimeAdapter?: AgentAdapter,
): Promise<never> {
  const adapter = runtimeAdapter || (await import("./index.js")).agents.claude
  if (!adapter) throw new Error("No agent adapter available")

  // Override name and dna from local soul
  termlingOpts = { ...termlingOpts }
  if (!termlingOpts.name && localAgent.soul?.name) {
    termlingOpts.name = localAgent.soul.name
  }
  if (!termlingOpts.dna && localAgent.soul?.dna) {
    termlingOpts.dna = localAgent.soul.dna
  }
  if (!termlingOpts.description && localAgent.soul?.description) {
    termlingOpts.description = localAgent.soul.description
  }

  // Set slug (folder name) - source of truth for agent identity
  termlingOpts.slug = localAgent.name || ""

  // Pass full soul data with title, title_short, and role
  return launchAgent(adapter, passthroughArgs, termlingOpts, {
    name: localAgent.soul?.name || "",
    description: localAgent.soul?.description || "",
    dna: localAgent.soul?.dna || "",
    title: localAgent.soul?.title,
    title_short: localAgent.soul?.title_short,
    role: localAgent.soul?.role,
    manage_agents: localAgent.soul?.manage_agents,
  })
}

/**
 * Launch a coding agent with termling context and message polling.
 * Uses Bun's native PTY to enable injecting messages into the agent's input.
 */
export async function launchAgent(
  adapter: AgentAdapter,
  passthroughArgs: string[],
  termlingOpts: Record<string, string>,
  soulData?: {
    name: string;
    description: string;
    dna: string;
    title?: string;
    title_short?: string;
    role?: string;
    manage_agents?: boolean;
  },
): Promise<never> {
  const sessionId = `tl-${randomBytes(4).toString("hex")}`
  const runtimeDiscoveryMarker = `tlm-${sessionId}-${randomBytes(6).toString("hex")}`
  const soul = soulData || parseSoul()

  const agentName = termlingOpts.name || soul.name || pickRandomName()
  const agentSlug = termlingOpts.slug || ""
  // Generate random DNA if not provided
  let agentDna = termlingOpts.dna || soul.dna
  if (!agentDna) {
    const { generateRandomDNA } = await import("../index.js")
    agentDna = generateRandomDNA()
  }

  // Extract title and role from soul
  const agentTitle = soulData?.title
  const agentTitleShort = soulData?.title_short
  const agentRole = soulData?.role
  const agentCanManageAgents = Boolean(soulData?.manage_agents)
  const agentDescription =
    termlingOpts.description
    || soul.description
    || process.env.TERMLINGS_DESCRIPTION
    || "You are an autonomous agent exploring and interacting with the world."
  const workspaceApps = resolveWorkspaceAppsForAgent(agentSlug || undefined)

  let finalContext = renderSystemContext({
    name: agentName,
    sessionId,
    title: agentTitle,
    titleShort: agentTitleShort,
    role: agentRole,
    description: agentDescription,
    apps: workspaceApps,
  })

  if (agentCanManageAgents) {
    const manageAgentsContext = renderManageAgentsContext()
    if (manageAgentsContext) {
      finalContext = finalContext
        ? `${finalContext}\n\n${manageAgentsContext}\n`
        : `${manageAgentsContext}\n`
    }
  }

  finalContext += loadVisionAddendum()

  // Per-launch marker used only to link this runtime process to its transcript file.
  // It improves mapping accuracy when multiple agents spawn concurrently.
  finalContext = finalContext
    ? `${finalContext}\n\n<TERMLINGS-RUNTIME-MARKER>${runtimeDiscoveryMarker}</TERMLINGS-RUNTIME-MARKER>\n`
    : `<TERMLINGS-RUNTIME-MARKER>${runtimeDiscoveryMarker}</TERMLINGS-RUNTIME-MARKER>\n`

  const requestedClaudeSessionRef = adapter.bin === "claude"
    ? extractClaudeSessionRefFromArgs(passthroughArgs)
    : ""
  const autoClaudeSessionId =
    adapter.bin === "claude" && shouldInjectClaudeSessionId(passthroughArgs)
      ? uuidFromSeed(`${agentSlug || agentName}|${sessionId}`)
      : ""
  const runtimeSessionRefSeed = autoClaudeSessionId || requestedClaudeSessionRef
  const runtimeSessionArgs = autoClaudeSessionId ? ["--session-id", autoClaudeSessionId] : []
  const finalArgs = composeLaunchArgs(adapter, finalContext, runtimeSessionArgs, passthroughArgs)

  // Remove legacy Claude hook registration so terminal activity remains authoritative.
  if (adapter.bin === "claude") {
    try {
      const { uninstallTermlingsHooks } = await import("../hooks/installer.js")
      await uninstallTermlingsHooks()
    } catch {
      // Hook cleanup failed — not fatal, agent will still work
    }
  }

  // Render agent startup message with avatar and name
  if (agentDna) {
    try {
      const { renderTerminalSmall, decodeDNA } = await import("../index.js")
      const traits = decodeDNA(agentDna)
      const avatar = renderTerminalSmall(agentDna, 0)
      const avatarLines = avatar.split("\n")

      // Render agent info beside avatar
      console.log()
      const faceRgb = [Math.round(200 + Math.sin(traits.faceHue / 12) * 55), Math.round(150 + Math.cos(traits.faceHue / 12) * 55), 100]
      const nameColor = `\x1b[38;2;${faceRgb[0]};${faceRgb[1]};${faceRgb[2]}m`
      const bold = "\x1b[1m"
      const reset = "\x1b[0m"

      const infoLines = [
        `${bold}Joined Termlings${reset}`,
        `${bold}${nameColor}${agentName}${reset}`,
        `${sessionId}`
      ]

      const maxLines = Math.max(avatarLines.length, infoLines.length)
      for (let i = 0; i < maxLines; i++) {
        const avatarLine = avatarLines[i] || ""
        const infoLine = infoLines[i] || ""
        const pad = " ".repeat(Math.max(0, 10 - avatarLine.replace(/\x1b\[[0-9;]*m/g, "").length))
        console.log(`${avatarLine}${pad}  ${infoLine}`)
      }
      console.log()
    } catch {
      console.log(`Joined Termlings as ${agentName}`)
      console.log()
    }
  } else {
    console.log(`Joined Termlings as ${adapter.defaultName}`)
    console.log()
  }

  const ipcDir = getIpcDir()

  const env: Record<string, string> = {
    ...sanitizeManagedRuntimeEnv(process.env as Record<string, string | undefined>),
    TERMLINGS_SESSION_ID: sessionId,
    TERMLINGS_AGENT_NAME: agentName,
    TERMLINGS_AGENT_DNA: agentDna,
    TERMLINGS_AGENT_SLUG: agentSlug,
    TERMLINGS_AGENT_TITLE: agentTitle || "",
    TERMLINGS_AGENT_TITLE_SHORT: agentTitleShort || "",
    TERMLINGS_AGENT_ROLE: agentRole || "",
    TERMLINGS_AGENT_MANAGE_AGENTS: agentCanManageAgents ? "1" : "0",
    TERMLINGS_IPC_DIR: ipcDir,
    TERMLINGS_CONTEXT_PROFILE: "default",
  }
  const typingDir = joinPath(ipcDir, "store", "presence")
  try {
    mkdirSync(typingDir, { recursive: true })
  } catch {}
  const typingPath = joinPath(typingDir, `${sessionId}.typing.json`)
  let typingIdleTimer: ReturnType<typeof setTimeout> | null = null
  let typingActive = false
  let lastTypingWriteAt = 0
  let lastTerminalOutputAt = 0
  let lastTerminalInputAt = 0
  let lastInjectedWriteAt = 0
  let outputActivityArmed = false
  let suppressOutputUntil = 0
  let processingInput = false

  const writeTypingState = (typing: boolean, source: "terminal" = "terminal", force = false) => {
    const now = Date.now()
    if (!force && typingActive === typing && now - lastTypingWriteAt < TERMINAL_TYPING_WRITE_THROTTLE_MS) {
      return
    }
    typingActive = typing
    lastTypingWriteAt = now
    try {
      writeFileSync(
        typingPath,
        JSON.stringify({ typing, source, updatedAt: now }) + "\n",
      )
    } catch {}
  }

  const noteTerminalActivity = () => {
    writeTypingState(true, "terminal")
    if (typingIdleTimer) {
      clearTimeout(typingIdleTimer)
    }
    typingIdleTimer = setTimeout(() => {
      typingIdleTimer = null
      writeTypingState(false, "terminal")
      outputActivityArmed = false
    }, TERMINAL_TYPING_IDLE_MS)
  }

  const clearTerminalTyping = () => {
    if (typingIdleTimer) {
      clearTimeout(typingIdleTimer)
      typingIdleTimer = null
    }
    outputActivityArmed = false
    writeTypingState(false, "terminal", true)
  }

  const isSubmitInput = (data: Buffer): boolean => {
    const text = data.toString("utf8")
    return text.includes("\r") || text.includes("\n")
  }

  const noteTerminalInput = (data: Buffer) => {
    lastTerminalInputAt = Date.now()
    // Any key activity means the operator/agent is currently typing.
    if (data.length > 0) {
      noteTerminalActivity()
    }
    if (isSubmitInput(data)) {
      outputActivityArmed = true
    }
  }

  const noteInjectedWrite = () => {
    lastInjectedWriteAt = Date.now()
    outputActivityArmed = true
  }

  // Add context to environment (already substituted above)
  if (context) {
    let envContext = finalContext

    if (process.env.TERMLINGS_SIMPLE === "1") {
      envContext += `\n\n## Workspace Mode

- Map/pathfinding actions are removed.
- Use \`termlings list-agents\` to discover teammates.
- Use \`termlings message <target> <message>\` to communicate.
- Use \`termlings message human:<id> <message>\` to DM human operators.
- Use \`termlings workflow\`, \`termlings task\`, and \`termlings calendar\` for shared workflow management.`
    }
    env.TERMLINGS_CONTEXT = envContext
  }

  const launchCwd = process.cwd()
  let runtimePid = 0
  let runtimeSessionRef = runtimeSessionRefSeed
  let runtimeJsonlFile = ""
  if (adapter.bin === "claude" && runtimeSessionRef) {
    const claudeSessionDir = runtimeSessionDirForBin(adapter.bin, launchCwd)
    if (claudeSessionDir) {
      runtimeJsonlFile = joinPath(claudeSessionDir, `${runtimeSessionRef}.jsonl`)
    }
  }
  let runtimeMetadataTimer: ReturnType<typeof setInterval> | null = null

  const refreshSessionPresence = (lastSeenAt?: number) => {
    upsertSession(sessionId, {
      name: agentName,
      dna: agentDna,
      lastSeenAt: lastSeenAt ?? Date.now(),
      runtime: adapter.bin,
      launcherPid: process.pid,
      runtimePid: runtimePid > 0 ? runtimePid : undefined,
      jsonlFile: runtimeJsonlFile || undefined,
      runtimeSessionId: runtimeSessionRef || undefined,
    })
  }

  // Register as an online workspace session.
  ensureWorkspaceDirs()
  refreshSessionPresence()
  appendWorkspaceMessage({
    kind: "system",
    from: "system",
    fromName: "Workspace",
    text: `${agentName} joined via ${runtimeLabelForAdapter(adapter)}`,
  })
  const heartbeatTimer = setInterval(() => {
    try {
      refreshSessionPresence(Date.now())
    } catch {}
  }, 5000)

  const cols = process.stdout.columns || 80
  const rows = process.stdout.rows || 24

  const sanitizeInjectedText = (text: string): string =>
    text
      .replace(/\x1b\[[0-9;]*[a-zA-Z~]/g, "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[^\x20-\x7E]/g, "")
      .trim()

  const hasSubstantiveTerminalOutput = (chunk: string | Uint8Array): boolean => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")
    const visible = text
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
      .replace(/\x1b\][^\u0007]*(?:\u0007|\x1b\\)/g, "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
    return visible.length > 0
  }

  const isTerminalBusy = () => {
    if (processingInput) return true
    const lastActivityAt = Math.max(lastTerminalOutputAt, lastTerminalInputAt, lastInjectedWriteAt)
    return Date.now() - lastActivityAt < INJECT_WHEN_IDLE_MS
  }

  const injectMessageLine = async (line: string) => {
    const payload = sanitizeInjectedText(line)
    if (!payload) return

    // Plain write is more reliable than bracketed paste in some Claude UI states.
    noteInjectedWrite()
    terminal.write(Buffer.from(payload))
    await delay(200)
    noteInjectedWrite()
    terminal.write(Buffer.from("\r"))
    await delay(220)
  }

  const proc = Bun.spawn([adapter.bin, ...finalArgs], {
    terminal: {
      cols,
      rows,
      data(_terminal, data) {
        lastTerminalOutputAt = Date.now()
        const outputSuppressed = Date.now() < suppressOutputUntil
        const canTreatOutputAsActivity = typingActive || outputActivityArmed
        if (!outputSuppressed && canTreatOutputAsActivity && hasSubstantiveTerminalOutput(data)) {
          noteTerminalActivity()
          outputActivityArmed = false
        }
        process.stdout.write(data)
      },
    },
    env,
  })

  runtimePid = Number.isFinite(proc.pid) && proc.pid > 0 ? proc.pid : 0
  try {
    refreshSessionPresence()
  } catch {}

  if (runtimeSessionDirForBin(adapter.bin, launchCwd)) {
    const knownRuntimeJsonlFiles = new Set(listRuntimeJsonlFiles(adapter.bin, launchCwd))
    const pendingRuntimeJsonlFiles = new Set<string>()
    const pendingAttempts = new Map<string, number>()

    // One-time bootstrap for resume/restart cases where runtime keeps writing to an existing file.
    for (const filePath of newestRuntimeJsonlFiles(adapter.bin, launchCwd, 5)) {
      pendingRuntimeJsonlFiles.add(filePath)
      pendingAttempts.set(filePath, 0)
    }

    const discoverRuntimeMetadata = () => {
      if (!runtimeJsonlFile) {
        const currentFiles = listRuntimeJsonlFiles(adapter.bin, launchCwd)
        for (const filePath of currentFiles) {
          if (knownRuntimeJsonlFiles.has(filePath)) continue
          knownRuntimeJsonlFiles.add(filePath)
          pendingRuntimeJsonlFiles.add(filePath)
          pendingAttempts.set(filePath, 0)
        }

        for (const filePath of Array.from(pendingRuntimeJsonlFiles)) {
          if (fileContainsSessionMarker(filePath, runtimeDiscoveryMarker)) {
            runtimeJsonlFile = filePath
            pendingRuntimeJsonlFiles.clear()
            pendingAttempts.clear()
            break
          }

          const attempts = (pendingAttempts.get(filePath) || 0) + 1
          pendingAttempts.set(filePath, attempts)
          if (attempts >= 20) {
            pendingRuntimeJsonlFiles.delete(filePath)
            pendingAttempts.delete(filePath)
          }
        }
      }

      if (!runtimeJsonlFile) return

      if (!runtimeSessionRef) {
        runtimeSessionRef = extractRuntimeSessionId(runtimeJsonlFile) || ""
      }

      try {
        refreshSessionPresence()
      } catch {}
    }

    const discoveryDeadline = Date.now() + RUNTIME_SESSION_DISCOVERY_WINDOW_MS
    discoverRuntimeMetadata()
    runtimeMetadataTimer = setInterval(() => {
      if (Date.now() >= discoveryDeadline) {
        if (runtimeMetadataTimer) {
          clearInterval(runtimeMetadataTimer)
          runtimeMetadataTimer = null
        }
        return
      }

      discoverRuntimeMetadata()

      if (runtimeJsonlFile && runtimeSessionRef) {
        if (runtimeMetadataTimer) {
          clearInterval(runtimeMetadataTimer)
          runtimeMetadataTimer = null
        }
      }
    }, RUNTIME_SESSION_DISCOVERY_POLL_MS)
  }

  const terminal = proc.terminal!

  // Forward user keyboard input to the PTY
  process.stdin.resume()
  process.stdin.setRawMode?.(true)
  const onStdinData = (data: Buffer) => {
    noteTerminalInput(data)
    terminal.write(data)
  }
  process.stdin.on("data", onStdinData)

  // Handle terminal resize
  const onResize = () => {
    outputActivityArmed = false
    suppressOutputUntil = Date.now() + RESIZE_ACTIVITY_SUPPRESS_MS
    terminal.resize(process.stdout.columns, process.stdout.rows)
  }
  process.stdout.on("resize", onResize)

  // Poll for incoming messages and inject them into the PTY
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  // Format message header with sender name, title, and ID
  const formatMessageHeader = async (msg: any): Promise<string> => {
    let title = ""
    let messageId = msg.from

    // Try to get title from sender's metadata
    try {
      if (msg.from === "human:default") {
        // Human operator
        const { getDefaultHuman } = await import("../humans/index.js")
        const human = getDefaultHuman()
        if (human?.soul?.title) {
          title = ` - ${human.soul.title}`
        }
        messageId = "human:default"
      } else if (msg.fromDna) {
        // Agent - look up by DNA to get slug (folder name)
        const { discoverLocalAgents } = await import("../agents/discover.js")
        const agents = discoverLocalAgents()
        const agent = agents.find((a) => a.soul?.dna === msg.fromDna)
        if (agent?.soul?.title) {
          title = ` - ${agent.soul.title}`
        }
        // Use slug (folder name) if available, fallback to DNA
        messageId = agent ? `agent:${agent.name}` : `agent:${msg.fromDna}`
      }
    } catch {}

    return `[Message from ${msg.fromName}${title}. id: ${messageId}]: ${msg.text}`
  }

  // Wait for initial output to settle before attempting message injection.
  lastTerminalOutputAt = Date.now()

  const pollTimer = setInterval(async () => {
    if (processingInput) return
    if (isTerminalBusy()) return
    try {
      const { readQueuedMessages } = await import("../engine/ipc.js")
      const messages = readMessages(sessionId)
      const slugQueued = agentSlug ? readQueuedMessages(agentSlug) : []
      const dnaQueued = readQueuedMessages(agentDna)
      const queuedMessages = [...slugQueued, ...dnaQueued]
      const allMessages = [...messages, ...queuedMessages]

      if (allMessages.length === 0) return

      clearTerminalTyping()
      processingInput = true
      for (const msg of allMessages) {
        const line = await formatMessageHeader(msg)
        await injectMessageLine(line)
      }
      processingInput = false
    } catch {
      processingInput = false
    }
  }, 2000)

  // Handle cleanup on exit
  let cleanedUp = false
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true

    clearInterval(heartbeatTimer)
    clearInterval(pollTimer)
    if (runtimeMetadataTimer) {
      clearInterval(runtimeMetadataTimer)
      runtimeMetadataTimer = null
    }
    clearTerminalTyping()
    process.stdin.off("data", onStdinData)
    process.stdout.off("resize", onResize)
    process.stdin.setRawMode?.(false)
    removeSession(sessionId)
    try { unlinkSync(typingPath) } catch {}
    appendWorkspaceMessage({
      kind: "system",
      from: "system",
      fromName: "Workspace",
      text: `${agentName} left`,
    })
  }

  // Forward signals to child and cleanup
  const forward = (sig: number) => {
    cleanup()
    proc.kill(sig)
  }
  process.on("SIGINT", () => forward(2))
  process.on("SIGTERM", () => forward(15))

  // Wait for process exit
  const exitCode = await proc.exited
  const finalCode = exitCode ?? 0

  // Cleanup on normal exit
  cleanup()

  process.exit(finalCode)
}
