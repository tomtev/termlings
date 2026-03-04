import type { AgentAdapter } from "./types.js"
import claude from "./claude.js"
import codex from "./codex.js"
import pi from "./pi.js"

export type { AgentAdapter } from "./types.js"

/**
 * Registry of supported agent adapters, keyed by the subcommand name.
 * To add a new agent: create src/agents/<name>.ts, add it here.
 */
export const agents: Record<string, AgentAdapter> = {
  claude,
  codex,
  pi,
}
