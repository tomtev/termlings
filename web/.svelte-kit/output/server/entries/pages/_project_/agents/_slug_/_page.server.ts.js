import { l as loadWorkspaceRouteData } from "../../../../../chunks/workspace-route.js";
const load = async ({ params, url }) => {
  const slug = params.slug;
  return loadWorkspaceRouteData({
    requestedProjectId: params.project,
    requestedThreadId: `agent:${slug}`,
    pathname: url.pathname
  });
};
export {
  load
};
