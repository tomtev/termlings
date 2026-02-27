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
 * Launch a coding agent with termling context and message polling.
 * Uses Bun's native PTY to enable injecting messages into the agent's input.
 */
export async function launchAgent(
  adapter: AgentAdapter,
  passthroughArgs: string[],
  termlingOpts: Record<string, string>,
): Promise<never> {
  const sessionId = `tl-${randomBytes(4).toString("hex")}`
  const context = loadContext()
  const soul = parseSoul()

  const agentName = termlingOpts.name || soul.name || pickRandomName()
  const agentDna = termlingOpts.dna || soul.dna || ""

  const contextArgs = adapter.contextArgs(context)
  const finalArgs = [...contextArgs, ...passthroughArgs]

  console.log(`Starting ${adapter.defaultName} with session: ${sessionId}`)
  console.log()

  const room = process.env.TERMLINGS_ROOM || "default"
  setRoom(room)

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TERMLINGS_SESSION_ID: sessionId,
    TERMLINGS_AGENT_NAME: agentName,
    TERMLINGS_AGENT_DNA: agentDna,
    TERMLINGS_ROOM: room,
  }

  if (context) {
    let finalContext = context
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
