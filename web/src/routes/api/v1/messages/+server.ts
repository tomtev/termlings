import type { RequestHandler } from "@sveltejs/kit"
import { listSessions, postWorkspaceMessage } from "$lib/server/workspace"
import { corsEmpty, corsJson, isAuthorized } from "$lib/server/public-api"
import { resolveProjectContext } from "$lib/server/hub"

interface MessageBody {
  kind?: "chat" | "dm"
  text?: string
  target?: string
  from?: string
  fromName?: string
  fromDna?: string
  projectId?: string
}

export const OPTIONS: RequestHandler = async () => {
  return corsEmpty()
}

export const POST: RequestHandler = async ({ request }) => {
  if (!isAuthorized(request)) {
    return corsJson({ error: "Unauthorized" }, { status: 401 })
  }

  let body: MessageBody
  try {
    body = (await request.json()) as MessageBody
  } catch {
    return corsJson({ error: "Invalid JSON body" }, { status: 400 })
  }

  const kind = body.kind ?? "chat"
  const text = body.text?.trim()
  const target = body.target
  const from = body.from || "external"
  const fromName = body.fromName || "External"
  const fromDna = body.fromDna
  const queryProject = new URL(request.url).searchParams.get("project") ?? undefined
  const context = resolveProjectContext(body.projectId ?? queryProject)

  if (!text) {
    return corsJson({ error: "text is required" }, { status: 400 })
  }
  if (kind === "dm" && !target) {
    return corsJson({ error: "target is required for DM" }, { status: 400 })
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
    return corsJson({ error: "Target session not found (agent may be offline)" }, { status: 404 })
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

  return corsJson({ ok: true, projectId: context.activeProjectId, message })
}
