import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { basename, join, resolve } from "path"
import { createHash } from "crypto"
import { homedir, tmpdir } from "os"

export interface HubProject {
  projectId: string
  projectName: string
  root: string
  registeredAt: number
  lastSeenAt: number
}

interface HubProjectsStore {
  version: number
  projects: HubProject[]
}

function hubDir(): string {
  return join(homedir(), ".termlings", "hub")
}

function projectsPath(): string {
  return join(hubDir(), "projects.json")
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T
  } catch {
    return fallback
  }
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

function normalizeProjects(store: HubProjectsStore | null): HubProject[] {
  if (!store || typeof store !== "object" || !Array.isArray(store.projects)) return []
  const normalized: HubProject[] = []
  for (const candidate of store.projects) {
    if (!candidate || typeof candidate !== "object") continue
    if (typeof candidate.projectId !== "string" || candidate.projectId.length === 0) continue
    if (typeof candidate.root !== "string" || candidate.root.length === 0) continue
    const root = resolve(candidate.root)
    if (!existsSync(root)) continue
    if (isTransientTempRoot(root)) continue
    const now = Date.now()
    normalized.push({
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
  return normalized
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

export function projectIdForRoot(root: string): string {
  return createHash("sha1").update(resolve(root)).digest("hex").slice(0, 12)
}

function fallbackProject(): HubProject {
  const root = defaultProjectRoot()
  const now = Date.now()
  return {
    projectId: projectIdForRoot(root),
    projectName: basename(root),
    root,
    registeredAt: now,
    lastSeenAt: now,
  }
}

export function listHubProjects(): HubProject[] {
  mkdirSync(hubDir(), { recursive: true })
  const store = safeReadJson<HubProjectsStore | null>(projectsPath(), null)
  const projects = normalizeProjects(store)
  const rawCount = store && Array.isArray(store.projects) ? store.projects.length : 0
  if (!store || store.version !== 1 || rawCount !== projects.length) {
    writeFileSync(
      projectsPath(),
      JSON.stringify(
        {
          version: 1,
          projects,
        },
        null,
        2,
      ) + "\n",
    )
  }
  if (projects.length === 0) {
    return [fallbackProject()]
  }
  return projects.sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

export function resolveProjectContext(projectId?: string): {
  activeProjectId: string
  projectRoot: string
  projects: HubProject[]
} {
  const projects = listHubProjects()

  if (projectId) {
    const selected = projects.find((project) => project.projectId === projectId)
    if (selected) {
      return {
        activeProjectId: selected.projectId,
        projectRoot: selected.root,
        projects,
      }
    }
  }

  const active = projects[0] ?? fallbackProject()
  return {
    activeProjectId: active.projectId,
    projectRoot: active.root,
    projects,
  }
}
