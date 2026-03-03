import { l as loadWorkspaceRouteData } from "../../../../../chunks/workspace-route.js";
function channelToThreadId(channel) {
  if (channel === "workspace" || channel === "inbox") return channel;
  return "activity";
}
const load = async ({ params, url }) => {
  return loadWorkspaceRouteData({
    requestedProjectId: params.project,
    requestedThreadId: channelToThreadId(params.channel),
    pathname: url.pathname
  });
};
export {
  load
};
