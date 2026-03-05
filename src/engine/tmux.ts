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

function sortWindowsByIndexAscending(windows: TmuxWindow[]): TmuxWindow[] {
  return [...windows].sort((a, b) => a.index - b.index)
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

function buildAgentTmuxTabLabel(root: string, agentSlug: string): string {
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
  const badge = buildAgentTmuxTabLabel(root, slug)
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

  // Hide tmux status/footer entirely for auto-spawn control sessions.
  apply("set-option", "-t", sessionName, "status", "off")
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

  const refreshedWindows = sortWindowsByIndexAscending(listTmuxWindows(sessionName))
  const firstWindow = refreshedWindows[0]
  const controlWindow = refreshedWindows.find((window) => window.name === "control")
  if (firstWindow && controlWindow && firstWindow.index !== controlWindow.index) {
    runTmux(
      [
        "swap-window",
        "-s",
        `${sessionName}:${controlWindow.index}`,
        "-t",
        `${sessionName}:${firstWindow.index}`,
      ],
      false,
    )
  }

  configureControlSession(sessionName, root)

  return { ok: true, sessionName }
}

export function attachControlSession(root = process.cwd()): { ok: boolean; error?: string } {
  const ensured = ensureControlSession(root)
  if (!ensured.ok) return { ok: false, error: ensured.error }

  const focusedByName = focusTmuxWindow(ensured.sessionName, "control")
  if (focusedByName.ok) {
    return { ok: true }
  }

  const focusedByIndex = focusTmuxWindow(ensured.sessionName, "0")
  if (focusedByIndex.ok) {
    return { ok: true }
  }

  return {
    ok: false,
    error:
      focusedByName.error
      || focusedByIndex.error
      || "Failed to attach tmux control session.",
  }
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
  const serializedArgs = extraArgs.map((arg) => shellQuote(arg)).join(" ")
  const command =
    `cd ${shellQuote(root)} && termlings spawn ${runtime} ${preset} --agent=${agentSlug} --inline`
    + (serializedArgs ? ` ${serializedArgs}` : "")

  if (!tmuxHasSession(sessionName)) {
    const createdSession = runTmux(["new-session", "-d", "-s", sessionName, "-n", windowName, "-c", root, command])
    if (!createdSession.ok) {
      return { ok: false, created: false, error: createdSession.error || `Failed to create session ${sessionName}.` }
    }

    const refreshed = listTmuxWindows(sessionName).find((window) => window.name === windowName)
    if (refreshed) {
      refreshAgentWindowBadge(sessionName, root, refreshed.index, refreshed.name)
    }
    return { ok: true, created: true }
  }

  const windows = listTmuxWindows(sessionName)
  const existing = windows.find((window) => window.name === windowName)
  if (existing) {
    refreshAgentWindowBadge(sessionName, root, existing.index, existing.name)
    return { ok: true, created: false }
  }

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

export function openSchedulerWindow(
  sessionName: string,
  root: string,
): { ok: boolean; created: boolean; error?: string } {
  const windowName = "scheduler"
  const command = `cd ${shellQuote(root)} && termlings scheduler --daemon`

  if (!tmuxHasSession(sessionName)) {
    const createdSession = runTmux(["new-session", "-d", "-s", sessionName, "-n", windowName, "-c", root, command])
    if (!createdSession.ok) {
      return { ok: false, created: false, error: createdSession.error || `Failed to create session ${sessionName}.` }
    }
    return { ok: true, created: true }
  }

  const windows = listTmuxWindows(sessionName)
  const existing = windows.find((window) => window.name === windowName)
  if (existing) {
    return { ok: true, created: false }
  }

  const created = runTmux(["new-window", "-d", "-t", sessionName, "-n", windowName, "-c", root, command])
  if (!created.ok) {
    return { ok: false, created: false, error: created.error || `Failed to open window ${windowName}.` }
  }

  return { ok: true, created: true }
}

export function killTmuxWindow(sessionName: string, target: string): { ok: boolean; error?: string } {
  const result = runTmux(["kill-window", "-t", `${sessionName}:${target}`], false)
  if (!result.ok) {
    return { ok: false, error: result.error || `Failed to kill tmux window ${sessionName}:${target}.` }
  }
  return { ok: true }
}

export function configureAgentSession(sessionName: string, root: string): void {
  const apply = (...args: string[]) => {
    runTmux(args, false)
  }
  const windowStatusFormat =
    "#[fg=colour250,bg=colour54] [#I] #{?@termlings_agent_badge,#{E:@termlings_agent_badge},#W} #[default]"
  const windowStatusCurrentFormat =
    "#[fg=colour255,bg=colour93,bold] [#I] #{?@termlings_agent_badge,#{E:@termlings_agent_badge},#W} #[default]"

  // Clean up control-session specific format overrides/bindings first.
  apply("set-option", "-u", "-t", sessionName, "status-format[0]")
  apply("set-option", "-u", "-t", sessionName, "status-format[1]")
  apply("unbind-key", "-T", "root", "-n", "Escape")
  apply("unbind-key", "-T", "root", "-n", "C-g")

  // Apply simplified agent window bar.
  apply("set-option", "-t", sessionName, "status", "on")
  apply("set-option", "-t", sessionName, "status-position", "bottom")
  apply("set-option", "-t", sessionName, "status-style", "bg=colour54,fg=colour255")
  apply("set-option", "-t", sessionName, "status-left", "")
  apply("set-option", "-t", sessionName, "status-right", "")
  apply("set-option", "-t", sessionName, "status-left-length", "0")
  apply("set-option", "-t", sessionName, "status-right-length", "0")
  apply("set-option", "-t", sessionName, "status-justify", "left")
  apply("set-window-option", "-g", "-t", sessionName, "automatic-rename", "off")
  apply("set-window-option", "-g", "-t", sessionName, "window-status-separator", " ")
  apply("set-window-option", "-g", "-t", sessionName, "window-status-format", windowStatusFormat)
  apply("set-window-option", "-g", "-t", sessionName, "window-status-current-format", windowStatusCurrentFormat)

  for (const window of listTmuxWindows(sessionName)) {
    const target = `${sessionName}:${window.index}`
    apply("set-window-option", "-t", target, "automatic-rename", "off")
    apply("set-window-option", "-t", target, "window-status-separator", " ")
    apply("set-window-option", "-t", target, "window-status-format", windowStatusFormat)
    apply("set-window-option", "-t", target, "window-status-current-format", windowStatusCurrentFormat)
    refreshAgentWindowBadge(sessionName, root, window.index, window.name)
  }
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
