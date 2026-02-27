import { join } from "path";
import { readdirSync, existsSync, readFileSync } from "fs";
import { createInterface } from "readline";

export interface LocalAgent {
  name: string;
  path: string;
  soul?: { name: string; title?: string; purpose: string; dna: string; command?: string };
}

/**
 * Discover agents in .termlings/ directory
 */
export function discoverLocalAgents(): LocalAgent[] {
  const agents: LocalAgent[] = [];
  const termlingsDir = join(process.cwd(), ".termlings");

  if (!existsSync(termlingsDir)) return agents;

  try {
    const entries = readdirSync(termlingsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip special directories
      if (entry.name === "_data" || entry.name.startsWith(".")) continue;

      const agentPath = join(termlingsDir, entry.name);
      const soulPath = join(agentPath, "SOUL.md");

      // Only consider it an agent if SOUL.md exists
      if (!existsSync(soulPath)) continue;

      let soul: LocalAgent["soul"] | undefined;
      try {
        const content = readFileSync(soulPath, "utf-8");
        const nameMatch = content.match(/^# (.+)$/m);
        const titleMatch = content.match(/\*\*Title\*\*:\s*(.+)$/m);
        // Purpose can be inline (**Purpose**: text) or as heading (## Purpose \n text)
        const purposeInlineMatch = content.match(/\*\*Purpose\*\*:\s*(.+)$/m);
        const purposeHeadingMatch = content.match(/^## Purpose\s*\n+(.+?)(?:\n\n|\n##)/m);
        const purposeMatch = purposeInlineMatch || purposeHeadingMatch;
        const dnaMatch = content.match(/\*\*DNA\*\*:\s*(.+)$/m);
        const commandMatch = content.match(/\*\*Command\*\*:\s*(.+)$/m);

        if (nameMatch && dnaMatch) {
          soul = {
            name: nameMatch[1],
            title: titleMatch ? titleMatch[1] : undefined,
            purpose: purposeMatch ? purposeMatch[1] : "",
            dna: dnaMatch[1],
            command: commandMatch ? commandMatch[1] : undefined,
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
  // Get active agents in this room
  const activeAgentDnas = new Set<string>();
  try {
    const { readState } = await import("../engine/ipc.js");
    const state = readState();
    if (state?.entities) {
      for (const entity of state.entities) {
        if (entity.dna) activeAgentDnas.add(entity.dna);
      }
    }
  } catch {
    // No sim running, that's fine
  }

  const { selectMenu } = await import("../interactive-menu.js");
  const { decodeDNA, getTraitColors } = await import("../index.js");

  // Build menu items for existing agents
  const menuItems = [
    ...localAgents.map((a) => {
      const name = a.soul?.name || a.name;
      const title = a.soul?.title ? ` — ${a.soul.title}` : "";
      const purpose = a.soul?.purpose || "Autonomous agent";
      const status = a.soul?.dna && activeAgentDnas.has(a.soul.dna) ? " (in room)" : "";

      // Get face and hat colors from DNA (same as avatar rendering)
      let hatColor = "";
      let faceColor = "";
      if (a.soul?.dna) {
        try {
          const traits = decodeDNA(a.soul.dna);
          const colors = getTraitColors(traits, false);
          hatColor = `\x1b[38;2;${colors.hatRgb[0]};${colors.hatRgb[1]};${colors.hatRgb[2]}m▪\x1b[0m`;
          faceColor = `\x1b[38;2;${colors.faceRgb[0]};${colors.faceRgb[1]};${colors.faceRgb[2]}m█\x1b[0m`;
        } catch {
          hatColor = "▪";
          faceColor = "●";
        }
      } else {
        hatColor = " ";
        faceColor = " ";
      }

      // Fade out description text (but keep color square bright)
      const dimGray = "\x1b[90m";
      const reset = "\x1b[0m";
      const fadedText = `${dimGray}${purpose}${status}${reset}`;

      return {
        value: JSON.stringify({ type: "existing", agent: a }),
        label: `${hatColor} ${name}${title}`,
        description: `${faceColor} ${fadedText}`,
      };
    }),
    {
      value: JSON.stringify({ type: "create", agent: null }),
      label: "Spawn random agent",
      description: "Create a new agent with random DNA",
    },
  ];

  const selected = await selectMenu(menuItems, "Select agent to launch:");
  const { type, agent } = JSON.parse(selected);

  if (type === "create") {
    return "create-random";
  }

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
  const activeAgentDnas = new Set<string>();
  try {
    const { readState } = await import("../engine/ipc.js");
    const state = readState();
    if (state?.entities) {
      for (const entity of state.entities) {
        if (entity.dna) activeAgentDnas.add(entity.dna);
      }
    }
  } catch {
    // No sim running, that's fine
  }

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
      const label = opt.name === "claude" ? "Claude Code" : "Codex CLI";
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
