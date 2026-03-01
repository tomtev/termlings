import { r as removeWorkspaceSession } from "../../../../../../chunks/workspace.js";
import { c as corsEmpty, i as isAuthorized, a as corsJson } from "../../../../../../chunks/public-api.js";
import { r as resolveProjectContext } from "../../../../../../chunks/hub.js";
const OPTIONS = async () => {
  return corsEmpty();
};
const POST = async ({ request }) => {
  if (!isAuthorized(request)) {
    return corsJson({ error: "Unauthorized" }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return corsJson({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.sessionId) {
    return corsJson({ error: "sessionId is required" }, { status: 400 });
  }
  const queryProject = new URL(request.url).searchParams.get("project") ?? void 0;
  const context = resolveProjectContext(body.projectId ?? queryProject);
  removeWorkspaceSession(body.sessionId, context.projectRoot);
  return corsJson({ ok: true, projectId: context.activeProjectId });
};
export {
  OPTIONS,
  POST
};
