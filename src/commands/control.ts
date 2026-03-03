import { focusTmuxWindow, isTmuxAvailable, projectTmuxSessionName, tmuxHasSession } from "../engine/tmux.js"

export async function handleControl(flags: Set<string>, _positional: string[]): Promise<void> {
  if (flags.has("help")) {
    console.log(`
Control - Return to Termlings control window

USAGE:
  termlings control

DESCRIPTION:
  Jumps to the control window inside the project tmux session.
  This is the fastest way back to the main Termlings workspace UI.
  Tip: in any agent window, press Ctrl-g.
`)
    return
  }

  if (!isTmuxAvailable()) {
    console.error("tmux is required for control mode. Install tmux and retry.")
    process.exit(1)
  }

  const sessionName = projectTmuxSessionName(process.cwd())
  if (!tmuxHasSession(sessionName)) {
    console.error("No Termlings tmux session found for this project.")
    console.error("Run: termlings")
    process.exit(1)
  }

  const focusedByName = focusTmuxWindow(sessionName, "control")
  if (focusedByName.ok) return

  const focusedByIndex = focusTmuxWindow(sessionName, "0")
  if (!focusedByIndex.ok) {
    console.error(focusedByIndex.error || "Failed to switch to control window.")
    process.exit(1)
  }
}
