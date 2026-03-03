import type { AgentAdapter } from "./types.js"

const codex: AgentAdapter = {
  bin: "codex",
  defaultName: "Codex",

  contextArgs(context) {
    if (!context) return []
    return ["-i", context]
  },
}

export default codex
