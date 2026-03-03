// @ts-nocheck
import type { PageServerLoad } from "./$types"
import { loadWorkspaceRouteData } from "$lib/server/workspace-route"

export const load = async ({ params, url }: Parameters<PageServerLoad>[0]) => {
  return loadWorkspaceRouteData({
    requestedProjectId: params.project,
    requestedThreadId: "workspace",
    pathname: url.pathname,
  })
}
