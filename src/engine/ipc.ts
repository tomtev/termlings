import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { join } from "path"
import { discoverLocalAgents } from "../agents/discover.js"
import { resolveAgentToken } from "../agents/resolve.js"

/**
 * Get the .termlings directory for the current project.
 * This is `.termlings/` relative to the current working directory.
 */
export function getTermlingsDir(): string {
  const explicitIpcDir = process.env.TERMLINGS_IPC_DIR?.trim()
  if (explicitIpcDir) return explicitIpcDir
  return join(process.cwd(), ".termlings")
}

/**
 * Get the IPC directory for the current project.
 * This is `.termlings/` where agent command files are stored.
 */
export function getIpcDir(): string {
  return getTermlingsDir()
}

/**
 * Get the data directory for the current project.
 * This is `.termlings/` where workspace state, calendar events, and tasks are stored.
 */
export function getDataDir(): string {
  return getTermlingsDir()
}

export let IPC_DIR = getIpcDir()

/**
 * Update directories if the working directory changes.
 * Generally not needed in typical usage.
 */
export function updateDirs(): void {
  IPC_DIR = getIpcDir()
}

export function ensureIpcDir(): void {
  mkdirSync(IPC_DIR, { recursive: true })
}

export function ensureDataDir(): void {
  mkdirSync(getDataDir(), { recursive: true })
}

function storeDir(): string {
  return join(IPC_DIR, "store")
}

function messageQueueDir(): string {
  return join(storeDir(), "message-queue")
}

function legacyMessageQueueDir(): string {
  return join(IPC_DIR, "message-queue")
}

function legacyMessagesDir(): string {
  return join(IPC_DIR, "messages")
}

function sessionsDir(): string {
  return join(storeDir(), "sessions")
}

function legacySessionsDir(): string {
  return join(IPC_DIR, "sessions")
}

function liveMessagePath(sessionId: string): string {
  return join(messageQueueDir(), `${sessionId}.msg.json`)
}

function queuedMessagePath(targetId: string): string {
  return join(messageQueueDir(), `${targetId}.queue.jsonl`)
}

function canonicalQueueTargetId(targetId: string): string {
  const trimmed = targetId.trim()
  if (!trimmed) return targetId

  try {
    const resolved = resolveAgentToken(
      trimmed,
      discoverLocalAgents().map((agent) => ({
        slug: agent.name,
        name: agent.soul?.name,
        title: agent.soul?.title,
        titleShort: agent.soul?.title_short,
        dna: agent.soul?.dna,
      })),
    )
    if ("error" in resolved) return trimmed
    return resolved.agent.slug || resolved.agent.dna || trimmed
  } catch {
    return trimmed
  }
}

function mergeJsonArrayFile(src: string, dest: string): void {
  let srcMessages: AgentMessage[] = []
  let destMessages: AgentMessage[] = []

  try {
    srcMessages = JSON.parse(readFileSync(src, "utf8")) as AgentMessage[]
  } catch {}
  try {
    destMessages = JSON.parse(readFileSync(dest, "utf8")) as AgentMessage[]
  } catch {}

  writeFileSync(dest, JSON.stringify([...destMessages, ...srcMessages]) + "\n")
  try { unlinkSync(src) } catch {}
}

function mergeJsonlFile(src: string, dest: string): void {
  let data = ""
  try {
    data = readFileSync(src, "utf8")
  } catch {
    return
  }

  if (!data.trim()) {
    try { unlinkSync(src) } catch {}
    return
  }

  appendFileSync(dest, data.endsWith("\n") ? data : `${data}\n`)
  try { unlinkSync(src) } catch {}
}

function repairQueueDirectory(queueDir: string): void {
  if (!existsSync(queueDir)) return
  for (const entry of readdirSync(queueDir)) {
    if (!entry.endsWith(".queue.jsonl")) continue
    const src = join(queueDir, entry)
    const canonicalTarget = canonicalQueueTargetId(entry.slice(0, -".queue.jsonl".length))
    const dest = queuedMessagePath(canonicalTarget)
    if (src === dest) continue
    mergeJsonlFile(src, dest)
  }
}

function migrateLegacyMessageIpc(): void {
  mkdirSync(storeDir(), { recursive: true })
  mkdirSync(messageQueueDir(), { recursive: true })

  try {
    for (const entry of readdirSync(IPC_DIR)) {
      if (!entry.endsWith(".msg.json")) continue
      mergeJsonArrayFile(join(IPC_DIR, entry), liveMessagePath(entry.slice(0, -".msg.json".length)))
    }
  } catch {}

  const oldQueueDir = legacyMessageQueueDir()
  if (existsSync(oldQueueDir)) {
    try {
      for (const entry of readdirSync(oldQueueDir)) {
        if (entry.endsWith(".msg.json")) {
          mergeJsonArrayFile(join(oldQueueDir, entry), liveMessagePath(entry.slice(0, -".msg.json".length)))
          continue
        }
        if (!entry.endsWith(".queue.jsonl")) continue
        const canonicalTarget = canonicalQueueTargetId(entry.slice(0, -".queue.jsonl".length))
        mergeJsonlFile(join(oldQueueDir, entry), queuedMessagePath(canonicalTarget))
      }
      rmSync(oldQueueDir, { recursive: true, force: true })
    } catch {}
  }

  const oldMessagesDir = legacyMessagesDir()
  if (existsSync(oldMessagesDir)) {
    try {
      for (const entry of readdirSync(oldMessagesDir)) {
        if (entry.endsWith(".msg.json")) {
          mergeJsonArrayFile(join(oldMessagesDir, entry), liveMessagePath(entry.slice(0, -".msg.json".length)))
          continue
        }
        if (!entry.endsWith(".queue.jsonl")) continue
        const canonicalTarget = canonicalQueueTargetId(entry.slice(0, -".queue.jsonl".length))
        mergeJsonlFile(join(oldMessagesDir, entry), queuedMessagePath(canonicalTarget))
      }
      const nestedQueueDir = join(oldMessagesDir, "queue")
      if (existsSync(nestedQueueDir)) {
        for (const entry of readdirSync(nestedQueueDir)) {
          if (!entry.endsWith(".queue.jsonl")) continue
          const canonicalTarget = canonicalQueueTargetId(entry.slice(0, -".queue.jsonl".length))
          mergeJsonlFile(join(nestedQueueDir, entry), queuedMessagePath(canonicalTarget))
        }
      }
      rmSync(oldMessagesDir, { recursive: true, force: true })
    } catch {}
  }

  repairQueueDirectory(messageQueueDir())
}

function ensureMessageIpcDirs(): void {
  ensureIpcDir()
  migrateLegacyMessageIpc()
}

function migrateLegacySessionIpc(): void {
  mkdirSync(storeDir(), { recursive: true })
  mkdirSync(sessionsDir(), { recursive: true })

  const oldDir = legacySessionsDir()
  if (!existsSync(oldDir)) return

  try {
    for (const entry of readdirSync(oldDir)) {
      if (!entry.endsWith(".json")) continue
      const from = join(oldDir, entry)
      const to = join(sessionsDir(), entry)
      try {
        if (!existsSync(to)) {
          const data = readFileSync(from, "utf8")
          writeFileSync(to, data)
        }
      } catch {}
      try { unlinkSync(from) } catch {}
    }
    rmSync(oldDir, { recursive: true, force: true })
  } catch {}
}

function ensureSessionIpcDir(): void {
  ensureIpcDir()
  migrateLegacySessionIpc()
}

// --- Command IPC ---

export interface AgentCommand {
  action: "walk" | "gesture" | "stop" | "send" | "chat" | "join" | "leave" | "place" | "destroy"
  x?: number
  y?: number
  type?: "wave" | "talk"
  text?: string
  target?: string
  name?: string
  dna?: string
  objectType?: string
  ts: number
}

export function writeCommand(sessionId: string, cmd: AgentCommand): void {
  ensureIpcDir()
  const file = join(IPC_DIR, `${sessionId}.queue.jsonl`)
  // Append command to queue (JSONL format: one JSON per line)
  try {
    // Get existing queue
    let queue: AgentCommand[] = []
    if (existsSync(file)) {
      const data = readFileSync(file, "utf8")
      queue = data.split("\n").filter(line => line.trim()).map(line => JSON.parse(line)) as AgentCommand[]
    }
    // Add new command, sorted by timestamp
    queue.push(cmd)
    queue.sort((a, b) => a.ts - b.ts)
    // Write back
    writeFileSync(file, queue.map(c => JSON.stringify(c)).join("\n") + "\n")
  } catch {
    // Fallback: just write the command (overwrites)
    writeFileSync(file, JSON.stringify(cmd) + "\n")
  }
}

export function pollCommands(): { sessionId: string; cmd: AgentCommand }[] {
  if (!existsSync(IPC_DIR)) return []
  const results: { sessionId: string; cmd: AgentCommand }[] = []
  const files = readdirSync(IPC_DIR).filter(f => f.endsWith(".queue.jsonl"))
  for (const file of files) {
    const sessionId = file.replace(".queue.jsonl", "")
    const path = join(IPC_DIR, file)
    try {
      const data = readFileSync(path, "utf8")
      // Read all commands in queue (JSONL format)
      for (const line of data.split("\n")) {
        if (!line.trim()) continue
        try {
          const cmd = JSON.parse(line) as AgentCommand
          results.push({ sessionId, cmd })
        } catch {
          // Ignore individual parse errors
        }
      }
    } catch {
      // Ignore file read errors
    }
    try { unlinkSync(path) } catch {}
  }
  return results
}


// --- Message IPC ---

export interface AgentMessage {
  from: string
  fromName: string
  text: string
  ts: number
}

export function writeMessages(sessionId: string, messages: AgentMessage[]): void {
  ensureMessageIpcDirs()
  const file = liveMessagePath(sessionId)
  // Append to existing messages if file exists
  let existing: AgentMessage[] = []
  try {
    const data = readFileSync(file, "utf8")
    existing = JSON.parse(data) as AgentMessage[]
  } catch {}
  existing.push(...messages)
  writeFileSync(file, JSON.stringify(existing) + "\n")
}

export function readMessages(sessionId: string): AgentMessage[] {
  ensureMessageIpcDirs()
  const file = liveMessagePath(sessionId)
  try {
    const data = readFileSync(file, "utf8")
    unlinkSync(file)
    return JSON.parse(data) as AgentMessage[]
  } catch {
    return []
  }
}

// --- Message Queue (for offline agents/humans) ---

export interface QueuedMessage extends AgentMessage {
  fromDna?: string
}

/**
 * Queue a message for an offline agent or human
 * Messages persist until agent/human comes online and reads them
 */
export function queueMessage(targetId: string, message: QueuedMessage): void {
  ensureMessageIpcDirs()
  const file = queuedMessagePath(canonicalQueueTargetId(targetId))
  try {
    const line = JSON.stringify(message) + "\n"
    appendFileSync(file, line)
  } catch (e) {
    // Fallback: write to file
    appendFileSync(file, JSON.stringify(message) + "\n")
  }
}

/**
 * Read all queued messages for an agent/human and clear the queue
 */
export function readQueuedMessages(targetId: string): QueuedMessage[] {
  ensureMessageIpcDirs()
  const file = queuedMessagePath(canonicalQueueTargetId(targetId))

  if (!existsSync(file)) return []

  try {
    const data = readFileSync(file, "utf8")
    const messages = data
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as QueuedMessage)

    // Clear the queue after reading
    unlinkSync(file)
    return messages
  } catch {
    return []
  }
}

/**
 * Check if there are queued messages for an agent/human
 */
export function hasQueuedMessages(targetId: string): boolean {
  ensureMessageIpcDirs()
  const file = queuedMessagePath(canonicalQueueTargetId(targetId))
  return existsSync(file)
}

const PERSIST_FILES = new Set(["agents.json", "chat.jsonl"])

// --- Session tracking ---

export interface SessionState {
  sessionId: string
  x: number
  y: number
  footY: number
  idle: boolean
  dna: string
  name?: string
}

export function writeSessionState(sessionId: string, state: Omit<SessionState, 'sessionId'>): void {
  ensureSessionIpcDir()
  const file = join(sessionsDir(), `${sessionId}.json`)
  try {
    let existing: Record<string, unknown> = {}
    try {
      const data = readFileSync(file, "utf8")
      const parsed = JSON.parse(data) as Record<string, unknown>
      if (parsed && typeof parsed === "object") {
        existing = parsed
      }
    } catch {}
    writeFileSync(file, JSON.stringify({ ...existing, sessionId, ...state }) + "\n")
  } catch (e) {
    // Silently fail - not critical
  }
}

export function readSessionState(sessionId: string): SessionState | null {
  ensureSessionIpcDir()
  const file = join(sessionsDir(), `${sessionId}.json`)
  try {
    const data = readFileSync(file, "utf8")
    return JSON.parse(data) as SessionState
  } catch {
    return null
  }
}

export function cleanupIpc(): void {
  if (!existsSync(IPC_DIR)) return
  try { rmSync(messageQueueDir(), { recursive: true, force: true }) } catch {}
  try { rmSync(sessionsDir(), { recursive: true, force: true }) } catch {}
  try {
    const files = readdirSync(IPC_DIR)
    for (const file of files) {
      if (PERSIST_FILES.has(file)) continue
      if (file === "messages" || file === "message-queue" || file === "sessions") {
        try { rmSync(join(IPC_DIR, file), { recursive: true, force: true }) } catch {}
        continue
      }
      try { unlinkSync(join(IPC_DIR, file)) } catch {}
    }
  } catch {}
}
