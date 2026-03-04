import { join } from "path";
import { readdirSync, existsSync, readFileSync } from "fs";
import { createInterface } from "readline";

export interface LocalAgent {
  name: string;
  path: string;
  soul?: {
    name: string;
    title?: string;
    title_short?: string;
    role?: string;
    team?: string;
    reports_to?: string;
    sort_order?: number;
    manage_agents?: boolean;
    dna: string;
    description: string;
  };
}

function parseFrontmatterNumber(input?: string): number | undefined {
  if (!input) return undefined;
  const cleaned = input.trim().replace(/^['"]|['"]$/g, "");
  if (!/^-?\d+$/.test(cleaned)) return undefined;
  const value = Number.parseInt(cleaned, 10);
  return Number.isFinite(value) ? value : undefined;
}

function parseFrontmatterBoolean(input?: string): boolean | undefined {
  if (!input) return undefined;
  const cleaned = input.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  if (["true", "yes", "1", "on"].includes(cleaned)) return true;
  if (["false", "no", "0", "off"].includes(cleaned)) return false;
  return undefined;
}

/**
 * Discover agents in .termlings/ directory
 */
export function discoverLocalAgents(): LocalAgent[] {
  const agents: LocalAgent[] = [];
  const agentsDir = join(process.cwd(), ".termlings", "agents");

  if (!existsSync(agentsDir)) return agents;

  try {
    const entries = readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip hidden directories
      if (entry.name.startsWith(".")) continue;

      const agentPath = join(agentsDir, entry.name);
      const soulPath = join(agentPath, "SOUL.md");

      // Only consider it an agent if SOUL.md exists
      if (!existsSync(soulPath)) continue;

      let soul: LocalAgent["soul"] | undefined;
      try {
        const content = readFileSync(soulPath, "utf-8");

        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/);
        if (!frontmatterMatch) continue;
        const yaml = frontmatterMatch[1];
        const name = yaml.match(/^name:\s*(.+)$/m)?.[1];
        const title = yaml.match(/^title:\s*(.+)$/m)?.[1];
        const title_short = yaml.match(/^title_short:\s*(.+)$/m)?.[1];
        const role = yaml.match(/^role:\s*(.+)$/m)?.[1];
        const team = yaml.match(/^team:\s*(.+)$/m)?.[1];
        const reports_to = yaml.match(/^reports_to:\s*(.+)$/m)?.[1];
        const sort_order = parseFrontmatterNumber(yaml.match(/^sort_order:\s*(.+)$/m)?.[1]);
        const manage_agents = parseFrontmatterBoolean(yaml.match(/^manage_agents:\s*(.+)$/m)?.[1]);
        const dna = yaml.match(/^dna:\s*(.+)$/m)?.[1];
        const description = (frontmatterMatch[2] || "").trim();

        if (name && dna) {
          soul = {
            name,
            title,
            title_short,
            role,
            team,
            reports_to,
            sort_order,
            manage_agents,
            dna,
            description,
          };

          agents.push({
            name: entry.name,
            path: agentPath,
            soul,
          });
        }
      } catch {}
    }
  } catch {}

  return agents;
}

/**
 * Show picker for local agents only (not built-in CLIs)
 * Marks agents already active in the room as taken
 * Includes option to create random agent
 */
export async function selectLocalAgentWithRoom(localAgents: LocalAgent[]): Promise<LocalAgent | null | "create-random"> {
  const { selectAgentGrid } = await import("../interactive-menu.js");
  const { renderTerminalSmall } = await import("../index.js");
  const { readdirSync, readFileSync, existsSync } = await import("fs");

  // Get active agents from sessions directory
  const activeAgentDnas = new Set<string>();
  const sessionsDir = join(process.cwd(), ".termlings", "sessions");
  if (existsSync(sessionsDir)) {
    try {
      const sessionFiles = readdirSync(sessionsDir);
      for (const file of sessionFiles) {
        if (file.endsWith(".json")) {
          try {
            const sessionData = JSON.parse(readFileSync(join(sessionsDir, file), "utf-8"));
            if (sessionData.dna) {
              activeAgentDnas.add(sessionData.dna);
            }
          } catch {}
        }
      }
    } catch {}
  }

  // Build grid items for existing agents
  const gridItems = localAgents.map((a) => {
    const name = a.soul?.name || a.name;
    const role = a.soul?.role || "";
    const isActive = a.soul?.dna ? activeAgentDnas.has(a.soul.dna) : false;
    const avatar = a.soul?.dna ? renderTerminalSmall(a.soul.dna, 0, isActive) : "?";

    return {
      value: JSON.stringify({ type: "existing", agent: a }),
      label: name,
      title: a.soul?.title_short || a.soul?.title,
      avatar,
      disabled: isActive,
    };
  });

  const selected = await selectAgentGrid(gridItems, "Select agent to launch:");
  const { type, agent } = JSON.parse(selected);

  if (agent && agent.soul?.dna && activeAgentDnas.has(agent.soul.dna)) {
    console.log("\n⚠️  Warning: This agent is already active in this room.");
  }

  return agent || null;
}

/**
 * Show interactive selector for all available agents (built-in + local)
 * Marks agents already active in the room as taken
 */
export async function selectAgent(): Promise<{ type: "builtin" | "local"; name: string; agent?: LocalAgent }> {
  const builtins = ["claude", "codex"];
  const localAgents = discoverLocalAgents();

  // Get active agents in this room
  // Note: With chunks, active agents are stored in sessions, not centralized state
  const activeAgentDnas = new Set<string>();
  // TODO: Query sessions directory to get active DNAs
  // For now, all agents are available for selection

  const allOptions = [
    ...builtins.map(name => ({ type: "builtin" as const, name, agent: undefined, taken: false })),
    ...localAgents.map(a => ({
      type: "local" as const,
      name: a.name,
      agent: a,
      taken: a.soul?.dna ? activeAgentDnas.has(a.soul.dna) : false
    })),
  ];

  if (allOptions.length === 0) return { type: "builtin", name: "claude" };
  if (allOptions.length === 1) return allOptions[0];

  // Build menu items for interactive selector
  const { selectMenu } = await import("../interactive-menu.js");
  const menuItems = allOptions.map((opt) => {
    if (opt.type === "builtin") {
      const label = opt.name === "codex" ? "Codex CLI" : "Claude Code";
      const status = opt.taken ? " (in room)" : "";
      return {
        value: JSON.stringify(opt),
        label: `${label}${status}`,
        description: `Built-in ${opt.name} agent`,
      };
    } else {
      const soulName = opt.agent?.soul?.name || opt.name;
      const status = opt.taken ? " (in room)" : "";
      const purpose = opt.agent?.soul?.purpose || "Autonomous agent";
      return {
        value: JSON.stringify(opt),
        label: `${soulName}${status}`,
        description: purpose,
      };
    }
  });

  const selected = await selectMenu(menuItems, "Which agent would you like to launch?");
  const option = JSON.parse(selected);

  if (option.taken) {
    console.log("\n⚠️  Warning: This agent is already active in this room.");
  }

  return option;
}

/**
 * Show interactive selector for local agents (deprecated, use selectAgent)
 */
export async function selectLocalAgent(): Promise<LocalAgent | null> {
  const agents = discoverLocalAgents();
  if (agents.length === 0) return null;
  if (agents.length === 1) return agents[0];

  const result = await selectAgent();
  return result.type === "local" ? result.agent || null : null;
}
