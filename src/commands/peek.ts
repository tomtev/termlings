import { focusTmuxWindow, isTmuxAvailable, listTmuxWindows, projectTmuxSessionName, tmuxHasSession } from "../engine/tmux.js"

function normalizeTarget(raw?: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("agent:")) return trimmed
  return `agent:${trimmed}`
}

export async function handlePeek(flags: Set<string>, positional: string[]): Promise<void> {
  if (flags.has("help")) {
    console.log(`
Peek - Jump to an agent terminal window

USAGE:
  termlings peek
  termlings peek <agent-slug>

EXAMPLES:
  termlings peek pm
  termlings peek developer

DESCRIPTION:
  Switches to an agent window inside the project tmux session.
  Press Ctrl-g to jump back to control, or run \`termlings control\`.
`)
    return
  }

  if (!isTmuxAvailable()) {
    console.error("tmux is required for peek mode. Install tmux and retry.")
    process.exit(1)
  }

  const sessionName = projectTmuxSessionName(process.cwd())
  if (!tmuxHasSession(sessionName)) {
    console.error("No Termlings tmux session found for this project.")
    console.error("Run: termlings")
    process.exit(1)
  }

  const windows = listTmuxWindows(sessionName)
  const agentWindows = windows.filter((window) => window.name.startsWith("agent:"))
  if (agentWindows.length === 0) {
    console.error("No agent windows found in tmux session.")
    console.error("Launch agents from the workspace (press 's' in termlings).")
    process.exit(1)
  }

  const requested = normalizeTarget(positional[1])
  const target = requested
    ? agentWindows.find((window) => window.name.toLowerCase() === requested.toLowerCase())
    : agentWindows[0]

  if (!target) {
    const available = agentWindows.map((window) => window.name.replace(/^agent:/, "")).join(", ")
    console.error(`Agent window not found: ${positional[1]}`)
    console.error(`Available: ${available}`)
    process.exit(1)
  }

  const focused = focusTmuxWindow(sessionName, String(target.index))
  if (!focused.ok) {
    console.error(focused.error || `Failed to switch to ${target.name}.`)
    process.exit(1)
  }
}
