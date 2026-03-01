import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs"
import { basename, join, resolve } from "path"

export interface WorkspaceMeta {
  version: number
  projectName: string
  createdAt: number
  updatedAt: number
}

export interface WorkspaceSession {
  sessionId: string
  name: string
  dna: string
  joinedAt: number
  lastSeenAt: number
}

export interface WorkspaceMessage {
  id: string
  kind: "chat" | "dm" | "system"
  from: string
  fromName: string
  fromDna?: string
  target?: string
  targetName?: string
  targetDna?: string
  text: string
  ts: number
}

export interface WorkspaceAgent {
  id: string
  agentId?: string
  name: string
  dna: string
  title?: string
  online: boolean
  typing: boolean
  activitySource?: "hook"
  sessionIds: string[]
  source: "saved" | "ephemeral"
}

interface Task {
  id: string
  title: string
  status: string
  priority: string
  assignedTo?: string
  updatedAt: number
}

interface CalendarEvent {
  id: string
  title: string
  description: string
  assignedAgents: string[]
  startTime: number
  endTime: number
  recurrence: string
  enabled: boolean
  nextNotification?: number
}

interface AgentInboxMessage {
  from: string
  fromName: string
  text: string
  ts: number
}

const SESSION_STALE_MS = 35_000
const HOOK_TYPING_STALE_MS = 8_000

interface SessionActivity {
  typing: boolean
  source?: "hook"
  updatedAt: number
}

function defaultProjectRoot(): string {
  if (process.env.TERMLINGS_PROJECT_ROOT) {
    return resolve(process.env.TERMLINGS_PROJECT_ROOT)
  }
  const cwd = process.cwd()
  if (basename(cwd) === "web") {
    return resolve(cwd, "..")
  }
  return resolve(cwd)
}

function projectRoot(root?: string): string {
  return root ? resolve(root) : defaultProjectRoot()
}

function termlingsDir(root?: string): string {
  return join(projectRoot(root), ".termlings")
}

function sessionsDir(root?: string): string {
  return join(termlingsDir(root), "sessions")
}

function agentsDir(root?: string): string {
  return join(termlingsDir(root), "agents")
}

function storeDir(root?: string): string {
  return join(termlingsDir(root), "store")
}

function workspaceMetaPath(root?: string): string {
  return join(termlingsDir(root), "workspace.json")
}

function messagesPath(root?: string): string {
  return join(storeDir(root), "messages.jsonl")
}

function inboxPath(sessionId: string, root?: string): string {
  return join(termlingsDir(root), `${sessionId}.msg.json`)
}

function tasksPath(root?: string): string {
  return join(storeDir(root), "tasks", "tasks.json")
}

function calendarPath(root?: string): string {
  return join(storeDir(root), "calendar", "calendar.json")
}

function typingPath(sessionId: string, root?: string): string {
  return join(termlingsDir(root), `${sessionId}.typing.json`)
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T
  } catch {
    return fallback
  }
}

function safeReadJsonLines<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return []
  try {
    return readFileSync(filePath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as T)
  } catch {
    return []
  }
}

function normalizeSession(raw: any, fallbackSessionId: string): WorkspaceSession | null {
  if (!raw || typeof raw !== "object") return null
  const hasPresenceTimestamps = typeof raw.joinedAt === "number" || typeof raw.lastSeenAt === "number"
  if (!hasPresenceTimestamps) return null
  const now = Date.now()
  return {
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : fallbackSessionId,
    name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : fallbackSessionId,
    dna: typeof raw.dna === "string" && raw.dna.length > 0 ? raw.dna : "0000000",
    joinedAt: typeof raw.joinedAt === "number" ? raw.joinedAt : now,
    lastSeenAt: typeof raw.lastSeenAt === "number" ? raw.lastSeenAt : now,
  }
}

interface SavedAgent {
  agentId: string
  name: string
  dna: string
  title?: string
}

function parseSoul(content: string): { name: string; dna: string; title?: string } | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/)
  if (!frontmatterMatch) return null
  const yaml = frontmatterMatch[1] || ""
  const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const dna = yaml.match(/^dna:\s*(.+)$/m)?.[1]?.trim()
  const title = yaml.match(/^title:\s*(.+)$/m)?.[1]?.trim()

  if (!name || !dna) return null
  return { name, dna, title }
}

function listSavedAgents(root?: string): SavedAgent[] {
  const currentRoot = projectRoot(root)
  const base = agentsDir(currentRoot)
  if (!existsSync(base)) return []

  const saved: SavedAgent[] = []
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".")) continue

    const soulPath = join(base, entry.name, "SOUL.md")
    if (!existsSync(soulPath)) continue

    try {
      const content = readFileSync(soulPath, "utf8")
      const parsed = parseSoul(content)
      if (!parsed) continue
      saved.push({
        agentId: entry.name,
        name: parsed.name,
        dna: parsed.dna,
        title: parsed.title,
      })
    } catch {}
  }

  saved.sort((a, b) => a.name.localeCompare(b.name))
  return saved
}

function mergeAgentPresence(
  savedAgents: SavedAgent[],
  sessions: WorkspaceSession[],
  activityBySessionId: Map<string, SessionActivity>,
): WorkspaceAgent[] {
  const byDna = new Map<string, WorkspaceAgent>()

  for (const agent of savedAgents) {
    byDna.set(agent.dna, {
      id: `saved:${agent.agentId}`,
      agentId: agent.agentId,
      name: agent.name,
      dna: agent.dna,
      title: agent.title,
      online: false,
      typing: false,
      sessionIds: [],
      source: "saved",
    })
  }

  for (const session of sessions) {
    const activity = activityBySessionId.get(session.sessionId)
    const existing = byDna.get(session.dna)
    if (existing) {
      existing.online = true
      if (activity?.typing) {
        existing.typing = true
        existing.activitySource = activity.source
      }
      if (!existing.sessionIds.includes(session.sessionId)) {
        existing.sessionIds.push(session.sessionId)
      }
      continue
    }

    byDna.set(session.dna, {
      id: `online:${session.sessionId}`,
      name: session.name,
      dna: session.dna,
      online: true,
      typing: activity?.typing ?? false,
      activitySource: activity?.source,
      sessionIds: [session.sessionId],
      source: "ephemeral",
    })
  }

  return Array.from(byDna.values()).sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function resolveHookTyping(sessionId: string, root?: string): { typing: boolean; updatedAt: number } | null {
  const direct = safeReadJson<{ typing?: unknown; updatedAt?: unknown } | null>(typingPath(sessionId, root), null)
  if (direct && typeof direct.typing === "boolean") {
    return {
      typing: direct.typing,
      updatedAt: typeof direct.updatedAt === "number" ? direct.updatedAt : 0,
    }
  }
  return null
}

function collectSessionActivity(sessions: WorkspaceSession[], root?: string): {
  bySessionId: Map<string, SessionActivity>
  updatedAt: number
} {
  const bySessionId = new Map<string, SessionActivity>()
  const now = Date.now()
  let maxUpdatedAt = 0

  for (const session of sessions) {
    const hookTyping = resolveHookTyping(session.sessionId, root)
    const hookUpdatedAt = hookTyping?.updatedAt ?? 0
    const hookFresh = hookUpdatedAt > 0 && now - hookUpdatedAt <= HOOK_TYPING_STALE_MS
    const hookTypingActive = hookFresh && hookTyping?.typing === true

    let typing = false
    let source: SessionActivity["source"]
    if (hookTypingActive) {
      typing = true
      source = "hook"
    }

    const updatedAt = hookUpdatedAt

    bySessionId.set(session.sessionId, { typing, source, updatedAt })
    if (updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt
  }

  return { bySessionId, updatedAt: maxUpdatedAt }
}

export function ensureWorkspace(root?: string): void {
  const currentRoot = projectRoot(root)
  const base = termlingsDir(currentRoot)
  mkdirSync(base, { recursive: true })
  mkdirSync(join(base, "agents"), { recursive: true })
  mkdirSync(join(base, "objects"), { recursive: true })
  mkdirSync(sessionsDir(currentRoot), { recursive: true })
  mkdirSync(storeDir(currentRoot), { recursive: true })

  if (!existsSync(workspaceMetaPath(currentRoot))) {
    const now = Date.now()
    const meta: WorkspaceMeta = {
      version: 1,
      projectName: basename(currentRoot),
      createdAt: now,
      updatedAt: now,
    }
    writeFileSync(workspaceMetaPath(currentRoot), JSON.stringify(meta, null, 2) + "\n")
  }
}

function touchWorkspace(root?: string): void {
  const currentRoot = projectRoot(root)
  const meta = safeReadJson<WorkspaceMeta>(workspaceMetaPath(currentRoot), {
    version: 1,
    projectName: basename(currentRoot),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
  meta.updatedAt = Date.now()
  writeFileSync(workspaceMetaPath(currentRoot), JSON.stringify(meta, null, 2) + "\n")
}

export function upsertWorkspaceSession(
  input: Pick<WorkspaceSession, "sessionId" | "name" | "dna">,
  root?: string,
): WorkspaceSession {
  const currentRoot = projectRoot(root)
  ensureWorkspace(currentRoot)

  const path = join(sessionsDir(currentRoot), `${input.sessionId}.json`)
  const existing = safeReadJson<WorkspaceSession | null>(path, null)
  const now = Date.now()
  const session: WorkspaceSession = {
    sessionId: input.sessionId,
    name: input.name,
    dna: input.dna,
    joinedAt: existing?.joinedAt ?? now,
    lastSeenAt: now,
  }
  writeFileSync(path, JSON.stringify(session, null, 2) + "\n")
  touchWorkspace(currentRoot)
  return session
}

export function removeWorkspaceSession(sessionId: string, root?: string): void {
  const currentRoot = projectRoot(root)
  const path = join(sessionsDir(currentRoot), `${sessionId}.json`)
  try {
    unlinkSync(path)
  } catch {}
  touchWorkspace(currentRoot)
}

export function listSessions(root?: string): WorkspaceSession[] {
  const currentRoot = projectRoot(root)
  ensureWorkspace(currentRoot)
  const sessions: WorkspaceSession[] = []
  const now = Date.now()
  for (const file of readdirSync(sessionsDir(currentRoot))) {
    if (!file.endsWith(".json")) continue
    const sessionRaw = safeReadJson<unknown>(join(sessionsDir(currentRoot), file), null)
    const normalized = normalizeSession(sessionRaw, file.slice(0, -".json".length))
    if (!normalized) continue
    if (now - normalized.lastSeenAt > SESSION_STALE_MS) {
      try {
        unlinkSync(join(sessionsDir(currentRoot), file))
      } catch {}
      continue
    }
    sessions.push(normalized)
  }
  sessions.sort((a, b) => a.joinedAt - b.joinedAt)
  return sessions
}

export function loadWorkspaceSnapshot(root?: string): {
  meta: WorkspaceMeta | null
  sessions: WorkspaceSession[]
  agents: WorkspaceAgent[]
  messages: WorkspaceMessage[]
  tasks: Task[]
  calendarEvents: CalendarEvent[]
  activityUpdatedAt: number
  generatedAt: number
} {
  const currentRoot = projectRoot(root)
  ensureWorkspace(currentRoot)

  const meta = safeReadJson<WorkspaceMeta | null>(workspaceMetaPath(currentRoot), null)
  const sessions = listSessions(currentRoot)
  const activity = collectSessionActivity(sessions, currentRoot)
  const agents = mergeAgentPresence(listSavedAgents(currentRoot), sessions, activity.bySessionId)

  const messages = safeReadJsonLines<WorkspaceMessage>(messagesPath(currentRoot))
  const tasks = safeReadJson<Task[]>(tasksPath(currentRoot), [])
  const calendarEvents = safeReadJson<CalendarEvent[]>(calendarPath(currentRoot), [])

  return {
    meta,
    sessions,
    agents,
    messages: messages.slice(-300),
    tasks: tasks.slice(-200),
    calendarEvents,
    activityUpdatedAt: activity.updatedAt,
    generatedAt: Date.now(),
  }
}

export function postWorkspaceMessage(input: {
  kind: "chat" | "dm" | "system"
  text: string
  from: string
  fromName: string
  fromDna?: string
  target?: string
  targetName?: string
  targetDna?: string
}, root?: string): WorkspaceMessage {
  const currentRoot = projectRoot(root)
  ensureWorkspace(currentRoot)
  const record: WorkspaceMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now(),
    kind: input.kind,
    from: input.from,
    fromName: input.fromName,
    fromDna: input.fromDna,
    target: input.target,
    targetName: input.targetName,
    targetDna: input.targetDna,
    text: input.text,
  }

  const existing = existsSync(messagesPath(currentRoot)) ? readFileSync(messagesPath(currentRoot), "utf8") : ""
  writeFileSync(messagesPath(currentRoot), `${existing}${JSON.stringify(record)}\n`)

  if (record.kind === "dm" && record.target) {
    const inboxFile = inboxPath(record.target, currentRoot)
    const inbox = safeReadJson<AgentInboxMessage[]>(inboxFile, [])
    inbox.push({
      from: record.from,
      fromName: record.fromName,
      text: record.text,
      ts: record.ts,
    })
    writeFileSync(inboxFile, JSON.stringify(inbox) + "\n")
  }

  touchWorkspace(currentRoot)
  return record
}
