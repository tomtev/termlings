import type { AgentAdapter } from "./types.js"

const pi: AgentAdapter = {
  bin: "pi",
  defaultName: "Pi",

  contextArgs(context) {
    // Pi auto-discovers AGENTS.md/CLAUDE.md from the project directory
    // and reads TERMLINGS_* env vars set by the launcher.
    // No additional args needed.
    return []
  },
}

export default pi
