import { redirect } from "@sveltejs/kit"
import { loadWorkspaceSnapshot } from "$lib/server/workspace"
import { resolveProjectContext } from "$lib/server/hub"

export type WorkspaceThreadId = "activity" | "workspace" | "inbox" | "tasks" | "calendar" | `agent:${string}`

export interface WorkspacePayload {
  snapshot: ReturnType<typeof loadWorkspaceSnapshot>
  projects: ReturnType<typeof resolveProjectContext>["projects"]
  activeProjectId: string
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1)
  }
  return pathname
}

function isValidDna(value: string): boolean {
  return /^[0-9a-f]{7}$/i.test(value)
}

export function threadPath(projectId: string, threadId: WorkspaceThreadId): string {
  const encodedProjectId = encodeURIComponent(projectId)
  if (threadId === "activity") return `/${encodedProjectId}`
  if (threadId === "workspace" || threadId === "inbox") {
    return `/${encodedProjectId}/channel/${encodeURIComponent(threadId)}`
  }
  if (threadId === "tasks") return `/${encodedProjectId}/tasks`
  if (threadId === "calendar") return `/${encodedProjectId}/calendar`
  const dna = threadId.slice("agent:".length)
  return `/${encodedProjectId}/agents/${encodeURIComponent(dna)}`
}

function normalizeThreadId(threadId: WorkspaceThreadId): WorkspaceThreadId {
  if (threadId.startsWith("agent:")) {
    const dna = threadId.slice("agent:".length)
    if (!isValidDna(dna)) return "activity"
    return `agent:${dna.toLowerCase()}`
  }
  return threadId
}

export function loadWorkspaceRouteData(input: {
  requestedProjectId?: string
  requestedThreadId: WorkspaceThreadId
  pathname: string
}): {
  payload: WorkspacePayload
  activeThreadId: WorkspaceThreadId
} {
  const context = resolveProjectContext(input.requestedProjectId)
  const activeThreadId = normalizeThreadId(input.requestedThreadId)
  const canonicalPath = threadPath(context.activeProjectId, activeThreadId)
  if (normalizePath(input.pathname) !== normalizePath(canonicalPath)) {
    throw redirect(307, canonicalPath)
  }

  return {
    payload: {
      snapshot: loadWorkspaceSnapshot(context.projectRoot),
      projects: context.projects,
      activeProjectId: context.activeProjectId,
    },
    activeThreadId,
  }
}
