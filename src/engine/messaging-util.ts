/**
 * Message sending utility
 */

export async function sendMessage(
  target: string,
  text: string,
  sessionId: string,
  agentName: string,
  agentDna: string
) {
  const { writeMessages, queueMessage } = await import("./ipc.js");
  const { appendWorkspaceMessage, readSession, upsertSession, listSessions } = await import("../workspace/state.js");

  const rawTarget = target;
  const resolvedTarget =
    rawTarget === "owner" || rawTarget === "operator"
      ? "human:default"
      : rawTarget;
  const fromName = agentName || "agent";
  const fromDna = agentDna || "0000000";

  // Check if this is a channel message
  const isChannelTarget = resolvedTarget.startsWith("channel:");
  const isHumanTarget = resolvedTarget.startsWith("human:");

  if (isChannelTarget) {
    // Channel message - no target session needed
    const channel = resolvedTarget.slice("channel:".length);
    if (!channel) {
      console.error("Channel name cannot be empty");
      console.error("Usage: termlings message channel:<name> <text>");
      process.exit(1);
    }

    // Keep sender fresh in session listing while chatting.
    upsertSession(sessionId, {
      name: fromName,
      dna: fromDna,
    });

    appendWorkspaceMessage({
      kind: "chat",
      channel,
      from: sessionId,
      fromName,
      fromDna,
      text,
    });

    console.log(`Posted to #${channel}: "${text}"`);
    return;
  }

  let targetSession = isHumanTarget ? null : readSession(resolvedTarget);
  let targetDna = targetSession?.dna;
  let finalTarget = resolvedTarget;
  let wasOffline = false;

  let targetSlug: string | undefined;
  let targetAgentName: string | undefined;

  if (!isHumanTarget && resolvedTarget.startsWith("agent:")) {
    const agentId = resolvedTarget.slice("agent:".length);
    if (agentId.length > 0) {
      // Try to resolve agent by slug (folder name) or DNA
      const { discoverLocalAgents } = await import("../agents/discover.js");
      const agents = discoverLocalAgents();

      // First try exact slug match
      let targetAgent = agents.find((a) => a.name === agentId);
      // Fallback: try DNA match
      if (!targetAgent) {
        targetAgent = agents.find((a) => a.soul?.dna === agentId);
      }
      let dna = targetAgent?.soul?.dna;
      targetSlug = targetAgent?.name;
      targetAgentName = targetAgent?.soul?.name;

      // If no slug match, try DNA match (backwards compat)
      if (!dna) {
        dna = agentId;
      }

      if (dna) {
        // Look for online session with this DNA
        const candidates = listSessions()
          .filter((session) => session.dna === dna)
          .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
        targetSession = candidates[0] ?? null;
        targetDna = dna;
        finalTarget = targetSession?.sessionId ?? resolvedTarget;
        wasOffline = !targetSession;
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
  };

  // Keep sender fresh in session listing while chatting.
  upsertSession(sessionId, {
    name: fromName,
    dna: fromDna,
  });

  if (targetSession) {
    // Online agent - deliver immediately via IPC
    writeMessages(finalTarget, [messageObj]);
  } else if (!isHumanTarget && resolvedTarget.startsWith("agent:")) {
    // Offline agent - queue for later delivery using slug (or DNA fallback)
    const queueKey = targetSlug || targetDna;
    if (queueKey) {
      queueMessage(queueKey, messageObj);
    }
  }
  // Human messages are stored in the workspace message index (appendWorkspaceMessage below)
  // and displayed in the TUI/web — no separate queue needed.

  appendWorkspaceMessage({
    kind: "dm",
    from: sessionId,
    fromName,
    fromDna,
    target: targetSlug ? `agent:${targetSlug}` : finalTarget,
    targetName: targetAgentName ?? targetSession?.name ?? (isHumanTarget ? "Owner" : undefined),
    targetDna,
    text,
  });

  const status = wasOffline || !targetSession ? " (queued)" : "";
  console.log(`Sent to ${resolvedTarget}: "${text}"${status}`);
}
