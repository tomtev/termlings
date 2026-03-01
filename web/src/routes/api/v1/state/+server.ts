import type { RequestHandler } from "@sveltejs/kit"
import { loadWorkspaceSnapshot } from "$lib/server/workspace"
import { corsEmpty, corsJson, isAuthorized } from "$lib/server/public-api"
import { resolveProjectContext } from "$lib/server/hub"

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
    project: {
      projectId: context.activeProjectId,
      projectName: context.projects.find((p) => p.projectId === context.activeProjectId)?.projectName,
    },
    ...loadWorkspaceSnapshot(context.projectRoot),
  })
}
