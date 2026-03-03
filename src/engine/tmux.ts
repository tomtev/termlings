import { createHash } from "crypto"
import { basename, join, resolve } from "path"
import { spawnSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { decodeDNA, getTraitColors } from "../index.js"

interface TmuxResult {
  ok: boolean
  error?: string
  stdout?: string
}

interface AgentBadgeMeta {
  name: string
  title: string
  dna?: string
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

function formatTitleCase(value: string): string {
  const text = value.trim()
  if (!text) return ""
  return text
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function stripQuoted(value?: string): string {
  if (!value) return ""
  return value.trim().replace(/^['"]|['"]$/g, "")
}

function escapeTmuxText(value: string): string {
  return value.replace(/#/g, "##").replace(/\r?\n/g, " ").trim()
}

function rgbToHex(rgb: [number, number, number]): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`
}

function readAgentBadgeMeta(root: string, agentSlug: string): AgentBadgeMeta {
  const fallbackName = formatTitleCase(agentSlug) || agentSlug
  const soulPath = join(root, ".termlings", "agents", agentSlug, "SOUL.md")
  if (!existsSync(soulPath)) {
    return { name: fallbackName, title: "", dna: undefined }
  }

  try {
    const content = readFileSync(soulPath, "utf8")
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/m)
    const yaml = frontmatterMatch?.[1] ?? ""
    const readField = (key: string): string => stripQuoted(yaml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1])
    const name = readField("name") || fallbackName
    const titleShort = readField("title_short")
    const title = titleShort || readField("title")
    const dna = readField("dna") || undefined
    return { name, title, dna }
  } catch {
    return { name: fallbackName, title: "", dna: undefined }
  }
}

function colorSquareHexFromDna(dna?: string): string {
  if (!dna) return "#8a8a8a"
  try {
    const traits = decodeDNA(dna)
    const { faceRgb } = getTraitColors(traits, false)
    return rgbToHex(faceRgb)
  } catch {
    return "#8a8a8a"
  }
}

function buildAgentTmuxBadge(root: string, agentSlug: string): string {
  const { name, title, dna } = readAgentBadgeMeta(root, agentSlug)
  const colorHex = colorSquareHexFromDna(dna)
  const safeName = escapeTmuxText(name || formatTitleCase(agentSlug) || agentSlug)
  const safeTitle = escapeTmuxText(title)
  const titlePart = safeTitle ? ` #[fg=colour245]${safeTitle}#[default]` : ""
  return `#[fg=${colorHex}]■#[default] ${safeName}${titlePart}`
}

function setWindowOption(sessionName: string, windowIndex: number, key: string, value: string): void {
  runTmux(["set-window-option", "-t", `${sessionName}:${windowIndex}`, key, value], false)
}

function refreshAgentWindowBadge(sessionName: string, root: string, windowIndex: number, windowName: string): void {
  if (!windowName.startsWith("agent:")) return
  const slug = windowName.slice("agent:".length).trim()
  if (!slug) return
  const badge = buildAgentTmuxBadge(root, slug)
  setWindowOption(sessionName, windowIndex, "@termlings_agent_badge", badge)
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

function configureControlSession(sessionName: string, root: string): void {
  // Keep configuration best-effort; failure should not block launching.
  const apply = (...args: string[]) => {
    runTmux(args, false)
  }

  apply("set-option", "-t", sessionName, "status", "on")
  apply("set-option", "-t", sessionName, "status-position", "bottom")
  apply("set-option", "-t", sessionName, "status-interval", "0")
  apply("set-option", "-t", sessionName, "status-style", "bg=default,fg=default")
  apply("set-option", "-t", sessionName, "@termlings_control_left", " #[fg=colour141,bold]termlings#[fg=colour245] · Chat#[default] ")
  apply("set-option", "-t", sessionName, "@termlings_control_right", "#[fg=colour245]Ctrl-p peek (DM only)#[default] ")
  apply("set-option", "-t", sessionName, "status-left", "")
  apply("set-option", "-t", sessionName, "status-right", "")
  apply("set-option", "-t", sessionName, "status-left-length", "80")
  apply("set-option", "-t", sessionName, "status-right-length", "80")
  // Use a custom status format so tmux does not render the window list in the middle.
  apply(
    "set-option",
    "-t",
    sessionName,
    "status-format[0]",
    "#[align=left]#{?#{==:#{window_name},control},#{@termlings_control_left}, #[fg=colour248]ESC Back to#[default] · #{@termlings_agent_badge} }#[align=right]#{?#{==:#{window_name},control},#{@termlings_control_right}, }",
  )
  apply("set-window-option", "-t", sessionName, "window-status-format", "")
  apply("set-window-option", "-t", sessionName, "window-status-current-format", "")
  apply("set-window-option", "-t", sessionName, "window-status-separator", "")
  apply("set-window-option", "-t", sessionName, "automatic-rename", "off")
  const escBackScript =
    "current=$(tmux display-message -p '#{window_name}'); " +
    "case \"$current\" in " +
    "agent:*) tmux select-window -t control ;; " +
    "*) tmux send-keys Escape ;; " +
    "esac"
  apply("unbind-key", "-T", "root", "-n", "Escape")
  apply("bind-key", "-T", "root", "-n", "Escape", "run-shell", escBackScript)
  apply("unbind-key", "-T", "root", "-n", "C-g")
  apply("bind-key", "-T", "root", "-n", "C-g", "select-window", "-t", "control")

  // Rehydrate per-window agent badges for existing windows in this session.
  for (const window of listTmuxWindows(sessionName)) {
    refreshAgentWindowBadge(sessionName, root, window.index, window.name)
  }
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
    const bootstrapCmd = `TERMLINGS_CONTROL_PANEL=1 TERMLINGS_TMUX_SESSION=${sessionName} termlings --inside-tmux`
    const created = runTmux(["new-session", "-d", "-s", sessionName, "-n", "control", "-c", root, bootstrapCmd])
    if (!created.ok) {
      return { ok: false, sessionName, error: created.error || "Failed to create tmux control session." }
    }
    configureControlSession(sessionName, root)
    return { ok: true, sessionName }
  }

  const windows = listTmuxWindows(sessionName)
  if (!windows.some((window) => window.name === "control")) {
    const created = runTmux([
      "new-window",
      "-d",
      "-t",
      sessionName,
      "-n",
      "control",
      "-c",
      root,
      `TERMLINGS_CONTROL_PANEL=1 TERMLINGS_TMUX_SESSION=${sessionName} termlings --inside-tmux`,
    ])
    if (!created.ok) {
      return { ok: false, sessionName, error: created.error || "Failed to create control window." }
    }
  }

  configureControlSession(sessionName, root)

  return { ok: true, sessionName }
}

export function attachControlSession(root = process.cwd()): { ok: boolean; error?: string } {
  const ensured = ensureControlSession(root)
  if (!ensured.ok) return { ok: false, error: ensured.error }

  const args = [
    "new-session",
    "-A",
    "-s",
    ensured.sessionName,
    "-c",
    root,
    `TERMLINGS_CONTROL_PANEL=1 TERMLINGS_TMUX_SESSION=${ensured.sessionName} termlings --inside-tmux`,
  ]
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
  const existing = windows.find((window) => window.name === windowName)
  if (existing) {
    refreshAgentWindowBadge(sessionName, root, existing.index, existing.name)
    return { ok: true, created: false }
  }

  const serializedArgs = extraArgs.map((arg) => shellQuote(arg)).join(" ")
  const hint = "printf '\\n[Termlings] Back: Esc (or Ctrl-g).\\n\\n'"
  const command =
    `${hint}; cd ${shellQuote(root)} && termlings spawn ${runtime} ${preset} --agent=${agentSlug} --inline`
    + (serializedArgs ? ` ${serializedArgs}` : "")
  const created = runTmux(["new-window", "-d", "-t", sessionName, "-n", windowName, "-c", root, command])
  if (!created.ok) {
    return { ok: false, created: false, error: created.error || `Failed to open window ${windowName}.` }
  }

  const refreshed = listTmuxWindows(sessionName).find((window) => window.name === windowName)
  if (refreshed) {
    refreshAgentWindowBadge(sessionName, root, refreshed.index, refreshed.name)
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
