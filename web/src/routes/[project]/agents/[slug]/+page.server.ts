import type { PageServerLoad } from "./$types"
import { loadWorkspaceRouteData } from "$lib/server/workspace-route"

export const load: PageServerLoad = async ({ params, url }) => {
  const slug = params.slug;

  return loadWorkspaceRouteData({
    requestedProjectId: params.project,
    requestedThreadId: `agent:${slug}`,
    pathname: url.pathname,
  })
}
