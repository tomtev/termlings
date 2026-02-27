import { join } from "path";
import { readdirSync, existsSync, readFileSync } from "fs";
import { createInterface } from "readline";

export interface LocalAgent {
  name: string;
  path: string;
  soul?: { name: string; purpose: string; dna: string; adapter?: string };
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
          const adapterMatch = content.match(/\*\*Adapter:\*\* (.+)$/m);

          if (nameMatch && dnaMatch) {
            soul = {
              name: nameMatch[1],
              purpose: purposeMatch ? purposeMatch[1] : "",
              dna: dnaMatch[1],
              adapter: adapterMatch ? adapterMatch[1] : undefined,
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
 * Show interactive selector for local agents
 */
export async function selectLocalAgent(): Promise<LocalAgent | null> {
  const agents = discoverLocalAgents();
  if (agents.length === 0) return null;
  if (agents.length === 1) return agents[0];

  console.log("\nSelect agent:\n");
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const soulName = agent.soul?.name || agent.name;
    const purpose = agent.soul?.purpose ? ` — ${agent.soul.purpose}` : "";
    console.log(`  (${i + 1}) ${soulName}${purpose}`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("\nChoose: ", (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < agents.length) {
        resolve(agents[idx]);
      } else {
        resolve(null);
      }
    });
  });
}
