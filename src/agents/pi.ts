import type { AgentAdapter } from "./types.js"
import { resolve as resolvePath } from "path"

const pi: AgentAdapter = {
  bin: "pi",
  defaultName: "Pi",

  contextArgs(context) {
    // Pi accepts @file syntax to inject content from files.
    // Pass the termling context directly to pi.
    if (!context) return []

    // For pi, we pass the context inline using the @ file syntax
    // The context is passed as a temporary file argument
    try {
      const contextPath = resolvePath("src/termling-context.md")
      return [`@${contextPath}`]
    } catch {
      return []
    }
  },
}

export default pi
