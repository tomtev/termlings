import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { basename, join, resolve } from "path"
import { homedir, tmpdir } from "os"
import { createHash } from "crypto"

export interface HubProject {
  projectId: string
  projectName: string
  root: string
  registeredAt: number
  lastSeenAt: number
}

export interface HubServer {
  host: string
  port: number
  pid: number
  startedAt: number
  updatedAt: number
}

interface HubProjectsStore {
  version: number
  projects: HubProject[]
}

const HUB_VERSION = 1

function hubDir(): string {
  return join(homedir(), ".termlings", "hub")
}

function projectsPath(): string {
  return join(hubDir(), "projects.json")
}

function serverPath(): string {
  return join(hubDir(), "server.json")
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T
  } catch {
    return fallback
  }
}

function ensureHubDirs(): void {
  mkdirSync(hubDir(), { recursive: true })
}

function normalizeProjectsStore(raw: HubProjectsStore | null): HubProjectsStore {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.projects)) {
    return { version: HUB_VERSION, projects: [] }
  }

  const projects: HubProject[] = []
  for (const candidate of raw.projects) {
    if (!candidate || typeof candidate !== "object") continue
    if (typeof candidate.projectId !== "string" || candidate.projectId.length === 0) continue
    if (typeof candidate.root !== "string" || candidate.root.length === 0) continue
    const root = resolve(candidate.root)
    if (!existsSync(root)) continue
    if (isTransientTempRoot(root)) continue
    const now = Date.now()
    projects.push({
      projectId: candidate.projectId,
      projectName:
        typeof candidate.projectName === "string" && candidate.projectName.length > 0
          ? candidate.projectName
          : basename(root),
      root,
      registeredAt: typeof candidate.registeredAt === "number" ? candidate.registeredAt : now,
      lastSeenAt: typeof candidate.lastSeenAt === "number" ? candidate.lastSeenAt : now,
    })
  }

  return { version: HUB_VERSION, projects }
}

function isTransientTempRoot(root: string): boolean {
  if (process.env.TERMLINGS_INCLUDE_TEMP_PROJECTS === "1") {
    return false
  }
  const normalized = resolve(root)
  const systemTmp = resolve(tmpdir())
  if (normalized.includes("/var/folders/") && normalized.includes("/T/tmp.")) {
    return true
  }
  if (!normalized.startsWith(systemTmp)) {
    return false
  }
  const suffix = normalized.slice(systemTmp.length)
  return /^\/tmp\./.test(suffix)
}

function readProjectsStore(): HubProjectsStore {
  ensureHubDirs()
  const raw = safeReadJson<HubProjectsStore | null>(projectsPath(), null)
  const normalized = normalizeProjectsStore(raw)
  const rawCount = raw && Array.isArray(raw.projects) ? raw.projects.length : 0
  if (!raw || raw.version !== HUB_VERSION || rawCount !== normalized.projects.length) {
    writeProjectsStore(normalized)
  }
  return normalized
}

function writeProjectsStore(store: HubProjectsStore): void {
  ensureHubDirs()
  writeFileSync(projectsPath(), JSON.stringify(store, null, 2) + "\n")
}

function normalizeServer(raw: HubServer | null): HubServer | null {
  if (!raw || typeof raw !== "object") return null
  if (typeof raw.host !== "string" || raw.host.length === 0) return null
  if (typeof raw.port !== "number" || !Number.isFinite(raw.port) || raw.port <= 0) return null
  const now = Date.now()
  return {
    host: raw.host,
    port: raw.port,
    pid: typeof raw.pid === "number" && Number.isFinite(raw.pid) ? raw.pid : 0,
    startedAt: typeof raw.startedAt === "number" ? raw.startedAt : now,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
  }
}

export function projectIdForRoot(root = process.cwd()): string {
  const normalized = resolve(root)
  return createHash("sha1").update(normalized).digest("hex").slice(0, 12)
}

export function listHubProjects(): HubProject[] {
  const store = readProjectsStore()
  return [...store.projects].sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

export function registerProject(root = process.cwd()): HubProject {
  const normalizedRoot = resolve(root)
  const store = readProjectsStore()
  const now = Date.now()
  const projectId = projectIdForRoot(normalizedRoot)
  const projectName = basename(normalizedRoot)

  const index = store.projects.findIndex((item) => item.projectId === projectId)
  const existing = index >= 0 ? store.projects[index] : null
  const project: HubProject = {
    projectId,
    projectName,
    root: normalizedRoot,
    registeredAt: existing?.registeredAt ?? now,
    lastSeenAt: now,
  }

  if (index >= 0) {
    store.projects[index] = project
  } else {
    store.projects.push(project)
  }

  writeProjectsStore(store)
  return project
}

export function readHubServer(): HubServer | null {
  ensureHubDirs()
  const raw = safeReadJson<HubServer | null>(serverPath(), null)
  return normalizeServer(raw)
}

export function writeHubServer(server: HubServer): void {
  ensureHubDirs()
  const normalized = normalizeServer(server)
  if (!normalized) return
  writeFileSync(serverPath(), JSON.stringify(normalized, null, 2) + "\n")
}

export function clearHubServer(): void {
  ensureHubDirs()
  writeFileSync(serverPath(), JSON.stringify({}, null, 2) + "\n")
}

export async function isHubServerRunning(server: HubServer, timeoutMs = 1000): Promise<boolean> {
  const healthHost = server.host === "0.0.0.0" ? "127.0.0.1" : server.host
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(`http://${healthHost}:${server.port}/api/hub/health`, {
      method: "GET",
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export function workspaceUrl(host: string, port: number, projectId?: string): string {
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host
  if (!projectId) {
    return `http://${displayHost}:${port}`
  }
  return `http://${displayHost}:${port}/?project=${encodeURIComponent(projectId)}`
}
