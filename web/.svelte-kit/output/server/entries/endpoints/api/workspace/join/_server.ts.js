import { json } from "@sveltejs/kit";
import { u as upsertWorkspaceSession } from "../../../../../chunks/workspace.js";
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
  if (!body.sessionId || !body.name || !body.dna) {
    return json({ error: "sessionId, name, dna are required" }, { status: 400 });
  }
  const session = upsertWorkspaceSession({
    sessionId: body.sessionId,
    name: body.name,
    dna: body.dna
  }, context.projectRoot);
  return json({ ok: true, session });
};
export {
  POST
};
