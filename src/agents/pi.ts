import type { AgentAdapter } from "./types.js"
import { writeFileSync, mkdirSync } from "fs"
import { resolve as resolvePath } from "path"

const pi: AgentAdapter = {
  bin: "pi",
  defaultName: "Pi",

  contextArgs(context) {
    // Pi auto-discovers .pi/APPEND_SYSTEM.md and appends it to the system prompt.
    // Write the termlings context to a file that pi will read.
    if (!context) return []

    try {
      // Create .pi directory if it doesn't exist
      const piDir = resolvePath(".pi")
      mkdirSync(piDir, { recursive: true })

      // Write to .pi/APPEND_SYSTEM.md - Pi will auto-discover and use this file
      const appendPath = resolvePath(".pi", "APPEND_SYSTEM.md")
      writeFileSync(appendPath, context, "utf8")

      // No args needed - pi will auto-discover the file
      return []
    } catch (e) {
      // If we can't write the file, still try to run pi
      console.error("Warning: Could not write termlings context:", e)
      return []
    }
  },
}

export default pi
