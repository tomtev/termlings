import { json } from "@sveltejs/kit";
import { r as removeWorkspaceSession } from "../../../../../chunks/workspace.js";
import { r as resolveProjectContext } from "../../../../../chunks/hub.js";
const POST = async ({ request, url }) => {
  const requestedProject = url.searchParams.get("project") ?? void 0;
  const context = resolveProjectContext(requestedProject);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.sessionId) {
    return json({ error: "sessionId is required" }, { status: 400 });
  }
  removeWorkspaceSession(body.sessionId, context.projectRoot);
  return json({ ok: true });
};
export {
  POST
};
