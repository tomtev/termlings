import type { AgentAdapter } from "./types.js"
import { randomBytes } from "crypto"
import { readFileSync, existsSync, unlinkSync } from "fs"
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

function pickRandomName(): string {
  const idx = Math.floor(Math.random() * RANDOM_NAMES.length)
  return RANDOM_NAMES[idx]!
}

function loadContext(): string {
  // Load framework context (termling-context.md)
  let context = ""

  // Try sibling file first (installed / built layout)
  const siblingPath = joinPath(__dirname, "..", "termling-context.md")
  try {
    context = readFileSync(siblingPath, "utf8")
  } catch {}

  // Fallback: dev mode with ts runner
  if (!context) {
    try {
      context = readFileSync(resolvePath("src/termling-context.md"), "utf8")
    } catch {}
  }

  // Append project OBJECTIVES.md if it exists
  try {
    const objectivesPath = resolvePath("OBJECTIVES.md")
    if (existsSync(objectivesPath)) {
      const objectives = readFileSync(objectivesPath, "utf8")
      context += "\n\n" + objectives + "\n"
    }
  } catch {}

  return context
}

function parseSoul(): { name: string; dna: string } {
  const agentsMdPath = resolvePath("AGENTS.md")
  if (!existsSync(agentsMdPath)) return { name: "", dna: "" }
  try {
    const content = readFileSync(agentsMdPath, "utf8")
    const soulMatch = content.match(/<agent-soul>([\s\S]*?)<\/agent-soul>/)
    if (!soulMatch) return { name: "", dna: "" }
    const block = soulMatch[1]!
    const nameMatch = block.match(/^Name:\s*(.+)/m)
    const dnaMatch = block.match(/^DNA:\s*([0-9a-fA-F]+)/m)
    return {
      name: nameMatch ? nameMatch[1]!.trim() : "",
      dna: dnaMatch ? dnaMatch[1]!.trim() : "",
    }
  } catch {
    return { name: "", dna: "" }
  }
}

function encodeBracketedPaste(text: string): Buffer {
  const sanitized = text.replace(/\x1b\[[0-9;]*[a-zA-Z~]/g, "")
  return Buffer.from(`\x1b[200~${sanitized}\x1b[201~`)
}

/**
 * Launch a local agent soul with specified command (default: claude)
 */
export async function launchLocalAgent(
  localAgent: any,
  passthroughArgs: string[],
  termlingOpts: Record<string, string>,
): Promise<never> {
  const { agents } = await import("./index.js")
  const adapter = agents.claude
  if (!adapter) throw new Error("Claude adapter is not available")

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

  return launchAgent(adapter, passthroughArgs, termlingOpts, localAgent.soul)
}

/**
 * Launch a coding agent with termling context and message polling.
 * Uses Bun's native PTY to enable injecting messages into the agent's input.
 */
export async function launchAgent(
  adapter: AgentAdapter,
  passthroughArgs: string[],
  termlingOpts: Record<string, string>,
  soulData?: { name: string; description: string; dna: string },
): Promise<never> {
  const sessionId = `tl-${randomBytes(4).toString("hex")}`
  const context = loadContext()
  const soul = soulData || parseSoul()

  const agentName = termlingOpts.name || soul.name || pickRandomName()
  // Generate random DNA if not provided
  let agentDna = termlingOpts.dna || soul.dna
  if (!agentDna) {
    const { generateRandomDNA } = await import("../index.js")
    agentDna = generateRandomDNA()
  }

  // Apply context substitutions BEFORE passing to adapter
  let finalContext = context
  if (context) {
    const dynamicFields: Record<string, string> = {
      NAME: agentName,
      SESSION_ID: sessionId,
      DNA: agentDna,
      ROOM: "default",
      DESCRIPTION: termlingOpts.description || soul.description || process.env.TERMLINGS_DESCRIPTION || "You are an autonomous agent exploring and interacting with the world.",
    }
    for (const [field, value] of Object.entries(dynamicFields)) {
      finalContext = finalContext.replace(new RegExp(`\\$${field}\\b`, "g"), value)
    }
  }

  const contextArgs = adapter.contextArgs(finalContext)
  const finalArgs = [...contextArgs, ...passthroughArgs]

  // Install Claude Code hooks for typing animations and tool requests
  if (adapter.bin === "claude") {
    try {
      const { installTermlingsHooks } = await import("../hooks/installer.js")
      await installTermlingsHooks()
    } catch {
      // Hook installation failed — not fatal, agent will still work
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
    ...(process.env as Record<string, string>),
    TERMLINGS_SESSION_ID: sessionId,
    TERMLINGS_AGENT_NAME: agentName,
    TERMLINGS_AGENT_DNA: agentDna,
    TERMLINGS_IPC_DIR: ipcDir,
  }
  const typingPath = joinPath(ipcDir, `${sessionId}.typing.json`)

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
    text: `${agentName} joined`,
    target: sessionId,
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

  const proc = Bun.spawn([adapter.bin, ...finalArgs], {
    terminal: {
      cols,
      rows,
      data(_terminal, data) {
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
    terminal.write(data)
  }
  process.stdin.on("data", onStdinData)

  // Handle terminal resize
  const onResize = () => {
    terminal.resize(process.stdout.columns, process.stdout.rows)
  }
  process.stdout.on("resize", onResize)

  // Poll for incoming messages and inject them into the PTY
  let processingInput = false
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const pollTimer = setInterval(async () => {
    if (processingInput) return
    try {
      const messages = readMessages(sessionId)
      if (messages.length === 0) return

      processingInput = true
      for (const msg of messages) {
        const line = `[Message from ${msg.fromName}]: ${msg.text}`
        terminal.write(encodeBracketedPaste(line))
        await delay(150)
        // Press enter twice to submit
        terminal.write(Buffer.from("\r"))
        await delay(80)
        terminal.write(Buffer.from("\r"))
        await delay(100)
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
      target: sessionId,
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
