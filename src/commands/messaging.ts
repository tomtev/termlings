/**
 * Messaging commands: list-agents, message
 */

import { sendMessage } from "../engine/messaging-util.js";
import { handleOrgChart } from "./org-chart.js";
import { maybeHandleCommandSchema, type CommandSchemaContract } from "./command-schema.js";

const MESSAGE_SCHEMA: CommandSchemaContract = {
  command: "message",
  title: "Messaging",
  summary: "Direct messaging for agents, humans, channels, and recent conversation lookup",
  relatedCommands: ["conversation"],
  notes: [
    "Use agent:<slug> for durable agent DMs and human:default for operator communication.",
    "Use `termlings conversation ...` to inspect message history.",
  ],
  actions: {
    send: {
      summary: "Send a direct message or channel post",
      usage: "termlings message <target> <text>",
      options: {
        target: "channel:<name> | agent:<slug> | human:default | tl-<session-id>",
        text: "Message body",
      },
      examples: [
        "termlings message agent:developer \"Ready for review\"",
        "termlings message human:default \"Blocked on credentials\"",
      ],
    },
    history: {
      summary: "Read message history for a target or recent timeline",
      usage: "termlings conversation <target> [--limit <n>] [--json]",
      notes: [
        "Targets: human:default, agent:<slug>, channel:<name>, tl-<session-id>, recent, all, or bare agent slug.",
      ],
      examples: [
        "termlings conversation human:default --limit 120",
        "termlings conversation recent --json",
      ],
    },
  },
}

export async function handleListAgents(flags: Set<string>, positional: string[]) {
  if (flags.has("help")) {
    console.log(`
👥 List Agents - Legacy alias for org chart

Use \`termlings org-chart\` instead.

USAGE:
  termlings org-chart
  termlings org-chart --json
  termlings list-agents --json   # still works

OPTIONS:
  --json         Output structured org data
`);
    return;
  }
  await handleOrgChart(flags, ["org-chart", ...positional.slice(1)]);
}

export async function handleMessage(flags: Set<string>, positional: string[]) {
  if (maybeHandleCommandSchema(MESSAGE_SCHEMA, positional)) {
    return;
  }

  if (flags.has("help")) {
    console.log(`
💬 Message - Send messages to channels, agents & operators

Send direct messages, post to channels, or notify human handlers.

USAGE:
  termlings message <target> <text>

TARGETS:
  channel:<name>        Post to a channel (e.g., #general)
  agent:<slug>          Agent folder name (e.g., agent:growth, agent:developer)
  human:default         Operator/owner inbox
    human:operator      Alias for operator
    human:owner         Alias for owner

NOTE: Messages to offline agents & humans are queued automatically.
If the recipient is offline, the message is stored and delivered when they come online.

EXAMPLES:
  # Post to a channel (team-wide)
  termlings message channel:general "Team standup in 5 mins"
  termlings message channel:engineering "Deploy ready for review"

  # Message another agent (works offline, survives restarts)
  termlings message agent:growth "Can you help with customer acquisition?"
  termlings message agent:developer "Task-123 is ready for review"
  termlings message agent:designer "Need feedback on the mockups"

  # Message the operator (high priority, queued if offline)
  termlings message human:default "Task completed, results in /tmp/output.json"

BEST PRACTICES:
  ✓ Use agent:slug for 1-to-1 communication (works offline, easy to remember)
  ✓ Use channel:name for team announcements
  ✓ Use human:default for operator/blockers (always gets through)
  ✓ Copy the slug from 'termlings org-chart' output
  ✓ When you receive a message, copy the ID from the message header and reply
  ✓ Keep messages concise (timestamps auto-added)
  ✓ Include concrete next steps
  ✓ Use for coordination, not logging

OPERATOR EXPECTATIONS:
  1. Acknowledge quickly
  2. Give next step + ETA
  3. State blockers clearly if stuck
  4. High priority: human messages get immediate attention

HISTORY:
  termlings conversation human:default
  termlings conversation agent:developer --limit 120
  termlings conversation recent --limit 200
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
    console.error("Targets: <session-id> | agent:<slug> | human:<id> (aliases: operator, owner)");
    process.exit(1);
  }

  try {
    await sendMessage(target, text, sessionId, _agentName || "agent", _agentDna || "0000000");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
