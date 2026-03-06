import type { AgentAdapter } from "./types.js"

const codex: AgentAdapter = {
  bin: "codex",
  defaultName: "Codex",

  contextArgs(context) {
    if (!context) return []
    // Codex expects the initial prompt as a trailing positional argument.
    // `-i` / `--image` is reserved for local image attachments.
    return [context]
  },
}

export default codex
