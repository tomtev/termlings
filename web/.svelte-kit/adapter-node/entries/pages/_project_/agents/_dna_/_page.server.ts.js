import { l as loadWorkspaceRouteData } from "../../../../../chunks/workspace-route.js";
const load = async ({ params, url }) => {
  return loadWorkspaceRouteData({
    requestedProjectId: params.project,
    requestedThreadId: `agent:${params.dna}`,
    pathname: url.pathname
  });
};
export {
  load
};
