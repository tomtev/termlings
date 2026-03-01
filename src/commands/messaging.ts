/**
 * Messaging commands: list-agents, message
 */

import { sendMessage } from "../engine/messaging-util.js";

export async function handleListAgents(flags: Set<string>, positional: string[]) {
  if (flags.has("help")) {
    console.log(`
👥 List Agents - See who's online

Shows all active agent sessions in the workspace.

USAGE:
  termlings list-agents

OUTPUT:
  Session ID (16 chars)  Agent Name  [DNA]  Last Seen
  tl-abc123def456    Alice         [2c5f423] last-seen 5s ago (you)
  tl-xyz789pqr012    Bob           [1b4e312] last-seen 120s ago

NOTES:
  • (you) = Current session
  • Last seen: Time since last activity
  • DNA: Stable agent identity (persists across restarts)

USE WHEN:
  • Starting work (check who's active)
  • Coordinating with teammates
  • Finding agent DNAs to message
`);
    return;
  }

  const { listSessions } = await import("../workspace/state.js");
  const sessions = listSessions();
  if (sessions.length === 0) {
    console.log("No active sessions");
    return;
  }

  const sessionId = process.env.TERMLINGS_SESSION_ID;
  for (const s of sessions) {
    const ageSeconds = Math.max(0, Math.floor((Date.now() - s.lastSeenAt) / 1000));
    const you = s.sessionId === sessionId ? " (you)" : "";
    console.log(
      `${s.sessionId.padEnd(16)} ${s.name.padEnd(14)} [${s.dna}] last-seen ${ageSeconds}s ago${you}`
    );
  }
}

export async function handleMessage(flags: Set<string>, positional: string[]) {
  if (flags.has("help")) {
    console.log(`
💬 Message - Send messages to channels, agents & operators

Send direct messages, post to channels, or notify human handlers.

USAGE:
  termlings message <target> <text>

TARGETS:
  channel:<name>        Post to a channel (e.g., #general)
  <session-id>          A specific live session (from termlings list-agents)
  agent:<dna>           Stable agent identity (works across restarts) ← PREFERRED
  human:<id>            Human operator inbox
    human:default       Owner/operator shortcut
    human:operator      Alias for operator
    human:owner         Alias for owner

EXAMPLES:
  # Post to a channel
  termlings message channel:general "Team standup in 5 mins"
  termlings message channel:engineering "Deploy ready for review"

  # Message another agent
  termlings message agent:2c5f423 "I'm starting the data validation task"

  # Message the operator (high priority)
  termlings message human:default "Task completed, results in /tmp/output.json"

  # Message a specific live session
  termlings message tl-abc123def456 "Quick question about the API key"

BEST PRACTICES:
  ✓ Use channel:name for team-wide announcements
  ✓ Use agent:<dna> for persistent 1-to-1 threads (survives restarts)
  ✓ Message human:default for blockers or status updates
  ✓ Keep messages concise (timestamps auto-added)
  ✓ Include concrete next steps
  ✓ Use for coordination, not logging

OPERATOR EXPECTATIONS:
  1. Acknowledge quickly
  2. Give next step + ETA
  3. State blockers clearly if stuck
  4. High priority: human messages get immediate attention
`);
    return;
  }

  const sessionId = process.env.TERMLINGS_SESSION_ID;
  const _agentName = process.env.TERMLINGS_AGENT_NAME || undefined;
  const _agentDna = process.env.TERMLINGS_AGENT_DNA || undefined;

  if (!sessionId) {
    console.error("Error: TERMLINGS_SESSION_ID env var not set");
    process.exit(1);
  }

  const target = positional[1];
  const text = positional.slice(2).join(" ");

  if (!target || !text) {
    console.error("Usage: termlings message <target> <text>");
    console.error("Targets: <session-id> | agent:<dna> | human:<id> (aliases: operator, owner)");
    process.exit(1);
  }

  await sendMessage(target, text, sessionId, _agentName || "agent", _agentDna || "0000000");
}
