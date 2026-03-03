import { l as loadWorkspaceRouteData } from "../../../../chunks/workspace-route.js";
const load = async ({ params, url }) => {
  return loadWorkspaceRouteData({
    requestedProjectId: params.project,
    requestedThreadId: "workspace",
    pathname: url.pathname
  });
};
export {
  load
};
