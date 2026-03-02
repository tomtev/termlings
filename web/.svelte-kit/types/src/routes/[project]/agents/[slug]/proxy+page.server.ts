// @ts-nocheck
import type { PageServerLoad } from "./$types"
import { loadWorkspaceRouteData } from "$lib/server/workspace-route"

export const load = async ({ params, url }: Parameters<PageServerLoad>[0]) => {
  const slug = params.slug;

  return loadWorkspaceRouteData({
    requestedProjectId: params.project,
    requestedThreadId: `agent:${slug}`,
    pathname: url.pathname,
  })
}
