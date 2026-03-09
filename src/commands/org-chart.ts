import { discoverLocalAgents } from "../agents/discover.js";
import { discoverLocalHumans } from "../humans/discover.js";
import { listSessions, type WorkspaceSession } from "../workspace/state.js";
import { maybeHandleCommandSchema, type CommandSchemaContract } from "./command-schema.js";

type OrgNodeType = "human" | "agent";

interface OrgNode {
  id: string;
  type: OrgNodeType;
  slug: string;
  name: string;
  title: string;
  role: string;
  team: string;
  reportsTo?: string;
  online: boolean;
  lastSeenAt: number;
  sessionIds: string[];
}

const ORG_CHART_SCHEMA: CommandSchemaContract = {
  command: "org-chart",
  title: "Org Chart",
  summary: "Team hierarchy, reporting lines, and active session visibility",
  notes: [
    "Use reports_to and team fields in SOUL.md frontmatter to shape the graph.",
    "The legacy alias `termlings list-agents` resolves to the same command.",
  ],
  actions: {
    show: {
      summary: "Render the org chart as text or JSON",
      usage: "termlings org-chart [--json]",
      aliases: [
        "termlings list-agents [--json]",
      ],
      options: {
        json: "Output nodes and edges as structured JSON",
      },
      examples: [
        "termlings org-chart",
        "termlings org-chart --json",
      ],
    },
  },
}

function cleanFrontmatterValue(input?: string): string {
  if (!input) return "";
  return input.trim().replace(/^['"]|['"]$/g, "");
}

function normalizeReportsToTarget(
  value: string | undefined,
  agentLookup: Map<string, string>,
  humanLookup: Map<string, string>,
): string | undefined {
  const raw = cleanFrontmatterValue(value);
  if (!raw) return undefined;

  const lower = raw.toLowerCase();
  if (lower === "-" || lower === "none" || lower === "n/a") return undefined;
  if (lower === "owner" || lower === "operator" || lower === "human") return "human:default";
  if (lower.startsWith("agent:") || lower.startsWith("human:")) return lower;
  if (agentLookup.has(lower)) return `agent:${agentLookup.get(lower)}`;
  if (humanLookup.has(lower)) return `human:${humanLookup.get(lower)}`;

  return raw;
}

function sessionsByDna(sessions: WorkspaceSession[]): Map<string, WorkspaceSession[]> {
  const byDna = new Map<string, WorkspaceSession[]>();
  for (const session of sessions) {
    const existing = byDna.get(session.dna) || [];
    existing.push(session);
    byDna.set(session.dna, existing);
  }
  for (const group of byDna.values()) {
    group.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }
  return byDna;
}

function truncate(value: string, maxWidth: number): string {
  if (value.length <= maxWidth) return value;
  if (maxWidth <= 3) return value.slice(0, maxWidth);
  return `${value.slice(0, maxWidth - 3)}...`;
}

export async function handleOrgChart(flags: Set<string>, _positional: string[]): Promise<void> {
  if (maybeHandleCommandSchema(ORG_CHART_SCHEMA, _positional)) {
    return;
  }

  if (flags.has("help")) {
    console.log(`
🏢 Org Chart - Team hierarchy and reporting lines

USAGE:
  termlings org-chart
  termlings org-chart --json

ALIAS:
  termlings list-agents    (legacy alias)

FRONTMATTER FIELDS:
  reports_to: agent:pm | human:default | <slug/name/title>
  team: Product | Platform | Growth
`);
    return;
  }

  const sessions = listSessions();
  const localAgents = discoverLocalAgents();
  const localHumans = discoverLocalHumans();
  const activeSessionId = process.env.TERMLINGS_SESSION_ID;
  const now = Date.now();
  const byDna = sessionsByDna(sessions);

  const agentLookup = new Map<string, string>();
  const humanLookup = new Map<string, string>();

  for (const human of localHumans) {
    const slug = human.name;
    const soul = human.soul;
    const name = cleanFrontmatterValue(soul?.name) || slug;
    const title = cleanFrontmatterValue(soul?.title);
    humanLookup.set(slug.toLowerCase(), slug);
    if (name) humanLookup.set(name.toLowerCase(), slug);
    if (title) humanLookup.set(title.toLowerCase(), slug);
  }

  for (const agent of localAgents) {
    const slug = agent.name;
    const soul = agent.soul;
    const name = cleanFrontmatterValue(soul?.name) || slug;
    const title = cleanFrontmatterValue(soul?.title);
    const short = cleanFrontmatterValue(soul?.title_short);
    agentLookup.set(slug.toLowerCase(), slug);
    if (name) agentLookup.set(name.toLowerCase(), slug);
    if (title) agentLookup.set(title.toLowerCase(), slug);
    if (short) agentLookup.set(short.toLowerCase(), slug);
  }

  const nodes: OrgNode[] = [];

  for (const human of localHumans) {
    const slug = human.name;
    const soul = human.soul;
    nodes.push({
      id: `human:${slug}`,
      type: "human",
      slug,
      name: cleanFrontmatterValue(soul?.name) || slug,
      title: cleanFrontmatterValue(soul?.title),
      role: cleanFrontmatterValue(soul?.role),
      team: cleanFrontmatterValue(soul?.team),
      reportsTo: normalizeReportsToTarget(soul?.reports_to, agentLookup, humanLookup),
      online: false,
      lastSeenAt: 0,
      sessionIds: [],
    });
  }

  for (const agent of localAgents) {
    const slug = agent.name;
    const soul = agent.soul;
    const dna = cleanFrontmatterValue(soul?.dna);
    const sessionsForAgent = dna ? byDna.get(dna) || [] : [];
    const latest = sessionsForAgent[0];
    const online = Boolean(latest && now - latest.lastSeenAt < 35_000);
    const title = cleanFrontmatterValue(soul?.title)
      || cleanFrontmatterValue(soul?.title_short);
    nodes.push({
      id: `agent:${slug}`,
      type: "agent",
      slug,
      name: cleanFrontmatterValue(soul?.name) || slug,
      title,
      role: cleanFrontmatterValue(soul?.role),
      team: cleanFrontmatterValue(soul?.team),
      reportsTo: normalizeReportsToTarget(soul?.reports_to, agentLookup, humanLookup),
      online,
      lastSeenAt: latest?.lastSeenAt || 0,
      sessionIds: sessionsForAgent.map((session) => session.sessionId),
    });
  }

  if (nodes.length === 0) {
    console.log("No humans or agents found.");
    return;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const directReportsById = new Map<string, number>();
  for (const node of nodes) {
    if (!node.reportsTo || !nodeById.has(node.reportsTo)) continue;
    directReportsById.set(node.reportsTo, (directReportsById.get(node.reportsTo) || 0) + 1);
  }

  const depthMemo = new Map<string, number>();
  const resolving = new Set<string>();
  const depthOf = (id: string): number => {
    const memo = depthMemo.get(id);
    if (memo !== undefined) return memo;
    if (resolving.has(id)) return 0;
    resolving.add(id);

    const node = nodeById.get(id);
    if (!node?.reportsTo || !nodeById.has(node.reportsTo)) {
      resolving.delete(id);
      depthMemo.set(id, 0);
      return 0;
    }

    const depth = depthOf(node.reportsTo) + 1;
    resolving.delete(id);
    depthMemo.set(id, depth);
    return depth;
  };

  const sorted = [...nodes].sort((a, b) => {
    const depthDiff = depthOf(a.id) - depthOf(b.id);
    if (depthDiff !== 0) return depthDiff;
    if (a.type !== b.type) return a.type === "human" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (flags.has("json")) {
    const output = {
      generatedAt: now,
      nodes: sorted.map((node) => ({
        ...node,
        depth: depthOf(node.id),
        directReports: directReportsById.get(node.id) || 0,
        isCurrentSession: node.sessionIds.includes(activeSessionId || ""),
      })),
      edges: sorted
        .filter((node) => Boolean(node.reportsTo))
        .map((node) => ({
          from: node.id,
          to: node.reportsTo!,
        })),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log("Org Chart");
  const header = [
    "Type".padEnd(6),
    "ID".padEnd(16),
    "Name".padEnd(14),
    "Title".padEnd(20),
    "Team".padEnd(12),
    "Reports To".padEnd(24),
    "Leads".padEnd(5),
    "Status",
  ].join(" ");
  console.log(header);

  for (const node of sorted) {
    const manager = node.reportsTo ? nodeById.get(node.reportsTo) : undefined;
    const managerText = manager
      ? `${manager.name} (${manager.id})`
      : (node.reportsTo || "-");
    const status = node.type === "human"
      ? "human"
      : (node.online ? "online" : "offline");
    const isYou = node.sessionIds.includes(activeSessionId || "");

    const row = [
      node.type.padEnd(6),
      truncate(node.id, 16).padEnd(16),
      truncate(node.name, 14).padEnd(14),
      truncate(node.title || "-", 20).padEnd(20),
      truncate(node.team || "-", 12).padEnd(12),
      truncate(managerText, 24).padEnd(24),
      String(directReportsById.get(node.id) || 0).padEnd(5),
      `${status}${isYou ? " (you)" : ""}`,
    ].join(" ");
    console.log(row);
  }
}
