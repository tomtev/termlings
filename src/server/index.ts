import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "fs"
import { createHash } from "crypto"
import { basename, join, resolve } from "path"
import { resolveAgentToken } from "../agents/resolve.js"
import type { BrowserWorkspaceSnapshot } from "../engine/browser-types.js"
import { listRequests, resolveRequest, dismissRequest } from "../engine/requests.js"
import { queueMessage, writeMessages } from "../engine/ipc.js"

import {
  appendWorkspaceMessage,
  ensureWorkspaceDirs,
  getChannels,
  listSessions,
  readWorkspaceMessages,
  removeSession,
  upsertSession,
  type WorkspaceMessage,
  type WorkspaceSession,
} from "../workspace/state.js"
import {
  clearHubServer,
  listHubProjects,
  projectIdForRoot,
  registerProject,
  writeHubServer,
  type HubProject,
} from "../workspace/hub.js"

interface SavedAgent {
  agentId: string
  name: string
  dna: string
  title?: string
  title_short?: string
  sort_order?: number
  role?: string
}

interface WorkspaceAgent {
  id: string
  agentId?: string
  name: string
  dna: string
  title?: string
  title_short?: string
  sort_order?: number
  role?: string
  online: boolean
  typing: boolean
  sessionIds: string[]
  source: "saved" | "ephemeral"
}

interface SessionTypingState {
  typing: boolean
  updatedAt: number
  source?: "terminal"
}

interface DmThread {
  id: string
  dna: string
  slug?: string
  label: string
  online: boolean
  typing: boolean
  sort_order?: number
}

interface ServerConfig {
  root: string
  host: string
  port: number
  token: string
  authRequired: boolean
  corsOrigins: Set<string>
  maxBodyBytes: number
  rateLimitPerMinute: number
  maxSsePerClient: number
  allowedProjectIds: Set<string>
}

interface ProjectContext {
  activeProjectId: string
  projectRoot: string
  projects: HubProject[]
}

const DEFAULT_PORT = 4173
const DEFAULT_HOST = "127.0.0.1"
const DEFAULT_RATE_LIMIT_PER_MINUTE = 120
const DEFAULT_MAX_SSE_PER_CLIENT = 5
const TYPING_STALE_MS = 12_000
const TYPING_MESSAGE_SUPPRESS_MS = 2_000

function safeReadJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T
  } catch {
    return fallback
  }
}

function parseIntOption(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function parseCsvOption(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1"
}

function buildConfig(opts: Record<string, string>, projectRoot = process.cwd()): ServerConfig {
  const root = resolve(projectRoot)
  const host = (opts.host || process.env.TERMLINGS_SERVER_HOST || DEFAULT_HOST).trim()
  const port = parseIntOption(opts.port || process.env.TERMLINGS_SERVER_PORT, DEFAULT_PORT)
  const token = (opts.token || process.env.TERMLINGS_API_TOKEN || "").trim()
  const authRequired = token.length > 0

  const corsOpt = opts["cors-origin"] || opts.cors_origin || process.env.TERMLINGS_CORS_ORIGINS
  const corsOrigins = new Set(parseCsvOption(corsOpt))

  const maxBodyKb = parseIntOption(opts["max-body-kb"] || opts.max_body_kb || process.env.TERMLINGS_MAX_BODY_KB, 64)
  const maxBodyBytes = maxBodyKb * 1024

  const rateLimitPerMinute = parseIntOption(
    opts["rate-limit"] || opts.rate_limit || process.env.TERMLINGS_RATE_LIMIT_PER_MINUTE,
    DEFAULT_RATE_LIMIT_PER_MINUTE,
  )

  const maxSsePerClient = parseIntOption(
    opts["sse-max"] || opts.sse_max || process.env.TERMLINGS_SSE_MAX_PER_CLIENT,
    DEFAULT_MAX_SSE_PER_CLIENT,
  )

  const allowedProjectIdsCsv = opts["allowed-projects"] || opts.allowed_projects || process.env.TERMLINGS_ALLOWED_PROJECT_IDS
  const allowedProjectIds = new Set(parseCsvOption(allowedProjectIdsCsv))

  if (!isLoopbackHost(host) && !authRequired) {
    throw new Error("Refusing non-loopback bind without TERMLINGS_API_TOKEN. Configure auth first.")
  }

  if (corsOrigins.has("*") && authRequired) {
    throw new Error("CORS wildcard '*' is not allowed when API auth is enabled.")
  }

  return {
    root,
    host,
    port,
    token,
    authRequired,
    corsOrigins,
    maxBodyBytes,
    rateLimitPerMinute,
    maxSsePerClient,
    allowedProjectIds,
  }
}

function parseFrontmatterNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const cleaned = value.trim().replace(/^['"]|['"]$/g, "")
  if (!/^-?\d+$/.test(cleaned)) return undefined
  const parsed = Number.parseInt(cleaned, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseSoul(
  content: string,
): { name: string; dna: string; title?: string; title_short?: string; sort_order?: number; role?: string } | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/)
  if (!frontmatterMatch) return null
  const yaml = frontmatterMatch[1] || ""
  const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const dna = yaml.match(/^dna:\s*(.+)$/m)?.[1]?.trim()
  const title = yaml.match(/^title:\s*(.+)$/m)?.[1]?.trim()
  const titleShort = yaml.match(/^title_short:\s*(.+)$/m)?.[1]?.trim()
  const sortOrder = parseFrontmatterNumber(yaml.match(/^sort_order:\s*(.+)$/m)?.[1])
  const role = yaml.match(/^role:\s*(.+)$/m)?.[1]?.trim()
  if (!name || !dna) return null
  return { name, dna, title, title_short: titleShort, sort_order: sortOrder, role }
}

function listSavedAgents(root: string): SavedAgent[] {
  const base = join(root, ".termlings", "agents")
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
        title_short: parsed.title_short,
        sort_order: parsed.sort_order,
        role: parsed.role,
      })
    } catch {}
  }

  saved.sort((a, b) => {
    const aOrder = a.sort_order ?? 0
    const bOrder = b.sort_order ?? 0
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.name.localeCompare(b.name)
  })
  return saved
}

function isHumanAddress(value?: string): boolean {
  const normalized = String(value || "").trim().toLowerCase()
  return normalized === "owner" || normalized === "operator" || normalized.startsWith("human:")
}

function isHumanDna(value?: string): boolean {
  return String(value || "").trim() === "0000000"
}

function collectSessionTypingBySession(
  root: string,
  sessions: WorkspaceSession[],
  messages: WorkspaceMessage[],
): Map<string, SessionTypingState> {
  const out = new Map<string, SessionTypingState>()
  const now = Date.now()
  const sessionDnaById = new Map(sessions.map((session) => [session.sessionId, session.dna]))
  const latestMessageByDna = new Map<string, number>()

  for (const message of messages) {
    if (!message || typeof message.ts !== "number") continue
    const fromDna = message.fromDna ?? (message.from ? sessionDnaById.get(message.from) : undefined)
    const targetDna = message.targetDna ?? (message.target ? sessionDnaById.get(message.target) : undefined)
    if (fromDna) {
      const prev = latestMessageByDna.get(fromDna) ?? 0
      if (message.ts > prev) latestMessageByDna.set(fromDna, message.ts)
    }
    if (targetDna) {
      const prev = latestMessageByDna.get(targetDna) ?? 0
      if (message.ts > prev) latestMessageByDna.set(targetDna, message.ts)
    }
  }

  for (const session of sessions) {
    const path = join(root, ".termlings", "store", "presence", `${session.sessionId}.typing.json`)
    if (!existsSync(path)) {
      out.set(session.sessionId, { typing: false, updatedAt: 0 })
      continue
    }

    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as {
        typing?: unknown
        source?: unknown
        updatedAt?: unknown
      }
      const updatedAt = typeof raw.updatedAt === "number" ? raw.updatedAt : 0
      const latestMessageTs = latestMessageByDna.get(session.dna) ?? 0
      let typing = raw.typing === true && raw.source === "terminal"
      if (typing && (updatedAt <= 0 || now - updatedAt > TYPING_STALE_MS)) {
        typing = false
      }
      if (typing && latestMessageTs >= updatedAt) {
        typing = false
      }
      if (typing && latestMessageTs > 0 && now - latestMessageTs <= TYPING_MESSAGE_SUPPRESS_MS) {
        typing = false
      }

      out.set(session.sessionId, {
        typing,
        updatedAt,
        source: typing ? "terminal" : undefined,
      })
    } catch {
      out.set(session.sessionId, { typing: false, updatedAt: 0 })
    }
  }

  return out
}

function mergeAgentPresence(
  savedAgents: SavedAgent[],
  sessions: WorkspaceSession[],
  typingBySessionId: Map<string, SessionTypingState>,
): WorkspaceAgent[] {
  const byDna = new Map<string, WorkspaceAgent>()

  for (const agent of savedAgents) {
    byDna.set(agent.dna, {
      id: `saved:${agent.agentId}`,
      agentId: agent.agentId,
      name: agent.name,
      dna: agent.dna,
      title: agent.title,
      title_short: agent.title_short,
      sort_order: agent.sort_order,
      role: agent.role,
      online: false,
      typing: false,
      sessionIds: [],
      source: "saved",
    })
  }

  for (const session of sessions) {
    if (isHumanDna(session.dna)) {
      continue
    }

    const existing = byDna.get(session.dna)
    if (existing) {
      existing.online = true
      if (typingBySessionId.get(session.sessionId)?.typing === true) {
        existing.typing = true
      }
      if (!existing.sessionIds.includes(session.sessionId)) {
        existing.sessionIds.push(session.sessionId)
      }
      if (!existing.name || existing.name === existing.dna) {
        existing.name = session.name
      }
      continue
    }

    byDna.set(session.dna, {
      id: `online:${session.sessionId}`,
      name: session.name,
      dna: session.dna,
      online: true,
      typing: typingBySessionId.get(session.sessionId)?.typing === true,
      sessionIds: [session.sessionId],
      source: "ephemeral",
    })
  }

  return Array.from(byDna.values()).sort((a, b) => {
    const aOrder = a.sort_order ?? 0
    const bOrder = b.sort_order ?? 0
    if (aOrder !== bOrder) return aOrder - bOrder
    if (a.online !== b.online) return a.online ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function buildDmThreads(
  messages: WorkspaceMessage[],
  agents: WorkspaceAgent[],
  sessions: WorkspaceSession[],
): DmThread[] {
  const sessionDnaById = new Map(sessions.map((session) => [session.sessionId, session.dna]))
  const agentByDna = new Map(agents.map((agent) => [agent.dna, agent]))
  const byDna = new Map<string, DmThread>()

  for (const agent of agents) {
    const threadId = agent.agentId ? `agent:${agent.agentId}` : `agent:${agent.dna}`
    byDna.set(agent.dna, {
      id: threadId,
      dna: agent.dna,
      slug: agent.agentId,
      label: agent.name,
      online: agent.online,
      typing: agent.typing,
      sort_order: agent.sort_order,
    })
  }

  for (const message of messages) {
    if (message.kind !== "dm") continue

    const fromDna = message.fromDna ?? (message.from ? sessionDnaById.get(message.from) : undefined)
    const targetDna = message.targetDna ?? (message.target ? sessionDnaById.get(message.target) : undefined)

    if (fromDna && !isHumanDna(fromDna) && !isHumanAddress(message.from) && !byDna.has(fromDna)) {
      const known = agentByDna.get(fromDna)
      const threadId = known?.agentId ? `agent:${known.agentId}` : `agent:${fromDna}`
      byDna.set(fromDna, {
        id: threadId,
        dna: fromDna,
        slug: known?.agentId,
        label: message.fromName || known?.name || fromDna,
        online: known?.online ?? false,
        typing: known?.typing ?? false,
        sort_order: known?.sort_order,
      })
    }

    if (targetDna && !isHumanDna(targetDna) && !isHumanAddress(message.target) && !byDna.has(targetDna)) {
      const known = agentByDna.get(targetDna)
      const threadId = known?.agentId ? `agent:${known.agentId}` : `agent:${targetDna}`
      byDna.set(targetDna, {
        id: threadId,
        dna: targetDna,
        slug: known?.agentId,
        label: message.targetName || known?.name || targetDna,
        online: known?.online ?? false,
        typing: known?.typing ?? false,
        sort_order: known?.sort_order,
      })
    }
  }

  return Array.from(byDna.values()).sort((a, b) => {
    const aOrder = a.sort_order ?? 0
    const bOrder = b.sort_order ?? 0
    if (aOrder !== bOrder) return aOrder - bOrder
    if (a.online !== b.online) return a.online ? -1 : 1
    return a.label.localeCompare(b.label)
  })
}

function loadWorkspaceSnapshot(root: string): {
  meta: unknown
  sessions: WorkspaceSession[]
  agents: WorkspaceAgent[]
  messages: ReturnType<typeof readWorkspaceMessages>
  channels: ReturnType<typeof getChannels>
  dmThreads: DmThread[]
  tasks: unknown[]
  calendarEvents: unknown[]
  requests: ReturnType<typeof listRequests>
  browser: BrowserWorkspaceSnapshot | null
  activityUpdatedAt: number
  generatedAt: number
} {
  ensureWorkspaceDirs(root)

  const meta = safeReadJson(join(root, ".termlings", "workspace.json"), null)
  const sessions = listSessions(root)
  const messages = readWorkspaceMessages({ limit: 300 }, root)
  const channels = getChannels(root)
  const tasks = safeReadJson<unknown[]>(join(root, ".termlings", "store", "tasks", "tasks.json"), [])
  const calendarEvents = safeReadJson<unknown[]>(join(root, ".termlings", "store", "calendar", "calendar.json"), [])
  const browser = safeReadJson<BrowserWorkspaceSnapshot | null>(join(root, ".termlings", "browser", "workspace-state.json"), null)
  const typingBySessionId = collectSessionTypingBySession(root, sessions, messages)
  const agents = mergeAgentPresence(listSavedAgents(root), sessions, typingBySessionId)
  const dmThreads = buildDmThreads(messages, agents, sessions)
  const requests = listRequests()

  const latestMessageTs = messages.length > 0 ? messages[messages.length - 1]!.ts : 0
  const latestSessionTs = sessions.reduce((max, session) => Math.max(max, session.lastSeenAt), 0)

  return {
    meta,
    sessions,
    agents,
    messages,
    channels,
    dmThreads,
    tasks: tasks.slice(-200),
    calendarEvents,
    requests,
    browser,
    activityUpdatedAt: Math.max(latestMessageTs, latestSessionTs),
    generatedAt: Date.now(),
  }
}

function resolveProjectContext(config: ServerConfig, requestedProjectId?: string): ProjectContext {
  const baseProject = registerProject(config.root)
  const projectsFromHub = listHubProjects()
  const withBase = projectsFromHub.some((project) => project.projectId === baseProject.projectId)
    ? projectsFromHub
    : [baseProject, ...projectsFromHub]

  const filteredProjects = config.allowedProjectIds.size > 0
    ? withBase.filter((project) => config.allowedProjectIds.has(project.projectId))
    : withBase

  if (filteredProjects.length === 0) {
    throw new Error("No projects are allowed by TERMLINGS_ALLOWED_PROJECT_IDS")
  }

  if (requestedProjectId) {
    const selected = filteredProjects.find((project) => project.projectId === requestedProjectId)
    if (!selected) {
      throw new Error(`Unknown or unauthorized project: ${requestedProjectId}`)
    }
    return {
      activeProjectId: selected.projectId,
      projectRoot: selected.root,
      projects: filteredProjects,
    }
  }

  const fallback = filteredProjects.find((project) => project.projectId === baseProject.projectId) || filteredProjects[0]!
  return {
    activeProjectId: fallback.projectId,
    projectRoot: fallback.root,
    projects: filteredProjects,
  }
}

function isAuthorized(req: Request, config: ServerConfig): boolean {
  if (!config.authRequired) return true

  const authHeader = req.headers.get("authorization")
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length)
    if (token === config.token) return true
  }

  const tokenHeader = req.headers.get("x-termlings-token")
  if (tokenHeader && tokenHeader === config.token) {
    return true
  }

  return false
}

function requestIp(req: Request, server: any): string {
  try {
    const ip = server?.requestIP?.(req)
    if (ip?.address) return String(ip.address)
  } catch {}

  const forwardedFor = req.headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim()
  }

  const realIp = req.headers.get("x-real-ip")
  if (realIp) {
    return realIp.trim()
  }

  return "unknown"
}

function clientKey(req: Request, server: any): string {
  const authHeader = req.headers.get("authorization") || req.headers.get("x-termlings-token")
  if (authHeader) {
    const digest = createHash("sha1").update(authHeader).digest("hex").slice(0, 12)
    return `auth:${digest}`
  }
  return `ip:${requestIp(req, server)}`
}

function corsHeaders(req: Request, config: ServerConfig): Headers {
  const headers = new Headers()
  const origin = req.headers.get("origin") || ""

  if (config.corsOrigins.has("*")) {
    headers.set("access-control-allow-origin", "*")
  } else if (origin && config.corsOrigins.has(origin)) {
    headers.set("access-control-allow-origin", origin)
    headers.set("vary", "origin")
  }

  if (headers.has("access-control-allow-origin")) {
    headers.set("access-control-allow-methods", "GET,POST,OPTIONS")
    headers.set("access-control-allow-headers", "content-type,authorization,x-termlings-token")
  }

  return headers
}

function withCors(req: Request, res: Response, config: ServerConfig): Response {
  const headers = corsHeaders(req, config)
  headers.forEach((value, key) => {
    res.headers.set(key, value)
  })
  return res
}

function json(req: Request, payload: unknown, config: ServerConfig, status = 200): Response {
  return withCors(req, new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  }), config)
}

function empty(req: Request, config: ServerConfig, status = 204): Response {
  return withCors(req, new Response(null, { status }), config)
}

async function readJsonBody(req: Request, maxBodyBytes: number): Promise<{ ok: true; value: any } | { ok: false; status: number; error: string }> {
  const contentLength = req.headers.get("content-length")
  if (contentLength) {
    const declared = Number.parseInt(contentLength, 10)
    if (Number.isFinite(declared) && declared > maxBodyBytes) {
      return { ok: false, status: 413, error: `Request body exceeds ${maxBodyBytes} bytes` }
    }
  }

  let buffer: ArrayBuffer
  try {
    buffer = await req.arrayBuffer()
  } catch {
    return { ok: false, status: 400, error: "Unable to read request body" }
  }

  if (buffer.byteLength > maxBodyBytes) {
    return { ok: false, status: 413, error: `Request body exceeds ${maxBodyBytes} bytes` }
  }

  try {
    const text = Buffer.from(buffer).toString("utf8")
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" }
  }
}

function auditLogPath(root: string): string {
  return join(root, ".termlings", "store", "server", "audit.jsonl")
}

function appendAudit(root: string, entry: Record<string, unknown>): void {
  try {
    const file = auditLogPath(root)
    mkdirSync(join(root, ".termlings", "store", "server"), { recursive: true })
    appendFileSync(file, JSON.stringify(entry) + "\n")
  } catch {}
}

function parseRequestedProject(url: URL, body: unknown): string | undefined {
  const fromQuery = url.searchParams.get("project")?.trim()
  if (fromQuery) return fromQuery
  if (body && typeof body === "object") {
    const raw = (body as Record<string, unknown>).projectId
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw.trim()
    }
  }
  return undefined
}

function resolveMessageTarget(
  target: string,
  sessions: WorkspaceSession[],
  savedAgents: SavedAgent[],
): {
  resolvedTarget: string
  storageTarget: string
  targetSlug?: string
  targetSession?: WorkspaceSession
  targetDna?: string
  targetAgentName?: string
} {
  if (target.startsWith("agent:")) {
    const agentKey = target.slice("agent:".length)
    const resolved = resolveAgentToken(
      agentKey,
      savedAgents.map((agent) => ({
        slug: agent.agentId,
        name: agent.name,
        title: agent.title,
        titleShort: agent.title_short,
        dna: agent.dna,
      })),
    )
    if ("error" in resolved) {
      return {
        resolvedTarget: target,
        storageTarget: target,
      }
    }

    const dna = resolved.agent.dna || agentKey
    const candidates = sessions
      .filter((session) => session.dna === dna)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)

    const targetSession = candidates[0]
    return {
      resolvedTarget: targetSession?.sessionId || target,
      storageTarget: `agent:${resolved.agent.slug}`,
      targetSlug: resolved.agent.slug,
      targetSession,
      targetDna: dna,
      targetAgentName: resolved.agent.name,
    }
  }

  const targetSession = sessions.find((session) => session.sessionId === target)
  return {
    resolvedTarget: target,
    storageTarget: target,
    targetSession,
    targetDna: targetSession?.dna,
    targetAgentName: targetSession?.name,
  }
}

function createRateLimiter(limitPerMinute: number): (key: string) => boolean {
  const windowMs = 60_000
  const buckets = new Map<string, { count: number; resetAt: number }>()

  return (key: string): boolean => {
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || now >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }

    if (bucket.count >= limitPerMinute) {
      return false
    }

    bucket.count += 1
    return true
  }
}

function createSseLimiter(maxPerClient: number): {
  acquire: (key: string) => boolean
  release: (key: string) => void
} {
  const counts = new Map<string, number>()

  return {
    acquire: (key: string): boolean => {
      const current = counts.get(key) || 0
      if (current >= maxPerClient) return false
      counts.set(key, current + 1)
      return true
    },
    release: (key: string): void => {
      const current = counts.get(key) || 0
      if (current <= 1) {
        counts.delete(key)
      } else {
        counts.set(key, current - 1)
      }
    },
  }
}

function selectProjectContext(config: ServerConfig, url: URL, body?: unknown): ProjectContext {
  const requestedProjectId = parseRequestedProject(url, body)
  return resolveProjectContext(config, requestedProjectId)
}

function workspacePayload(config: ServerConfig, url: URL): {
  snapshot: ReturnType<typeof loadWorkspaceSnapshot>
  projects: HubProject[]
  activeProjectId: string
} {
  const context = selectProjectContext(config, url)
  return {
    snapshot: loadWorkspaceSnapshot(context.projectRoot),
    projects: context.projects,
    activeProjectId: context.activeProjectId,
  }
}

export async function startServer(opts: Record<string, string>, projectRoot = process.cwd()): Promise<never> {
  if (typeof Bun === "undefined") {
    throw new Error("termlings --server requires Bun runtime")
  }

  const config = buildConfig(opts, projectRoot)

  ensureWorkspaceDirs(config.root)
  registerProject(config.root)

  const allowRequest = createRateLimiter(config.rateLimitPerMinute)
  const sseLimiter = createSseLimiter(config.maxSsePerClient)

  const startedAt = Date.now()
  let stopped = false

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: async (req: Request, serverRef: any): Promise<Response> => {
      const started = Date.now()
      const url = new URL(req.url)
      const path = url.pathname
      const method = req.method.toUpperCase()
      const key = clientKey(req, serverRef)
      let status = 500
      let projectId = ""

      const finish = (response: Response): Response => {
        status = response.status
        appendAudit(config.root, {
          ts: Date.now(),
          method,
          path,
          status,
          durationMs: Date.now() - started,
          client: key,
          projectId,
        })
        return response
      }

      try {
        if (path.startsWith("/api") && method === "OPTIONS") {
          return finish(empty(req, config))
        }

        if (path === "/api/hub/health" && method === "GET") {
          return finish(json(req, { ok: true, ts: Date.now() }, config))
        }

        if (path.startsWith("/api") && !isAuthorized(req, config)) {
          return finish(json(req, { error: "Unauthorized" }, config, 401))
        }

        // Protect API from abuse.
        if (path.startsWith("/api") && path !== "/api/hub/health" && !allowRequest(key)) {
          return finish(json(req, { error: "Rate limit exceeded" }, config, 429))
        }

        if (path === "/api/v1/projects" && method === "GET") {
          const context = resolveProjectContext(config)
          return finish(json(req, { apiVersion: "v1", projects: context.projects }, config))
        }

        if (path === "/api/v1/state" && method === "GET") {
          const context = selectProjectContext(config, url)
          projectId = context.activeProjectId
          const snapshot = loadWorkspaceSnapshot(context.projectRoot)
          return finish(json(req, {
            apiVersion: "v1",
            project: {
              projectId: context.activeProjectId,
              projectName: context.projects.find((project) => project.projectId === context.activeProjectId)?.projectName,
            },
            ...snapshot,
          }, config))
        }

        if (path === "/api/v1/sessions" && method === "GET") {
          const context = selectProjectContext(config, url)
          projectId = context.activeProjectId
          return finish(json(req, {
            apiVersion: "v1",
            projectId: context.activeProjectId,
            sessions: listSessions(context.projectRoot),
          }, config))
        }

        if (path === "/api/v1/sessions" && method === "POST") {
          const parsed = await readJsonBody(req, config.maxBodyBytes)
          if (!parsed.ok) {
            return finish(json(req, { error: parsed.error }, config, parsed.status))
          }
          const body = parsed.value as {
            sessionId?: string
            name?: string
            dna?: string
            projectId?: string
          }

          if (!body.sessionId || !body.name || !body.dna) {
            return finish(json(req, { error: "sessionId, name, dna are required" }, config, 400))
          }

          const context = selectProjectContext(config, url, body)
          projectId = context.activeProjectId

          const session = upsertSession(body.sessionId, {
            name: body.name,
            dna: body.dna,
          }, context.projectRoot)

          return finish(json(req, {
            ok: true,
            projectId: context.activeProjectId,
            session,
          }, config))
        }

        if (path === "/api/v1/sessions/leave" && method === "POST") {
          const parsed = await readJsonBody(req, config.maxBodyBytes)
          if (!parsed.ok) {
            return finish(json(req, { error: parsed.error }, config, parsed.status))
          }
          const body = parsed.value as {
            sessionId?: string
            projectId?: string
          }

          if (!body.sessionId) {
            return finish(json(req, { error: "sessionId is required" }, config, 400))
          }

          const context = selectProjectContext(config, url, body)
          projectId = context.activeProjectId
          removeSession(body.sessionId, context.projectRoot)
          return finish(json(req, { ok: true, projectId: context.activeProjectId }, config))
        }

        if (path === "/api/v1/messages" && method === "POST") {
          const parsed = await readJsonBody(req, config.maxBodyBytes)
          if (!parsed.ok) {
            return finish(json(req, { error: parsed.error }, config, parsed.status))
          }

          const body = parsed.value as {
            kind?: "chat" | "dm"
            text?: string
            target?: string
            from?: string
            fromName?: string
            fromDna?: string
            projectId?: string
          }

          const kind = body.kind || "chat"
          const text = body.text?.trim() || ""
          const target = typeof body.target === "string" ? body.target.trim() : undefined
          const from = body.from || "human:default"
          const fromName = body.fromName || "Operator"
          const fromDna = body.fromDna

          if (!text) {
            return finish(json(req, { error: "text is required" }, config, 400))
          }
          if (kind === "dm" && !target) {
            return finish(json(req, { error: "target is required for DM" }, config, 400))
          }

          const context = selectProjectContext(config, url, body)
          projectId = context.activeProjectId
          const sessions = listSessions(context.projectRoot)
          const savedAgents = listSavedAgents(context.projectRoot)

          if (kind === "chat") {
            const channel = target?.startsWith("channel:")
              ? (target.slice("channel:".length) || undefined)
              : "workspace"

            const message = appendWorkspaceMessage({
              kind: "chat",
              channel,
              from,
              fromName,
              fromDna,
              text,
            }, context.projectRoot)

            return finish(json(req, {
              ok: true,
              delivered: false,
              projectId: context.activeProjectId,
              message,
            }, config))
          }

          const resolved = target ? resolveMessageTarget(target, sessions, savedAgents) : {
            resolvedTarget: target || "",
            storageTarget: target || "",
          }

          let delivered = false
          const queueKey = resolved.targetSlug || resolved.targetDna

          if (target?.startsWith("human:")) {
            // Human inbox lives in workspace history only.
          } else if (resolved.targetSession) {
            delivered = true
            writeMessages(resolved.resolvedTarget, [{
              from,
              fromName,
              text,
              ts: Date.now(),
            }])
          } else if (queueKey) {
            queueMessage(queueKey, {
              from,
              fromName,
              fromDna,
              text,
              ts: Date.now(),
            })
          } else {
            return finish(json(req, { error: "Target agent is unknown or offline" }, config, 404))
          }

          const message = appendWorkspaceMessage({
            kind: "dm",
            from,
            fromName,
            fromDna,
            target: resolved.storageTarget,
            targetName: resolved.targetAgentName || resolved.targetSession?.name || (isHumanAddress(target) ? "Owner" : undefined),
            targetDna: resolved.targetDna || resolved.targetSession?.dna,
            text,
          }, context.projectRoot)

          return finish(json(req, {
            ok: true,
            delivered,
            projectId: context.activeProjectId,
            message,
          }, config))
        }

        if (path === "/api/v1/requests/resolve" && method === "POST") {
          const parsed = await readJsonBody(req, config.maxBodyBytes)
          if (!parsed.ok) {
            return finish(json(req, { error: parsed.error }, config, parsed.status))
          }

          const body = parsed.value as {
            requestId?: string
            response?: string
            projectId?: string
          }

          const requestId = typeof body.requestId === "string" ? body.requestId.trim() : ""
          const response = typeof body.response === "string" ? body.response.trim() : ""
          if (!requestId || !response) {
            return finish(json(req, { error: "requestId and response are required" }, config, 400))
          }

          const context = selectProjectContext(config, url, body)
          projectId = context.activeProjectId
          const request = resolveRequest(requestId, response)
          if (!request) {
            return finish(json(req, { error: "Request not found" }, config, 404))
          }

          return finish(json(req, {
            ok: true,
            projectId: context.activeProjectId,
            request,
          }, config))
        }

        if (path === "/api/v1/requests/dismiss" && method === "POST") {
          const parsed = await readJsonBody(req, config.maxBodyBytes)
          if (!parsed.ok) {
            return finish(json(req, { error: parsed.error }, config, parsed.status))
          }

          const body = parsed.value as {
            requestId?: string
            projectId?: string
          }

          const requestId = typeof body.requestId === "string" ? body.requestId.trim() : ""
          if (!requestId) {
            return finish(json(req, { error: "requestId is required" }, config, 400))
          }

          const context = selectProjectContext(config, url, body)
          projectId = context.activeProjectId
          const request = dismissRequest(requestId)
          if (!request) {
            return finish(json(req, { error: "Request not found" }, config, 404))
          }

          return finish(json(req, {
            ok: true,
            projectId: context.activeProjectId,
            request,
          }, config))
        }

        // Legacy-compatible workspace payload endpoint.
        if (path === "/api/workspace" && method === "GET") {
          return finish(json(req, workspacePayload(config, url), config))
        }

        if (path === "/api/workspace/join" && method === "POST") {
          const parsed = await readJsonBody(req, config.maxBodyBytes)
          if (!parsed.ok) {
            return finish(json(req, { error: parsed.error }, config, parsed.status))
          }

          const body = parsed.value as {
            sessionId?: string
            name?: string
            dna?: string
            projectId?: string
          }

          if (!body.sessionId || !body.name || !body.dna) {
            return finish(json(req, { error: "sessionId, name, dna are required" }, config, 400))
          }

          const context = selectProjectContext(config, url, body)
          projectId = context.activeProjectId

          const session = upsertSession(body.sessionId, {
            name: body.name,
            dna: body.dna,
          }, context.projectRoot)

          return finish(json(req, { ok: true, session }, config))
        }

        if (path === "/api/workspace/leave" && method === "POST") {
          const parsed = await readJsonBody(req, config.maxBodyBytes)
          if (!parsed.ok) {
            return finish(json(req, { error: parsed.error }, config, parsed.status))
          }

          const body = parsed.value as {
            sessionId?: string
            projectId?: string
          }

          if (!body.sessionId) {
            return finish(json(req, { error: "sessionId is required" }, config, 400))
          }

          const context = selectProjectContext(config, url, body)
          projectId = context.activeProjectId
          removeSession(body.sessionId, context.projectRoot)
          return finish(json(req, { ok: true }, config))
        }

        if (path === "/api/workspace/message" && method === "POST") {
          const parsed = await readJsonBody(req, config.maxBodyBytes)
          if (!parsed.ok) {
            return finish(json(req, { error: parsed.error }, config, parsed.status))
          }

          const body = parsed.value as {
            kind?: "chat" | "dm"
            text?: string
            target?: string
            from?: string
            fromName?: string
            fromDna?: string
            projectId?: string
          }

          const kind = body.kind || "chat"
          const text = body.text?.trim() || ""
          if (!text) {
            return finish(json(req, { error: "text is required" }, config, 400))
          }

          if (kind === "dm" && !body.target) {
            return finish(json(req, { error: "target is required for DM" }, config, 400))
          }

          const context = selectProjectContext(config, url, body)
          projectId = context.activeProjectId

          const message = appendWorkspaceMessage({
            kind,
            from: body.from || "operator",
            fromName: body.fromName || "Operator",
            fromDna: body.fromDna,
            target: body.target,
            text,
          }, context.projectRoot)

          return finish(json(req, { ok: true, message }, config))
        }

        if (path === "/api/workspace/stream" && method === "GET") {
          if (!sseLimiter.acquire(key)) {
            return finish(json(req, { error: "Too many active streams for this client" }, config, 429))
          }

          const encoder = new TextEncoder()
          const requestedProjectId = url.searchParams.get("project") || undefined
          let released = false

          const release = () => {
            if (released) return
            released = true
            sseLimiter.release(key)
          }

          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              let closed = false
              let lastPayload = ""

              const send = () => {
                if (closed) return
                try {
                  const context = resolveProjectContext(config, requestedProjectId)
                  const payload = JSON.stringify({
                    snapshot: loadWorkspaceSnapshot(context.projectRoot),
                    projects: context.projects,
                    activeProjectId: context.activeProjectId,
                  })

                  if (payload !== lastPayload) {
                    lastPayload = payload
                    controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
                  }
                } catch {}
              }

              const heartbeat = () => {
                if (closed) return
                try {
                  controller.enqueue(encoder.encode(": heartbeat\n\n"))
                } catch {}
              }

              send()
              const sendTimer = setInterval(send, 2_000)
              const heartbeatTimer = setInterval(heartbeat, 15_000)

              const onAbort = () => {
                if (closed) return
                closed = true
                clearInterval(sendTimer)
                clearInterval(heartbeatTimer)
                release()
                try {
                  controller.close()
                } catch {}
              }

              req.signal.addEventListener("abort", onAbort, { once: true })
            },
            cancel() {
              release()
            },
          })

          const response = new Response(stream, {
            status: 200,
            headers: {
              "cache-control": "no-cache",
              connection: "keep-alive",
              "content-type": "text/event-stream",
            },
          })

          return finish(withCors(req, response, config))
        }

        return finish(json(req, { error: "Not Found" }, config, 404))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return finish(json(req, { error: message }, config, 500))
      }
    },
  })

  writeHubServer({
    host: config.host,
    port: config.port,
    pid: process.pid,
    startedAt,
    updatedAt: Date.now(),
  })

  console.log(`Termlings server listening on http://${config.host}:${config.port}`)
  console.log(`Project: ${basename(config.root)} (${projectIdForRoot(config.root)})`)
  console.log(`Auth: ${config.authRequired ? "enabled" : "disabled (loopback only)"}`)

  if (config.corsOrigins.size > 0) {
    console.log(`CORS origins: ${Array.from(config.corsOrigins).join(", ")}`)
  } else {
    console.log("CORS origins: none (same-origin/non-browser clients only)")
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    try {
      server.stop(true)
    } catch {}
    clearHubServer()
  }

  process.on("SIGINT", () => {
    stop()
    process.exit(0)
  })

  process.on("SIGTERM", () => {
    stop()
    process.exit(0)
  })

  await new Promise(() => {})
}
