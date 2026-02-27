import type { AgentAdapter } from "./types.js"
import { writeFileSync } from "fs"
import { resolve as resolvePath } from "path"

const pi: AgentAdapter = {
  bin: "pi",
  defaultName: "Pi",

  contextArgs(context) {
    // Pi auto-discovers APPEND_SYSTEM.md and appends it to the system prompt.
    // Write the termlings context to a file that pi will read.
    if (!context) return []

    try {
      // Write to APPEND_SYSTEM.md in the current working directory
      // Pi will auto-discover and use this file
      const appendPath = resolvePath("APPEND_SYSTEM.md")
      writeFileSync(appendPath, context, "utf8")
      // No args needed - pi will auto-discover the file
      return []
    } catch (e) {
      // If we can't write the file, still try to run pi
      // (context via env vars might still work)
      return []
    }
  },
}

export default pi
