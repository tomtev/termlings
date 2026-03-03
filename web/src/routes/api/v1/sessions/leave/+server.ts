import type { RequestHandler } from "@sveltejs/kit"
import { removeWorkspaceSession } from "$lib/server/workspace"
import { corsEmpty, corsJson, isAuthorized } from "$lib/server/public-api"
import { resolveProjectContext } from "$lib/server/hub"

interface LeaveSessionBody {
  sessionId?: string
  projectId?: string
}

export const OPTIONS: RequestHandler = async () => {
  return corsEmpty()
}

export const POST: RequestHandler = async ({ request }) => {
  if (!isAuthorized(request)) {
    return corsJson({ error: "Unauthorized" }, { status: 401 })
  }

  let body: LeaveSessionBody
  try {
    body = (await request.json()) as LeaveSessionBody
  } catch {
    return corsJson({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.sessionId) {
    return corsJson({ error: "sessionId is required" }, { status: 400 })
  }

  const queryProject = new URL(request.url).searchParams.get("project") ?? undefined
  const context = resolveProjectContext(body.projectId ?? queryProject)

  removeWorkspaceSession(body.sessionId, context.projectRoot)
  return corsJson({ ok: true, projectId: context.activeProjectId })
}
