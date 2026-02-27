import type { AgentAdapter } from "./types.js"

const claude: AgentAdapter = {
  bin: "claude",
  defaultName: "Claude",

  contextArgs(context) {
    if (!context) return []
    return ["--append-system-prompt", context]
  },
}

export default claude
