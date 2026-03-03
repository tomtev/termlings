import { json } from "@sveltejs/kit"
import type { RequestHandler } from "@sveltejs/kit"
import { loadWorkspaceSnapshot } from "$lib/server/workspace"
import { resolveProjectContext } from "$lib/server/hub"

export const GET: RequestHandler = ({ url }) => {
  const requestedProject = url.searchParams.get("project") ?? undefined
  const context = resolveProjectContext(requestedProject)
  return json({
    snapshot: loadWorkspaceSnapshot(context.projectRoot),
    projects: context.projects,
    activeProjectId: context.activeProjectId,
  })
}
