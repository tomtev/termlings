import type { PageServerLoad } from "./$types"
import { loadWorkspaceRouteData, type WorkspaceThreadId } from "$lib/server/workspace-route"

function channelToThreadId(channel: string): WorkspaceThreadId {
  if (channel === "workspace" || channel === "inbox") return channel
  return "activity"
}

export const load: PageServerLoad = async ({ params, url }) => {
  return loadWorkspaceRouteData({
    requestedProjectId: params.project,
    requestedThreadId: channelToThreadId(params.channel),
    pathname: url.pathname,
  })
}
