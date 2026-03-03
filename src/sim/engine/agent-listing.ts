import type { LocalAgent } from "../../agents/discover.js";

export interface AgentStateEntity {
  sessionId: string
  name?: string
  dna: string
  x: number
  y: number
  idle?: boolean
}

export interface MergedAgent {
  dna: string;
  saved?: LocalAgent;
  online?: AgentStateEntity;
  status: "saved" | "online" | "both";
}

/**
 * Merge saved agents with online agents, matching by DNA
 */
export function mergeSavedWithOnline(
  saved: LocalAgent[],
  online: AgentStateEntity[]
): MergedAgent[] {
  const byDna = new Map<string, MergedAgent>();

  // Add saved agents
  for (const agent of saved) {
    const dna = agent.soul?.dna;
    if (!dna) continue;
    byDna.set(dna, {
      dna,
      saved: agent,
      status: "saved",
    });
  }

  // Add/merge online agents
  for (const entity of online) {
    const existing = byDna.get(entity.dna);
    if (existing) {
      existing.online = entity;
      existing.status = "both";
    } else {
      byDna.set(entity.dna, {
        dna: entity.dna,
        online: entity,
        status: "online",
      });
    }
  }

  return Array.from(byDna.values());
}

/**
 * Format agent list as compact table
 */
export function formatAgentListCompact(
  agents: MergedAgent[],
  options: { filterSaved?: boolean; filterOnline?: boolean } = {}
): string {
  const filtered = agents.filter((a) => {
    if (options.filterSaved && a.status !== "saved" && a.status !== "both")
      return false;
    if (options.filterOnline && a.status !== "online" && a.status !== "both")
      return false;
    return true;
  });

  if (filtered.length === 0) {
    return "No agents found.";
  }

  const lines: string[] = [];
  lines.push("Agents:\n");

  for (const agent of filtered) {
    const icon = agent.status === "both" ? "✓" : "○";
    const name =
      agent.saved?.soul?.name ||
      agent.online?.name ||
      agent.saved?.name ||
      "?";
    const dnaStr = `[${agent.dna.slice(0, 7)}]`;

    if (agent.online) {
      const pos = `(${agent.online.x}, ${agent.online.y})`;
      const idle = agent.online.idle ? "idle" : "active";
      const line = `${icon} ${name.padEnd(14)} ${dnaStr.padEnd(10)} ${agent.status.padEnd(6)} ${agent.online.sessionId} at ${pos.padEnd(12)} ${idle}`;
      lines.push(line);
    } else if (agent.saved) {
      const purpose = agent.saved.soul?.purpose
        ? ` — ${agent.saved.soul.purpose}`
        : "";
      const line = `${icon} ${name.padEnd(14)} ${dnaStr.padEnd(10)} ${agent.status.padEnd(6)} (offline)${purpose}`;
      lines.push(line);
    }
  }

  // Summary
  const onlineCount = filtered.filter((a) => a.online).length;
  const savedCount = filtered.filter((a) => a.saved && !a.online).length;
  const bothCount = filtered.filter((a) => a.saved && a.online).length;
  const totalOnline = filtered.filter((a) => a.online).length;
  const totalSaved = filtered.filter((a) => a.saved).length;

  lines.push("");
  lines.push(
    `Total: ${filtered.length} agents (${totalOnline} online, ${totalSaved} saved, ${bothCount} both)`
  );

  return lines.join("\n");
}

/**
 * Format agent list as detailed output
 */
export function formatAgentListFull(
  agents: MergedAgent[],
  options: { filterSaved?: boolean; filterOnline?: boolean } = {}
): string {
  const filtered = agents.filter((a) => {
    if (options.filterSaved && a.status !== "saved" && a.status !== "both")
      return false;
    if (options.filterOnline && a.status !== "online" && a.status !== "both")
      return false;
    return true;
  });

  if (filtered.length === 0) {
    return "No agents found.";
  }

  const lines: string[] = [];
  lines.push("Agents:\n");

  for (let i = 0; i < filtered.length; i++) {
    const agent = filtered[i]!;
    const name =
      agent.saved?.soul?.name ||
      agent.online?.name ||
      agent.saved?.name ||
      "?";

    lines.push(`${i + 1}. ${name} [${agent.dna}]`);

    if (agent.status === "saved" || agent.status === "both") {
      lines.push(`   Status: ${agent.status === "both" ? "online + saved" : "saved"}`);
      if (agent.saved?.soul?.purpose) {
        lines.push(`   Purpose: ${agent.saved.soul.purpose}`);
      }
      if (agent.saved?.soul?.command) {
        lines.push(`   Command: ${agent.saved.soul.command}`);
      }
    } else {
      lines.push(`   Status: online`);
    }

    if (agent.online) {
      lines.push(`   Session: ${agent.online.sessionId}`);
      lines.push(`   Position: (${agent.online.x}, ${agent.online.y})`);
      lines.push(`   State: ${agent.online.idle ? "idle" : "active"}`);
    }

    if (i < filtered.length - 1) {
      lines.push("");
    }
  }

  // Summary
  const onlineCount = filtered.filter((a) => a.online).length;
  const totalSaved = filtered.filter((a) => a.saved).length;
  const bothCount = filtered.filter((a) => a.saved && a.online).length;

  lines.push("");
  lines.push(
    `Total: ${filtered.length} agents (${onlineCount} online, ${totalSaved} saved, ${bothCount} both)`
  );

  return lines.join("\n");
}
