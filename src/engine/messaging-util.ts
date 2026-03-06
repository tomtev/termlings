/**
 * Message sending utility
 */

import { resolveAgentToken } from "../agents/resolve.js"

export async function sendMessage(
  target: string,
  text: string,
  sessionId: string,
  agentName: string,
  agentDna: string
) {
  const { writeMessages, queueMessage } = await import("./ipc.js")
  const { appendWorkspaceMessage, readSession, upsertSession, listSessions } = await import("../workspace/state.js")

  const rawTarget = target
  const resolvedTarget =
    rawTarget === "owner" || rawTarget === "operator"
      ? "human:default"
      : rawTarget
  const fromName = agentName || "agent"
  const fromDna = agentDna || "0000000"

  // Check if this is a channel message
  const isChannelTarget = resolvedTarget.startsWith("channel:")
  const isHumanTarget = resolvedTarget.startsWith("human:")

  if (isChannelTarget) {
    // Channel message - no target session needed
    const channel = resolvedTarget.slice("channel:".length)
    if (!channel) {
      throw new Error("Channel name cannot be empty. Usage: termlings message channel:<name> <text>")
    }

    // Keep sender fresh in session listing while chatting.
    upsertSession(sessionId, {
      name: fromName,
      dna: fromDna,
    })

    appendWorkspaceMessage({
      kind: "chat",
      channel,
      from: sessionId,
      fromName,
      fromDna,
      text,
    })

    console.log(`Posted to #${channel}: "${text}"`)
    return
  }

  let targetSession = isHumanTarget ? null : readSession(resolvedTarget)
  let targetDna = targetSession?.dna
  let finalTarget = resolvedTarget
  let storageTarget = resolvedTarget
  let wasQueued = false

  let targetSlug: string | undefined
  let targetAgentName: string | undefined

  if (!isHumanTarget && resolvedTarget.startsWith("agent:")) {
    const agentId = resolvedTarget.slice("agent:".length)
    if (agentId.length > 0) {
      const { discoverLocalAgents } = await import("../agents/discover.js")
      const resolved = resolveAgentToken(
        agentId,
        discoverLocalAgents().map((agent) => ({
          slug: agent.name,
          name: agent.soul?.name,
          title: agent.soul?.title,
          titleShort: agent.soul?.title_short,
          dna: agent.soul?.dna,
        })),
      )

      if ("error" in resolved) {
        if (resolved.error === "ambiguous") {
          throw new Error(`Agent target "${agentId}" is ambiguous. Use agent:<slug> instead.`)
        }
        throw new Error(`Unknown agent target "${agentId}". Use agent:<slug> from termlings org-chart.`)
      }

      targetSlug = resolved.agent.slug
      targetAgentName = resolved.agent.name
      targetDna = resolved.agent.dna
      storageTarget = `agent:${targetSlug}`

      if (targetDna) {
        const candidates = listSessions()
          .filter((session) => session.dna === targetDna)
          .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
        targetSession = candidates[0] ?? null
        finalTarget = targetSession?.sessionId ?? resolvedTarget
      } else {
        targetSession = null
      }
    }
  }

  // Allow messaging offline agents and humans - queue messages for later
  const messageObj = {
    from: sessionId,
    fromName,
    text,
    ts: Date.now(),
    fromDna,
  }

  // Keep sender fresh in session listing while chatting.
  upsertSession(sessionId, {
    name: fromName,
    dna: fromDna,
  })

  if (targetSession) {
    // Online agent - deliver immediately via IPC
    writeMessages(finalTarget, [messageObj])
  } else if (!isHumanTarget && resolvedTarget.startsWith("agent:")) {
    // Offline agent - queue for later delivery using canonical slug.
    const queueKey = targetSlug || targetDna
    if (queueKey) {
      queueMessage(queueKey, messageObj)
      wasQueued = true
    }
  }
  // Human messages are stored in the workspace message index (appendWorkspaceMessage below)
  // and displayed in the TUI/web — no separate queue needed.

  appendWorkspaceMessage({
    kind: "dm",
    from: sessionId,
    fromName,
    fromDna,
    target: storageTarget,
    targetName: targetAgentName ?? targetSession?.name ?? (isHumanTarget ? "Owner" : undefined),
    targetDna,
    text,
  })

  const status = wasQueued ? " (queued)" : ""
  console.log(`Sent to ${storageTarget}: "${text}"${status}`)
}
