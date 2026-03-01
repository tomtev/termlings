import { l as listSessions, p as postWorkspaceMessage } from "../../../../../chunks/workspace.js";
import { c as corsEmpty, i as isAuthorized, a as corsJson } from "../../../../../chunks/public-api.js";
import { r as resolveProjectContext } from "../../../../../chunks/hub.js";
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
  const kind = body.kind ?? "chat";
  const text = body.text?.trim();
  const target = body.target;
  const from = body.from || "external";
  const fromName = body.fromName || "External";
  const fromDna = body.fromDna;
  const queryProject = new URL(request.url).searchParams.get("project") ?? void 0;
  const context = resolveProjectContext(body.projectId ?? queryProject);
  if (!text) {
    return corsJson({ error: "text is required" }, { status: 400 });
  }
  if (kind === "dm" && !target) {
    return corsJson({ error: "target is required for DM" }, { status: 400 });
  }
  const sessions = listSessions(context.projectRoot);
  let resolvedTarget = target;
  let targetSession = target ? sessions.find((s) => s.sessionId === target) : void 0;
  let targetDna = targetSession?.dna;
  if (kind === "dm" && target?.startsWith("agent:")) {
    const dna = target.slice("agent:".length);
    const byDna = sessions.filter((s) => s.dna === dna).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    targetSession = byDna[0];
    targetDna = dna;
    resolvedTarget = targetSession?.sessionId ?? target;
  }
  if (kind === "dm" && target && !targetSession && !target.startsWith("human:")) {
    return corsJson({ error: "Target session not found (agent may be offline)" }, { status: 404 });
  }
  const message = postWorkspaceMessage({
    kind,
    from,
    fromName,
    fromDna,
    target: resolvedTarget,
    targetName: targetSession?.name,
    targetDna,
    text
  }, context.projectRoot);
  return corsJson({ ok: true, projectId: context.activeProjectId, message });
};
export {
  OPTIONS,
  POST
};
