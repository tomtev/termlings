import { json } from "@sveltejs/kit"
import type { RequestHandler } from "@sveltejs/kit"
import { upsertWorkspaceSession } from "$lib/server/workspace"
import { resolveProjectContext } from "$lib/server/hub"

interface JoinBody {
  sessionId?: string
  name?: string
  dna?: string
}

export const POST: RequestHandler = async ({ request, url }) => {
  const requestedProject = url.searchParams.get("project") ?? undefined
  const context = resolveProjectContext(requestedProject)
  let body: JoinBody
  try {
    body = (await request.json()) as JoinBody
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.sessionId || !body.name || !body.dna) {
    return json({ error: "sessionId, name, dna are required" }, { status: 400 })
  }

  const session = upsertWorkspaceSession({
    sessionId: body.sessionId,
    name: body.name,
    dna: body.dna,
  }, context.projectRoot)

  return json({ ok: true, session })
}
