import { createHash } from "crypto"
import { basename, resolve } from "path"
import { spawnSync } from "child_process"

interface TmuxResult {
  ok: boolean
  error?: string
  stdout?: string
}

export interface TmuxWindow {
  index: number
  name: string
  active: boolean
}

function normalizeSegment(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "workspace"
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function runTmux(args: string[], inheritStdio = false): TmuxResult {
  const proc = spawnSync("tmux", args, {
    encoding: "utf8",
    stdio: inheritStdio ? "inherit" : ["ignore", "pipe", "pipe"],
  })

  if (proc.error) {
    return { ok: false, error: proc.error.message }
  }

  if ((proc.status ?? 0) !== 0) {
    const stderr = typeof proc.stderr === "string" ? proc.stderr.trim() : ""
    return { ok: false, error: stderr || `tmux exited with code ${proc.status ?? 1}` }
  }

  return { ok: true, stdout: typeof proc.stdout === "string" ? proc.stdout : "" }
}

function configureControlSession(sessionName: string): void {
  // Keep configuration best-effort; failure should not block launching.
  const apply = (...args: string[]) => {
    runTmux(args, false)
  }

  apply("set-option", "-t", sessionName, "status", "on")
  apply("set-option", "-t", sessionName, "status-position", "bottom")
  apply("set-option", "-t", sessionName, "status-interval", "2")
  apply("set-option", "-t", sessionName, "status-style", "bg=colour234,fg=colour246")
  apply("set-option", "-t", sessionName, "status-left", " #[fg=colour141,bold]termlings #[fg=colour245]#S ")
  apply("set-option", "-t", sessionName, "status-right", "#[fg=colour245]Ctrl-g control #[fg=colour244]%H:%M %d-%b")
  apply("set-option", "-t", sessionName, "window-status-format", " #[fg=colour245]#I:#W ")
  apply("set-option", "-t", sessionName, "window-status-current-format", "#[bg=colour61,fg=colour231,bold] #I:#W #[default]")
  apply("set-window-option", "-t", sessionName, "automatic-rename", "off")
  apply("unbind-key", "-T", "root", "-n", "C-g")
  apply("bind-key", "-T", "root", "-n", "C-g", "select-window", "-t", "control")
}

export function isInsideTmux(): boolean {
  return Boolean((process.env.TMUX || "").trim())
}

export function isTmuxAvailable(): boolean {
  const proc = spawnSync("tmux", ["-V"], { stdio: "ignore" })
  return (proc.status ?? 1) === 0
}

export function projectTmuxSessionName(root = process.cwd()): string {
  const abs = resolve(root)
  const shortName = normalizeSegment(basename(abs))
  const hash = createHash("sha1").update(abs).digest("hex").slice(0, 6)
  return `termlings-${shortName}-${hash}`
}

export function tmuxHasSession(sessionName: string): boolean {
  const proc = spawnSync("tmux", ["has-session", "-t", sessionName], { stdio: "ignore" })
  return (proc.status ?? 1) === 0
}

export function listTmuxWindows(sessionName: string): TmuxWindow[] {
  const result = runTmux(["list-windows", "-t", sessionName, "-F", "#{window_index}\t#{window_name}\t#{window_active}"])
  if (!result.ok || !result.stdout) return []

  const windows: TmuxWindow[] = []
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue
    const [indexRaw, name = "", activeRaw = "0"] = line.split("\t")
    const index = Number.parseInt(indexRaw || "", 10)
    if (!Number.isFinite(index)) continue
    windows.push({
      index,
      name,
      active: activeRaw === "1",
    })
  }
  return windows
}

export function ensureControlSession(root = process.cwd()): { ok: boolean; sessionName: string; error?: string } {
  const sessionName = projectTmuxSessionName(root)
  if (!isTmuxAvailable()) {
    return { ok: false, sessionName, error: "tmux is required. Install tmux first." }
  }

  if (!tmuxHasSession(sessionName)) {
    const bootstrapCmd = "termlings --inside-tmux"
    const created = runTmux(["new-session", "-d", "-s", sessionName, "-n", "control", "-c", root, bootstrapCmd])
    if (!created.ok) {
      return { ok: false, sessionName, error: created.error || "Failed to create tmux control session." }
    }
    configureControlSession(sessionName)
    return { ok: true, sessionName }
  }

  const windows = listTmuxWindows(sessionName)
  if (!windows.some((window) => window.name === "control")) {
    const created = runTmux(["new-window", "-d", "-t", sessionName, "-n", "control", "-c", root, "termlings --inside-tmux"])
    if (!created.ok) {
      return { ok: false, sessionName, error: created.error || "Failed to create control window." }
    }
  }

  configureControlSession(sessionName)

  return { ok: true, sessionName }
}

export function attachControlSession(root = process.cwd()): { ok: boolean; error?: string } {
  const ensured = ensureControlSession(root)
  if (!ensured.ok) return { ok: false, error: ensured.error }

  const args = ["new-session", "-A", "-s", ensured.sessionName, "-c", root, "termlings --inside-tmux"]
  const result = runTmux(args, true)
  if (!result.ok) {
    return { ok: false, error: result.error || "Failed to attach tmux control session." }
  }

  return { ok: true }
}

export function openAgentWindow(
  sessionName: string,
  root: string,
  runtime: string,
  preset: string,
  agentSlug: string,
  extraArgs: string[] = [],
): { ok: boolean; created: boolean; error?: string } {
  const windowName = `agent:${agentSlug}`
  const windows = listTmuxWindows(sessionName)
  if (windows.some((window) => window.name === windowName)) {
    return { ok: true, created: false }
  }

  const serializedArgs = extraArgs.map((arg) => shellQuote(arg)).join(" ")
  const hint = "printf '\\n[Termlings] Back to workspace: press Ctrl-g (or Ctrl-b then 0).\\n\\n'"
  const command =
    `${hint}; cd ${shellQuote(root)} && termlings spawn ${runtime} ${preset} --agent=${agentSlug} --inline`
    + (serializedArgs ? ` ${serializedArgs}` : "")
  const created = runTmux(["new-window", "-d", "-t", sessionName, "-n", windowName, "-c", root, command])
  if (!created.ok) {
    return { ok: false, created: false, error: created.error || `Failed to open window ${windowName}.` }
  }

  return { ok: true, created: true }
}

export function focusTmuxWindow(sessionName: string, target: string): { ok: boolean; error?: string } {
  const selector = `${sessionName}:${target}`
  const selected = runTmux(["select-window", "-t", selector], false)
  if (!selected.ok) {
    return { ok: false, error: selected.error || `Failed to select tmux window ${selector}.` }
  }

  if (!isInsideTmux()) {
    const attached = runTmux(["attach-session", "-t", sessionName], true)
    if (!attached.ok) {
      return { ok: false, error: attached.error || "Failed to attach tmux session." }
    }
  }

  return { ok: true }
}
