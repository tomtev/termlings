import type { AgentAdapter } from "./types.js"
import { writeFileSync, mkdirSync } from "fs"
import { resolve as resolvePath } from "path"

const pi: AgentAdapter = {
  bin: "pi",
  defaultName: "Pi",

  contextArgs(context) {
    // Pi accepts @file syntax to inject content from files.
    // Write the termlings context to a file and pass it as an argument.
    if (!context) return []

    try {
      // Create .pi directory if it doesn't exist
      const piDir = resolvePath(".pi")
      mkdirSync(piDir, { recursive: true })

      // Write to .pi/APPEND_SYSTEM.md
      const appendPath = resolvePath(".pi", "APPEND_SYSTEM.md")
      writeFileSync(appendPath, context, "utf8")

      // Pass as explicit @file argument so Pi definitely reads it
      return [`@${appendPath}`]
    } catch (e) {
      // If we can't write the file, still try to run pi
      console.error("Warning: Could not write termlings context:", e)
      return []
    }
  },
}

export default pi
