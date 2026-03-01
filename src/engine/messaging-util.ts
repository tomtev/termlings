/**
 * Message sending utility - extracted from cli.ts
 */

export async function sendMessage(
  target: string,
  text: string,
  sessionId: string,
  agentName: string,
  agentDna: string
) {
  const { writeMessages } = await import("./ipc.js");
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

  if (!isHumanTarget && resolvedTarget.startsWith("agent:")) {
    const dna = resolvedTarget.slice("agent:".length);
    if (dna.length > 0) {
      const candidates = listSessions()
        .filter((session) => session.dna === dna)
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
      targetSession = candidates[0] ?? null;
      targetDna = dna;
      finalTarget = targetSession?.sessionId ?? resolvedTarget;
    }
  }

  if (!isHumanTarget && !targetSession) {
    console.error(`Unknown target: ${resolvedTarget}`);
    console.error("Use `termlings list-agents` to discover agent IDs, `agent:<dna>` for stable threads, `channel:<name>` for channels, or `human:<id>` for a human operator.");
    process.exit(1);
  }

  // Keep sender fresh in session listing while chatting.
  upsertSession(sessionId, {
    name: fromName,
    dna: fromDna,
  });

  if (targetSession) {
    writeMessages(finalTarget, [{
      from: sessionId,
      fromName,
      text,
      ts: Date.now(),
    }]);
  }

  appendWorkspaceMessage({
    kind: "dm",
    from: sessionId,
    fromName,
    fromDna,
    target: finalTarget,
    targetName: targetSession?.name ?? (isHumanTarget ? "Human Operator" : undefined),
    targetDna,
    text,
  });

  console.log(`Sent to ${resolvedTarget}: "${text}"`);
}
