import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { basename, join } from "path"
import * as msgStorage from "./message-storage.js"

export type WorkspaceMessageKind = "chat" | "dm" | "system"

export interface WorkspaceSession {
  sessionId: string
  name: string
  dna: string
  joinedAt: number
  lastSeenAt: number
}

export interface WorkspaceMessage {
  id: string
  kind: WorkspaceMessageKind
  channel?: string          // NEW: for channel messages
  from: string
  fromName: string
  fromDna?: string
  target?: string
  targetName?: string
  targetDna?: string
  text: string
  ts: number
}

export type AvatarSizeMode = "large" | "small" | "tiny"

export interface WorkspaceSettings {
  avatarSize?: AvatarSizeMode
}

interface WorkspaceMeta {
  version: number
  projectName: string
  createdAt: number
  updatedAt: number
  settings?: WorkspaceSettings
}

const WORKSPACE_VERSION = 1
const SESSION_STALE_MS = 35_000

function termlingsDir(root: string): string {
  return join(root, ".termlings")
}

function sessionsDir(root: string): string {
  return join(termlingsDir(root), "sessions")
}

function storeDir(root: string): string {
  return join(termlingsDir(root), "store")
}

function presenceDir(root: string): string {
  return join(storeDir(root), "presence")
}

function workspaceMetaPath(root: string): string {
  return join(termlingsDir(root), "workspace.json")
}

function messagesPath(root: string): string {
  return join(storeDir(root), "messages.jsonl")
}

function parseJsonLines<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return []
  try {
    const raw = readFileSync(filePath, "utf8")
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as T)
  } catch {
    return []
  }
}

function writeWorkspaceMeta(root: string, meta: WorkspaceMeta): void {
  writeFileSync(workspaceMetaPath(root), JSON.stringify(meta, null, 2) + "\n")
}

function isValidAvatarSize(value: unknown): value is AvatarSizeMode {
  return value === "large" || value === "small" || value === "tiny"
}

function sanitizeWorkspaceSettings(raw: unknown): WorkspaceSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const input = raw as Record<string, unknown>
  const out: WorkspaceSettings = {}
  if (isValidAvatarSize(input.avatarSize)) {
    out.avatarSize = input.avatarSize
  }
  return out
}

function ensureWorkspaceMeta(root: string): WorkspaceMeta {
  const now = Date.now()
  const path = workspaceMetaPath(root)
  if (!existsSync(path)) {
    return {
      version: WORKSPACE_VERSION,
      projectName: basename(root),
      createdAt: now,
      updatedAt: now,
      settings: {},
    }
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : now
    const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : now
    const projectName =
      typeof parsed.projectName === "string" && parsed.projectName.trim().length > 0
        ? parsed.projectName
        : basename(root)
    const version = typeof parsed.version === "number" ? parsed.version : WORKSPACE_VERSION
    const settings = sanitizeWorkspaceSettings(parsed.settings)
    return { version, projectName, createdAt, updatedAt, settings }
  } catch {
    return {
      version: WORKSPACE_VERSION,
      projectName: basename(root),
      createdAt: now,
      updatedAt: now,
      settings: {},
    }
  }
}

export function readWorkspaceSettings(root = process.cwd()): WorkspaceSettings {
  ensureWorkspaceDirs(root)
  const meta = ensureWorkspaceMeta(root)
  return sanitizeWorkspaceSettings(meta.settings)
}

export function updateWorkspaceSettings(
  patch: Partial<WorkspaceSettings>,
  root = process.cwd(),
): WorkspaceSettings {
  ensureWorkspaceDirs(root)
  const now = Date.now()
  const meta = ensureWorkspaceMeta(root)
  const merged = sanitizeWorkspaceSettings({
    ...meta.settings,
    ...patch,
  })
  writeWorkspaceMeta(root, {
    ...meta,
    updatedAt: now,
    settings: merged,
  })
  return merged
}

function touchWorkspace(root: string): void {
  const now = Date.now()
  const path = workspaceMetaPath(root)
  if (!existsSync(path)) {
    writeWorkspaceMeta(root, {
      version: WORKSPACE_VERSION,
      projectName: basename(root),
      createdAt: now,
      updatedAt: now,
    })
    return
  }

  try {
    const current = JSON.parse(readFileSync(path, "utf8")) as WorkspaceMeta
    current.updatedAt = now
    writeWorkspaceMeta(root, current)
  } catch {
    writeWorkspaceMeta(root, {
      version: WORKSPACE_VERSION,
      projectName: basename(root),
      createdAt: now,
      updatedAt: now,
    })
  }
}

function sessionFile(root: string, sessionId: string): string {
  return join(sessionsDir(root), `${sessionId}.json`)
}

function typingFile(root: string, sessionId: string): string {
  return join(presenceDir(root), `${sessionId}.typing.json`)
}

function clearSessionTyping(sessionId: string, root: string, ts: number): void {
  try {
    writeFileSync(
      typingFile(root, sessionId),
      JSON.stringify({ typing: false, source: "terminal", updatedAt: ts }) + "\n",
    )
  } catch {}
}

function migrateLegacyTypingFiles(root: string): void {
  const base = termlingsDir(root)
  const targetDir = presenceDir(root)

  let entries: string[] = []
  try {
    entries = readdirSync(base)
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.endsWith(".typing.json")) continue
    const from = join(base, entry)
    const to = join(targetDir, entry)
    try {
      if (!existsSync(to)) {
        renameSync(from, to)
      } else {
        rmSync(from, { force: true })
      }
    } catch {}
  }
}

function normalizeSession(raw: any, fallbackSessionId: string): WorkspaceSession | null {
  if (!raw || typeof raw !== "object") return null
  const hasPresenceTimestamps = typeof raw.joinedAt === "number" || typeof raw.lastSeenAt === "number"
  if (!hasPresenceTimestamps) return null
  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : fallbackSessionId
  const rawName = typeof raw.name === "string" && raw.name.length > 0 ? raw.name : sessionId
  const name = rawName.replace(/\x1b\[[0-9;]*[a-zA-Z~]/g, "")
  const dna = typeof raw.dna === "string" && raw.dna.length > 0 ? raw.dna : "0000000"
  const now = Date.now()
  const joinedAt = typeof raw.joinedAt === "number" ? raw.joinedAt : now
  const lastSeenAt = typeof raw.lastSeenAt === "number" ? raw.lastSeenAt : now
  return { sessionId, name, dna, joinedAt, lastSeenAt }
}

export function ensureWorkspaceDirs(root = process.cwd()): void {
  const base = termlingsDir(root)
  mkdirSync(base, { recursive: true })
  mkdirSync(join(base, "agents"), { recursive: true })
  mkdirSync(join(base, "humans"), { recursive: true })
  mkdirSync(sessionsDir(root), { recursive: true })
  mkdirSync(storeDir(root), { recursive: true })
  mkdirSync(presenceDir(root), { recursive: true })
  mkdirSync(join(base, "browser"), { recursive: true })
  migrateLegacyTypingFiles(root)
  msgStorage.initializeMessageDirs(root)
  touchWorkspace(root)
}

export function clearWorkspaceRuntime(root = process.cwd()): void {
  ensureWorkspaceDirs(root)
  const base = termlingsDir(root)

  for (const entry of readdirSync(base)) {
    if (
      entry.endsWith(".queue.jsonl")
      || entry.endsWith(".msg.json")
      || entry.endsWith(".typing.json")
      || entry === "state.json"
    ) {
      try {
        rmSync(join(base, entry), { force: true })
      } catch {}
    }
  }

  try {
    const presenceEntries = readdirSync(presenceDir(root))
    for (const file of presenceEntries) {
      if (!file.endsWith(".typing.json")) continue
      rmSync(join(presenceDir(root), file), { force: true })
    }
  } catch {}

  try {
    const sessions = readdirSync(sessionsDir(root))
    for (const file of sessions) {
      if (!file.endsWith(".json")) continue
      unlinkSync(join(sessionsDir(root), file))
    }
  } catch {}
}

export function upsertSession(
  sessionId: string,
  data: { name: string; dna: string; joinedAt?: number; lastSeenAt?: number },
  root = process.cwd(),
): WorkspaceSession {
  ensureWorkspaceDirs(root)
  const path = sessionFile(root, sessionId)
  const now = Date.now()

  let existing: WorkspaceSession | null = null
  try {
    existing = JSON.parse(readFileSync(path, "utf8")) as WorkspaceSession
  } catch {
    existing = null
  }

  const session: WorkspaceSession = {
    sessionId,
    name: data.name,
    dna: data.dna,
    joinedAt: existing?.joinedAt ?? data.joinedAt ?? now,
    lastSeenAt: data.lastSeenAt ?? now,
  }

  writeFileSync(path, JSON.stringify(session, null, 2) + "\n")
  touchWorkspace(root)
  return session
}

export function removeSession(sessionId: string, root = process.cwd()): void {
  const path = sessionFile(root, sessionId)
  try {
    unlinkSync(path)
  } catch {}
  touchWorkspace(root)
}

export function readSession(sessionId: string, root = process.cwd()): WorkspaceSession | null {
  const path = sessionFile(root, sessionId)
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
    return normalizeSession(parsed, sessionId)
  } catch {
    return null
  }
}

export function listSessions(root = process.cwd()): WorkspaceSession[] {
  ensureWorkspaceDirs(root)
  const out: WorkspaceSession[] = []
  const now = Date.now()
  for (const file of readdirSync(sessionsDir(root))) {
    if (!file.endsWith(".json")) continue
    try {
      const parsed = JSON.parse(readFileSync(join(sessionsDir(root), file), "utf8")) as unknown
      const sessionId = file.slice(0, -".json".length)
      const normalized = normalizeSession(parsed, sessionId)
      if (!normalized) continue
      if (now - normalized.lastSeenAt > SESSION_STALE_MS) {
        try {
          unlinkSync(join(sessionsDir(root), file))
        } catch {}
        continue
      }
      out.push(normalized)
    } catch {}
  }
  out.sort((a, b) => a.joinedAt - b.joinedAt)
  return out
}

export function appendWorkspaceMessage(
  message: Omit<WorkspaceMessage, "id" | "ts"> & { id?: string; ts?: number },
  root = process.cwd(),
): WorkspaceMessage {
  ensureWorkspaceDirs(root)
  const record = msgStorage.appendMessage(message, root)
  if (record.kind !== "system" && typeof record.from === "string" && record.from.startsWith("tl-")) {
    clearSessionTyping(record.from, root, record.ts)
  }
  touchWorkspace(root)
  return record
}

export function readWorkspaceMessages(
  opts: { limit?: number } = {},
  root = process.cwd(),
): WorkspaceMessage[] {
  ensureWorkspaceDirs(root)
  const limit = opts.limit ?? 300
  return msgStorage.getRecentMessages(limit, root)
}

// Re-export message storage functions for convenience
export const getChannelMessages = msgStorage.getChannelMessages
export const getDmMessages = msgStorage.getDmMessages
export const getSystemMessages = msgStorage.getSystemMessages
export const getChannels = msgStorage.getChannels
export const getDmThreads = msgStorage.getDmThreads
export const getMessageIndex = msgStorage.getMessageIndex
