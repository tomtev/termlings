import type { AgentAdapter } from "./types.js"
import { randomBytes } from "crypto"
import { readFileSync, existsSync } from "fs"
import { resolve as resolvePath, dirname as dirName, join as joinPath } from "path"
import { fileURLToPath } from "url"
import { writeCommand, readMessages, setRoom } from "../engine/ipc.js"

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
  // Try sibling file first (installed / built layout)
  const siblingPath = joinPath(__dirname, "..", "termling-context.md")
  try {
    return readFileSync(siblingPath, "utf8")
  } catch {}

  // Fallback: dev mode with ts runner
  try {
    return readFileSync(resolvePath("src/termling-context.md"), "utf8")
  } catch {}

  return ""
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
  commandName?: string,
): Promise<never> {
  const { agents } = await import("./index.js")

  // Use soul's command if specified, otherwise use provided command or default to claude
  const finalCommandName = localAgent.soul?.command || commandName || "claude"
  const adapter = agents[finalCommandName]
  if (!adapter) throw new Error(`Agent command not found: ${finalCommandName}`)

  // Override name and dna from local soul
  termlingOpts = { ...termlingOpts }
  if (!termlingOpts.name && localAgent.soul?.name) {
    termlingOpts.name = localAgent.soul.name
  }
  if (!termlingOpts.dna && localAgent.soul?.dna) {
    termlingOpts.dna = localAgent.soul.dna
  }
  if (!termlingOpts.purpose && localAgent.soul?.purpose) {
    termlingOpts.purpose = localAgent.soul.purpose
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
  soulData?: { name: string; purpose: string; dna: string; command?: string },
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

  const contextArgs = adapter.contextArgs(context)
  const finalArgs = [...contextArgs, ...passthroughArgs]

  const room = process.env.TERMLINGS_ROOM || "default"
  setRoom(room)

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
        `${bold}Joined Termlings ${room}${reset}`,
        `${bold}${nameColor}with: ${agentName}${reset}`,
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
      console.log(`Joined Termlings ${room} with: ${agentName}`)
      console.log()
    }
  } else {
    console.log(`Joined Termlings ${room} with: ${adapter.defaultName}`)
    console.log()
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TERMLINGS_SESSION_ID: sessionId,
    TERMLINGS_AGENT_NAME: agentName,
    TERMLINGS_AGENT_DNA: agentDna,
    TERMLINGS_ROOM: room,
  }

  if (context) {
    let finalContext = context

    // Replace dynamic fields
    const dynamicFields: Record<string, string> = {
      NAME: agentName,
      SESSION_ID: sessionId,
      DNA: agentDna,
      ROOM: room,
      PURPOSE: termlingOpts.purpose || soul.purpose || process.env.TERMLINGS_PURPOSE || "explore and interact",
    }

    // Replace $FIELD placeholders
    for (const [field, value] of Object.entries(dynamicFields)) {
      finalContext = finalContext.replace(new RegExp(`\\$${field}\\b`, "g"), value)
    }

    if (process.env.TERMLINGS_SIMPLE === "1") {
      finalContext += `\n\n## Simple Mode

This room is running in SIMPLE MODE:
- There is NO map. Walking is disabled.
- \`termlings action walk\` will fail.
- \`termlings action build\` and \`termlings action destroy\` will fail.
- Use \`termlings action map\` to see connected agents and their session IDs.
- Use \`termlings action send <session-id> <message>\` to communicate.
- Gestures (talk, wave) and stop still work.`
    }
    env.TERMLINGS_CONTEXT = finalContext
  }

  // Announce to the sim so the agent entity spawns immediately
  writeCommand(sessionId, { action: "join", name: agentName, dna: agentDna, ts: Date.now() })

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

  // Forward signals to child
  const forward = (sig: number) => proc.kill(sig)
  process.on("SIGINT", () => forward(2))
  process.on("SIGTERM", () => forward(15))

  // Wait for process exit
  const exitCode = await proc.exited
  const finalCode = exitCode ?? 0

  // Cleanup
  clearInterval(pollTimer)
  process.stdin.off("data", onStdinData)
  process.stdout.off("resize", onResize)
  process.stdin.setRawMode?.(false)

  // Announce departure
  writeCommand(sessionId, { action: "leave" as any, name: agentName, ts: Date.now() })

  process.exit(finalCode)
}
