import type { PageServerLoad } from "./$types"
import { loadWorkspaceRouteData } from "$lib/server/workspace-route"

export const load: PageServerLoad = async ({ params, url }) => {
  return loadWorkspaceRouteData({
    requestedProjectId: params.project,
    requestedThreadId: `agent:${params.dna}`,
    pathname: url.pathname,
  })
}
