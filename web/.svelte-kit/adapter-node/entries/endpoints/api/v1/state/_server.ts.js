import { a as loadWorkspaceSnapshot } from "../../../../../chunks/workspace.js";
import { i as isAuthorized, a as corsJson, c as corsEmpty } from "../../../../../chunks/public-api.js";
import { r as resolveProjectContext } from "../../../../../chunks/hub.js";
const OPTIONS = async () => {
  return corsEmpty();
};
const GET = async ({ request }) => {
  if (!isAuthorized(request)) {
    return corsJson({ error: "Unauthorized" }, { status: 401 });
  }
  const requestedProject = new URL(request.url).searchParams.get("project") ?? void 0;
  const context = resolveProjectContext(requestedProject);
  return corsJson({
    apiVersion: "v1",
    project: {
      projectId: context.activeProjectId,
      projectName: context.projects.find((p) => p.projectId === context.activeProjectId)?.projectName
    },
    ...loadWorkspaceSnapshot(context.projectRoot)
  });
};
export {
  GET,
  OPTIONS
};
