import { appendFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { readLastJsonLines } from "../workspace/jsonl.js"

export type AppActivityLevel = "summary" | "detail"
export type AppActivitySurface = "feed" | "thread" | "both"

export interface AppActivityEntry {
  ts: number
  app: string
  kind: string
  text: string
  level?: AppActivityLevel
  surface?: AppActivitySurface
  actorSessionId?: string
  actorName?: string
  actorSlug?: string
  actorDna?: string
  threadId?: string
  result?: "success" | "error" | "timeout"
  meta?: Record<string, unknown>
}

function activityDir(root: string): string {
  return join(root, ".termlings", "store", "activity")
}

function threadActivityDir(root: string): string {
  return join(activityDir(root), "thread")
}

function activityPath(root: string): string {
  return join(activityDir(root), "all.jsonl")
}

function sanitizeActivityThreadKey(threadId: string): string {
  return threadId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown"
}

function threadActivityPath(threadId: string, root: string): string {
  return join(threadActivityDir(root), `${sanitizeActivityThreadKey(threadId)}.jsonl`)
}

function normalizeActivityEntry(entry: AppActivityEntry): AppActivityEntry | null {
  const text = String(entry.text || "").trim()
  const app = String(entry.app || "").trim()
  const kind = String(entry.kind || "").trim()
  const ts = Number(entry.ts)
  if (!text || !app || !kind || !Number.isFinite(ts)) return null

  const normalized: AppActivityEntry = {
    ts,
    app,
    kind,
    text,
    level: entry.level === "detail" ? "detail" : "summary",
    surface: entry.surface === "feed" || entry.surface === "thread" ? entry.surface : "both",
    actorSessionId: typeof entry.actorSessionId === "string" && entry.actorSessionId.trim()
      ? entry.actorSessionId.trim()
      : undefined,
    actorName: typeof entry.actorName === "string" && entry.actorName.trim()
      ? entry.actorName.trim()
      : undefined,
    actorSlug: typeof entry.actorSlug === "string" && entry.actorSlug.trim()
      ? entry.actorSlug.trim()
      : undefined,
    actorDna: typeof entry.actorDna === "string" && entry.actorDna.trim()
      ? entry.actorDna.trim()
      : undefined,
    threadId: typeof entry.threadId === "string" && entry.threadId.trim()
      ? entry.threadId.trim()
      : undefined,
    result: entry.result === "error" || entry.result === "timeout" ? entry.result : entry.result === "success" ? "success" : undefined,
    meta: entry.meta && typeof entry.meta === "object" && !Array.isArray(entry.meta)
      ? entry.meta
      : undefined,
  }
  return normalized
}

export function ensureActivityDirs(root = process.cwd()): void {
  mkdirSync(activityDir(root), { recursive: true })
  mkdirSync(threadActivityDir(root), { recursive: true })
}

export function appendAppActivity(entry: AppActivityEntry, root = process.cwd()): AppActivityEntry | null {
  const normalized = normalizeActivityEntry(entry)
  if (!normalized) return null
  ensureActivityDirs(root)

  try {
    appendFileSync(activityPath(root), JSON.stringify(normalized) + "\n", "utf8")
  } catch {
    // ignore logging errors
  }

  if (normalized.threadId && normalized.surface !== "feed") {
    try {
      appendFileSync(threadActivityPath(normalized.threadId, root), JSON.stringify(normalized) + "\n", "utf8")
    } catch {
      // ignore logging errors
    }
  }

  return normalized
}

export function appendCurrentAgentThreadActivity(
  entry: Omit<AppActivityEntry, "ts" | "actorSessionId" | "actorName" | "actorSlug" | "actorDna" | "threadId"> & {
    ts?: number
    threadId?: string
  },
  root = process.cwd(),
): AppActivityEntry | null {
  const actorSessionId = String(process.env.TERMLINGS_SESSION_ID || "").trim()
  const actorName = String(process.env.TERMLINGS_AGENT_NAME || "").trim()
  const actorSlug = String(process.env.TERMLINGS_AGENT_SLUG || "").trim()
  const actorDna = String(process.env.TERMLINGS_AGENT_DNA || "").trim()
  const threadId = String(entry.threadId || "").trim() || resolveAgentActivityThreadId({
    agentSlug: actorSlug || undefined,
    agentDna: actorDna || undefined,
  })

  if (!threadId || (!actorSessionId && !actorSlug && !actorDna && !actorName)) {
    return null
  }

  return appendAppActivity(
    {
      ...entry,
      ts: typeof entry.ts === "number" && Number.isFinite(entry.ts) ? entry.ts : Date.now(),
      actorSessionId: actorSessionId || undefined,
      actorName: actorName || undefined,
      actorSlug: actorSlug || undefined,
      actorDna: actorDna || undefined,
      threadId,
    },
    root,
  )
}

export function readRecentAppActivityEntries(limit: number, root = process.cwd()): AppActivityEntry[] {
  if (limit <= 0) return []
  const path = activityPath(root)
  if (!existsSync(path)) return []
  return readLastJsonLines<AppActivityEntry>(path, limit)
    .map((entry) => normalizeActivityEntry(entry))
    .filter((entry): entry is AppActivityEntry => Boolean(entry))
}

export function readRecentThreadActivityEntries(threadId: string, limit: number, root = process.cwd()): AppActivityEntry[] {
  const normalizedThreadId = String(threadId || "").trim()
  if (!normalizedThreadId || limit <= 0) return []
  const path = threadActivityPath(normalizedThreadId, root)
  if (!existsSync(path)) return []
  return readLastJsonLines<AppActivityEntry>(path, limit)
    .map((entry) => normalizeActivityEntry(entry))
    .filter((entry): entry is AppActivityEntry => Boolean(entry))
}

export function resolveAgentActivityThreadId(identity: {
  threadId?: string
  agentSlug?: string
  agentDna?: string
}): string | undefined {
  if (identity.threadId && identity.threadId.trim()) return identity.threadId.trim()
  if (identity.agentSlug && identity.agentSlug.trim()) return `agent:${identity.agentSlug.trim()}`
  if (identity.agentDna && identity.agentDna.trim()) return `agent:${identity.agentDna.trim()}`
  return undefined
}
