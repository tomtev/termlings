import { json } from '@sveltejs/kit';
import { a as listSessions, p as postWorkspaceMessage } from './workspace-CMuDx67t.js';
import { r as resolveProjectContext } from './hub-BHhrJYhI.js';
import 'fs';
import 'path';
import 'crypto';
import 'os';

const POST = async ({ request }) => {
  const requestedProject = new URL(request.url).searchParams.get("project") ?? void 0;
  const context = resolveProjectContext(requestedProject);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const kind = body.kind ?? "chat";
  const text = body.text?.trim();
  const target = body.target;
  const from = body.from || "operator";
  const fromName = body.fromName || "Operator";
  const fromDna = body.fromDna;
  if (!text) {
    return json({ error: "text is required" }, { status: 400 });
  }
  if (kind === "dm" && !target) {
    return json({ error: "target is required for DM" }, { status: 400 });
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
    return json({ error: "Target session not found (agent may be offline)" }, { status: 404 });
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
  return json({ ok: true, message });
};

export { POST };
//# sourceMappingURL=_server.ts-CWlgKfbE.js.map
