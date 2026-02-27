import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

export function ipcDir(room = "default"): string {
  return join(homedir(), ".termlings", "rooms", room)
}

export let IPC_DIR = ipcDir("default")

export function setRoom(room: string): void {
  IPC_DIR = ipcDir(room)
}

export function ensureIpcDir(): void {
  mkdirSync(IPC_DIR, { recursive: true })
}

// --- Command IPC ---

export interface AgentCommand {
  action: "walk" | "gesture" | "stop" | "send" | "chat" | "join" | "leave" | "build" | "destroy"
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
  const file = join(IPC_DIR, `${sessionId}.cmd.json`)
  writeFileSync(file, JSON.stringify(cmd) + "\n")
}

export function pollCommands(): { sessionId: string; cmd: AgentCommand }[] {
  if (!existsSync(IPC_DIR)) return []
  const results: { sessionId: string; cmd: AgentCommand }[] = []
  const files = readdirSync(IPC_DIR).filter(f => f.endsWith(".cmd.json"))
  for (const file of files) {
    const sessionId = file.replace(".cmd.json", "")
    const path = join(IPC_DIR, file)
    try {
      const data = readFileSync(path, "utf8")
      const cmd = JSON.parse(data) as AgentCommand
      results.push({ sessionId, cmd })
    } catch {
      // Ignore parse errors
    }
    try { unlinkSync(path) } catch {}
  }
  return results
}

// --- State IPC ---

export interface AgentStateEntity {
  sessionId: string
  name: string
  x: number
  y: number
  footY: number
  idle: boolean
  dna: string
}

export interface AgentState {
  entities: AgentStateEntity[]
  map: {
    width: number; height: number; name?: string; tiles?: string[][]; mode?: "simple"
    rooms?: {
      id: number; wallType: string
      bounds: { x: number; y: number; w: number; h: number }
      center: { x: number; y: number }
      doors: { x: number; y: number; toRoom: number | null }[]
    }[]
  }
  objects?: { x: number; y: number; type: string; width: number; height: number; walkable: boolean; occupants?: string[] }[]
}

export function writeState(state: AgentState): void {
  const file = join(IPC_DIR, "state.json")
  writeFileSync(file, JSON.stringify(state) + "\n")
}

export function readState(): AgentState | null {
  const file = join(IPC_DIR, "state.json")
  try {
    const data = readFileSync(file, "utf8")
    return JSON.parse(data) as AgentState
  } catch {
    return null
  }
}

// --- Message IPC ---

export interface AgentMessage {
  from: string
  fromName: string
  text: string
  ts: number
}

export function writeMessages(sessionId: string, messages: AgentMessage[]): void {
  const file = join(IPC_DIR, `${sessionId}.msg.json`)
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
  const file = join(IPC_DIR, `${sessionId}.msg.json`)
  try {
    const data = readFileSync(file, "utf8")
    unlinkSync(file)
    return JSON.parse(data) as AgentMessage[]
  } catch {
    return []
  }
}

const PERSIST_FILES = new Set(["agents.json", "chat.jsonl", "placements.json"])

export function cleanupIpc(): void {
  if (!existsSync(IPC_DIR)) return
  try {
    const files = readdirSync(IPC_DIR)
    for (const file of files) {
      if (PERSIST_FILES.has(file)) continue
      try { unlinkSync(join(IPC_DIR, file)) } catch {}
    }
  } catch {}
}
