import { l as loadWorkspaceRouteData } from "../../../../chunks/workspace-route.js";
const load = async ({ params, url }) => {
  return loadWorkspaceRouteData({
    requestedProjectId: params.project,
    requestedThreadId: "calendar",
    pathname: url.pathname
  });
};
export {
  load
};
