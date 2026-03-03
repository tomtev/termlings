import type { RequestHandler } from "@sveltejs/kit"
import { listSessions, upsertWorkspaceSession } from "$lib/server/workspace"
import { corsEmpty, corsJson, isAuthorized } from "$lib/server/public-api"
import { resolveProjectContext } from "$lib/server/hub"

interface UpsertSessionBody {
  sessionId?: string
  name?: string
  dna?: string
  projectId?: string
}

export const OPTIONS: RequestHandler = async () => {
  return corsEmpty()
}

export const GET: RequestHandler = async ({ request }) => {
  if (!isAuthorized(request)) {
    return corsJson({ error: "Unauthorized" }, { status: 401 })
  }
  const requestedProject = new URL(request.url).searchParams.get("project") ?? undefined
  const context = resolveProjectContext(requestedProject)
  return corsJson({
    apiVersion: "v1",
    projectId: context.activeProjectId,
    sessions: listSessions(context.projectRoot),
  })
}

export const POST: RequestHandler = async ({ request }) => {
  if (!isAuthorized(request)) {
    return corsJson({ error: "Unauthorized" }, { status: 401 })
  }

  let body: UpsertSessionBody
  try {
    body = (await request.json()) as UpsertSessionBody
  } catch {
    return corsJson({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.sessionId || !body.name || !body.dna) {
    return corsJson({ error: "sessionId, name, dna are required" }, { status: 400 })
  }

  const queryProject = new URL(request.url).searchParams.get("project") ?? undefined
  const context = resolveProjectContext(body.projectId ?? queryProject)

  const session = upsertWorkspaceSession({
    sessionId: body.sessionId,
    name: body.name,
    dna: body.dna,
  }, context.projectRoot)
  return corsJson({ ok: true, projectId: context.activeProjectId, session })
}
