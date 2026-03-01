import { a as listSessions, u as upsertWorkspaceSession } from './workspace-BILcvbix.js';
import { i as isAuthorized, a as corsJson, c as corsEmpty } from './public-api-zplf20gd.js';
import { r as resolveProjectContext } from './hub-BHhrJYhI.js';
import 'fs';
import 'path';
import '@sveltejs/kit';
import 'crypto';
import 'os';

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
    projectId: context.activeProjectId,
    sessions: listSessions(context.projectRoot)
  });
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
  if (!body.sessionId || !body.name || !body.dna) {
    return corsJson({ error: "sessionId, name, dna are required" }, { status: 400 });
  }
  const queryProject = new URL(request.url).searchParams.get("project") ?? void 0;
  const context = resolveProjectContext(body.projectId ?? queryProject);
  const session = upsertWorkspaceSession({
    sessionId: body.sessionId,
    name: body.name,
    dna: body.dna
  }, context.projectRoot);
  return corsJson({ ok: true, projectId: context.activeProjectId, session });
};

export { GET, OPTIONS, POST };
//# sourceMappingURL=_server.ts-CP8Mx9_l.js.map
