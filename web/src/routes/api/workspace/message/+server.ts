import { json } from "@sveltejs/kit"
import type { RequestHandler } from "@sveltejs/kit"
import { listSessions, postWorkspaceMessage } from "$lib/server/workspace"
import { resolveProjectContext } from "$lib/server/hub"

interface MessageBody {
  kind?: "chat" | "dm"
  text?: string
  target?: string
  from?: string
  fromName?: string
  fromDna?: string
}

export const POST: RequestHandler = async ({ request }) => {
  const requestedProject = new URL(request.url).searchParams.get("project") ?? undefined
  const context = resolveProjectContext(requestedProject)
  let body: MessageBody
  try {
    body = (await request.json()) as MessageBody
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const kind = body.kind ?? "chat"
  const text = body.text?.trim()
  const target = body.target
  const from = body.from || "operator"
  const fromName = body.fromName || "Operator"
  const fromDna = body.fromDna

  if (!text) {
    return json({ error: "text is required" }, { status: 400 })
  }
  if (kind === "dm" && !target) {
    return json({ error: "target is required for DM" }, { status: 400 })
  }

  const sessions = listSessions(context.projectRoot)
  let resolvedTarget = target
  let targetSession = target ? sessions.find((s) => s.sessionId === target) : undefined
  let targetDna = targetSession?.dna

  if (kind === "dm" && target?.startsWith("agent:")) {
    const dna = target.slice("agent:".length)
    const byDna = sessions
      .filter((s) => s.dna === dna)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    targetSession = byDna[0]
    targetDna = dna
    resolvedTarget = targetSession?.sessionId ?? target
  }

  if (kind === "dm" && target && !targetSession && !target.startsWith("human:")) {
    return json({ error: "Target session not found (agent may be offline)" }, { status: 404 })
  }

  const message = postWorkspaceMessage({
    kind,
    from,
    fromName,
    fromDna,
    target: resolvedTarget,
    targetName: targetSession?.name,
    targetDna,
    text,
  }, context.projectRoot)

  return json({ ok: true, message })
}
