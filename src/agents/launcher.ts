import type { AgentAdapter } from "./types.js"
import { randomBytes } from "crypto"
import { mkdirSync, readFileSync, existsSync, unlinkSync, writeFileSync } from "fs"
import { resolve as resolvePath, dirname as dirName, join as joinPath } from "path"
import { fileURLToPath } from "url"
import { readMessages, getIpcDir } from "../engine/ipc.js"
import {
  appendWorkspaceMessage,
  ensureWorkspaceDirs,
  removeSession,
  upsertSession,
} from "../workspace/state.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirName(__filename)

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
type ContextProfile = "default" | "sim"

function pickRandomName(): string {
  const idx = Math.floor(Math.random() * RANDOM_NAMES.length)
  return RANDOM_NAMES[idx]!
}

function runtimeLabelForAdapter(adapter: AgentAdapter): string {
  const bin = (adapter.bin || "").trim().toLowerCase()
  if (bin === "claude") return "Claude"
  if (bin === "codex") return "Codex"
  if (bin === "pi") return "Pi"

  const fallback = (adapter.defaultName || "").trim()
  return fallback || adapter.bin || "Unknown"
}

function isTruthyEnv(value?: string): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on"
}

function detectContextProfile(): ContextProfile {
  const forcedProfile = (process.env.TERMLINGS_CONTEXT_PROFILE || "").trim().toLowerCase()
  if (forcedProfile === "sim") return "sim"
  if (forcedProfile === "default") return "default"

  if (isTruthyEnv(process.env.TERMLINGS_SIM_MODE) || isTruthyEnv(process.env.TERMLINGS_SIM)) {
    return "sim"
  }

  const mapMetadataPath = resolvePath(".termlings", "map-metadata.json")
  if (existsSync(mapMetadataPath)) {
    return "sim"
  }

  return "default"
}

function readFirstContextFile(paths: string[]): string {
  for (const path of paths) {
    try {
      return readFileSync(path, "utf8")
    } catch {}
  }
  return ""
}

function loadContext(profile: ContextProfile): string {
  // Load framework context (termlings-system-message.md)
  const baseContext = readFirstContextFile([
    // Installed / built layout
    joinPath(__dirname, "..", "termlings-system-message.md"),
    // Dev mode
    resolvePath("src/termlings-system-message.md"),
  ])

  let context = baseContext

  if (profile === "sim") {
    const simAddendum = readFirstContextFile([
      // Installed / built layout
      joinPath(__dirname, "..", "sim", "termlings-system-message-sim.md"),
      // Dev mode
      resolvePath("src/sim/termlings-system-message-sim.md"),
    ]).trim()

    if (simAddendum) {
      context = context ? `${context}\n\n${simAddendum}\n` : `${simAddendum}\n`
    }
  }

  // Append project vision addendum if present.
  try {
    const visionPath = resolvePath(".termlings", "VISION.md")
    if (existsSync(visionPath)) {
      const vision = readFileSync(visionPath, "utf8").trim()
      if (vision) {
        context += `\n\n<TERMLINGS-VISION>\n${vision}\n</TERMLINGS-VISION>\n`
      }
    }
  } catch {}

  return context
}

function loadManageAgentsContext(): string {
  return readFirstContextFile([
    // Installed / built layout
    joinPath(__dirname, "..", "termlings-system-message-manage-agents.md"),
    // Dev mode
    resolvePath("src/termlings-system-message-manage-agents.md"),
  ]).trim()
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
  const contextProfile = detectContextProfile()
  const context = loadContext(contextProfile)
  const soul = soulData || parseSoul()

  const agentName = termlingOpts.name || soul.name || pickRandomName()
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

  // Apply context substitutions BEFORE passing to adapter
  let finalContext = context
  if (context) {
    const dynamicFields: Record<string, string> = {
      NAME: agentName,
      SESSION_ID: sessionId,
      DNA: agentDna,
      ROOM: "default",
      AGENT_TITLE: agentTitle || "",
      AGENT_TITLE_SHORT: agentTitleShort || "",
      AGENT_ROLE: agentRole || "",
      DESCRIPTION: termlingOpts.description || soul.description || process.env.TERMLINGS_DESCRIPTION || "You are an autonomous agent exploring and interacting with the world.",
    }
    for (const [field, value] of Object.entries(dynamicFields)) {
      finalContext = finalContext.replace(new RegExp(`\\$${field}\\b`, "g"), value)
    }
  }

  if (agentCanManageAgents) {
    const manageAgentsContext = loadManageAgentsContext()
    if (manageAgentsContext) {
      finalContext = finalContext
        ? `${finalContext}\n\n${manageAgentsContext}\n`
        : `${manageAgentsContext}\n`
    }
  }

  const contextArgs = adapter.contextArgs(finalContext)
  const finalArgs = [...contextArgs, ...passthroughArgs]

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

  const agentSlug = termlingOpts.slug || ""

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TERMLINGS_SESSION_ID: sessionId,
    TERMLINGS_AGENT_NAME: agentName,
    TERMLINGS_AGENT_DNA: agentDna,
    TERMLINGS_AGENT_SLUG: agentSlug,
    TERMLINGS_AGENT_TITLE: agentTitle || "",
    TERMLINGS_AGENT_TITLE_SHORT: agentTitleShort || "",
    TERMLINGS_AGENT_ROLE: agentRole || "",
    TERMLINGS_AGENT_MANAGE_AGENTS: agentCanManageAgents ? "1" : "0",
    TERMLINGS_IPC_DIR: ipcDir,
    TERMLINGS_CONTEXT_PROFILE: contextProfile,
    TERMLINGS_SIM_MODE: contextProfile === "sim" ? "1" : "0",
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
- Use \`termlings task\` and \`termlings calendar\` for task/calendar management.`
    }
    env.TERMLINGS_CONTEXT = envContext
  }

  // Register as an online workspace session.
  ensureWorkspaceDirs()
  upsertSession(sessionId, {
    name: agentName,
    dna: agentDna,
  })
  appendWorkspaceMessage({
    kind: "system",
    from: "system",
    fromName: "Workspace",
    text: `${agentName} joined via ${runtimeLabelForAdapter(adapter)}`,
  })
  const heartbeatTimer = setInterval(() => {
    try {
      upsertSession(sessionId, {
        name: agentName,
        dna: agentDna,
        lastSeenAt: Date.now(),
      })
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
