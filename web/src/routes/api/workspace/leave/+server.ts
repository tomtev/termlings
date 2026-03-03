import { json } from "@sveltejs/kit"
import type { RequestHandler } from "@sveltejs/kit"
import { removeWorkspaceSession } from "$lib/server/workspace"
import { resolveProjectContext } from "$lib/server/hub"

interface LeaveBody {
  sessionId?: string
}

export const POST: RequestHandler = async ({ request, url }) => {
  const requestedProject = url.searchParams.get("project") ?? undefined
  const context = resolveProjectContext(requestedProject)

  let body: LeaveBody
  try {
    body = (await request.json()) as LeaveBody
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.sessionId) {
    return json({ error: "sessionId is required" }, { status: 400 })
  }

  removeWorkspaceSession(body.sessionId, context.projectRoot)
  return json({ ok: true })
}
