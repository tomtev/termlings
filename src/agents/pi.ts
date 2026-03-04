import type { AgentAdapter } from "./types.js"

const pi: AgentAdapter = {
  bin: "pi",
  defaultName: "Pi",

  contextArgs(context) {
    if (!context) return []
    return ["--append-system-prompt", context]
  },
}

export default pi
