import { json } from "@sveltejs/kit";
import { a as loadWorkspaceSnapshot } from "../../../../chunks/workspace.js";
import { r as resolveProjectContext } from "../../../../chunks/hub.js";
const GET = ({ url }) => {
  const requestedProject = url.searchParams.get("project") ?? void 0;
  const context = resolveProjectContext(requestedProject);
  return json({
    snapshot: loadWorkspaceSnapshot(context.projectRoot),
    projects: context.projects,
    activeProjectId: context.activeProjectId
  });
};
export {
  GET
};
