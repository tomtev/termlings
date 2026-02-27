import { join } from "path";
import { readdirSync, existsSync, readFileSync } from "fs";
import { createInterface } from "readline";

export interface LocalAgent {
  name: string;
  path: string;
  soul?: { name: string; purpose: string; dna: string; command?: string };
}

/**
 * Discover agents in .termlings/ directory
 */
export function discoverLocalAgents(): LocalAgent[] {
  const agents: LocalAgent[] = [];
  const termlingsDir = ".termlings";

  if (!existsSync(termlingsDir)) return agents;

  try {
    const entries = readdirSync(termlingsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const agentPath = join(termlingsDir, entry.name);
      const soulPath = join(agentPath, "SOUL.md");

      let soul: LocalAgent["soul"] | undefined;
      if (existsSync(soulPath)) {
        try {
          const content = readFileSync(soulPath, "utf-8");
          const nameMatch = content.match(/^# (.+)$/m);
          const purposeMatch = content.match(/\*\*Purpose:\*\* (.+)$/m);
          const dnaMatch = content.match(/\*\*DNA:\*\* (.+)$/m);
          const commandMatch = content.match(/\*\*Command:\*\* (.+)$/m);

          if (nameMatch && dnaMatch) {
            soul = {
              name: nameMatch[1],
              purpose: purposeMatch ? purposeMatch[1] : "",
              dna: dnaMatch[1],
              command: commandMatch ? commandMatch[1] : undefined,
            };
          }
        } catch {}
      }

      agents.push({
        name: entry.name,
        path: agentPath,
        soul,
      });
    }
  } catch {}

  return agents;
}

/**
 * Show picker for local agents only (not built-in CLIs)
 * Marks agents already active in the room as taken
 * Includes option to create random agent
 */
export async function selectLocalAgentWithRoom(localAgents: LocalAgent[], room: string = "default"): Promise<LocalAgent | null | "create-random"> {
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

  const options = localAgents.map((a, i) => ({
    index: i,
    agent: a,
    taken: a.soul?.dna ? activeAgentDnas.has(a.soul.dna) : false,
    type: "existing" as const
  }));

  // Add "Create random agent" option
  const createOption = {
    index: options.length,
    agent: null,
    taken: false,
    type: "create" as const
  };

  console.log("\nSelect agent:\n");
  for (const opt of options) {
    const soulName = opt.agent!.soul?.name || opt.agent!.name;
    const purpose = opt.agent!.soul?.purpose ? ` — ${opt.agent!.soul.purpose}` : "";
    const status = opt.taken ? " (already in room)" : "";
    console.log(`  (${opt.index + 1}) ${soulName}${purpose}${status}`);
  }
  console.log(`  (${createOption.index + 1}) [Create random agent]`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("\nChoose: ", (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      if (idx === createOption.index) {
        resolve("create-random");
      } else if (idx >= 0 && idx < options.length) {
        if (options[idx].taken) {
          console.log("\nWarning: This agent is already active in this room.");
        }
        resolve(options[idx].agent);
      } else {
        resolve(options[0]?.agent || null);
      }
    });
  });
}

/**
 * Show interactive selector for all available agents (built-in + local)
 * Marks agents already active in the room as taken
 */
export async function selectAgent(room: string = "default"): Promise<{ type: "builtin" | "local"; name: string; agent?: LocalAgent }> {
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

  console.log("\nSelect agent:\n");
  for (let i = 0; i < allOptions.length; i++) {
    const opt = allOptions[i];
    const status = opt.taken ? " (already in room)" : "";
    if (opt.type === "builtin") {
      const label = opt.name === "claude" ? "Claude Code" : "Codex CLI";
      console.log(`  (${i + 1}) ${opt.name.padEnd(10)} - ${label}${status}`);
    } else {
      const soulName = opt.agent?.soul?.name || opt.name;
      const purpose = opt.agent?.soul?.purpose ? ` — ${opt.agent.soul.purpose}` : "";
      console.log(`  (${i + 1}) ${soulName}${purpose}${status}`);
    }
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("\nChoose: ", (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < allOptions.length) {
        // Still allow choosing taken agents (user can run multiple instances if they want)
        // Just warn them
        if (allOptions[idx].taken) {
          console.log("\nWarning: This agent is already active in this room.");
        }
        resolve(allOptions[idx]);
      } else {
        resolve(allOptions[0]);
      }
    });
  });
}

/**
 * Show interactive selector for local agents (deprecated, use selectAgent)
 */
export async function selectLocalAgent(room: string = "default"): Promise<LocalAgent | null> {
  const agents = discoverLocalAgents();
  if (agents.length === 0) return null;
  if (agents.length === 1) return agents[0];

  const result = await selectAgent(room);
  return result.type === "local" ? result.agent || null : null;
}
