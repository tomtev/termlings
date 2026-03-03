/**
 * Conversation history command
 */

import { discoverLocalAgents } from "../agents/discover.js";
import {
  getChannelMessages,
  readWorkspaceMessages,
  type WorkspaceMessage,
} from "../workspace/state.js";

type ConversationScope =
  | { kind: "recent" }
  | { kind: "channel"; channel: string }
  | { kind: "human"; humanId: string }
  | { kind: "agent"; slug?: string; dna?: string; rawTarget: string }
  | { kind: "session"; sessionId: string };

function normalizeHumanId(id: string): string {
  if (id === "human:owner" || id === "human:operator") return "human:default";
  return id;
}

function parsePositiveInt(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatDmTarget(message: WorkspaceMessage): string {
  if (message.targetName && message.targetName.trim().length > 0) return message.targetName;
  if (message.target && message.target.trim().length > 0) return message.target;
  return "unknown";
}

function formatDmMessage(message: WorkspaceMessage): string {
  const ts = formatTimestamp(message.ts);
  const from = message.fromName || message.from;
  const to = formatDmTarget(message);
  return `[${ts}] ${from} -> ${to}\n${message.text}\n`;
}

function formatChatMessage(message: WorkspaceMessage): string {
  const ts = formatTimestamp(message.ts);
  const channel = message.channel || "workspace";
  const from = message.fromName || message.from;
  return `[${ts}] #${channel} ${from}\n${message.text}\n`;
}

function resolveAgentScope(rawTarget: string): ConversationScope {
  const token = rawTarget.slice("agent:".length);
  const localAgents = discoverLocalAgents();
  const bySlug = localAgents.find((agent) => agent.name === token);
  const byDna = !bySlug ? localAgents.find((agent) => agent.soul?.dna === token) : null;
  const resolved = bySlug ?? byDna;

  return {
    kind: "agent",
    slug: resolved?.name ?? (byDna ? undefined : token),
    dna: resolved?.soul?.dna ?? (byDna ? token : undefined),
    rawTarget,
  };
}

function resolveScope(targetArg: string): ConversationScope {
  const normalizedTarget = targetArg === "owner" || targetArg === "operator"
    ? "human:default"
    : targetArg;

  if (normalizedTarget === "all" || normalizedTarget === "recent") {
    return { kind: "recent" };
  }

  if (normalizedTarget.startsWith("channel:")) {
    const channel = normalizedTarget.slice("channel:".length);
    if (!channel) {
      console.error("Usage: termlings conversation channel:<name>");
      process.exit(1);
    }
    return { kind: "channel", channel };
  }

  if (normalizedTarget.startsWith("human:")) {
    return { kind: "human", humanId: normalizeHumanId(normalizedTarget) };
  }

  if (normalizedTarget.startsWith("agent:")) {
    return resolveAgentScope(normalizedTarget);
  }

  if (normalizedTarget.startsWith("tl-")) {
    return { kind: "session", sessionId: normalizedTarget };
  }

  return resolveAgentScope(`agent:${normalizedTarget}`);
}

function matchesScope(message: WorkspaceMessage, scope: ConversationScope): boolean {
  if (scope.kind === "recent") {
    return message.kind === "chat" || message.kind === "dm";
  }

  if (scope.kind === "channel") {
    return message.kind === "chat" && message.channel === scope.channel;
  }

  if (scope.kind === "human") {
    if (message.kind !== "dm") return false;
    const from = normalizeHumanId(message.from);
    const target = message.target ? normalizeHumanId(message.target) : "";
    return from === scope.humanId || target === scope.humanId;
  }

  if (scope.kind === "session") {
    if (message.kind !== "dm") return false;
    return message.from === scope.sessionId || message.target === scope.sessionId;
  }

  if (scope.kind === "agent") {
    if (message.kind !== "dm") return false;
    const slugTarget = scope.slug ? `agent:${scope.slug}` : "";
    const dnaTarget = scope.dna ? `agent:${scope.dna}` : "";

    if (scope.dna) {
      if (message.fromDna === scope.dna || message.targetDna === scope.dna) return true;
    }
    if (slugTarget) {
      if (message.from === slugTarget || message.target === slugTarget) return true;
    }
    if (dnaTarget) {
      if (message.from === dnaTarget || message.target === dnaTarget) return true;
    }
    return message.from === scope.rawTarget || message.target === scope.rawTarget;
  }

  return false;
}

function scopeLabel(scope: ConversationScope): string {
  switch (scope.kind) {
    case "recent":
      return "all recent messages";
    case "channel":
      return `channel #${scope.channel}`;
    case "human":
      return scope.humanId;
    case "agent":
      return scope.slug ? `agent:${scope.slug}` : scope.rawTarget;
    case "session":
      return scope.sessionId;
  }
}

export async function handleConversation(
  flags: Set<string>,
  positional: string[],
  opts: Record<string, string>,
): Promise<void> {
  if (flags.has("help")) {
    console.log(`
🧵 Conversation - Read message history in terminal

USAGE:
  termlings conversation <target>
  termlings conversation recent
  termlings conversation all
  termlings conversation <target> --limit 200
  termlings conversation <target> --json

TARGETS:
  human:default          Operator thread view (most important)
  human:owner            Alias for human:default
  human:operator         Alias for human:default
  agent:<slug>           Agent DM conversation
  channel:<name>         Channel history
  tl-<session-id>        Session DM history
  recent|all             Global recent timeline (chat + DMs)
  <slug>                 Shortcut for agent:<slug>

OPTIONS:
  --limit <n>            Max messages to show (default 80)
  --json                 Output raw JSON

OUTPUT:
  - Messages are shown oldest -> newest (within the selected window)
  - Default text mode: readable timeline with timestamp + sender/target
  - JSON mode: { target, total, shown, messages[] }

NOTES:
  - If unsure what is being discussed, check human thread first:
    termlings conversation human:default --limit 120
  - Agent targets resolve by slug first, then DNA
  - "recent"/"all" merges channel + DM traffic into one timeline
  - Use larger limits for full audits (e.g. --limit 500)

EXAMPLES:
  termlings conversation human:default
  termlings conversation agent:developer --limit 150
  termlings conversation developer --limit 150
  termlings conversation channel:workspace --limit 60
  termlings conversation recent --limit 120
  termlings conversation all --json
`);
    return;
  }

  const targetArg = positional[1];
  if (!targetArg) {
    console.error("Usage: termlings conversation <target>");
    console.error("Try: termlings conversation human:default");
    process.exit(1);
  }

  const limit = parsePositiveInt(opts.limit, 80);
  const scope = resolveScope(targetArg);
  const root = process.cwd();
  const jsonMode = flags.has("json");

  const sourceMessages =
    scope.kind === "channel"
      ? getChannelMessages(scope.channel, root)
      : readWorkspaceMessages({ limit: 20_000 }, root);

  const filtered = sourceMessages
    .filter((message) => matchesScope(message, scope))
    .sort((a, b) => a.ts - b.ts);

  const clipped = filtered.slice(-limit);

  if (jsonMode) {
    console.log(JSON.stringify({
      target: scopeLabel(scope),
      total: filtered.length,
      shown: clipped.length,
      messages: clipped,
    }, null, 2));
    return;
  }

  if (clipped.length === 0) {
    console.log(`No messages found for ${scopeLabel(scope)}.`);
    return;
  }

  console.log(`Conversation: ${scopeLabel(scope)} (${clipped.length}/${filtered.length})\n`);

  for (const message of clipped) {
    if (message.kind === "chat") {
      console.log(formatChatMessage(message));
    } else if (message.kind === "dm") {
      console.log(formatDmMessage(message));
    } else {
      const ts = formatTimestamp(message.ts);
      const from = message.fromName || message.from;
      console.log(`[${ts}] ${from}\n${message.text}\n`);
    }
  }
}
