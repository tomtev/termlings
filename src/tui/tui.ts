import { discoverLocalAgents } from "../agents/discover.js"
import { existsSync, readFileSync } from "fs"
import { getAllCalendarEvents, type CalendarEvent, type CalendarRecurrence } from "../engine/calendar.js"
import { writeMessages } from "../engine/ipc.js"
import { getAllTasks, type Task, type TaskPriority, type TaskStatus } from "../engine/tasks.js"
import { listRequests, resolveRequest, dismissRequest, type AgentRequest } from "../engine/requests.js"
import { decodeDNA, getTraitColors, renderTerminal, renderTerminalSmall, renderTermlingsLogo } from "../index.js"
import { basename, join } from "path"
import { execSync, spawnSync } from "child_process"
import {
  appendWorkspaceMessage,
  ensureWorkspaceDirs,
  listSessions,
  readWorkspaceSettings,
  readSession,
  readWorkspaceMessages,
  removeSession,
  updateWorkspaceSettings,
  upsertSession,
  type WorkspaceMessage,
  type WorkspaceSession,
} from "../workspace/state.js"
import type {
  AgentPresence,
  AvatarBlock,
  DmThread,
  Identity,
  InboxSummary,
  MainView,
  MentionCandidate,
  MessageCardOptions,
  Snapshot,
} from "./types.js"
import {
  ANSI_RESET,
  AVATAR_ANIM_MS,
  BG_INPUT_PANEL,
  BG_OFFLINE_PANEL,
  CARD_SPACER_LINES,
  FG_ACTIVE,
  FG_CURSOR_BLOCK,
  FG_FRAME,
  FG_FRAME_LABEL,
  FG_INPUT,
  FG_MD_CODE,
  FG_MD_HEADING,
  FG_MD_QUOTE,
  FG_META,
  FG_OFFLINE_TEXT,
  FG_PLACEHOLDER,
  FG_PROMPT,
  FG_SELECTED,
  FG_SUBTLE_HINT,
  FRAME_BL,
  FRAME_BR,
  FRAME_H,
  FRAME_TL,
  FRAME_TR,
  FRAME_V,
  HEARTBEAT_MS,
  JOIN_WAVE_MS,
  MESSAGE_SCROLL_STEP,
  REFRESH_MS,
  TALK_ANIM_MS,
  boxAnsiLine,
  boxBottom,
  boxTop,
  chunkPlain,
  composerInputBar,
  fitPlain,
  formatDateTime,
  grayBar,
  isHumanAddress,
  offlineBar,
  padAnsi,
  panelBodyLine,
  statusIcon,
  truncatePlain,
  visibleLength,
  wrapPlain,
} from "./ui.js"

const TYPING_STALE_MS = 12_000
const TYPING_MESSAGE_SUPPRESS_MS = 2_000
const MENTION_WAVE_MS = AVATAR_ANIM_MS * 2
const UI_ANIMATION_TICK_MS = 250
const BRACKETED_PASTE_START = "\u001b[200~"
const BRACKETED_PASTE_END = "\u001b[201~"
const PASTE_COMPACT_MIN_CHARS = 700
const PASTE_COMPACT_MIN_LINES = 8
const PASTE_COMPACT_MULTILINE_MIN_CHARS = 300
const PASTE_COMPACT_MULTILINE_MIN_LINES = 4
const DRAFT_BLOCK_TOKEN_PATTERN = /(?:\[Image #\d+\]|\[Pasted Content(?: #\d+)? \d+ chars\])$/
const DRAFT_BLOCK_TOKEN_GLOBAL = /\[Image #\d+\]|\[Pasted Content(?: #\d+)? \d+ chars\]/g

interface SessionTypingState {
  typing: boolean
  updatedAt: number
  source?: "terminal"
}

interface WorkspaceTuiOptions {
  startupBanner?: string
}

class WorkspaceTui {
  private readonly root: string

  private readonly stdin = process.stdin

  private readonly stdout = process.stdout

  private readonly identity: Identity

  private view: MainView = "messages"

  private selectedThreadId = "activity"

  private draft = ""
  private draftCursorIndex = 0

  private statusMessage = "Ready"
  private startupBanner = ""
  private startupBannerUntil = 0

  private snapshot: Snapshot = {
    sessions: [],
    messages: [],
    tasks: [],
    calendarEvents: [],
    agents: [],
    dmThreads: [],
    requests: [],
    generatedAt: Date.now(),
  }

  private running = false

  private refreshing = false

  private sending = false

  private refreshTimer: ReturnType<typeof setInterval> | null = null

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  private animationTimer: ReturnType<typeof setInterval> | null = null

  private previousSessionIds = new Set<string>()

  private waveUntilByDna = new Map<string, number>()
  private draftMentionedAgentDnas = new Set<string>()
  private imagePlaceholderCounter = 0
  private imagePlaceholderByUrl = new Map<string, string>()
  private imageSourceByPlaceholder = new Map<string, string>()
  private pastedContentPlaceholderCounter = 0
  private pastedContentByPlaceholder = new Map<string, string>()
  private bracketedPasteBuffer = ""
  private bracketedPasteActive = false

  private talkUntilByDna = new Map<string, number>()

  private previousMessageIds = new Set<string>()

  private lastReadByThread = new Map<string, number>()

  private requestSelectionIndex = 0
  private requestInputMode = false
  private requestInputDraft = ""

  private messageScrollOffset = 0
  private messageScrollMax = 0
  private taskScrollOffset = 0
  private taskScrollMax = 0
  private taskFilterIndex = 0
  private calendarScrollOffset = 0
  private calendarScrollMax = 0
  private calendarFilterIndex = 0

  private inputFocused = true

  private cursorBlinkVisible = true

  private mentionSelectionIndex = 0

  private settingsSelectionIndex = 0

  private avatarSizeMode: "large" | "small" | "tiny" = "small"
  private avatarVisibleAgentCount = 0
  private avatarTotalAgentCount = 0
  private renderScheduled = false
  private lastRenderTime = 0
  private lastTmuxStatusLeft = ""
  private lastTmuxStatusRight = ""

  private calendarSchedulerRunning = false
  private calendarSchedulerCheckedAt = 0

  private readonly onDataBound: (chunk: Buffer | string) => void

  private readonly onResizeBound: () => void

  private readonly onSigIntBound: () => void

  private readonly onSigTermBound: () => void

  constructor(root = process.cwd(), options: WorkspaceTuiOptions = {}) {
    this.root = root
    if (options.startupBanner) {
      this.startupBanner = options.startupBanner
      this.startupBannerUntil = Date.now() + 30_000
    }

    const envSessionId = process.env.TERMLINGS_SESSION_ID

    // Load human identity from SOUL.md if available
    let humanName = "Operator"
    try {
      const { getDefaultHuman } = require("../humans/discover.js")
      const human = getDefaultHuman()
      if (human?.soul?.name) humanName = human.soul.name
    } catch {}

    const identity: Identity = {
      sessionId: envSessionId || `tl-tui-${Math.random().toString(16).slice(2, 10)}`,
      name: process.env.TERMLINGS_AGENT_NAME || humanName,
      dna: process.env.TERMLINGS_AGENT_DNA || "0000000",
      ephemeral: !envSessionId,
    }

    this.identity = identity

    this.onDataBound = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8")
      void this.handleInput(text)
    }

    this.onResizeBound = () => {
      this.render()
    }

    this.onSigIntBound = () => {
      this.stop(0)
    }

    this.onSigTermBound = () => {
      this.stop(0)
    }
  }

  private showStartupBanner(): boolean {
    if (!this.startupBanner) return false
    return Date.now() < this.startupBannerUntil
  }

  async run(): Promise<never> {
    if (!this.stdout.isTTY || !this.stdin.isTTY) {
      console.error("TUI requires an interactive terminal (TTY).")
      process.exit(1)
    }

    ensureWorkspaceDirs(this.root)
    this.loadWorkspaceSettings()
    upsertSession(
      this.identity.sessionId,
      {
        name: this.identity.name,
        dna: this.identity.dna,
      },
      this.root,
    )

    this.running = true
    this.enterScreen()

    await this.reloadSnapshot()
    this.render()

    this.stdin.on("data", this.onDataBound)
    this.stdout.on("resize", this.onResizeBound)
    process.on("SIGINT", this.onSigIntBound)
    process.on("SIGTERM", this.onSigTermBound)

    this.refreshTimer = setInterval(() => {
      void this.reloadSnapshot().then(() => this.render())
    }, REFRESH_MS)

    this.heartbeatTimer = setInterval(() => {
      upsertSession(
        this.identity.sessionId,
        {
          name: this.identity.name,
          dna: this.identity.dna,
        },
        this.root,
      )
    }, HEARTBEAT_MS)

    this.animationTimer = setInterval(() => {
      if (this.shouldShowComposerCursor()) {
        this.cursorBlinkVisible = !this.cursorBlinkVisible
      } else {
        this.cursorBlinkVisible = true
      }
      this.render()
    }, UI_ANIMATION_TICK_MS)

    await new Promise(() => {})
  }

  private enterScreen(): void {
    this.stdout.write("\x1b[?1049h") // alternate screen
    // Clear screen + scrollback so the TUI owns the full viewport cleanly.
    this.stdout.write("\x1b[2J\x1b[3J\x1b[H")
    this.stdout.write("\x1b[?2004h") // enable bracketed paste mode
    // Keep native terminal selection/copy behavior by not enabling mouse tracking.
    this.stdout.write("\x1b[?25l") // hide cursor
    this.stdin.setRawMode(true)
    this.stdin.resume()
    this.stdin.setEncoding("utf8")
  }

  private leaveScreen(): void {
    try {
      this.stdout.write("\x1b[?1006l") // disable SGR mouse mode
      this.stdout.write("\x1b[?1000l") // disable mouse tracking
      this.stdout.write("\x1b[?2004l") // disable bracketed paste mode
      this.stdout.write("\x1b[?25h") // show cursor
      this.stdout.write("\x1b[?1049l") // leave alternate screen
      this.stdin.setRawMode(false)
      this.stdin.pause()
    } catch {}
  }

  private isControlPanelSession(): boolean {
    const raw = (process.env.TERMLINGS_CONTROL_PANEL || "").trim().toLowerCase()
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
  }

  private isInsideTmuxSession(): boolean {
    return Boolean((process.env.TMUX || "").trim())
  }

  private tmuxSessionName(): string {
    return (process.env.TERMLINGS_TMUX_SESSION || "").trim()
  }

  private currentViewLabel(): string {
    if (this.view === "messages") return "Chat"
    if (this.view === "requests") return "Requests"
    if (this.view === "tasks") return "Tasks"
    if (this.view === "calendar") return "Calendar"
    if (this.view === "settings") return "Settings"
    return "Workspace"
  }

  private renderTmuxStatusLeft(): string {
    const project = basename(this.root || process.cwd()) || "workspace"
    const parts = [project, this.currentViewLabel()]
    if (this.view === "messages") {
      parts.push(this.threadLabel(this.selectedThreadId))
    }
    return parts.join(" / ")
  }

  private renderTmuxStatusRight(): string {
    if (this.view === "messages") {
      return `${this.messageScrollOffset}/${this.messageScrollMax} ↑/↓`
    }

    if (this.view === "requests") {
      return "↑/↓ select | Enter respond"
    }

    if (this.view === "settings") {
      return "↑/↓ select | Enter toggle"
    }

    if (this.view === "tasks") {
      return `${this.taskScrollOffset}/${this.taskScrollMax} ↑/↓`
    }

    if (this.view === "calendar") {
      return `${this.calendarScrollOffset}/${this.calendarScrollMax} ↑/↓`
    }

    return ""
  }

  private syncTmuxStatusBar(): void {
    if (!this.isInsideTmuxSession()) return
    const sessionName = this.tmuxSessionName()
    if (!sessionName) return

    const left = this.renderTmuxStatusLeft()
    const right = this.renderTmuxStatusRight()

    if (left !== this.lastTmuxStatusLeft) {
      this.lastTmuxStatusLeft = left
      try {
        spawnSync("tmux", ["set-option", "-t", sessionName, "@termlings_control_left", ` #[fg=colour141,bold]${left}#[default] `], {
          stdio: "ignore",
        })
      } catch {}
    }

    if (right !== this.lastTmuxStatusRight) {
      this.lastTmuxStatusRight = right
      try {
        spawnSync("tmux", ["set-option", "-t", sessionName, "@termlings_control_right", `#[fg=colour245]${right}#[default] `], {
          stdio: "ignore",
        })
      } catch {}
    }
  }

  private teardownControlTmuxSession(): void {
    if (!this.isControlPanelSession()) return
    const sessionName = (process.env.TERMLINGS_TMUX_SESSION || "").trim()
    if (!sessionName) return

    try {
      spawnSync("tmux", ["kill-session", "-t", sessionName], { stdio: "ignore" })
    } catch {}
  }

  private stop(code: number): never {
    if (!this.running) {
      process.exit(code)
    }

    this.running = false

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    if (this.animationTimer) {
      clearInterval(this.animationTimer)
      this.animationTimer = null
    }

    this.stdin.off("data", this.onDataBound)
    this.stdout.off("resize", this.onResizeBound)
    process.off("SIGINT", this.onSigIntBound)
    process.off("SIGTERM", this.onSigTermBound)

    if (this.identity.ephemeral) {
      removeSession(this.identity.sessionId, this.root)
    }

    this.leaveScreen()
    this.teardownControlTmuxSession()
    process.exit(code)
  }

  private extractBracketedPasteSegments(input: string): string[] {
    if (!input) return []
    const out: string[] = []
    let remaining = input

    while (remaining.length > 0) {
      if (this.bracketedPasteActive) {
        const endIndex = remaining.indexOf(BRACKETED_PASTE_END)
        if (endIndex === -1) {
          this.bracketedPasteBuffer += remaining
          return out
        }
        this.bracketedPasteBuffer += remaining.slice(0, endIndex)
        out.push(`${BRACKETED_PASTE_START}${this.bracketedPasteBuffer}${BRACKETED_PASTE_END}`)
        this.bracketedPasteBuffer = ""
        this.bracketedPasteActive = false
        remaining = remaining.slice(endIndex + BRACKETED_PASTE_END.length)
        continue
      }

      const startIndex = remaining.indexOf(BRACKETED_PASTE_START)
      if (startIndex === -1) {
        out.push(remaining)
        break
      }

      if (startIndex > 0) {
        out.push(remaining.slice(0, startIndex))
      }

      const contentStart = startIndex + BRACKETED_PASTE_START.length
      const endIndex = remaining.indexOf(BRACKETED_PASTE_END, contentStart)
      if (endIndex === -1) {
        this.bracketedPasteActive = true
        this.bracketedPasteBuffer = remaining.slice(contentStart)
        break
      }

      const payload = remaining.slice(contentStart, endIndex)
      out.push(`${BRACKETED_PASTE_START}${payload}${BRACKETED_PASTE_END}`)
      remaining = remaining.slice(endIndex + BRACKETED_PASTE_END.length)
    }

    return out.filter((segment) => segment.length > 0)
  }

  private async handleInput(input: string): Promise<void> {
    if (!input) return

    const segments = this.extractBracketedPasteSegments(input)
    if (segments.length === 0) {
      return
    }
    if (segments.length > 1 || segments[0] !== input) {
      for (const segment of segments) {
        await this.handleInput(segment)
      }
      return
    }

    this.cursorBlinkVisible = true

    const bracketedPaste = this.unwrapBracketedPaste(input)
    const isEscapeSequence = bracketedPaste === null && input.startsWith("\u001b[")
    const isPasteInput = bracketedPaste !== null || (!isEscapeSequence && input.length > 1)
    const normalizedInput = isPasteInput
      ? this.normalizePastedInput(bracketedPaste ?? input)
      : input

    if (!normalizedInput) return

    if (isPasteInput) {
      const pasteText = normalizedInput
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n+/g, " ")

      if (this.view === "requests" && this.requestInputMode) {
        this.requestInputDraft += pasteText
        this.render()
        return
      }

      if (!this.isComposerAvailable()) {
        return
      }

      if (
        this.view === "messages"
        && this.selectedThreadId === "activity"
        && this.draft.length === 0
        && !pasteText.trimStart().startsWith("@")
      ) {
        this.statusMessage = 'Start with @everyone or @agent.'
        this.render()
        return
      }

      if (!this.inputFocused) {
        this.inputFocused = true
      }
      this.insertDraftText(pasteText)
      this.syncMentionSelection()
      this.render()
      return
    }

    const isArrowUp = normalizedInput === "\u001b[A" || normalizedInput === "\u001bOA"
    const isArrowDown = normalizedInput === "\u001b[B" || normalizedInput === "\u001bOB"
    const isArrowLeft = normalizedInput === "\u001b[D" || normalizedInput === "\u001bOD"
    const isArrowRight = normalizedInput === "\u001b[C" || normalizedInput === "\u001bOC"
    const mentionState = this.getMentionMenuState()
    const mouseWheelDirection = this.parseMouseWheelDirection(normalizedInput)

    if (mouseWheelDirection !== null) {
      this.handleMouseWheel(mouseWheelDirection)
      this.render()
      return
    }

    if (isArrowUp || isArrowDown) {
      if (mentionState && mentionState.candidates.length > 0 && this.inputFocused) {
        this.stepMentionSelection(isArrowUp ? -1 : 1, mentionState.candidates.length)
        this.render()
        return
      }

      if (this.view === "messages" && this.isComposerAvailable() && this.inputFocused && this.draft.length > 0) {
        this.moveDraftCursorVertical(isArrowDown ? 1 : -1)
        this.render()
        return
      }

      if (this.view === "requests") {
        this.moveRequestSelection(isArrowUp ? -1 : 1)
        this.render()
        return
      }

      if (this.view === "settings") {
        this.moveSettingsSelection(isArrowUp ? -1 : 1)
        this.render()
        return
      }

      if (this.view === "messages") {
        this.scrollMessages(isArrowUp ? MESSAGE_SCROLL_STEP : -MESSAGE_SCROLL_STEP)
        this.render()
        return
      }

      if (this.view === "tasks") {
        this.scrollTasks(isArrowUp ? -MESSAGE_SCROLL_STEP : MESSAGE_SCROLL_STEP)
        this.render()
        return
      }

      if (this.view === "calendar") {
        this.scrollCalendar(isArrowUp ? -MESSAGE_SCROLL_STEP : MESSAGE_SCROLL_STEP)
        this.render()
        return
      }
    }

    if ((isArrowLeft || isArrowRight) && this.view === "messages") {
      if (this.isComposerAvailable() && this.inputFocused && this.draft.length > 0) {
        this.moveDraftCursor(isArrowRight ? 1 : -1)
        this.render()
        return
      }
      this.stepMessageRoom(isArrowRight ? 1 : -1)
      this.render()
      return
    }

    if ((isArrowLeft || isArrowRight) && this.view === "tasks") {
      this.stepTaskFilter(isArrowRight ? 1 : -1)
      this.render()
      return
    }

    if ((isArrowLeft || isArrowRight) && this.view === "calendar") {
      this.stepCalendarFilter(isArrowRight ? 1 : -1)
      this.render()
      return
    }

    if (normalizedInput === "\u001b[5~" && this.view === "messages") {
      const page = Math.max(MESSAGE_SCROLL_STEP, Math.floor(Math.max(this.stdout.rows || 24, 10) / 2))
      this.scrollMessages(page)
      this.render()
      return
    }

    if (normalizedInput === "\u001b[5~" && this.view === "tasks") {
      const page = Math.max(MESSAGE_SCROLL_STEP, Math.floor(Math.max(this.stdout.rows || 24, 10) / 2))
      this.scrollTasks(-page)
      this.render()
      return
    }

    if (normalizedInput === "\u001b[5~" && this.view === "calendar") {
      const page = Math.max(MESSAGE_SCROLL_STEP, Math.floor(Math.max(this.stdout.rows || 24, 10) / 2))
      this.scrollCalendar(-page)
      this.render()
      return
    }

    if (normalizedInput === "\u001b[6~" && this.view === "messages") {
      const page = Math.max(MESSAGE_SCROLL_STEP, Math.floor(Math.max(this.stdout.rows || 24, 10) / 2))
      this.scrollMessages(-page)
      this.render()
      return
    }

    if (normalizedInput === "\u001b[6~" && this.view === "tasks") {
      const page = Math.max(MESSAGE_SCROLL_STEP, Math.floor(Math.max(this.stdout.rows || 24, 10) / 2))
      this.scrollTasks(page)
      this.render()
      return
    }

    if (normalizedInput === "\u001b[6~" && this.view === "calendar") {
      const page = Math.max(MESSAGE_SCROLL_STEP, Math.floor(Math.max(this.stdout.rows || 24, 10) / 2))
      this.scrollCalendar(page)
      this.render()
      return
    }

    if (normalizedInput === "\u0003") {
      this.stop(0)
      return
    }

    if (normalizedInput === "\u001b") {
      this.handleEscape()
      this.render()
      return
    }

    if (normalizedInput === "\r" || normalizedInput === "\n") {
      if (mentionState && mentionState.candidates.length > 0 && this.inputFocused) {
        const selected =
          mentionState.candidates[Math.max(0, Math.min(this.mentionSelectionIndex, mentionState.candidates.length - 1))]
          ?? mentionState.candidates[0]
        if (selected) {
          this.acceptMention(selected, mentionState.atIndex)
        }
        this.syncMentionSelection()
        this.render()
        return
      }

      if (this.view === "requests") {
        await this.handleRequestAction()
      } else if (this.view === "settings") {
        this.activateSelectedSetting()
      } else if (!this.inputFocused && this.isComposerAvailable()) {
        this.inputFocused = true
      } else {
        await this.submitDraft()
      }
      this.render()
      return
    }

    if (normalizedInput === "\x7f") {
      if (this.view === "requests" && this.requestInputMode) {
        this.requestInputDraft = this.requestInputDraft.slice(0, -1)
      } else if (this.isComposerAvailable()) {
        this.deleteLastDraftUnit()
      }
      this.render()
      return
    }

    if (normalizedInput === "\t") {
      return
    }

    // Ignore arrow/function key escape sequences.
    if (normalizedInput.startsWith("\u001b[")) {
      return
    }

    for (const ch of normalizedInput) {
      if (ch === "\u0003") {
        this.stop(0)
        return
      }

      if (ch === "\r" || ch === "\n") {
        if (this.view === "requests") {
          await this.handleRequestAction()
        } else if (this.view === "settings") {
          this.activateSelectedSetting()
        } else if (!this.inputFocused && this.isComposerAvailable()) {
          this.inputFocused = true
        } else {
          await this.submitDraft()
        }
        continue
      }

      if (ch === "\x7f") {
        if (this.view === "requests" && this.requestInputMode) {
          this.requestInputDraft = this.requestInputDraft.slice(0, -1)
        } else if (this.isComposerAvailable()) {
          this.deleteLastDraftUnit()
        }
        continue
      }

      const hasActiveInputText =
        (this.view === "messages" && this.draft.length > 0)
        || (this.view === "requests" && this.requestInputMode)

      if (!hasActiveInputText && !isPasteInput) {
        const lower = ch.toLowerCase()
        if (lower === "q") {
          this.stop(0)
          return
        }

        if (lower === "b" && this.view === "messages" && this.messageScrollOffset > 0) {
          this.messageScrollOffset = 0
          continue
        }

        if (lower === "b" && this.view === "tasks" && this.taskScrollMax > 0) {
          this.taskScrollOffset = this.taskScrollMax
          continue
        }

        if (lower === "b" && this.view === "calendar" && this.calendarScrollMax > 0) {
          this.calendarScrollOffset = this.calendarScrollMax
          continue
        }

        if (ch >= "1" && ch <= "9" && !(this.view === "requests" && this.requestInputMode)) {
          this.selectViewByNumber(Number.parseInt(ch, 10))
          continue
        }
      }

      if (ch >= " " && ch <= "~") {
        if (this.view === "requests" && this.requestInputMode) {
          this.requestInputDraft += ch
          continue
        }
        if (!this.isComposerAvailable()) {
          continue
        }
        if (
          !isPasteInput
          && this.view === "messages"
          && this.selectedThreadId === "activity"
          && this.draft.length === 0
          && ch !== "@"
        ) {
          this.statusMessage = 'Start with @everyone or @agent.'
          continue
        }
        if (!this.inputFocused) {
          this.inputFocused = true
        }
        this.insertDraftText(ch)
      }
    }

    this.syncMentionSelection()
    this.render()
  }

  private unwrapBracketedPaste(input: string): string | null {
    if (!input.startsWith(BRACKETED_PASTE_START)) return null
    if (!input.endsWith(BRACKETED_PASTE_END)) return null
    return input.slice(BRACKETED_PASTE_START.length, -BRACKETED_PASTE_END.length)
  }

  private normalizePastedInput(input: string): string {
    const withNormalizedNewlines = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const withMediaPlaceholders = this.replaceImageUrlsWithPlaceholders(withNormalizedNewlines)
    return this.compactLargePastedContent(withMediaPlaceholders, withNormalizedNewlines.length)
  }

  private compactLargePastedContent(input: string, rawCharCount: number): string {
    const trimmed = input.trim()
    if (!trimmed) return input

    const lineCount = input.split("\n").length
    const largeByChars = rawCharCount >= PASTE_COMPACT_MIN_CHARS
    const largeByLines = lineCount >= PASTE_COMPACT_MIN_LINES
    const largeMultiline =
      rawCharCount >= PASTE_COMPACT_MULTILINE_MIN_CHARS
      && lineCount >= PASTE_COMPACT_MULTILINE_MIN_LINES

    if (!largeByChars && !largeByLines && !largeMultiline) {
      return input
    }

    this.pastedContentPlaceholderCounter += 1
    const placeholder = `[Pasted Content #${this.pastedContentPlaceholderCounter} ${rawCharCount} chars]`
    this.pastedContentByPlaceholder.set(placeholder, input)
    return placeholder
  }

  private expandPastedContentPlaceholdersForSend(input: string): string {
    if (!input) return input
    return input.replace(/\[Pasted Content(?: #\d+)? \d+ chars\]/g, (token) => {
      return this.pastedContentByPlaceholder.get(token) ?? token
    })
  }

  private expandImagePlaceholdersForSend(input: string): string {
    if (!input) return input
    return input.replace(/\[Image #\d+\]/g, (token) => {
      const source = this.imageSourceByPlaceholder.get(token)
      if (!source) return token
      return this.formatImageSourceForSend(source)
    })
  }

  private formatImageSourceForSend(source: string): string {
    if (!source) return source
    const shouldQuote = this.isLikelyImagePath(source) || /\s/.test(source)
    if (!shouldQuote) return source
    const escaped = source.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
    return `'${escaped}'`
  }

  private expandDraftPlaceholdersForSend(input: string): string {
    const withPasted = this.expandPastedContentPlaceholdersForSend(input)
    return this.expandImagePlaceholdersForSend(withPasted)
  }

  private replaceImageUrlsWithPlaceholders(input: string): string {
    const quotedLocalImageRegex = /(['"])([^'"\n]*\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|tiff?)(?:[?#][^'"\n]*)?)\1/gi
    let out = input.replace(quotedLocalImageRegex, (_match, _quote: string, rawPath: string) => {
      if (!this.isLikelyImagePath(rawPath)) return _match
      return this.placeholderForImageUrl(rawPath)
    })

    const localPathRegex = /(?:^|[\s(])(file:\/\/[^\s)]+|~\/[^\s)]+|\/[^\s)]+)(?=$|[\s),.!?;:'"])/gi
    out = out.replace(localPathRegex, (full: string, rawPath: string) => {
      const prefix = full.slice(0, full.length - rawPath.length)
      const { path, suffix } = this.stripTrailingPathPunctuation(rawPath)
      if (!this.isLikelyImagePath(path)) return full
      return `${prefix}${this.placeholderForImageUrl(path)}${suffix}`
    })

    const markdownImageRegex = /!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/gi
    out = out.replace(markdownImageRegex, (_match, rawUrl: string) => {
      const { url } = this.stripTrailingUrlPunctuation(rawUrl)
      if (!this.isLikelyImageUrl(url)) return _match
      return this.placeholderForImageUrl(url)
    })

    const urlRegex = /(https?:\/\/[^\s]+)/gi
    out = out.replace(urlRegex, (rawUrl: string) => {
      const { url, suffix } = this.stripTrailingUrlPunctuation(rawUrl)
      if (!this.isLikelyImageUrl(url)) return rawUrl
      return `${this.placeholderForImageUrl(url)}${suffix}`
    })
    return out
  }

  private stripTrailingPathPunctuation(value: string): { path: string; suffix: string } {
    let path = value
    let suffix = ""
    while (path.length > 0 && /[)\],.!?;:'"]/.test(path[path.length - 1] || "")) {
      suffix = `${path[path.length - 1]}${suffix}`
      path = path.slice(0, -1)
    }
    return { path, suffix }
  }

  private stripTrailingUrlPunctuation(value: string): { url: string; suffix: string } {
    let url = value
    let suffix = ""
    while (url.length > 0 && /[)\],.!?;:'"]/.test(url[url.length - 1] || "")) {
      suffix = `${url[url.length - 1]}${suffix}`
      url = url.slice(0, -1)
    }
    return { url, suffix }
  }

  private isLikelyImageUrl(raw: string): boolean {
    if (!raw) return false
    if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|tiff?)(?:[?#].*)?$/i.test(raw)) {
      return true
    }
    try {
      const parsed = new URL(raw)
      const host = parsed.hostname.toLowerCase()
      if (
        host.includes("images.unsplash.com")
        || host.includes("i.imgur.com")
        || host.includes("cdn.discordapp.com")
        || host.includes("media.tenor.com")
      ) {
        return true
      }
    } catch {}
    return false
  }

  private isLikelyImagePath(raw: string): boolean {
    if (!raw) return false
    if (!/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|tiff?)(?:[?#].*)?$/i.test(raw)) {
      return false
    }
    if (raw.startsWith("/") || raw.startsWith("~/")) {
      return true
    }
    if (raw.startsWith("file://")) {
      try {
        const parsed = new URL(raw)
        return parsed.protocol === "file:"
      } catch {
        return false
      }
    }
    return false
  }

  private placeholderForImageUrl(url: string): string {
    const existing = this.imagePlaceholderByUrl.get(url)
    if (existing) {
      this.imageSourceByPlaceholder.set(existing, url)
      return existing
    }
    this.imagePlaceholderCounter += 1
    const placeholder = `[Image #${this.imagePlaceholderCounter}]`
    this.imagePlaceholderByUrl.set(url, placeholder)
    this.imageSourceByPlaceholder.set(placeholder, url)
    return placeholder
  }

  private deleteLastDraftUnit(): void {
    if (this.draftCursorIndex <= 0) return
    const block = this.findDraftBlockSpanAt(this.draftCursorIndex - 1)
    if (block) {
      this.draft = `${this.draft.slice(0, block.start)}${this.draft.slice(block.end)}`
      this.draftCursorIndex = block.start
      this.syncMentionSelection()
      return
    }

    const left = this.draft.slice(0, this.draftCursorIndex)
    const right = this.draft.slice(this.draftCursorIndex)
    const match = left.match(DRAFT_BLOCK_TOKEN_PATTERN)
    if (match && typeof match.index === "number") {
      const nextLeft = left.slice(0, match.index)
      this.draft = `${nextLeft}${right}`
      this.draftCursorIndex = nextLeft.length
    } else {
      const nextLeft = left.slice(0, -1)
      this.draft = `${nextLeft}${right}`
      this.draftCursorIndex = nextLeft.length
    }
    this.syncMentionSelection()
  }

  private moveDraftCursor(delta: number): void {
    if (delta === 0) return
    if (delta > 0) {
      if (this.draftCursorIndex >= this.draft.length) return
      const block = this.findDraftBlockSpanAt(this.draftCursorIndex)
      if (block) {
        this.draftCursorIndex = block.end
      } else {
        this.draftCursorIndex = Math.min(this.draft.length, this.draftCursorIndex + 1)
      }
      this.syncMentionSelection()
      return
    }

    if (this.draftCursorIndex <= 0) return
    const block = this.findDraftBlockSpanAt(this.draftCursorIndex - 1)
    if (block) {
      this.draftCursorIndex = block.start
    } else {
      this.draftCursorIndex = Math.max(0, this.draftCursorIndex - 1)
    }
    this.syncMentionSelection()
  }

  private wrappedDraftSegments(width: number): Array<{ text: string; start: number; end: number; prefix: string }> {
    const firstPrefix = " ❯ "
    const continuationPrefix = "   "
    const firstCapacity = Math.max(1, width - visibleLength(firstPrefix))
    const continuationCapacity = Math.max(1, width - visibleLength(continuationPrefix))

    const segments: Array<{ text: string; start: number; end: number; prefix: string }> = []
    if (this.draft.length === 0) {
      segments.push({ text: "", start: 0, end: 0, prefix: firstPrefix })
      return segments
    }

    let start = 0
    let line = 0
    while (start < this.draft.length) {
      const capacity = line === 0 ? firstCapacity : continuationCapacity
      const end = Math.min(this.draft.length, start + capacity)
      segments.push({
        text: this.draft.slice(start, end),
        start,
        end,
        prefix: line === 0 ? firstPrefix : continuationPrefix,
      })
      start = end
      line += 1
    }

    return segments
  }

  private moveDraftCursorVertical(direction: -1 | 1): void {
    if (this.draft.length === 0 || direction === 0) return

    const width = Math.max(this.stdout.columns || 120, 40)
    const segments = this.wrappedDraftSegments(width)
    if (segments.length === 0) return

    let lineIndex = Math.max(0, segments.length - 1)
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!
      if (this.draftCursorIndex <= segment.end) {
        lineIndex = index
        break
      }
    }

    const targetLineIndex = Math.max(0, Math.min(segments.length - 1, lineIndex + direction))
    if (targetLineIndex === lineIndex) return

    const currentSegment = segments[lineIndex]!
    const currentColumn = Math.max(0, this.draftCursorIndex - currentSegment.start)
    const targetSegment = segments[targetLineIndex]!
    let targetIndex = Math.min(targetSegment.start + currentColumn, targetSegment.end)

    const blockAt = this.findDraftBlockSpanAt(targetIndex)
    if (blockAt && targetIndex > blockAt.start && targetIndex < blockAt.end) {
      targetIndex = direction < 0 ? blockAt.start : blockAt.end
    } else if (targetIndex > 0) {
      const blockLeft = this.findDraftBlockSpanAt(targetIndex - 1)
      if (blockLeft && targetIndex > blockLeft.start && targetIndex < blockLeft.end) {
        targetIndex = direction < 0 ? blockLeft.start : blockLeft.end
      }
    }

    this.draftCursorIndex = Math.max(0, Math.min(this.draft.length, targetIndex))
    this.syncMentionSelection()
  }

  private findDraftBlockSpanAt(index: number): { start: number; end: number } | null {
    if (index < 0 || index >= this.draft.length) return null
    DRAFT_BLOCK_TOKEN_GLOBAL.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = DRAFT_BLOCK_TOKEN_GLOBAL.exec(this.draft)) !== null) {
      const start = match.index
      const end = start + match[0].length
      if (index >= start && index < end) {
        return { start, end }
      }
    }
    return null
  }

  private insertDraftText(text: string): void {
    if (!text) return
    const before = this.draft.slice(0, this.draftCursorIndex)
    const after = this.draft.slice(this.draftCursorIndex)
    this.draft = `${before}${text}${after}`
    this.draftCursorIndex = before.length + text.length
    this.syncMentionSelection()
  }

  private handleEscape(): void {
    if (this.view === "requests" && this.requestInputMode) {
      this.requestInputMode = false
      this.requestInputDraft = ""
      this.render()
      return
    }
    if (!this.isComposerAvailable()) return

    const mentionState = this.getMentionMenuState()
    if (mentionState) {
      this.mentionSelectionIndex = 0
      return
    }

    if (this.draft.length > 0) {
      this.draft = ""
      this.draftCursorIndex = 0
      this.inputFocused = true
      return
    }

    if (this.inputFocused) {
      this.inputFocused = false
      return
    }

    this.inputFocused = true
  }

  private tabViews(): MainView[] {
    return ["messages", "requests", "tasks", "calendar", "settings"]
  }

  private selectViewByNumber(viewNumber: number): void {
    const views = this.tabViews()
    const index = viewNumber - 1
    const view = views[index]
    if (!view) return
    this.view = view
    if (view === "requests") {
      this.requestSelectionIndex = 0
      this.requestInputMode = false
      this.requestInputDraft = ""
    }
    if (view === "messages" && this.selectedThreadId.startsWith("agent:")) {
      this.markThreadRead(this.selectedThreadId)
    }
    if (view === "messages" || view === "requests") {
      this.inputFocused = true
    }
    if (view === "settings") {
      this.inputFocused = false
    }
  }

  private settingsItems(): Array<{ key: "avatar-size"; label: string; value: string; hint: string }> {
    const avatarSizeLabel =
      this.avatarSizeMode === "large" ? "Large"
      : this.avatarSizeMode === "tiny" ? "Tiny"
      : "Small"
    return [
      {
        key: "avatar-size",
        label: "Avatar size",
        value: avatarSizeLabel,
        hint: "Large = full avatar, Small = compact avatar (default), Tiny = color square only.",
      },
    ]
  }

  private loadWorkspaceSettings(): void {
    try {
      const settings = readWorkspaceSettings(this.root)
      if (settings.avatarSize === "large" || settings.avatarSize === "small" || settings.avatarSize === "tiny") {
        this.avatarSizeMode = settings.avatarSize
      }
    } catch {}
  }

  private moveSettingsSelection(delta: number): void {
    if (this.view !== "settings") return
    const items = this.settingsItems()
    if (items.length <= 0) {
      this.settingsSelectionIndex = 0
      return
    }
    const next = this.settingsSelectionIndex + delta
    this.settingsSelectionIndex = ((next % items.length) + items.length) % items.length
  }

  private activateSelectedSetting(): void {
    if (this.view !== "settings") return
    const items = this.settingsItems()
    if (items.length <= 0) return
    const selected = items[Math.max(0, Math.min(this.settingsSelectionIndex, items.length - 1))]
    if (!selected) return

    if (selected.key === "avatar-size") {
      const order: Array<"large" | "small" | "tiny"> = ["large", "small", "tiny"]
      const currentIndex = order.indexOf(this.avatarSizeMode)
      const nextIndex = (currentIndex + 1) % order.length
      this.avatarSizeMode = order[nextIndex] ?? "small"
      try {
        updateWorkspaceSettings({ avatarSize: this.avatarSizeMode }, this.root)
      } catch {}
      this.statusMessage = `Avatar size set to ${this.avatarSizeMode}.`
    }
  }

  private stepMentionSelection(delta: number, total: number): void {
    if (total <= 0) {
      this.mentionSelectionIndex = 0
      return
    }
    const next = this.mentionSelectionIndex + delta
    this.mentionSelectionIndex = ((next % total) + total) % total
  }

  private stepMessageRoom(delta: number): void {
    if (this.view !== "messages") return

    const rooms = ["activity", ...this.snapshot.dmThreads.map((thread) => thread.id)]
    if (rooms.length <= 1) return

    const currentIndex = rooms.findIndex((id) => id === this.selectedThreadId)
    const startIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = ((startIndex + delta) % rooms.length + rooms.length) % rooms.length
    this.selectedThreadId = rooms[nextIndex]!
    if (this.selectedThreadId === "activity") {
      this.draft = ""
      this.draftCursorIndex = 0
    }
    this.mentionSelectionIndex = 0
    this.inputFocused = true
    this.messageScrollOffset = 0
    if (this.selectedThreadId.startsWith("agent:")) {
      this.markThreadRead(this.selectedThreadId)
    }
  }

  private scrollMessages(delta: number): void {
    if (this.view !== "messages") return
    const next = this.messageScrollOffset + delta
    this.messageScrollOffset = Math.max(0, next)
  }

  private scrollTasks(delta: number): void {
    if (this.view !== "tasks") return
    const next = this.taskScrollOffset + delta
    this.taskScrollOffset = Math.max(0, next)
  }

  private scrollCalendar(delta: number): void {
    if (this.view !== "calendar") return
    const next = this.calendarScrollOffset + delta
    this.calendarScrollOffset = Math.max(0, next)
  }

  private parseMouseWheelDirection(input: string): -1 | 1 | null {
    const match = input.match(/\u001b\[<(\d+);\d+;\d+[mM]/)
    if (!match) return null
    const code = Number.parseInt(match[1] || "", 10)
    if (!Number.isFinite(code)) return null
    if ((code & 64) === 0) return null
    const button = code & 0b11
    if (button === 0) return -1 // wheel up
    if (button === 1) return 1 // wheel down
    return null
  }

  private handleMouseWheel(direction: -1 | 1): void {
    const step = MESSAGE_SCROLL_STEP
    if (this.view === "messages") {
      this.scrollMessages(direction < 0 ? step : -step)
      return
    }
    if (this.view === "tasks") {
      this.scrollTasks(direction < 0 ? -step : step)
      return
    }
    if (this.view === "calendar") {
      this.scrollCalendar(direction < 0 ? -step : step)
    }
  }

  private async submitDraft(): Promise<void> {
    const text = this.draft.trim()
    if (text.length === 0) return

    if (this.sending) return

    if (this.view !== "messages") {
      this.statusMessage = "Sending is enabled in Chat view only."
      return
    }

    if (this.selectedThreadId === "activity") {
      const parsedDm = this.parseAllActivityDm(text)
      if (parsedDm.error) {
        this.statusMessage = parsedDm.error
        return
      }

      this.sending = true

      try {
        const expandedBody = this.expandDraftPlaceholdersForSend(parsedDm.body)
        const textWithMentions = this.encodeMentionsForTransport(expandedBody)
        let deliveredCount = 0
        let storedCount = 0
        for (const targetId of parsedDm.targetIds) {
          const outcome = await this.sendDm(targetId, textWithMentions)
          this.applyOptimisticMessage(outcome.record)
          if (outcome.delivered) deliveredCount += 1
          else storedCount += 1
        }
        if (parsedDm.audience === "single") {
          const label = parsedDm.targetLabels[0] || "agent"
          this.statusMessage = deliveredCount > 0
            ? `Sent to ${label}.`
            : `Stored for ${label} (offline).`
        } else if (parsedDm.audience === "everyone") {
          this.statusMessage = `Sent to everyone (${parsedDm.targetIds.length} agents: ${deliveredCount} live, ${storedCount} offline).`
        } else {
          this.statusMessage = `Sent to mentioned agents (${parsedDm.targetIds.length}: ${deliveredCount} live, ${storedCount} offline).`
        }
        this.draft = ""
        this.draftCursorIndex = 0
        this.mentionSelectionIndex = 0
        this.messageScrollOffset = 0
        void this.reloadSnapshot().then(() => this.render())
      } catch (error) {
        this.statusMessage = error instanceof Error ? error.message : "Failed to send message."
      } finally {
        this.sending = false
      }
      return
    }

    if (!this.selectedThreadId.startsWith("agent:")) {
      this.statusMessage = "Select a DM room to send messages."
      return
    }

    const selectedDmThread = this.selectedDmThread()
    if (selectedDmThread && !selectedDmThread.online) {
      this.statusMessage = `${selectedDmThread.label} is offline. Run \`termlings spawn\` in another terminal.`
      return
    }

    this.sending = true

    try {
      const expandedText = this.expandDraftPlaceholdersForSend(text)
      const textWithMentions = this.encodeMentionsForTransport(expandedText)
      const outcome = await this.sendDm(this.selectedThreadId, textWithMentions)
      this.applyOptimisticMessage(outcome.record)
      this.draft = ""
      this.draftCursorIndex = 0
      this.mentionSelectionIndex = 0
      this.messageScrollOffset = 0
      this.statusMessage = outcome.delivered
        ? `Sent to ${this.threadLabel(this.selectedThreadId)}.`
        : `Stored for ${this.threadLabel(this.selectedThreadId)} (offline).`
      void this.reloadSnapshot().then(() => this.render())
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : "Failed to send message."
    } finally {
      this.sending = false
    }
  }

  private applyOptimisticMessage(message: WorkspaceMessage): void {
    const next = [...this.snapshot.messages, message]
    next.sort((a, b) => a.ts - b.ts)
    this.snapshot.messages = next.slice(-1000)
    this.previousMessageIds.add(message.id)
  }

  private parseAllActivityDm(text: string): {
    targetIds: string[]
    targetLabels: string[]
    audience: "single" | "mentions" | "everyone"
    body: string
    error?: undefined
  } | {
    targetIds?: undefined
    targetLabels?: undefined
    audience?: undefined
    body?: undefined
    error: string
  } {
    let remainder = text.trim()
    const tags: string[] = []
    while (remainder.length > 0) {
      const match = remainder.match(/^@([a-zA-Z0-9._-]+)\b(?:\s+|$)/)
      if (!match) break
      const rawTag = (match[1] || "").trim()
      if (!rawTag) break
      tags.push(rawTag)
      remainder = remainder.slice(match[0].length)
    }

    if (tags.length === 0) {
      return { error: 'Start with a valid tag: @everyone or @agent.' }
    }

    const body = remainder.trim()
    if (!body) {
      return { error: "Write a message after the tag." }
    }

    const byToken = new Map<string, MentionCandidate>()
    for (const candidate of this.allMentionCandidates()) {
      if (!candidate.id.startsWith("agent:")) continue
      byToken.set(candidate.token.toLowerCase(), candidate)
      byToken.set(candidate.insertText.slice(1).toLowerCase(), candidate)
      byToken.set(candidate.label.toLowerCase().replace(/\s+/g, ""), candidate)
      byToken.set(candidate.id.toLowerCase(), candidate)
    }

    const resolveAgentTag = (rawTag: string): { id: string; label: string } | null => {
      const key = rawTag.toLowerCase()
      const direct = byToken.get(key) ?? byToken.get(`agent:${key}`)
      if (direct) {
        return { id: direct.id, label: direct.label }
      }

      const fromThread = this.snapshot.dmThreads.find(
        (thread) => thread.slug?.toLowerCase() === key || thread.dna.toLowerCase() === key,
      )
      if (fromThread) {
        return { id: fromThread.id, label: fromThread.label }
      }

      return null
    }

    const wantsEveryone = tags.some((tag) => tag.toLowerCase() === "everyone")
    const resolved: Array<{ id: string; label: string }> = []
    if (wantsEveryone) {
      for (const thread of this.snapshot.dmThreads) {
        if (!thread.id.startsWith("agent:")) continue
        resolved.push({ id: thread.id, label: thread.label })
      }
      if (resolved.length === 0) {
        return { error: 'No agents available for "@everyone".' }
      }
    }

    for (const tag of tags) {
      if (tag.toLowerCase() === "everyone") continue
      const target = resolveAgentTag(tag)
      if (!target) {
        return { error: `Unknown tag "@${tag}". Use @everyone or a valid @agent tag.` }
      }
      resolved.push(target)
    }

    const seen = new Set<string>()
    const deduped = resolved.filter((target) => {
      if (seen.has(target.id)) return false
      seen.add(target.id)
      return true
    })
    if (deduped.length === 0) {
      return { error: 'Start with a valid tag: @everyone or @agent.' }
    }

    const audience: "single" | "mentions" | "everyone" =
      wantsEveryone ? "everyone" : deduped.length === 1 ? "single" : "mentions"

    return {
      targetIds: deduped.map((target) => target.id),
      targetLabels: deduped.map((target) => target.label),
      audience,
      body,
    }
  }

  private async sendWorkspaceChat(text: string): Promise<void> {
    const fromName = this.identity.name || "Operator"
    const fromDna = this.identity.dna || "0000000"

    upsertSession(
      this.identity.sessionId,
      {
        name: fromName,
        dna: fromDna,
      },
      this.root,
    )

    appendWorkspaceMessage(
      {
        kind: "chat",
        channel: "workspace",
        from: this.identity.sessionId,
        fromName,
        fromDna,
        text,
      },
      this.root,
    )
  }

  private async sendDm(target: string, text: string): Promise<{ delivered: boolean; record: WorkspaceMessage }> {
    const rawTarget = target
    const resolvedTarget = rawTarget === "owner" || rawTarget === "operator" ? "human:default" : rawTarget

    const fromName = this.identity.name || "Operator"
    const fromDna = this.identity.dna || "0000000"
    // TUI is the human operator — messages come from human:default
    const fromId = "human:default"

    const isHumanTarget = resolvedTarget.startsWith("human:")

    let targetSession = isHumanTarget ? null : readSession(resolvedTarget, this.root)
    let targetDna = targetSession?.dna
    let finalTarget = resolvedTarget
    let storageTarget = resolvedTarget
    let targetAgentName: string | undefined
    let resolvedByStableDna = false

    if (!isHumanTarget && resolvedTarget.startsWith("agent:")) {
      const agentId = resolvedTarget.slice("agent:".length)
      if (agentId.length > 0) {
        // Resolve slug (folder name) to DNA first, fall back to treating as DNA
        let dna = agentId
        let stableSlug: string | undefined
        try {
          const localAgents = discoverLocalAgents()
          const match = localAgents.find((a) => a.name === agentId)
            ?? localAgents.find((a) => a.soul?.dna === agentId)
          if (match?.soul?.dna) {
            dna = match.soul.dna
          }
          if (match?.name) {
            stableSlug = match.name
          }
          if (match?.soul?.name) {
            targetAgentName = match.soul.name
          }
        } catch {}

        const candidates = listSessions(this.root)
          .filter((session) => session.dna === dna)
          .sort((a, b) => b.lastSeenAt - a.lastSeenAt)

        targetSession = candidates[0] ?? null
        targetDna = dna
        finalTarget = targetSession?.sessionId ?? resolvedTarget
        storageTarget = `agent:${stableSlug ?? agentId}`
        resolvedByStableDna = true
      }
    }

    if (!isHumanTarget && !targetSession && !resolvedByStableDna) {
      throw new Error(`Target ${resolvedTarget} is offline or unknown.`)
    }

    let delivered = false
    if (targetSession) {
      delivered = true
      writeMessages(finalTarget, [
        {
          from: fromId,
          fromName,
          text,
          ts: Date.now(),
        },
      ])
    }

    const record = appendWorkspaceMessage(
      {
        kind: "dm",
        from: fromId,
        fromName,
        fromDna,
        target: storageTarget,
        targetName: targetAgentName ?? targetSession?.name ?? (isHumanTarget ? "Human Operator" : undefined),
        targetDna,
        text,
      },
      this.root,
    )

    return { delivered, record }
  }

  private async reloadSnapshot(): Promise<void> {
    if (this.refreshing) return
    this.refreshing = true

    try {
      const sessions = listSessions(this.root)
      const now = Date.now()
      const currentSessionIds = new Set(sessions.map((session) => session.sessionId))

      for (const session of sessions) {
        if (session.sessionId === this.identity.sessionId) continue
        if (!this.previousSessionIds.has(session.sessionId)) {
          this.waveUntilByDna.set(session.dna, now + JOIN_WAVE_MS)
        }
      }

      this.previousSessionIds = currentSessionIds

      for (const [dna, until] of this.waveUntilByDna.entries()) {
        if (until <= now) {
          this.waveUntilByDna.delete(dna)
        }
      }

      const messages = readWorkspaceMessages({ limit: 1000 }, this.root)
      const sessionDnaById = new Map(sessions.map((session) => [session.sessionId, session.dna]))
      const typingBySessionId = this.collectSessionTypingBySession(sessions, messages)
      const nextMessageIds = new Set(messages.map((message) => message.id))
      const isInitialSnapshot = this.previousMessageIds.size === 0 && this.snapshot.messages.length === 0

      if (!isInitialSnapshot) {
        for (const message of messages) {
          if (this.previousMessageIds.has(message.id)) continue
          if (message.kind !== "chat" && message.kind !== "dm") continue
          if (isHumanAddress(message.from)) continue
          const senderDna = message.fromDna ?? (message.from ? sessionDnaById.get(message.from) : undefined)
          if (!senderDna) continue
          this.talkUntilByDna.set(senderDna, now + TALK_ANIM_MS)
        }
      }
      this.previousMessageIds = nextMessageIds

      for (const [dna, until] of this.talkUntilByDna.entries()) {
        if (until <= now) {
          this.talkUntilByDna.delete(dna)
        }
      }

      const tasks = getAllTasks()
      const calendarEvents = [...getAllCalendarEvents()].sort((a, b) => a.startTime - b.startTime)
      const agents = this.buildAgentPresence(sessions, typingBySessionId)
      const dmThreads = this.buildDmThreads(messages, agents, sessions)
      const requests = listRequests()
      this.refreshCalendarSchedulerStatus(now)

      this.snapshot = {
        sessions,
        messages,
        tasks,
        calendarEvents,
        agents,
        dmThreads,
        requests,
        generatedAt: Date.now(),
      }

      if (this.selectedThreadId !== "activity" && !dmThreads.some((thread) => thread.id === this.selectedThreadId)) {
        this.selectedThreadId = "activity"
        this.messageScrollOffset = 0
      }

      const pendingReqCount = requests.filter(r => r.status === "pending").length
      if (pendingReqCount <= 0) {
        this.requestSelectionIndex = 0
      } else if (this.requestSelectionIndex >= pendingReqCount) {
        this.requestSelectionIndex = pendingReqCount - 1
      }
    } finally {
      this.refreshing = false
    }
  }

  private waveFrameForAgent(agent: AgentPresence): number {
    if (!agent.online) return 0
    const until = this.waveUntilByDna.get(agent.dna) ?? 0
    if (until <= Date.now()) return 0
    return (Math.floor(Date.now() / AVATAR_ANIM_MS) % 2) + 1
  }

  private resolveAgentDnaFromMentionId(id: string): string | undefined {
    if (!id.startsWith("agent:")) return undefined

    const exact = this.snapshot.dmThreads.find((thread) => thread.id === id)
    if (exact?.dna) return exact.dna

    const token = id.slice("agent:".length)
    const bySlug = this.snapshot.dmThreads.find((thread) => thread.slug === token)
    if (bySlug?.dna) return bySlug.dna

    const byDna = this.snapshot.dmThreads.find((thread) => thread.dna === token)
    if (byDna?.dna) return byDna.dna

    return undefined
  }

  private mentionedAgentDnasInDraft(): Set<string> {
    const mentioned = new Set<string>()
    if (this.view !== "messages") return mentioned
    if (this.draft.length === 0) return mentioned

    const byToken = new Map<string, MentionCandidate>()
    for (const candidate of this.allMentionCandidates()) {
      if (!candidate.id.startsWith("agent:")) continue
      byToken.set(candidate.token.toLowerCase(), candidate)
      byToken.set(candidate.insertText.slice(1).toLowerCase(), candidate)
      byToken.set(candidate.label.toLowerCase().replace(/\s+/g, ""), candidate)
      byToken.set(candidate.id.toLowerCase(), candidate)
      byToken.set(candidate.id.slice("agent:".length).toLowerCase(), candidate)
    }

    for (const match of this.draft.matchAll(/(^|[\s(])@([a-zA-Z0-9._-]+)/g)) {
      const token = (match[2] || "").toLowerCase()
      if (!token) continue
      const candidate = byToken.get(token)
      if (!candidate) continue
      const dna = this.mentionCandidateDna(candidate)
      if (dna) {
        mentioned.add(dna)
      }
    }

    for (const match of this.draft.matchAll(/<@(agent:[^|>]+)(?:\|[^>]+)?>/g)) {
      const id = match[1] || ""
      const dna = this.resolveAgentDnaFromMentionId(id)
      if (dna) {
        mentioned.add(dna)
      }
    }

    return mentioned
  }

  private collectSessionTypingBySession(
    sessions: WorkspaceSession[],
    messages: WorkspaceMessage[],
  ): Map<string, SessionTypingState> {
    const out = new Map<string, SessionTypingState>()
    const now = Date.now()
    const sessionDnaById = new Map(sessions.map((session) => [session.sessionId, session.dna]))
    const latestMessageByDna = new Map<string, number>()

    for (const message of messages) {
      if (!message || typeof message.ts !== "number") continue
      const fromDna = message.fromDna ?? (message.from ? sessionDnaById.get(message.from) : undefined)
      const targetDna = message.targetDna ?? (message.target ? sessionDnaById.get(message.target) : undefined)
      if (fromDna) {
        const prev = latestMessageByDna.get(fromDna) ?? 0
        if (message.ts > prev) latestMessageByDna.set(fromDna, message.ts)
      }
      if (targetDna) {
        const prev = latestMessageByDna.get(targetDna) ?? 0
        if (message.ts > prev) latestMessageByDna.set(targetDna, message.ts)
      }
    }

    for (const session of sessions) {
      const path = join(this.root, ".termlings", "store", "presence", `${session.sessionId}.typing.json`)
      if (!existsSync(path)) {
        out.set(session.sessionId, { typing: false, updatedAt: 0 })
        continue
      }
      try {
        const raw = JSON.parse(readFileSync(path, "utf8")) as { typing?: unknown; source?: unknown; updatedAt?: unknown }
        const updatedAt = typeof raw.updatedAt === "number" ? raw.updatedAt : 0
        const latestMessageTs = latestMessageByDna.get(session.dna) ?? 0
        let typing = raw.typing === true && raw.source === "terminal"
        if (typing && (updatedAt <= 0 || now - updatedAt > TYPING_STALE_MS)) {
          typing = false
        }
        if (typing && latestMessageTs >= updatedAt) {
          typing = false
        }
        if (typing && latestMessageTs > 0 && now - latestMessageTs <= TYPING_MESSAGE_SUPPRESS_MS) {
          typing = false
        }
        out.set(session.sessionId, {
          typing,
          updatedAt,
          source: typing ? "terminal" : undefined,
        })
      } catch {
        out.set(session.sessionId, { typing: false, updatedAt: 0 })
      }
    }
    return out
  }

  private talkFrameForAgent(agent: AgentPresence): number {
    if (!agent.online) return 0
    if (agent.typing) {
      return Math.floor(Date.now() / AVATAR_ANIM_MS) % 2
    }
    const until = this.talkUntilByDna.get(agent.dna) ?? 0
    if (until <= Date.now()) return 0
    return Math.floor(Date.now() / AVATAR_ANIM_MS) % 2
  }

  private typingDots(): string {
    const frames = [".", "..", "..."] as const
    const phase = Math.floor(Date.now() / 300) % frames.length
    return frames[phase]!
  }

  private buildAgentPresence(
    sessions: WorkspaceSession[],
    typingBySessionId: Map<string, SessionTypingState>,
  ): AgentPresence[] {
    const byDna = new Map<string, AgentPresence>()
    const slugByDna = new Map<string, string>()

    // Load saved agents with slugs
    for (const local of discoverLocalAgents()) {
      const dna = local.soul?.dna
      if (!dna) continue
      const slug = local.name // Folder name is the slug
      const name = local.soul?.name || local.name
      const title = local.soul?.title || local.soul?.role || undefined
      const title_short = local.soul?.title_short
      const sort_order = typeof local.soul?.sort_order === "number" ? local.soul.sort_order : undefined

      slugByDna.set(dna, slug)
      byDna.set(dna, {
        dna,
        slug,
        name,
        online: false,
        typing: false,
        title,
        title_short,
        sort_order,
      })
    }

    // Merge with active sessions
    for (const session of sessions) {
      const existing = byDna.get(session.dna)
      if (existing) {
        existing.online = true
        if (typingBySessionId.get(session.sessionId)?.typing === true) {
          existing.typing = true
        }
        if (!existing.name || existing.name === existing.dna) {
          existing.name = session.name
        }
        continue
      }

      // Ephemeral agent (not saved, so no slug)
      byDna.set(session.dna, {
        dna: session.dna,
        name: session.name,
        online: true,
        typing: typingBySessionId.get(session.sessionId)?.typing === true,
      })
    }

    // Hide current local session from the agents strip (show teammates only).
    const filtered = Array.from(byDna.values()).filter(
      (agent) => !(agent.dna === this.identity.dna && agent.name === this.identity.name),
    )

    return filtered.sort((a, b) => {
      const aOrder = a.sort_order ?? 0
      const bOrder = b.sort_order ?? 0
      if (aOrder !== bOrder) return aOrder - bOrder
      if (a.online !== b.online) return a.online ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  private buildDmThreads(
    messages: WorkspaceMessage[],
    agents: AgentPresence[],
    sessions: WorkspaceSession[],
  ): DmThread[] {
    const sessionDnaById = new Map(sessions.map((session) => [session.sessionId, session.dna]))
    const agentByDna = new Map(agents.map((agent) => [agent.dna, agent]))
    const byDna = new Map<string, DmThread>()

    for (const agent of agents) {
      // Use slug if available (source of truth), fallback to DNA
      const threadId = agent.slug ? `agent:${agent.slug}` : `agent:${agent.dna}`
      byDna.set(agent.dna, {
        id: threadId,
        dna: agent.dna,
        slug: agent.slug,
        label: agent.name,
        online: agent.online,
        typing: agent.typing,
        sort_order: agent.sort_order,
      })
    }

    for (const message of messages) {
      if (message.kind !== "dm") continue

      const fromDna = message.fromDna ?? (message.from ? sessionDnaById.get(message.from) : undefined)
      const targetDna = message.targetDna ?? (message.target ? sessionDnaById.get(message.target) : undefined)

      if (fromDna && !isHumanAddress(message.from) && !byDna.has(fromDna)) {
        const known = agentByDna.get(fromDna)
        const fromThreadId = known?.slug ? `agent:${known.slug}` : `agent:${fromDna}`
        byDna.set(fromDna, {
          id: fromThreadId,
          dna: fromDna,
          slug: known?.slug,
          label: message.fromName || known?.name || fromDna,
          online: known?.online ?? false,
          typing: known?.typing ?? false,
          sort_order: known?.sort_order,
        })
      }

      if (targetDna && !isHumanAddress(message.target) && !byDna.has(targetDna)) {
        const known = agentByDna.get(targetDna)
        const targetThreadId = known?.slug ? `agent:${known.slug}` : `agent:${targetDna}`
        byDna.set(targetDna, {
          id: targetThreadId,
          dna: targetDna,
          slug: known?.slug,
          label: message.targetName || known?.name || targetDna,
          online: known?.online ?? false,
          typing: known?.typing ?? false,
          sort_order: known?.sort_order,
        })
      }
    }

    return Array.from(byDna.values()).sort((a, b) => {
      const aOrder = a.sort_order ?? 0
      const bOrder = b.sort_order ?? 0
      if (aOrder !== bOrder) return aOrder - bOrder
      if (a.online !== b.online) return a.online ? -1 : 1
      return a.label.localeCompare(b.label)
    })
  }

  private threadLabel(threadId: string): string {
    if (threadId === "activity") return "All activity"
    if (!threadId.startsWith("agent:")) return threadId

    const thread = this.snapshot.dmThreads.find((candidate) => candidate.id === threadId)
    if (thread) return thread.label
    return threadId.slice("agent:".length)
  }

  private threadDna(threadId: string): string | null {
    if (!threadId.startsWith("agent:")) return null
    const thread = this.snapshot.dmThreads.find((candidate) => candidate.id === threadId)
    if (thread?.dna) return thread.dna
    return threadId.slice("agent:".length)
  }

  private selectedDmThread(): DmThread | null {
    if (!this.selectedThreadId.startsWith("agent:")) return null
    return this.snapshot.dmThreads.find((thread) => thread.id === this.selectedThreadId) ?? null
  }

  private isComposerAvailable(): boolean {
    if (this.view !== "messages") return false
    if (this.selectedThreadId === "activity") return true
    if (!this.selectedThreadId.startsWith("agent:")) return false
    const thread = this.selectedDmThread()
    if (thread && !thread.online) return false
    return true
  }

  private messageFromDna(message: WorkspaceMessage): string | undefined {
    if (message.fromDna) return message.fromDna
    if (!message.from) return undefined
    return this.snapshot.sessions.find((session) => session.sessionId === message.from)?.dna
  }

  private messageTargetDna(message: WorkspaceMessage): string | undefined {
    if (message.targetDna) return message.targetDna
    if (!message.target) return undefined
    return this.snapshot.sessions.find((session) => session.sessionId === message.target)?.dna
  }

  private isOperatorSender(message: WorkspaceMessage): boolean {
    if (isHumanAddress(message.from)) return true
    if (message.from === this.identity.sessionId) return true
    const fromDna = this.messageFromDna(message)
    if (fromDna && fromDna === this.identity.dna) return true
    return (message.fromName || "").trim().toLowerCase() === "operator"
  }

  private isOperatorTarget(message: WorkspaceMessage): boolean {
    if (isHumanAddress(message.target)) return true
    if (message.target === this.identity.sessionId) return true
    const targetDna = this.messageTargetDna(message)
    if (targetDna && targetDna === this.identity.dna) return true

    const targetName = (message.targetName || "").trim().toLowerCase()
    return targetName === "operator" || targetName === "human operator"
  }

  private isOperatorAgentDmForThread(message: WorkspaceMessage, threadDna: string): boolean {
    if (message.kind !== "dm") return false

    const fromDna = this.messageFromDna(message)
    const targetDna = this.messageTargetDna(message)
    const fromIsThreadAgent = fromDna === threadDna
    const targetIsThreadAgent = targetDna === threadDna

    if (!fromIsThreadAgent && !targetIsThreadAgent) return false
    if (fromIsThreadAgent && this.isOperatorTarget(message)) return true
    if (targetIsThreadAgent && this.isOperatorSender(message)) return true
    return false
  }

  private isMessageInThread(message: WorkspaceMessage, threadId: string): boolean {
    if (threadId === "activity") return true

    const threadDna = this.threadDna(threadId)
    if (!threadDna) return false
    return this.isOperatorAgentDmForThread(message, threadDna)
  }

  private isOutgoingDmInSelectedThread(message: WorkspaceMessage): boolean {
    if (!this.selectedThreadId.startsWith("agent:")) return false
    const threadDna = this.threadDna(this.selectedThreadId)
    if (!threadDna) return false
    if (!this.isOperatorAgentDmForThread(message, threadDna)) return false

    return this.isOperatorSender(message)
  }

  private isIncomingOperatorDmForDna(message: WorkspaceMessage, threadDna: string): boolean {
    if (!this.isOperatorAgentDmForThread(message, threadDna)) return false
    return this.isOperatorTarget(message)
  }

  private markThreadRead(threadId: string): void {
    const threadDna = this.threadDna(threadId)
    if (!threadDna) return

    let latestIncomingTs = 0
    for (const message of this.snapshot.messages) {
      if (!this.isIncomingOperatorDmForDna(message, threadDna)) continue
      if (message.ts > latestIncomingTs) {
        latestIncomingTs = message.ts
      }
    }

    if (latestIncomingTs <= 0) return
    const current = this.lastReadByThread.get(threadId) ?? 0
    if (latestIncomingTs <= current) return
    this.lastReadByThread.set(threadId, latestIncomingTs)
  }

  private unreadInboxSummaries(): InboxSummary[] {
    const summaries: InboxSummary[] = []

    for (const thread of this.snapshot.dmThreads) {
      const seenAt = this.lastReadByThread.get(thread.id) ?? 0
      const unread = this.snapshot.messages
        .filter((message) => this.isIncomingOperatorDmForDna(message, thread.dna) && message.ts > seenAt)
        .sort((a, b) => b.ts - a.ts)

      if (unread.length === 0) continue

      summaries.push({
        key: thread.id,
        label: thread.label,
        threadId: thread.id,
        count: unread.length,
        lastMessage: unread[0]!,
        dna: thread.dna,
      })
    }

    return summaries.sort((a, b) => b.lastMessage.ts - a.lastMessage.ts)
  }

  private moveRequestSelection(delta: number): void {
    if (this.view !== "requests") return
    const pending = this.snapshot.requests.filter(r => r.status === "pending")
    if (pending.length === 0) {
      this.requestSelectionIndex = 0
      return
    }
    const next = this.requestSelectionIndex + delta
    const normalized = ((next % pending.length) + pending.length) % pending.length
    this.requestSelectionIndex = normalized
  }

  private async handleRequestAction(): Promise<void> {
    const pending = this.snapshot.requests.filter(r => r.status === "pending")
    if (pending.length === 0) return

    const index = Math.max(0, Math.min(this.requestSelectionIndex, pending.length - 1))
    const selected = pending[index]!

    if (selected.type === "confirm") {
      if (!this.requestInputMode) {
        this.requestInputMode = true
        this.requestInputDraft = ""
        return
      }
      const answer = this.requestInputDraft.trim().toLowerCase()
      if (answer === "y" || answer === "yes") {
        resolveRequest(selected.id, "yes")
        this.requestInputMode = false
        this.requestInputDraft = ""
        this.statusMessage = `Confirmed: ${selected.question}`
        await this.notifyRequestResolved(selected, "yes")
      } else if (answer === "n" || answer === "no") {
        resolveRequest(selected.id, "no")
        this.requestInputMode = false
        this.requestInputDraft = ""
        this.statusMessage = `Declined: ${selected.question}`
        await this.notifyRequestResolved(selected, "no")
      }
      return
    }

    if (selected.type === "choice") {
      if (!this.requestInputMode) {
        this.requestInputMode = true
        this.requestInputDraft = ""
        return
      }
      const num = parseInt(this.requestInputDraft.trim(), 10)
      if (selected.options && num >= 1 && num <= selected.options.length) {
        const chosen = selected.options[num - 1]!
        resolveRequest(selected.id, chosen)
        this.requestInputMode = false
        this.requestInputDraft = ""
        this.statusMessage = `Chose: ${chosen}`
        await this.notifyRequestResolved(selected, chosen)
      }
      return
    }

    if (selected.type === "env") {
      if (!this.requestInputMode) {
        this.requestInputMode = true
        this.requestInputDraft = ""
        return
      }
      const value = this.requestInputDraft.trim()
      if (value.length > 0) {
        resolveRequest(selected.id, value)
        // Also set in current process so TUI subprocesses can use it
        process.env[selected.varName!] = value
        this.requestInputMode = false
        this.requestInputDraft = ""
        this.statusMessage = `Set ${selected.varName} in .env`
        await this.notifyRequestResolved(selected, "(set)")
      }
      return
    }
  }

  /**
   * Notify the requesting agent that their request was resolved.
   */
  private async notifyRequestResolved(req: AgentRequest, response: string): Promise<void> {
    const target = req.fromSlug ? `agent:${req.fromSlug}` : req.from
    if (!target) return

    let text: string
    if (req.type === "env") {
      text = `${req.varName} has been set in the project .env file. Restart or re-source your environment to pick it up.`
    } else if (req.type === "confirm") {
      text = `Your question "${req.question}" was answered: ${response}`
    } else if (req.type === "choice") {
      text = `Your question "${req.question}" was answered: ${response}`
    } else {
      text = `Your request ${req.id} was resolved: ${response}`
    }

    try {
      await this.sendDm(target, text)
    } catch {
      // Agent may be offline — message is queued via sendDm
    }
  }

  private isAgentThreadSelected(agent: AgentPresence): boolean {
    if (!this.selectedThreadId.startsWith("agent:")) return false
    const bySlug = agent.slug ? `agent:${agent.slug}` : null
    const byDna = `agent:${agent.dna}`
    return this.selectedThreadId === bySlug || this.selectedThreadId === byDna
  }

  private colorChipForDna(dna?: string): string {
    if (!dna) {
      return `${FG_META}■${ANSI_RESET}`
    }

    try {
      const traits = decodeDNA(dna)
      const { faceRgb } = getTraitColors(traits, false)
      return `\x1b[38;2;${faceRgb[0]};${faceRgb[1]};${faceRgb[2]}m■${ANSI_RESET}`
    } catch {
      return `${FG_META}■${ANSI_RESET}`
    }
  }

  private requestSenderDna(req: AgentRequest): string | undefined {
    if (req.fromDna) return req.fromDna

    if (req.fromSlug) {
      const bySlug = this.snapshot.agents.find((agent) => agent.slug === req.fromSlug)
      if (bySlug?.dna) return bySlug.dna
    }

    const normalizedName = (req.fromName || "").trim().toLowerCase()
    if (normalizedName.length > 0) {
      const byAgentName = this.snapshot.agents.find((agent) => agent.name.toLowerCase() === normalizedName)
      if (byAgentName?.dna) return byAgentName.dna

      const bySessionName = this.snapshot.sessions.find((session) => session.name.toLowerCase() === normalizedName)
      if (bySessionName?.dna) return bySessionName.dna
    }

    return undefined
  }

  private requestSenderName(req: AgentRequest): string {
    const fromName = (req.fromName || "").trim()
    if (fromName.length > 0) return fromName

    const fromSlug = (req.fromSlug || "").trim()
    if (fromSlug.length > 0) {
      const bySlug = this.snapshot.agents.find((agent) => agent.slug === fromSlug)
      if (bySlug?.name) return bySlug.name
      return fromSlug
    }

    const from = (req.from || "").trim()
    if (from.length > 0) return from
    return "unknown"
  }

  private senderColorChip(message: WorkspaceMessage): string {
    return this.colorChipForDna(this.resolvedSenderDna(message))
  }

  private targetColorChip(message: WorkspaceMessage): string {
    return this.colorChipForDna(this.resolvedTargetDna(message))
  }

  private targetDisplayName(message: WorkspaceMessage): string {
    if (isHumanAddress(message.target)) {
      const explicit = (message.targetName || "").trim()
      if (explicit.length > 0 && explicit.toLowerCase() !== "owner") {
        return explicit
      }
      return this.identity.name || "Owner"
    }
    return message.targetName || message.target || "unknown"
  }

  private resolvedSenderDna(message: WorkspaceMessage): string | undefined {
    let senderDna = this.messageFromDna(message)
    if (!senderDna) {
      const fromName = (message.fromName || "").toLowerCase()
      if (message.from === this.identity.sessionId || fromName === "operator" || isHumanAddress(message.from)) {
        senderDna = this.identity.dna
      }
    }
    return senderDna
  }

  private resolvedTargetDna(message: WorkspaceMessage): string | undefined {
    let targetDna = this.messageTargetDna(message)
    if (!targetDna && isHumanAddress(message.target)) {
      targetDna = this.identity.dna
    }
    return targetDna
  }

  private shortTitleForDna(dna?: string): string | undefined {
    if (!dna) return undefined
    const agent = this.snapshot.agents.find((candidate) => candidate.dna === dna)
    const short = (agent?.title_short || "").trim()
    if (short.length > 0) return short
    return undefined
  }

  private formatNameWithShortTitle(
    name: string,
    dna: string | undefined,
    maxWidth: number,
    markYou = false,
  ): string {
    const safeWidth = Math.max(1, maxWidth)
    const suffixParts: string[] = []
    const shortTitle = this.shortTitleForDna(dna)
    if (shortTitle) {
      suffixParts.push(`(${shortTitle})`)
    }
    if (markYou) {
      suffixParts.push("(You)")
    }

    if (suffixParts.length === 0) {
      return truncatePlain(name, safeWidth)
    }

    const suffixPlain = ` ${suffixParts.join(" ")}`
    if (safeWidth <= suffixPlain.length + 1) {
      return truncatePlain(name, safeWidth)
    }

    const nameBudget = Math.max(1, safeWidth - suffixPlain.length)
    const nameShort = truncatePlain(name, nameBudget)
    return `${nameShort}${FG_META}${suffixPlain}${ANSI_RESET}`
  }

  private resolveDnaByName(name: string): string | undefined {
    const normalized = name.trim().toLowerCase()
    if (!normalized) return undefined

    if (this.identity.name.toLowerCase() === normalized) {
      return this.identity.dna
    }

    const knownAgent = this.snapshot.agents.find((agent) => agent.name.toLowerCase() === normalized)
    if (knownAgent?.dna) {
      return knownAgent.dna
    }

    const knownSession = this.snapshot.sessions.find((session) => session.name.toLowerCase() === normalized)
    if (knownSession?.dna) {
      return knownSession.dna
    }

    return undefined
  }

  private mentionTokenFromLabel(label: string, fallback: string): string {
    const compact = label
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "")
    if (compact.length > 0) {
      return compact
    }
    return fallback
      .replace(/[^a-zA-Z0-9._-]+/g, "")
      .replace(/^-+|-+$/g, "") || "user"
  }

  private allMentionCandidates(): MentionCandidate[] {
    const titleByDna = new Map(
      this.snapshot.agents.map((agent) => [agent.dna, agent.title_short || agent.title || ""]),
    )

    const usedTokens = new Set<string>()
    const claimsToken = (raw: string): string => {
      const normalizedBase = raw.trim().replace(/\s+/g, "")
      const base = (normalizedBase.length > 0 ? normalizedBase : "user").toLowerCase()
      if (!usedTokens.has(base)) {
        usedTokens.add(base)
        return base
      }

      let idx = 2
      while (usedTokens.has(`${base}${idx}`)) {
        idx += 1
      }
      const unique = `${base}${idx}`
      usedTokens.add(unique)
      return unique
    }

    const candidates: MentionCandidate[] = this.snapshot.dmThreads.map((thread) => {
      const preferred = this.mentionTokenFromLabel(thread.label, thread.slug || thread.dna)
      const token = claimsToken(preferred)
      const subtitle = titleByDna.get(thread.dna) || undefined
      return {
        id: thread.id,
        label: thread.label,
        token,
        insertText: `@${preferred}`,
        subtitle,
        online: thread.online,
        sort_order: thread.sort_order,
      } satisfies MentionCandidate
    })

    const ownerLabel = this.identity.name || "Owner"
    const ownerToken = claimsToken(this.mentionTokenFromLabel(ownerLabel, "owner"))
    candidates.push({
      id: "human:default",
      label: ownerLabel,
      token: ownerToken,
      insertText: `@${this.mentionTokenFromLabel(ownerLabel, "Owner")}`,
      subtitle: "Owner",
      online: true,
      sort_order: Number.MAX_SAFE_INTEGER,
    })

    const visibleCandidates = candidates.filter((candidate) => candidate.online || candidate.id.startsWith("human:"))

    visibleCandidates.sort((a, b) => {
      const aOrder = a.sort_order ?? 0
      const bOrder = b.sort_order ?? 0
      if (aOrder !== bOrder) return aOrder - bOrder
      if (a.online !== b.online) return a.online ? -1 : 1
      return a.label.localeCompare(b.label)
    })

    return visibleCandidates
  }

  private getMentionCandidates(query: string): MentionCandidate[] {
    const q = query.trim().toLowerCase()
    const candidates = this.selectedThreadId === "activity"
      ? [
          {
            id: "everyone",
            label: "everyone",
            token: "everyone",
            insertText: "@everyone",
            subtitle: "All agents",
            online: true,
            sort_order: -1,
          } satisfies MentionCandidate,
          ...this.allMentionCandidates().filter((candidate) => candidate.id.startsWith("agent:")),
        ]
      : this.allMentionCandidates()

    if (q.length === 0) {
      return candidates
    }

    const scored = candidates
      .map((candidate) => {
        const token = candidate.token.toLowerCase()
        const mentionText = candidate.insertText.slice(1).toLowerCase()
        const label = candidate.label.toLowerCase()
        const subtitle = (candidate.subtitle || "").toLowerCase()
        const id = candidate.id.toLowerCase()
        const combined = `${token} ${mentionText} ${label} ${subtitle} ${id}`
        if (!combined.includes(q)) {
          return null
        }

        let score = 4
        if (token === q || mentionText === q || label === q) score = 0
        else if (token.startsWith(q) || mentionText.startsWith(q)) score = 1
        else if (label.startsWith(q)) score = 2
        else if (subtitle.startsWith(q) || id.startsWith(q)) score = 3

        return { candidate, score }
      })
      .filter((entry): entry is { candidate: MentionCandidate; score: number } => Boolean(entry))

    scored.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      const aOrder = a.candidate.sort_order ?? 0
      const bOrder = b.candidate.sort_order ?? 0
      if (aOrder !== bOrder) return aOrder - bOrder
      if (a.candidate.online !== b.candidate.online) return a.candidate.online ? -1 : 1
      return a.candidate.label.localeCompare(b.candidate.label)
    })

    return scored.map((entry) => entry.candidate)
  }

  private getMentionMenuState(): { atIndex: number; query: string; candidates: MentionCandidate[] } | null {
    if (!this.inputFocused) return null
    if (!this.isComposerAvailable()) return null
    if (this.draft.length === 0) return null

    const draftBeforeCursor = this.draft.slice(0, this.draftCursorIndex)
    if (draftBeforeCursor.length === 0) return null

    const match = draftBeforeCursor.match(/(?:^|[\s(])@([a-zA-Z0-9._-]*)$/)
    if (!match) return null

    const query = (match[1] || "").toLowerCase()
    const atIndex = draftBeforeCursor.length - query.length - 1
    const candidates = this.getMentionCandidates(query)
    return { atIndex, query, candidates }
  }

  private syncMentionSelection(): void {
    this.updateMentionWavesFromDraft()

    const mention = this.getMentionMenuState()
    if (!mention || mention.candidates.length === 0) {
      this.mentionSelectionIndex = 0
      return
    }

    if (this.mentionSelectionIndex < 0) {
      this.mentionSelectionIndex = 0
      return
    }

    if (this.mentionSelectionIndex >= mention.candidates.length) {
      this.mentionSelectionIndex = mention.candidates.length - 1
    }
  }

  private updateMentionWavesFromDraft(): void {
    const now = Date.now()
    const currentMentions = this.mentionedAgentDnasInDraft()

    for (const dna of currentMentions) {
      if (this.draftMentionedAgentDnas.has(dna)) continue
      this.waveUntilByDna.set(dna, now + MENTION_WAVE_MS)
    }

    this.draftMentionedAgentDnas = currentMentions
  }

  private acceptMention(candidate: MentionCandidate, atIndex: number): void {
    const before = this.draft.slice(0, atIndex)
    const after = this.draft.slice(this.draftCursorIndex)
    this.draft = `${before}${candidate.insertText} ${after}`
    this.draftCursorIndex = before.length + candidate.insertText.length + 1
    this.mentionSelectionIndex = 0
    this.cursorBlinkVisible = true
  }

  private mentionLabelById(id: string): string {
    if (id === "human:default" || id === "human:owner" || id === "human:operator") {
      return this.identity.name || "Owner"
    }
    if (id.startsWith("agent:")) {
      const thread = this.snapshot.dmThreads.find((candidate) => candidate.id === id)
      if (thread) return thread.label

      const token = id.slice("agent:".length)
      const bySlug = this.snapshot.dmThreads.find((candidate) => candidate.slug === token)
      if (bySlug) return bySlug.label

      const byDna = this.snapshot.dmThreads.find((candidate) => candidate.dna === token)
      if (byDna) return byDna.label
    }
    return id
  }

  private mentionCandidateDna(candidate: MentionCandidate): string | undefined {
    if (candidate.id.startsWith("human:")) {
      return this.identity.dna
    }

    if (!candidate.id.startsWith("agent:")) {
      return undefined
    }

    const exact = this.snapshot.dmThreads.find((thread) => thread.id === candidate.id)
    if (exact?.dna) return exact.dna

    const token = candidate.id.slice("agent:".length)
    const bySlug = this.snapshot.dmThreads.find((thread) => thread.slug === token)
    if (bySlug?.dna) return bySlug.dna

    const byDna = this.snapshot.dmThreads.find((thread) => thread.dna === token)
    if (byDna?.dna) return byDna.dna

    return undefined
  }

  private mentionCandidateColorChip(candidate: MentionCandidate): string {
    return this.colorChipForDna(this.mentionCandidateDna(candidate))
  }

  private encodeMentionsForTransport(input: string): string {
    if (!input.includes("@")) return input
    const byToken = new Map<string, MentionCandidate>()
    for (const candidate of this.allMentionCandidates()) {
      byToken.set(candidate.token.toLowerCase(), candidate)
      byToken.set(candidate.insertText.slice(1).toLowerCase(), candidate)
      byToken.set(candidate.label.toLowerCase().replace(/\s+/g, ""), candidate)
    }

    return input.replace(/(^|[\s(])@([a-zA-Z0-9._-]+)/g, (full, prefix: string, raw: string) => {
      const key = raw.toLowerCase()
      const candidate = byToken.get(key)
      if (!candidate) return full
      return `${prefix}<@${candidate.id}|${candidate.label}>`
    })
  }

  private decodeMentionsForDisplay(input: string): string {
    return input
      .replace(/<@([^|>]+)\|([^>]+)>/g, (_match, _id: string, label: string) => `@${label}`)
      .replace(/<@(agent:[^>]+|human:[^>]+)>/g, (_match, id: string) => `@${this.mentionLabelById(id)}`)
      .replace(/\\([!'"$`])/g, "$1")
  }

  private parseSystemPresenceEvent(message: WorkspaceMessage): { name: string; action: "joined" | "left"; dna?: string } | null {
    if (message.kind !== "system") return null
    const text = (message.text || "").trim()
    const match = text.match(/^(.+?)\s+(joined|left)\b/i)
    if (!match) return null

    const name = (match[1] || "").trim()
    if (!name) return null

    const action = (match[2] || "").toLowerCase() as "joined" | "left"
    return {
      name,
      action,
      dna: this.resolveDnaByName(name),
    }
  }

  private normalizeInlineMarkdown(input: string): string {
    return input
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
  }

  private renderMarkdownBody(text: string, width: number): string[] {
    const safeWidth = Math.max(1, width)
    const out: string[] = []
    const sourceLines = text.replace(/\r\n/g, "\n").split("\n")
    let inCodeBlock = false

    for (const sourceLine of sourceLines) {
      const trimmed = sourceLine.trim()

      if (trimmed.startsWith("```")) {
        inCodeBlock = !inCodeBlock
        continue
      }

      if (inCodeBlock) {
        const chunks = chunkPlain(sourceLine.replace(/\t/g, "  "), safeWidth)
        for (const chunk of chunks) {
          out.push(`${FG_MD_CODE}${chunk}${ANSI_RESET}`)
        }
        continue
      }

      const headingMatch = sourceLine.match(/^\s{0,3}(#{1,6})\s+(.*)$/)
      if (headingMatch) {
        const headingText = this.normalizeInlineMarkdown(headingMatch[2] || "")
        const wrapped = wrapPlain(headingText, safeWidth)
        for (const segment of wrapped) {
          out.push(`${FG_MD_HEADING}\x1b[1m${segment}${ANSI_RESET}`)
        }
        continue
      }

      const quoteMatch = sourceLine.match(/^\s*>\s?(.*)$/)
      if (quoteMatch) {
        const quoted = this.normalizeInlineMarkdown(quoteMatch[1] || "")
        const wrapped = wrapPlain(quoted, Math.max(1, safeWidth - 2))
        for (const segment of wrapped) {
          out.push(`${FG_MD_QUOTE}▏ ${segment}${ANSI_RESET}`)
        }
        continue
      }

      const listMatch = sourceLine.match(/^\s*[-*+]\s+(.*)$/)
      if (listMatch) {
        const listed = this.normalizeInlineMarkdown(listMatch[1] || "")
        const wrapped = wrapPlain(listed, Math.max(1, safeWidth - 2))
        for (let index = 0; index < wrapped.length; index++) {
          const prefix = index === 0 ? "• " : "  "
          out.push(`${prefix}${wrapped[index]}`)
        }
        continue
      }

      const orderedMatch = sourceLine.match(/^\s*(\d+)\.\s+(.*)$/)
      if (orderedMatch) {
        const marker = `${orderedMatch[1]}. `
        const listed = this.normalizeInlineMarkdown(orderedMatch[2] || "")
        const wrapped = wrapPlain(listed, Math.max(1, safeWidth - marker.length))
        for (let index = 0; index < wrapped.length; index++) {
          const prefix = index === 0 ? marker : " ".repeat(marker.length)
          out.push(`${prefix}${wrapped[index]}`)
        }
        continue
      }

      const plain = this.normalizeInlineMarkdown(sourceLine)
      out.push(...wrapPlain(plain, safeWidth))
    }

    return out.length > 0 ? out : [""]
  }

  private renderMessageCard(
    message: WorkspaceMessage,
    maxWidth: number,
    indent = 0,
    options: MessageCardOptions = {},
  ): string[] {
    const minCardWidth = 20
    let frameInset = Math.max(0, indent)
    if (maxWidth - frameInset < minCardWidth) {
      frameInset = Math.max(0, maxWidth - minCardWidth)
    }
    const cardWidth = Math.max(minCardWidth, maxWidth - frameInset)
    const innerWidth = Math.max(8, cardWidth - 2)
    const contentInset = 1
    const contentWidth = Math.max(8, innerWidth - contentInset)
    const contentInsetPad = " ".repeat(contentInset)
    const frameInsetPad = " ".repeat(frameInset)

    const fromName = message.fromName || message.from || "unknown"
    const senderDna = this.resolvedSenderDna(message)
    const targetDna = this.resolvedTargetDna(message)
    const senderIsYou = this.isOperatorSender(message)
    const targetIsYou = this.isOperatorTarget(message)
    const details: string[] = []
    let dateTimeText = truncatePlain(new Date(message.ts).toLocaleString(), Math.min(28, contentWidth))
    let leftMaxWidth = contentWidth - dateTimeText.length - 1
    if (leftMaxWidth < 3) {
      dateTimeText = truncatePlain(dateTimeText, Math.max(4, contentWidth - 4))
      leftMaxWidth = contentWidth - dateTimeText.length - 1
    }
    leftMaxWidth = Math.max(3, leftMaxWidth)

    const presenceEvent = this.parseSystemPresenceEvent(message)

    let headerLeft = `${this.senderColorChip(message)} ${this.formatNameWithShortTitle(
      fromName,
      senderDna,
      Math.max(1, leftMaxWidth - 2),
      senderIsYou,
    )}`

    if (message.kind === "dm" && this.selectedThreadId === "activity") {
      const targetName = this.targetDisplayName(message)
      if (leftMaxWidth <= 10) {
        headerLeft = `${this.senderColorChip(message)} -> ${this.targetColorChip(message)}`
      } else {
        const fixedVisible = 8 // 2 chips + spaces + " -> "
        const namesBudget = Math.max(2, leftMaxWidth - fixedVisible)
        const fromBudget = Math.max(1, Math.floor(namesBudget * 0.45))
        const targetBudget = Math.max(1, namesBudget - fromBudget)
        const fromShort = this.formatNameWithShortTitle(fromName, senderDna, fromBudget, senderIsYou)
        const targetShort = this.formatNameWithShortTitle(targetName, targetDna, targetBudget, targetIsYou)
        headerLeft = `${this.senderColorChip(message)} ${fromShort} -> ${this.targetColorChip(message)} ${targetShort}`
      }
    } else if (message.kind === "chat") {
      details.push(`#${message.channel || "workspace"}`)
    } else if (presenceEvent) {
      // Render presence events on one compact row:
      // actor (+ muted short title) + action on the left, timestamp on the right.
      const maxActionWidth = Math.max(0, leftMaxWidth - 4) // reserve: "<chip> " + at least 1 char name
      const actionText = maxActionWidth > 0
        ? truncatePlain(presenceEvent.action, maxActionWidth)
        : ""
      const reservedLeft = 2 + (actionText.length > 0 ? actionText.length + 1 : 0) // "<chip> " + optional "action"
      const nameBudget = Math.max(1, leftMaxWidth - reservedLeft)
      const displayName = this.formatNameWithShortTitle(
        presenceEvent.name,
        presenceEvent.dna,
        nameBudget,
      )
      headerLeft = `${this.colorChipForDna(presenceEvent.dna)} ${displayName}${actionText ? `${FG_META} ${actionText}${ANSI_RESET}` : ""}`
    }

    const headerGap = Math.max(1, contentWidth - visibleLength(headerLeft) - dateTimeText.length)
    const header = `${headerLeft}${" ".repeat(headerGap)}${FG_META}${dateTimeText}${ANSI_RESET}`

    const bodyLines = presenceEvent
      ? []
      : this.renderMarkdownBody(this.decodeMentionsForDisplay(message.text || ""), contentWidth)
    const prependLines = options.prependLines ?? []
    const detailLines = details.map((d) => truncatePlain(d, contentWidth))
    const shouldAddBodyGap = !presenceEvent
      && (message.kind === "dm" || message.kind === "chat")
      && (prependLines.length > 0 || bodyLines.length > 0)
    const content = shouldAddBodyGap
      ? [header, ...detailLines, "", ...prependLines, ...bodyLines]
      : [header, ...detailLines, ...prependLines, ...bodyLines]
    const rows = content.length

    const borderColor = options.borderColor ?? FG_FRAME
    const borderless = options.borderless === true
    if (borderless) {
      const plainLines: string[] = []
      const sidePad = " "
      const leadPad = `${sidePad}${contentInsetPad}`
      for (let row = 0; row < rows; row++) {
        plainLines.push(`${frameInsetPad}${leadPad}${padAnsi(content[row] || "", contentWidth)}${sidePad}`)
      }
      return plainLines
    }

    const topBorder = `${frameInsetPad}${borderColor}${FRAME_TL}${FRAME_H.repeat(innerWidth)}${FRAME_TR}${ANSI_RESET}`
    const bottomBorder = `${frameInsetPad}${borderColor}${FRAME_BL}${FRAME_H.repeat(innerWidth)}${FRAME_BR}${ANSI_RESET}`
    const lines: string[] = [topBorder]

    for (let row = 0; row < rows; row++) {
      const textPart = padAnsi(`${contentInsetPad}${padAnsi(content[row] || "", contentWidth)}`, innerWidth)
      lines.push(`${frameInsetPad}${borderColor}${FRAME_V}${ANSI_RESET}${textPart}${borderColor}${FRAME_V}${ANSI_RESET}`)
    }

    lines.push(bottomBorder)
    return lines
  }

  private renderMessagesView(height: number, width: number): string[] {
    const maxVisibleWidth = Math.max(20, (this.stdout.columns || 120) - 1)
    const renderWidth = Math.max(20, Math.min(maxVisibleWidth, width + 3))
    const out: string[] = []
    const selectedDmThread = this.selectedDmThread()
    const noAgentsOnline = this.snapshot.agents.length > 0 && !this.snapshot.agents.some((agent) => agent.online)
    const showTypingFooter = this.selectedThreadId.startsWith("agent:") && Boolean(selectedDmThread?.typing)
    const typingFooter = showTypingFooter && selectedDmThread
      ? `${FG_META}  ${this.typingDots()}${ANSI_RESET}`
      : null
    const typingFooterPadRows = typingFooter ? 2 : 0

    const visible = this.snapshot.messages
      .filter((message) => this.isMessageInThread(message, this.selectedThreadId))

    if (visible.length === 0) {
      if (noAgentsOnline) {
        const bannerLines = [
          "Looks like no agent terminal is online yet.",
          "Run `termlings spawn` in another terminal.",
        ]
        const topPadding = Math.max(0, Math.floor((height - bannerLines.length) / 2))
        const bannerWidth = Math.max(1, width)
        for (let row = 0; row < topPadding && out.length < height; row++) {
          out.push("")
        }
        for (let index = 0; index < bannerLines.length && out.length < height; index++) {
          const text = truncatePlain(bannerLines[index]!, bannerWidth)
          const leftPad = Math.max(0, Math.floor((bannerWidth - text.length) / 2))
          const rightPad = Math.max(0, bannerWidth - leftPad - text.length)
          const color = index === 0 ? FG_META : FG_SUBTLE_HINT
          out.push(`${" ".repeat(leftPad)}${color}${text}${ANSI_RESET}${" ".repeat(rightPad)}`)
        }
      } else {
        const bannerLines = this.selectedThreadId === "activity"
          ? [
              "No messages yet.",
              'Start with @everyone or @agent below.',
            ]
          : [
              "No messages yet.",
              `Say hi to ${selectedDmThread?.label || "your teammate"} below.`,
            ]
        const topPadding = Math.max(0, Math.floor((height - bannerLines.length) / 2))
        const bannerWidth = Math.max(1, width)
        for (let row = 0; row < topPadding && out.length < height; row++) {
          out.push("")
        }
        for (let index = 0; index < bannerLines.length && out.length < height; index++) {
          const text = truncatePlain(bannerLines[index]!, bannerWidth)
          const leftPad = Math.max(0, Math.floor((bannerWidth - text.length) / 2))
          const rightPad = Math.max(0, bannerWidth - leftPad - text.length)
          const color = index === 0 ? FG_META : FG_SUBTLE_HINT
          out.push(`${" ".repeat(leftPad)}${color}${text}${ANSI_RESET}${" ".repeat(rightPad)}`)
        }
      }
      if (typingFooter && out.length < height) {
        out.push(typingFooter)
        for (let row = 0; row < typingFooterPadRows && out.length < height; row++) {
          out.push("")
        }
      }
      return out
    }

    const blocks = visible.map((message) => {
      const outgoing = this.isOutgoingDmInSelectedThread(message)
      return this.renderMessageCard(message, renderWidth, 0, outgoing ? { borderless: true } : {})
    })

    const flatBodyLines: string[] = []
    for (let index = 0; index < blocks.length; index++) {
      flatBodyLines.push(...blocks[index]!)
      if (index < blocks.length - 1) {
        for (let spacer = 0; spacer < CARD_SPACER_LINES; spacer++) {
          flatBodyLines.push("")
        }
      }
    }

    const footerRows = typingFooter ? 1 : 0
    const reservedFooterRows = footerRows + typingFooterPadRows
    const maxBodyLines = Math.max(1, height - out.length - reservedFooterRows)
    const maxOffset = Math.max(0, flatBodyLines.length - maxBodyLines)
    this.messageScrollMax = maxOffset
    if (this.messageScrollOffset > maxOffset) {
      this.messageScrollOffset = maxOffset
    }
    if (this.messageScrollOffset < 0) {
      this.messageScrollOffset = 0
    }

    const start = Math.max(0, flatBodyLines.length - maxBodyLines - this.messageScrollOffset)
    const end = Math.min(flatBodyLines.length, start + maxBodyLines)
    out.push(...flatBodyLines.slice(start, end))
    if (typingFooter && out.length < height) {
      out.push(typingFooter)
      for (let row = 0; row < typingFooterPadRows && out.length < height; row++) {
        out.push("")
      }
    }

    return out
  }

  private renderRequestsView(height: number, width: number): string[] {
    const out: string[] = []
    const cardWidth = Math.max(34, Math.min(width - 2, 96))
    const cardHorizontalPadding = 1
    const asText = (value: unknown): string => {
      if (typeof value === "string") return value
      if (value === null || value === undefined) return ""
      return String(value)
    }

    const pending = this.snapshot.requests.filter(r => r.status === "pending")
    const resolved = this.snapshot.requests.filter(r => r.status !== "pending").slice(0, 5)

    if (pending.length === 0 && resolved.length === 0) {
      return this.renderHeaderFrame([`${FG_META}No requests from agents.${ANSI_RESET}`], width)
    }

    const resolvedCount = this.snapshot.requests.filter(r => r.status !== "pending").length
    out.push(
      ...this.renderHeaderFrame(
        [`${FG_META}Pending ${pending.length} · Resolved ${resolvedCount}${ANSI_RESET}`],
        width,
      ),
    )
    out.push("")

    const selectedIndex = Math.max(0, Math.min(this.requestSelectionIndex, pending.length - 1))

    for (let i = 0; i < pending.length; i++) {
      const req = pending[i]!
      const selected = i === selectedIndex
      const from = this.requestSenderName(req)
      const senderDna = this.requestSenderDna(req)
      const senderChip = this.colorChipForDna(senderDna)
      const ago = Math.floor((Date.now() - req.ts) / 1000)
      const agoStr = ago < 60 ? `${ago}s` : ago < 3600 ? `${Math.floor(ago / 60)}m` : `${Math.floor(ago / 3600)}h`
      const borderColor = selected ? FG_SELECTED : FG_FRAME

      // Card label
      let icon = "req"
      let label = ""
      if (req.type === "env") {
        icon = "key"
        label = asText(req.varName)
      } else if (req.type === "confirm") {
        icon = "?"
        label = "Confirm"
      } else if (req.type === "choice") {
        icon = ">"
        label = "Choice"
      }

      // Build card content lines
      const innerWidth = Math.max(8, cardWidth - 2)
      const contentWidth = Math.max(1, innerWidth - (cardHorizontalPadding * 2))
      const content: string[] = []
      const pushWrapped = (text: unknown, options: { color?: string; prefix?: string } = {}): void => {
        const normalizedText = asText(text)
        const prefix = options.prefix ?? ""
        const color = options.color ?? ""
        const bodyWidth = Math.max(1, contentWidth - prefix.length)
        const wrapped = wrapPlain(normalizedText, bodyWidth)
        const continuationPrefix = " ".repeat(prefix.length)
        for (let index = 0; index < wrapped.length; index++) {
          const linePrefix = index === 0 ? prefix : continuationPrefix
          const plainLine = truncatePlain(`${linePrefix}${wrapped[index] ?? ""}`, contentWidth)
          if (color.length > 0) {
            content.push(`${color}${plainLine}${ANSI_RESET}`)
          } else {
            content.push(plainLine)
          }
        }
      }

      const agoLabel = contentWidth >= 12 ? `${agoStr} ago` : agoStr
      const chipPrefix = `${senderChip} `
      const chipPrefixWidth = visibleLength(chipPrefix)
      const leftBudget = Math.max(0, contentWidth - agoLabel.length - 1)
      let headerLeft = ""
      if (leftBudget > 0) {
        if (chipPrefixWidth >= leftBudget) {
          headerLeft = visibleLength(senderChip) <= leftBudget ? senderChip : ""
        } else {
          const maxNameWidth = Math.max(0, leftBudget - chipPrefixWidth)
          headerLeft = maxNameWidth > 0
            ? `${chipPrefix}${this.formatNameWithShortTitle(from, senderDna, maxNameWidth)}`
            : senderChip
        }
      }
      const headerGap = Math.max(0, contentWidth - visibleLength(headerLeft) - agoLabel.length)
      content.push(`${headerLeft}${" ".repeat(headerGap)}${FG_META}${agoLabel}${ANSI_RESET}`)
      content.push("")

      if (req.type === "env") {
        if (req.reason) pushWrapped(asText(req.reason), { color: FG_META, prefix: "Reason: " })
        if (req.url) pushWrapped(asText(req.url), { color: FG_META })
        if (selected && this.requestInputMode) {
          pushWrapped(`Value (saved to .env): ${this.requestInputDraft}█`, { color: FG_SELECTED })
        } else if (selected) {
          pushWrapped("Press Enter to set value", { color: FG_META })
        }
      } else if (req.type === "confirm") {
        pushWrapped(asText(req.question))
        if (selected && this.requestInputMode) {
          pushWrapped(`Type y/n: ${this.requestInputDraft}█`, { color: FG_SELECTED })
        } else if (selected) {
          pushWrapped("Press Enter to respond", { color: FG_META })
        }
      } else if (req.type === "choice") {
        pushWrapped(asText(req.question))
        if (req.options) {
          for (let j = 0; j < req.options.length; j++) {
            pushWrapped(asText(req.options[j]), { color: FG_META, prefix: `  ${j + 1}. ` })
          }
        }
        if (selected && this.requestInputMode) {
          pushWrapped(`Pick #: ${this.requestInputDraft}█`, { color: FG_SELECTED })
        } else if (selected) {
          pushWrapped("Press Enter to choose", { color: FG_META })
        }
      }

      // Render card with border
      const cardLabel = icon.length > 0 ? `${icon} ${label}` : label
      const labelTrimmed = truncatePlain(cardLabel, Math.max(0, innerWidth - 2))
      const labelUsed = visibleLength(labelTrimmed) + 2
      const dashCount = Math.max(0, innerWidth - labelUsed)
      out.push(` ${borderColor}${FRAME_TL} ${ANSI_RESET}${labelTrimmed}${borderColor} ${FRAME_H.repeat(dashCount)}${FRAME_TR}${ANSI_RESET}`)

      for (const line of content) {
        const textPart = padAnsi(line, contentWidth)
        out.push(
          ` ${borderColor}${FRAME_V}${ANSI_RESET}${" ".repeat(cardHorizontalPadding)}${textPart}${" ".repeat(cardHorizontalPadding)}${borderColor}${FRAME_V}${ANSI_RESET}`,
        )
      }

      out.push(` ${borderColor}${FRAME_BL}${FRAME_H.repeat(innerWidth)}${FRAME_BR}${ANSI_RESET}`)
      out.push("")
    }

    if (resolved.length > 0) {
      out.push(`${FG_META}  Resolved:${ANSI_RESET}`)
      const resolvedBodyWidth = Math.max(12, width - 8)
      for (const req of resolved) {
        const from = this.requestSenderName(req)
        const senderChip = this.colorChipForDna(this.requestSenderDna(req))
        const status = req.status === "resolved" ? "✓" : "✗"
        const response = asText(req.response) || "dismissed"
        let summary = ""
        if (req.type === "env") {
          const reasonSuffix = req.reason ? ` — ${asText(req.reason)}` : ""
          summary = `${from}: ${asText(req.varName)} -> set${reasonSuffix}`
        } else if (req.type === "confirm") {
          summary = `${from}: ${asText(req.question)} -> ${response}`
        } else if (req.type === "choice") {
          summary = `${from}: ${asText(req.question)} -> ${response}`
        }

        const wrapped = wrapPlain(summary, resolvedBodyWidth)
        const lead = `${status} ${senderChip} `
        const leadIndent = " ".repeat(visibleLength(`${status} ■ `))
        if (wrapped.length > 0) {
          out.push(`  ${FG_META}${lead}${wrapped[0] ?? ""}${ANSI_RESET}`)
          for (let index = 1; index < wrapped.length; index++) {
            out.push(`  ${FG_META}${leadIndent}${wrapped[index] ?? ""}${ANSI_RESET}`)
          }
        }
      }
    }

    return out
  }

  private pendingRequestCount(): number {
    return this.snapshot.requests.filter(r => r.status === "pending").length
  }

  private taskStatusColor(status: TaskStatus): string {
    if (status === "completed") return "\x1b[38;5;71m"
    if (status === "blocked") return "\x1b[38;5;203m"
    if (status === "in-progress") return "\x1b[38;5;220m"
    if (status === "claimed") return "\x1b[38;5;75m"
    return "\x1b[38;5;110m"
  }

  private taskPriorityColor(priority: TaskPriority): string {
    if (priority === "high") return "\x1b[38;5;203m"
    if (priority === "low") return "\x1b[38;5;109m"
    return "\x1b[38;5;180m"
  }

  private taskFilters(): Array<{ id: string; label: string; predicate: (task: Task) => boolean }> {
    return [
      { id: "all", label: "All", predicate: () => true },
      { id: "open", label: "Open", predicate: (task) => task.status === "open" },
      { id: "claimed", label: "Claimed", predicate: (task) => task.status === "claimed" },
      { id: "in-progress", label: "In-progress", predicate: (task) => task.status === "in-progress" },
      { id: "blocked", label: "Blocked", predicate: (task) => task.status === "blocked" },
      { id: "completed", label: "Completed", predicate: (task) => task.status === "completed" },
    ]
  }

  private calendarFilters(): Array<{ id: string; label: string; predicate: (event: CalendarEvent) => boolean }> {
    return [
      { id: "all", label: "All", predicate: () => true },
      { id: "enabled", label: "Enabled", predicate: (event) => event.enabled },
      { id: "disabled", label: "Disabled", predicate: (event) => !event.enabled },
      { id: "upcoming", label: "Upcoming", predicate: (event) => event.endTime >= Date.now() },
      { id: "past", label: "Past", predicate: (event) => event.endTime < Date.now() },
    ]
  }

  private stepTaskFilter(delta: number): void {
    if (this.view !== "tasks") return
    const filters = this.taskFilters()
    if (filters.length <= 1) return
    const next = this.taskFilterIndex + delta
    this.taskFilterIndex = ((next % filters.length) + filters.length) % filters.length
    this.taskScrollOffset = 0
  }

  private stepCalendarFilter(delta: number): void {
    if (this.view !== "calendar") return
    const filters = this.calendarFilters()
    if (filters.length <= 1) return
    const next = this.calendarFilterIndex + delta
    this.calendarFilterIndex = ((next % filters.length) + filters.length) % filters.length
    this.calendarScrollOffset = 0
  }

  private renderFilterLine(filters: Array<{ label: string }>, selectedIndex: number): string {
    const separator = `${FG_SUBTLE_HINT} · ${ANSI_RESET}`
    const chips = filters.map((filter, index) => {
      if (index === selectedIndex) {
        return `${FG_SELECTED}[${filter.label}]${ANSI_RESET}`
      }
      return `${FG_META}${filter.label}${ANSI_RESET}`
    })
    return `${FG_META}Filter:${ANSI_RESET} ${chips.join(separator)}`
  }

  private elapsedSince(ts: number): string {
    const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`
    if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`
    return `${Math.floor(seconds / 604_800)}w`
  }

  private durationLabel(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000))
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86_400)}d`
  }

  private dueLabel(task: Task): string {
    if (!task.dueDate) return `${FG_META}none${ANSI_RESET}`
    const due = new Date(task.dueDate)
    const dueText = due.toLocaleDateString()
    if (task.status === "completed") {
      return `${FG_META}${dueText} (done)${ANSI_RESET}`
    }

    const delta = task.dueDate - Date.now()
    if (delta < 0) {
      return `\x1b[38;5;203m${dueText} (${this.durationLabel(Math.abs(delta))} overdue)${ANSI_RESET}`
    }
    if (delta <= 86_400_000) {
      return `\x1b[38;5;220m${dueText} (in ${this.durationLabel(delta)})${ANSI_RESET}`
    }
    return `${FG_META}${dueText}${ANSI_RESET}`
  }

  private unresolvedDependencies(task: Task, taskById: Map<string, Task>): number {
    if (!task.blockedBy || task.blockedBy.length === 0) return 0
    let unresolved = 0
    for (const depId of task.blockedBy) {
      const dep = taskById.get(depId)
      if (!dep || dep.status !== "completed") {
        unresolved += 1
      }
    }
    return unresolved
  }

  private renderHeaderFrame(lines: string[], width: number, label = ""): string[] {
    // Non-message views render through panelBodyLine(), which adds one leading cell.
    // Body render width is already reduced upstream, so expand header frames here to match
    // the visual full-width span of the agent container frame.
    const frameWidth = Math.max(12, width + 3)
    const innerWidth = Math.max(1, frameWidth - 4)
    const out: string[] = [boxTop(frameWidth, label)]
    for (const line of lines) {
      out.push(boxAnsiLine(truncatePlain(line, innerWidth), frameWidth))
    }
    out.push(boxBottom(frameWidth))
    return out
  }

  private renderTaskCard(task: Task, cardWidth: number, taskById: Map<string, Task>): string[] {
    const out: string[] = []
    const borderColor = FG_FRAME
    const innerWidth = Math.max(12, cardWidth - 2)
    const statusTag = `${this.taskStatusColor(task.status)}${statusIcon(task.status)} ${task.status.toUpperCase()}${ANSI_RESET}`
    const priorityTag = `${this.taskPriorityColor(task.priority)}${task.priority.toUpperCase()}${ANSI_RESET}`
    const cardLabel = `${statusTag} ${FG_META}|${ANSI_RESET} ${priorityTag}`
    const labelUsed = visibleLength(cardLabel) + 2
    const dashCount = Math.max(0, innerWidth - labelUsed)

    out.push(` ${borderColor}${FRAME_TL} ${ANSI_RESET}${cardLabel}${borderColor} ${FRAME_H.repeat(dashCount)}${FRAME_TR}${ANSI_RESET}`)

    const details: string[] = []
    details.push(`\x1b[1m${truncatePlain(task.title || "(untitled task)", innerWidth)}\x1b[22m`)

    const owner = task.assignedTo ? `@${task.assignedTo}` : "unassigned"
    const metaLine = `Owner: ${owner} | Updated ${this.elapsedSince(task.updatedAt)} ago`
    details.push(`${FG_META}${truncatePlain(metaLine, innerWidth)}${ANSI_RESET}`)

    details.push(`${FG_META}Due:${ANSI_RESET} ${this.dueLabel(task)}`)

    const description = task.description.trim()
    if (description.length > 0) {
      const wrapped = wrapPlain(description, innerWidth)
      const firstPrefix = `${FG_META}Desc:${ANSI_RESET} `
      const firstWidth = Math.max(0, innerWidth - visibleLength(firstPrefix))
      const firstLine = wrapped[0] || ""
      details.push(`${firstPrefix}${truncatePlain(firstLine, firstWidth)}`)
      if (wrapped.length > 1) {
        const hidden = Math.max(0, wrapped.length - 2)
        const secondRaw = wrapped[1] || ""
        const secondSuffix = hidden > 0 ? ` (+${hidden} more)` : ""
        const secondWidth = Math.max(0, innerWidth - 6)
        details.push(`      ${truncatePlain(`${secondRaw}${secondSuffix}`, secondWidth)}`)
      }
    } else {
      details.push(`${FG_META}Desc:${ANSI_RESET} ${FG_META}none${ANSI_RESET}`)
    }

    const depCount = task.blockedBy?.length ?? 0
    const unresolved = this.unresolvedDependencies(task, taskById)
    const depLabel = depCount > 0 ? `${unresolved}/${depCount} open` : "none"
    details.push(`${FG_META}Deps:${ANSI_RESET} ${depLabel}  ${FG_META}Notes:${ANSI_RESET} ${task.notes.length}`)

    if (task.blockedOn && task.status === "blocked") {
      const blockedPrefix = `${FG_META}Blocked:${ANSI_RESET} `
      const blockedWidth = Math.max(0, innerWidth - visibleLength(blockedPrefix))
      details.push(`${blockedPrefix}${truncatePlain(task.blockedOn, blockedWidth)}`)
    }

    for (const line of details) {
      const textPart = padAnsi(line, innerWidth)
      out.push(` ${borderColor}${FRAME_V}${ANSI_RESET}${textPart}${borderColor}${FRAME_V}${ANSI_RESET}`)
    }

    out.push(` ${borderColor}${FRAME_BL}${FRAME_H.repeat(innerWidth)}${FRAME_BR}${ANSI_RESET}`)
    return out
  }

  private renderTasksView(height: number, width: number): string[] {
    const out: string[] = []
    const allTasks = [...this.snapshot.tasks].sort((a, b) => b.updatedAt - a.updatedAt)
    const taskById = new Map(allTasks.map(task => [task.id, task]))
    const filters = this.taskFilters()
    const safeFilterIndex = Math.max(0, Math.min(this.taskFilterIndex, filters.length - 1))
    this.taskFilterIndex = safeFilterIndex
    const activeFilter = filters[safeFilterIndex] ?? filters[0]
    const tasks = activeFilter ? allTasks.filter(activeFilter.predicate) : allTasks

    if (allTasks.length === 0) {
      return this.renderHeaderFrame([`${FG_META}No tasks created.${ANSI_RESET}`], width)
    }

    const counts = {
      open: allTasks.filter(task => task.status === "open").length,
      claimed: allTasks.filter(task => task.status === "claimed").length,
      inProgress: allTasks.filter(task => task.status === "in-progress").length,
      blocked: allTasks.filter(task => task.status === "blocked").length,
      completed: allTasks.filter(task => task.status === "completed").length,
    }
    const summary = `Open ${counts.open} · Claimed ${counts.claimed} · In-progress ${counts.inProgress} · Blocked ${counts.blocked} · Completed ${counts.completed}`
    out.push(
      ...this.renderHeaderFrame(
        [
          this.renderFilterLine(filters, safeFilterIndex),
          `${FG_META}${summary}${ANSI_RESET}`,
          `${FG_META}Showing ${tasks.length}/${allTasks.length}${ANSI_RESET}`,
        ],
        width,
      ),
    )
    out.push("")

    const cardWidth = Math.max(28, Math.min(width - 2, 96))
    const bodyLines: string[] = []
    if (tasks.length === 0) {
      bodyLines.push(`${FG_META}No tasks for this filter.${ANSI_RESET}`)
    }

    for (const task of tasks) {
      const cardLines = this.renderTaskCard(task, cardWidth, taskById)
      bodyLines.push(...cardLines)
      if (task !== tasks[tasks.length - 1]) {
        bodyLines.push("")
      }
    }

    const bodyHeight = Math.max(1, height - out.length)
    const maxOffset = Math.max(0, bodyLines.length - bodyHeight)
    this.taskScrollMax = maxOffset
    if (this.taskScrollOffset > maxOffset) this.taskScrollOffset = maxOffset
    if (this.taskScrollOffset < 0) this.taskScrollOffset = 0
    const start = Math.max(0, this.taskScrollOffset)
    const end = Math.min(bodyLines.length, start + bodyHeight)
    out.push(...bodyLines.slice(start, end))

    while (out.length < height) {
      out.push("")
    }

    return out
  }

  private calendarStatusColor(enabled: boolean): string {
    return enabled ? "\x1b[38;5;71m" : "\x1b[38;5;244m"
  }

  private calendarRecurrenceLabel(recurrence: CalendarRecurrence): string {
    if (recurrence === "none") return "one-time"
    if (recurrence === "hourly") return "hourly"
    if (recurrence === "daily") return "daily"
    if (recurrence === "weekly") return "weekly"
    return "monthly"
  }

  private calendarTimelineLabel(event: CalendarEvent): string {
    const now = Date.now()
    if (now < event.startTime) {
      return `${FG_META}Starts in ${this.durationLabel(event.startTime - now)}${ANSI_RESET}`
    }
    if (now <= event.endTime) {
      return `\x1b[38;5;220mLive now · ends in ${this.durationLabel(event.endTime - now)}${ANSI_RESET}`
    }
    return `${FG_META}Ended ${this.durationLabel(now - event.endTime)} ago${ANSI_RESET}`
  }

  private calendarNextNotificationLabel(event: CalendarEvent): string {
    if (typeof event.nextNotification !== "number" || !Number.isFinite(event.nextNotification)) {
      return `${FG_META}none${ANSI_RESET}`
    }
    const ts = event.nextNotification
    if (ts <= Date.now()) {
      return `${FG_META}${formatDateTime(ts)}${ANSI_RESET}`
    }
    return `${FG_META}${formatDateTime(ts)} (in ${this.durationLabel(ts - Date.now())})${ANSI_RESET}`
  }

  private renderCalendarCard(event: CalendarEvent, cardWidth: number): string[] {
    const out: string[] = []
    const borderColor = FG_FRAME
    const innerWidth = Math.max(12, cardWidth - 2)
    const statusText = event.enabled ? "✓ ENABLED" : "✕ DISABLED"
    const statusTag = `${this.calendarStatusColor(event.enabled)}${statusText}${ANSI_RESET}`
    const recurrenceTag = `${FG_META}${this.calendarRecurrenceLabel(event.recurrence)}${ANSI_RESET}`
    const cardLabel = `${statusTag} ${FG_META}|${ANSI_RESET} ${recurrenceTag}`
    const labelUsed = visibleLength(cardLabel) + 2
    const dashCount = Math.max(0, innerWidth - labelUsed)

    out.push(` ${borderColor}${FRAME_TL} ${ANSI_RESET}${cardLabel}${borderColor} ${FRAME_H.repeat(dashCount)}${FRAME_TR}${ANSI_RESET}`)

    const details: string[] = []
    details.push(`\x1b[1m${truncatePlain(event.title || "(untitled event)", innerWidth)}\x1b[22m`)

    details.push(`${FG_META}${truncatePlain(`${formatDateTime(event.startTime)} -> ${formatDateTime(event.endTime)}`, innerWidth)}${ANSI_RESET}`)
    details.push(this.calendarTimelineLabel(event))

    const assignees = event.assignedAgents
    if (assignees.length > 0) {
      const shown = assignees.slice(0, 3).map(agent => `@${agent}`).join(", ")
      const suffix = assignees.length > 3 ? ` (+${assignees.length - 3})` : ""
      details.push(`${FG_META}Agents:${ANSI_RESET} ${truncatePlain(`${shown}${suffix}`, Math.max(0, innerWidth - 8))}`)
    } else {
      details.push(`${FG_META}Agents:${ANSI_RESET} ${FG_META}none${ANSI_RESET}`)
    }

    const description = event.description.trim()
    if (description.length > 0) {
      const wrapped = wrapPlain(description, innerWidth)
      const firstPrefix = `${FG_META}Desc:${ANSI_RESET} `
      const firstWidth = Math.max(0, innerWidth - visibleLength(firstPrefix))
      const firstLine = wrapped[0] || ""
      details.push(`${firstPrefix}${truncatePlain(firstLine, firstWidth)}`)
      if (wrapped.length > 1) {
        const hidden = Math.max(0, wrapped.length - 2)
        const secondRaw = wrapped[1] || ""
        const secondSuffix = hidden > 0 ? ` (+${hidden} more)` : ""
        const secondWidth = Math.max(0, innerWidth - 6)
        details.push(`      ${truncatePlain(`${secondRaw}${secondSuffix}`, secondWidth)}`)
      }
    } else {
      details.push(`${FG_META}Desc:${ANSI_RESET} ${FG_META}none${ANSI_RESET}`)
    }

    details.push(`${FG_META}Next notify:${ANSI_RESET} ${this.calendarNextNotificationLabel(event)}`)

    for (const line of details) {
      const textPart = padAnsi(line, innerWidth)
      out.push(` ${borderColor}${FRAME_V}${ANSI_RESET}${textPart}${borderColor}${FRAME_V}${ANSI_RESET}`)
    }

    out.push(` ${borderColor}${FRAME_BL}${FRAME_H.repeat(innerWidth)}${FRAME_BR}${ANSI_RESET}`)
    return out
  }

  private refreshCalendarSchedulerStatus(now = Date.now()): void {
    const checkIntervalMs = 15_000
    if (this.calendarSchedulerCheckedAt > 0 && now - this.calendarSchedulerCheckedAt < checkIntervalMs) {
      return
    }

    this.calendarSchedulerCheckedAt = now

    try {
      const output = execSync("ps -axo command=", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      const lines = output.split("\n")
      this.calendarSchedulerRunning = lines.some((line) => {
        const normalized = line.trim().toLowerCase()
        if (!normalized) return false
        const looksLikeScheduler = normalized.includes("scheduler") && normalized.includes("--daemon")
        const looksLikeTermlings =
          normalized.includes("termlings")
          || normalized.includes("src/cli.ts")
          || normalized.includes("calendar-scheduler")
        return looksLikeScheduler && looksLikeTermlings
      })
    } catch {
      this.calendarSchedulerRunning = false
    }
  }

  private renderCalendarView(height: number, width: number): string[] {
    const out: string[] = []
    const allEvents = [...this.snapshot.calendarEvents].sort((a, b) => a.startTime - b.startTime)
    const filters = this.calendarFilters()
    const safeFilterIndex = Math.max(0, Math.min(this.calendarFilterIndex, filters.length - 1))
    this.calendarFilterIndex = safeFilterIndex
    const activeFilter = filters[safeFilterIndex] ?? filters[0]
    const events = activeFilter ? allEvents.filter(activeFilter.predicate) : allEvents

    if (allEvents.length === 0) {
      return this.renderHeaderFrame([`${FG_META}No calendar events scheduled.${ANSI_RESET}`], width)
    }

    const now = Date.now()
    const schedulerPlain = this.calendarSchedulerRunning
      ? "scheduler active"
      : "scheduler not active · run: termlings scheduler --daemon"
    const schedulerColor = this.calendarSchedulerRunning ? "\x1b[38;5;71m" : FG_META
    const schedulerLine = `${schedulerColor}● ${schedulerPlain}${ANSI_RESET}`

    const enabled = allEvents.filter(event => event.enabled).length
    const upcoming = allEvents.filter(event => event.endTime >= now).length
    const summary = `Enabled ${enabled}/${allEvents.length} · Upcoming ${upcoming} · Past ${Math.max(0, allEvents.length - upcoming)}`
    out.push(
      ...this.renderHeaderFrame(
        [
          this.renderFilterLine(filters, safeFilterIndex),
          schedulerLine,
          `${FG_META}${summary}${ANSI_RESET}`,
          `${FG_META}Showing ${events.length}/${allEvents.length}${ANSI_RESET}`,
        ],
        width,
      ),
    )
    out.push("")

    const cardWidth = Math.max(28, Math.min(width - 2, 96))
    const bodyLines: string[] = []
    if (events.length === 0) {
      bodyLines.push(`${FG_META}No events for this filter.${ANSI_RESET}`)
    }

    for (const event of events) {
      const cardLines = this.renderCalendarCard(event, cardWidth)
      bodyLines.push(...cardLines)
      if (event !== events[events.length - 1]) {
        bodyLines.push("")
      }
    }

    const bodyHeight = Math.max(1, height - out.length)
    const maxOffset = Math.max(0, bodyLines.length - bodyHeight)
    this.calendarScrollMax = maxOffset
    if (this.calendarScrollOffset > maxOffset) this.calendarScrollOffset = maxOffset
    if (this.calendarScrollOffset < 0) this.calendarScrollOffset = 0
    const start = Math.max(0, this.calendarScrollOffset)
    const end = Math.min(bodyLines.length, start + bodyHeight)
    out.push(...bodyLines.slice(start, end))

    while (out.length < height) {
      out.push("")
    }

    return out
  }

  private renderSettingsView(height: number, width: number): string[] {
    const items = this.settingsItems()
    const rows: string[] = []

    if (items.length === 0) {
      rows.push(`${FG_META}No settings available.${ANSI_RESET}`)
      return this.renderHeaderFrame(rows, width)
    }

    const selected = Math.max(0, Math.min(this.settingsSelectionIndex, items.length - 1))
    const maxRows = Math.max(1, height - 2) // reserve top+bottom frame rows
    let renderedItems = 0

    for (let index = 0; index < items.length && rows.length < maxRows; index++) {
      const item = items[index]!
      const prefix = index === selected ? "›" : " "
      const row = `${prefix} ${item.label}: ${item.value}`
      if (index === selected) {
        rows.push(`${FG_SELECTED}\x1b[1m${row}\x1b[22m${ANSI_RESET}`)
      } else {
        rows.push(row)
      }
      if (rows.length < maxRows) {
        rows.push(`${FG_META}  ${item.hint}${ANSI_RESET}`)
      }
      renderedItems = index + 1
    }

    const remainingItems = Math.max(0, items.length - renderedItems)
    if (remainingItems > 0 && rows.length < maxRows) {
      rows.push(`${FG_META}+${remainingItems} more setting${remainingItems === 1 ? "" : "s"}${ANSI_RESET}`)
    }

    return this.renderHeaderFrame(rows, width)
  }

  private renderAvatarStrip(width: number): string[] {
    const agents = this.snapshot.agents
    this.avatarVisibleAgentCount = 0
    this.avatarTotalAgentCount = agents.length
    if (agents.length === 0) {
      return ["Agents: none"]
    }

    const roomByDna = new Map<string, number>()
    for (let index = 0; index < this.snapshot.dmThreads.length; index++) {
      const thread = this.snapshot.dmThreads[index]!
      roomByDna.set(thread.dna, index + 2)
    }

    const sortedAgents = [...agents].sort((a, b) => {
      const aRoom = roomByDna.get(a.dna) ?? Number.MAX_SAFE_INTEGER
      const bRoom = roomByDna.get(b.dna) ?? Number.MAX_SAFE_INTEGER
      if (aRoom !== bRoom) return aRoom - bRoom
      return a.name.localeCompare(b.name)
    })
    const largeAvatars = this.avatarSizeMode === "large"
    const tinyAvatars = this.avatarSizeMode === "tiny"

    const skeletonColor = "\x1b[38;5;244m"
    // Keep "All Activity" logo always colored and static.
    const logoTalkFrame = 0
    const logoWalkFrame = 0
    const logoBw = false
    const logoLines = renderTermlingsLogo(logoBw, logoTalkFrame, logoWalkFrame).split("\n")
    const allActivityBlock: AvatarBlock = {
      kind: "activity",
      label: "All",
      displayLabel: "All",
      subtitle: "Activity",
      typing: false,
      lines: tinyAvatars
        ? [`${skeletonColor}▤${ANSI_RESET}`]
        : largeAvatars
          ? [
              `${skeletonColor}██  ████████████${ANSI_RESET}`,
              `${skeletonColor}██  ████████████${ANSI_RESET}`,
              `${skeletonColor}██  ████████████${ANSI_RESET}`,
              `${skeletonColor}██  ████████████${ANSI_RESET}`,
              `${skeletonColor}██  ████████████${ANSI_RESET}`,
            ]
          : logoLines,
      width: Math.max(...logoLines.map((l) => visibleLength(l)), "All".length, "Activity".length),
      selected: this.selectedThreadId === "activity",
    }

    const now = Date.now()
    const agentBlocks: AvatarBlock[] = sortedAgents.map((agent) => {
      const waveFrame = this.waveFrameForAgent(agent)
      const talkFrame = 0
      const baseAvatarLines = renderTerminalSmall(agent.dna, 0, !agent.online, talkFrame, waveFrame).split("\n")
      const largeFrame = waveFrame > 0 ? Math.floor(Date.now() / AVATAR_ANIM_MS) % 2 : 0
      const lines = tinyAvatars
        ? [agent.online ? this.colorChipForDna(agent.dna) : `${FG_META}■${ANSI_RESET}`]
        : largeAvatars
          ? renderTerminal(agent.dna, largeFrame, !agent.online, talkFrame, waveFrame).split("\n")
          : baseAvatarLines
      const label = agent.name
      const displayLabel = label
      const baseSubtitle = (agent.title_short || agent.title) || (!agent.online ? "offline" : "")
      const speaking = agent.online
        && (
          agent.typing
          || (this.talkUntilByDna.get(agent.dna) ?? 0) > now
        )
      const talkDots = speaking ? this.typingDots().padEnd(3, " ") : ""
      const subtitle = speaking
        ? `${baseSubtitle}${baseSubtitle.length > 0 ? " " : ""}${talkDots}`.trimEnd()
        : baseSubtitle
      const selected = this.isAgentThreadSelected(agent)
      const blockWidth = Math.max(
        ...lines.map((line) => visibleLength(line)),
        displayLabel.length,
        subtitle.length,
        1,
      )
      return {
        kind: "agent",
        label,
        displayLabel,
        subtitle,
        typing: speaking,
        lines,
        width: blockWidth,
        selected,
      }
    })

    // Large avatar mode: "All" header above + responsive grid + desk visual
    if (largeAvatars) {
      this.avatarVisibleAgentCount = agentBlocks.length
      const lines: string[] = []

      // "All Activity" header above the grid
      const allChip = allActivityBlock.selected ? `${FG_SELECTED}■${ANSI_RESET}` : `${FG_META}■${ANSI_RESET}`
      const allLabel = "All Activity"
      const allStyled = allActivityBlock.selected
        ? `${allChip} ${FG_SELECTED}${allLabel}${ANSI_RESET}`
        : `${allChip} ${FG_META}${allLabel}${ANSI_RESET}`
      lines.push(allStyled)
      lines.push("")


      // Lay out agents into responsive rows
      const gap = 2
      const gridRows: AvatarBlock[][] = []
      let currentRow: AvatarBlock[] = []
      let rowWidth = 0

      for (const block of agentBlocks) {
        const needed = block.width + (currentRow.length > 0 ? gap : 0)
        if (currentRow.length > 0 && rowWidth + needed > width) {
          gridRows.push(currentRow)
          currentRow = [block]
          rowWidth = block.width
        } else {
          currentRow.push(block)
          rowWidth += needed
        }
      }
      if (currentRow.length > 0) {
        gridRows.push(currentRow)
      }

      // Render each row of agents
      for (let rowIdx = 0; rowIdx < gridRows.length; rowIdx++) {
        const row = gridRows[rowIdx]!
        const maxAvatarHeight = Math.max(...row.map((b) => b.lines.length), 1)

        // Avatar + desk lines (vertically aligned from bottom)
        for (let r = 0; r < maxAvatarHeight; r++) {
          let line = ""
          for (let i = 0; i < row.length; i++) {
            const block = row[i]!
            const offset = maxAvatarHeight - block.lines.length
            const piece = r >= offset ? (block.lines[r - offset] ?? "") : ""
            line += padAnsi(piece, block.width)
            if (i < row.length - 1) line += "  "
          }
          lines.push(line)
        }

        // Name labels
        let labelLine = ""
        for (let i = 0; i < row.length; i++) {
          const block = row[i]!
          const labelText = fitPlain(truncatePlain(block.displayLabel, block.width), block.width)
          const styled = block.selected ? `${FG_SELECTED}${labelText}${ANSI_RESET}` : labelText
          labelLine += padAnsi(styled, block.width)
          if (i < row.length - 1) labelLine += "  "
        }
        lines.push(labelLine)

        // Subtitle/title labels
        let subtitleLine = ""
        for (let i = 0; i < row.length; i++) {
          const block = row[i]!
          const subtitleText = fitPlain(truncatePlain(block.subtitle, block.width), block.width)
          const styled = block.subtitle.length > 0
            ? block.selected
              ? `${FG_SELECTED}${subtitleText}${ANSI_RESET}`
              : `${FG_META}${subtitleText}${ANSI_RESET}`
            : " ".repeat(block.width)
          subtitleLine += padAnsi(styled, block.width)
          if (i < row.length - 1) subtitleLine += "  "
        }
        lines.push(subtitleLine)

        // Spacer between rows (not after last row)
        if (rowIdx < gridRows.length - 1) {
          lines.push("")
        }
      }

      return lines
    }

    // Standard layout (small/tiny): single row with "All" inline
    const blocks: AvatarBlock[] = [allActivityBlock, ...agentBlocks]
    const shown = this.computeAvatarViewport(blocks, width)
    this.avatarVisibleAgentCount = shown.filter((block) => block.kind === "agent").length

    const avatarHeight = Math.max(...shown.map((block) => block.lines.length), 1)
    const lines: string[] = []

    for (let row = 0; row < avatarHeight; row++) {
      let line = ""
      for (let index = 0; index < shown.length; index++) {
        const block = shown[index]!
        const offset = avatarHeight - block.lines.length
        const piece = row >= offset ? (block.lines[row - offset] ?? "") : ""
        line += padAnsi(piece, block.width)
        if (index < shown.length - 1) {
          line += "  "
        }
      }
      lines.push(line)
    }

    let labels = ""
    for (let index = 0; index < shown.length; index++) {
      const block = shown[index]!
      const labelText = fitPlain(truncatePlain(block.displayLabel, block.width), block.width)
      const styledLabel = block.selected ? `${FG_SELECTED}${labelText}${ANSI_RESET}` : labelText
      labels += padAnsi(styledLabel, block.width)
      if (index < shown.length - 1) {
        labels += "  "
      }
    }
    lines.push(labels)

    let subtitles = ""
    for (let index = 0; index < shown.length; index++) {
      const block = shown[index]!
      const subtitleText = fitPlain(truncatePlain(block.subtitle, block.width), block.width)
      const styledSubtitle = block.subtitle.length > 0
        ? block.selected
          ? `${FG_SELECTED}${subtitleText}${ANSI_RESET}`
          : `${FG_META}${subtitleText}${ANSI_RESET}`
        : " ".repeat(block.width)
      subtitles += padAnsi(styledSubtitle, block.width)
      if (index < shown.length - 1) {
        subtitles += "  "
      }
    }
    lines.push(subtitles)

    return lines
  }

  private computeAvatarViewport(blocks: AvatarBlock[], width: number): AvatarBlock[] {
    if (blocks.length === 0) return []

    const gap = 2
    const selectedIndex = Math.max(0, blocks.findIndex((block) => block.selected))
    let left = selectedIndex
    let right = selectedIndex
    let usedWidth = blocks[selectedIndex]!.width
    let leftSpan = usedWidth / 2
    let rightSpan = usedWidth / 2

    while (true) {
      const leftCandidate = left - 1
      const rightCandidate = right + 1

      const canAddLeft = leftCandidate >= 0 && usedWidth + gap + blocks[leftCandidate]!.width <= width
      const canAddRight = rightCandidate < blocks.length && usedWidth + gap + blocks[rightCandidate]!.width <= width

      if (!canAddLeft && !canAddRight) break

      if (canAddLeft && !canAddRight) {
        const nextWidth = gap + blocks[leftCandidate]!.width
        usedWidth += nextWidth
        leftSpan += nextWidth
        left = leftCandidate
        continue
      }

      if (!canAddLeft && canAddRight) {
        const nextWidth = gap + blocks[rightCandidate]!.width
        usedWidth += nextWidth
        rightSpan += nextWidth
        right = rightCandidate
        continue
      }

      const nextLeftWidth = gap + blocks[leftCandidate]!.width
      const nextRightWidth = gap + blocks[rightCandidate]!.width
      const leftImbalance = Math.abs((leftSpan + nextLeftWidth) - rightSpan)
      const rightImbalance = Math.abs(leftSpan - (rightSpan + nextRightWidth))

      if (leftImbalance <= rightImbalance) {
        usedWidth += nextLeftWidth
        leftSpan += nextLeftWidth
        left = leftCandidate
      } else {
        usedWidth += nextRightWidth
        rightSpan += nextRightWidth
        right = rightCandidate
      }
    }

    return blocks.slice(left, right + 1)
  }

  private renderBody(height: number, width: number): string[] {
    if (this.view === "messages") {
      return this.renderMessagesView(height, width)
    }

    if (this.view === "requests") {
      return this.renderRequestsView(height, width)
    }

    if (this.view === "tasks") {
      return this.renderTasksView(height, width)
    }

    if (this.view === "settings") {
      return this.renderSettingsView(height, width)
    }

    return this.renderCalendarView(height, width)
  }

  private renderPrompt(width: number): [string, boolean] {
    if (this.view === "messages" && this.draft.length === 0) {
      if (this.selectedThreadId === "activity") {
        return ['Write "@everyone" or "@agent" to send DM', true]
      }
      if (this.selectedThreadId.startsWith("agent:")) {
        return [`Message ${this.threadLabel(this.selectedThreadId)}...`, true]
      }
    }

    const placeholder = !this.inputFocused && this.isComposerAvailable()
      ? "Press Enter or type to focus..."
      : this.view === "messages"
        ? this.selectedThreadId === "activity"
          ? "Send DM: @everyone or @agent your message..."
          : `Message ${this.threadLabel(this.selectedThreadId)}...`
        : "Switch to Chat to send"

    const body = this.draft.length > 0
      ? this.draft
      : this.inputFocused && this.isComposerAvailable()
        ? ""
        : placeholder

    return [body, this.draft.length === 0]
  }

  private renderComposerLines(width: number, body: string, isPlaceholder: boolean): string[] {
    const cursor = this.shouldShowComposerCursor()
      ? this.cursorBlinkVisible
        ? `${FG_CURSOR_BLOCK}█${FG_INPUT}`
        : " "
      : ""
    const cursorIndex = !isPlaceholder ? this.draftCursorIndex : undefined

    if (isPlaceholder) {
      return [composerInputBar(" ❯ ", body, width, true, cursor, cursorIndex)]
    }

    const segments = this.wrappedDraftSegments(width)

    let cursorLineIndex = Math.max(0, segments.length - 1)
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!
      if ((cursorIndex ?? 0) <= segment.end) {
        cursorLineIndex = index
        break
      }
    }

    return segments.map((segment, index) => {
      if (index !== cursorLineIndex) {
        return composerInputBar(segment.prefix, segment.text, width, false)
      }
      const segmentCursorIndex = Math.max(0, (cursorIndex ?? 0) - segment.start)
      return composerInputBar(
        segment.prefix,
        segment.text,
        width,
        false,
        cursor,
        segmentCursorIndex,
      )
    })
  }

  private shouldShowComposerCursor(): boolean {
    if (!this.inputFocused) return false
    if (this.view !== "messages") return false
    if (this.selectedThreadId === "activity") return true
    if (!this.isComposerAvailable()) return false
    return true
  }

  private renderMentionSuggestions(width: number): string[] {
    const mention = this.getMentionMenuState()
    if (!mention) return []

    if (mention.candidates.length === 0) {
      return [
        `${BG_INPUT_PANEL}${FG_META}${fitPlain(`   no matches for @${mention.query}`, width)}${ANSI_RESET}`,
      ]
    }

    const maxRows = 3
    const selected = Math.max(0, Math.min(this.mentionSelectionIndex, mention.candidates.length - 1))
    const windowStart = Math.max(0, Math.min(selected - maxRows + 1, mention.candidates.length - maxRows))
    const shown = mention.candidates.slice(windowStart, windowStart + maxRows)

    return shown.map((candidate, offset) => {
      const absoluteIndex = windowStart + offset
      const active = absoluteIndex === selected
      const subtitle = candidate.subtitle ? ` · ${candidate.subtitle}` : ""
      const tokenLooksLikeLabel =
        candidate.insertText.slice(1).toLowerCase() === candidate.label.toLowerCase().replace(/\s+/g, "")
      const labelPart = tokenLooksLikeLabel ? "" : `  ${candidate.label}`
      const chip = this.mentionCandidateColorChip(candidate)
      const showChip = width >= 2
      const chipChunk = showChip ? ` ${chip}${BG_INPUT_PANEL}` : ""
      const chipWidth = showChip ? 2 : 0
      const textWidth = Math.max(0, width - chipWidth)
      const prefixText = `   ${active ? "›" : " "} ${candidate.insertText}${labelPart}`
      const titleText = subtitle

      let remaining = textWidth
      const shownPrefix = truncatePlain(prefixText, remaining)
      remaining = Math.max(0, remaining - shownPrefix.length)
      const shownTitle = remaining > 0 ? truncatePlain(titleText, remaining) : ""
      remaining = Math.max(0, remaining - shownTitle.length)
      const padding = " ".repeat(remaining)

      if (active) {
        return `${BG_INPUT_PANEL}${FG_SELECTED}\x1b[1m${shownPrefix}\x1b[22m${chipChunk}${FG_SUBTLE_HINT}${shownTitle}${padding}${ANSI_RESET}`
      }
      return `${BG_INPUT_PANEL}${FG_META}${shownPrefix}${chipChunk}${FG_SUBTLE_HINT}${shownTitle}${padding}${ANSI_RESET}`
    })
  }

  private renderBottomTabs(width: number): string {
    const leftPad = "  "
    const reqCount = this.pendingRequestCount()
    const tabs: Array<{ view: MainView; label: string }> = [
      { view: "messages", label: "Chat" },
      { view: "requests", label: "Requests" },
      { view: "tasks", label: "Tasks" },
      { view: "calendar", label: "Calendar" },
      { view: "settings", label: "Settings" },
    ]

    const leftBracket = `${FG_META}[${ANSI_RESET}`
    const rightBracket = `${FG_META}]${ANSI_RESET}`
    const rendered = tabs
      .map((tab, index) => {
        const selected = this.view === tab.view
        const shortcut = selected
          ? `\x1b[38;5;255m${index + 1}${ANSI_RESET}`
          : `\x1b[38;5;244m${index + 1}${ANSI_RESET}`
        const numberToken = `${leftBracket}${shortcut}${rightBracket}`
        const requestBadge = tab.view === "requests" && reqCount > 0
          ? ` \x1b[48;5;160m\x1b[38;5;231m ${reqCount} ${ANSI_RESET}`
          : ""
        if (selected) {
          return `${numberToken} ${FG_ACTIVE}\x1b[1m${tab.label}\x1b[22m${ANSI_RESET}${requestBadge}`
        }
        return `${numberToken} ${FG_SUBTLE_HINT}${tab.label}${ANSI_RESET}${requestBadge}`
      })
      .join("  ")
    const left = `${leftPad}${rendered}`
    return padAnsi(left, width)
  }

  private renderFooterLeftMeta(): string {
    const project = basename(this.root || process.cwd())
    const projectPrefix = project.length > 0 ? `${project} / ` : ""

    if (this.view === "messages") {
      return `${projectPrefix}${this.threadLabel(this.selectedThreadId)}`
    }

    if (this.view === "requests") {
      return `${projectPrefix}requests`
    }

    if (this.view === "settings") {
      return `${projectPrefix}settings`
    }

    if (this.view === "tasks") {
      return `${projectPrefix}tasks`
    }

    if (this.view === "calendar") {
      return `${projectPrefix}calendar`
    }

    return project
  }

  private renderFooterRightMeta(): string {
    if (this.view === "messages") {
      return `${this.messageScrollOffset}/${this.messageScrollMax} ↑/↓`
    }

    if (this.view === "requests") {
      return "↑/↓ select | Enter respond"
    }

    if (this.view === "settings") {
      return "↑/↓ select | Enter toggle"
    }

    if (this.view === "tasks") {
      return `${this.taskScrollOffset}/${this.taskScrollMax} ↑/↓`
    }

    if (this.view === "calendar") {
      return `${this.calendarScrollOffset}/${this.calendarScrollMax} ↑/↓`
    }

    return ""
  }

  private renderFooterMetaBar(width: number): string {
    const leftRaw = this.renderFooterLeftMeta()
    const rightRaw = this.renderFooterRightMeta()
    if (!leftRaw && !rightRaw) return " ".repeat(Math.max(0, width))

    const leftPrefix = leftRaw ? ` ${leftRaw}` : ""
    const rightText = rightRaw ? ` ${rightRaw}` : ""
    const minGap = 2
    const leftLen = leftPrefix.length
    const rightLen = rightText.length
    const availableForLeft = Math.max(0, width - rightLen - minGap)
    const shownLeft = truncatePlain(leftPrefix, availableForLeft)
    const gap = Math.max(0, width - shownLeft.length - rightLen)
    const line = `${FG_SUBTLE_HINT}${shownLeft}${" ".repeat(gap)}${rightText}${ANSI_RESET}`
    return padAnsi(line, width)
  }

  private render(): void {
    if (!this.running) return

    // Throttle: if a render was very recent, schedule one on next tick instead
    const now = Date.now()
    if (now - this.lastRenderTime < 16) { // ~60fps cap
      if (!this.renderScheduled) {
        this.renderScheduled = true
        queueMicrotask(() => {
          this.renderScheduled = false
          this.renderImmediate()
        })
      }
      return
    }
    this.renderImmediate()
  }

  private renderImmediate(): void {
    if (!this.running) return
    this.lastRenderTime = Date.now()

    const width = Math.max(this.stdout.columns || 120, 40)
    const height = Math.max(this.stdout.rows || 30, 18)

    const topPadRows = 1
    const headerLines: string[] = []
    for (let index = 0; index < topPadRows; index++) {
      headerLines.push(" ".repeat(Math.max(0, width)))
    }
    headerLines.push(this.renderBottomTabs(width))

    const showAgents = this.view === "messages"
    let avatarContentLines = showAgents ? this.renderAvatarStrip(Math.max(0, width - 4)) : []
    const selectedDmThread = this.view === "messages" ? this.selectedDmThread() : null
    const showOfflineJoinHint = Boolean(selectedDmThread && !selectedDmThread.online)
    const showRequestsNavigator = this.view === "requests"
    const showScrollToBottomHint = this.view === "messages" && this.messageScrollOffset > 0
    const showComposer = !showOfflineJoinHint && !showRequestsNavigator && this.view !== "settings"
    const mentionSuggestionLines = showComposer ? this.renderMentionSuggestions(width) : []
    const [promptLine, isPlaceholder] = this.renderPrompt(width)
    const composerLines = showComposer ? this.renderComposerLines(width, promptLine, isPlaceholder) : []
    const showPromptArea = showOfflineJoinHint || showComposer
    const inputPadTopRows = showPromptArea ? (showRequestsNavigator ? 0 : 1) : 0
    const inputPadBottomRows = showPromptArea ? 1 : 0
    const inputMarginBottomRows = 0
    const promptContentRows = showPromptArea
      ? (showComposer ? composerLines.length + mentionSuggestionLines.length : 1)
      : 0
    const promptBoxHeight = inputPadTopRows + promptContentRows + inputPadBottomRows + inputMarginBottomRows
    const minBodyBoxHeight = 8
    const showAvatarCountHint = showAgents && this.avatarTotalAgentCount > 0
    if (showAgents) {
      while (
        headerLines.length + promptBoxHeight + (avatarContentLines.length + 2) + minBodyBoxHeight > height
        && avatarContentLines.length > 1
      ) {
        avatarContentLines = avatarContentLines.slice(0, -1)
      }
    }

    const agentsSectionHeight = showAgents ? avatarContentLines.length + 2 : 0

    const bodyBoxHeight = Math.max(
      minBodyBoxHeight,
      height - headerLines.length - promptBoxHeight - agentsSectionHeight,
    )
    const bodyContentHeight = Math.max(1, bodyBoxHeight - 2)
    const bodyLines = this.renderBody(bodyContentHeight, Math.max(0, width - 4))

    const lines: string[] = []
    lines.push(...headerLines)

    if (showAgents) {
      if (!showAvatarCountHint) {
        lines.push(boxTop(width, ""))
      } else {
        const countHintText = `(${this.avatarVisibleAgentCount}/${this.avatarTotalAgentCount})`
        const hintText = `←/→ ${countHintText}`
        const hint = `${FG_SUBTLE_HINT}${hintText}${ANSI_RESET}`
        const hintLen = hintText.length
        const innerWidth = Math.max(0, width - 2)
        const dashLeft = Math.max(0, innerWidth - hintLen - 2)
        lines.push(`${FG_FRAME}${FRAME_TL}${FRAME_H.repeat(dashLeft)} ${ANSI_RESET}${hint}${FG_FRAME} ${FRAME_TR}${ANSI_RESET}`)
      }
      for (const avatarLine of avatarContentLines) {
        lines.push(boxAnsiLine(avatarLine, width))
      }
      lines.push(boxBottom(width))
    }

    const trimmedBody = bodyLines.slice(-bodyContentHeight)
    const messageView = this.view === "messages"
    for (const line of trimmedBody) {
      if (messageView) {
        lines.push(padAnsi(line, width))
      } else {
        lines.push(panelBodyLine(line, width))
      }
    }
    const targetBodyEnd = headerLines.length + agentsSectionHeight + bodyContentHeight
    while (lines.length < targetBodyEnd) {
      if (messageView) {
        lines.push(" ".repeat(Math.max(0, width)))
      } else {
        lines.push(panelBodyLine("", width))
      }
    }
    const dividerWidth = Math.max(0, width)
    if (showScrollToBottomHint && dividerWidth > 0) {
      const hintPlain = "(b) Scroll to bottom"
      if (hintPlain.length <= dividerWidth) {
        const padLeft = Math.max(0, Math.floor((dividerWidth - hintPlain.length) / 2))
        const padRight = Math.max(0, dividerWidth - padLeft - hintPlain.length)
        lines.push(`${" ".repeat(padLeft)}${FG_SUBTLE_HINT}${hintPlain}${ANSI_RESET}${" ".repeat(padRight)}`)
      } else {
        lines.push(" ".repeat(dividerWidth))
      }
    } else {
      lines.push(" ".repeat(dividerWidth))
    }

    if (showPromptArea) {
      const promptBg = showOfflineJoinHint ? BG_OFFLINE_PANEL : BG_INPUT_PANEL
      for (let index = 0; index < inputPadTopRows; index++) {
        lines.push(grayBar("", width, promptBg))
      }
      if (showOfflineJoinHint && selectedDmThread) {
        lines.push(offlineBar(` ${selectedDmThread.label} is offline. Run \`termlings spawn\` in another terminal.`, width))
      } else if (showComposer) {
        lines.push(...composerLines)
        lines.push(...mentionSuggestionLines)
      }
      for (let index = 0; index < inputPadBottomRows; index++) {
        lines.push(grayBar("", width, promptBg))
      }
    }
    for (let index = 0; index < inputMarginBottomRows; index++) {
      if (index === 0 && this.showStartupBanner()) {
        lines.push(`${BG_INPUT_PANEL}\x1b[38;5;223m${fitPlain(` ${this.startupBanner}`, width)}${ANSI_RESET}`)
      } else {
        lines.push("")
      }
    }
    while (lines.length < height) {
      lines.push("")
    }
    if (height > 0) {
      lines[height - 1] = this.renderFooterMetaBar(width)
    }

    // Overwrite in-place: move to home, write each line with clear-to-EOL.
    // This avoids the full screen clear that causes flicker.
    const frame = lines.slice(0, height)
    const buf: string[] = ["\x1b[H"] // cursor home
    for (let i = 0; i < frame.length; i++) {
      buf.push(frame[i]!)
      buf.push("\x1b[K") // clear rest of line
      if (i < frame.length - 1) {
        buf.push("\n")
      }
    }
    this.stdout.write(buf.join(""))
  }
}

export async function launchWorkspaceTui(root = process.cwd(), options: WorkspaceTuiOptions = {}): Promise<never> {
  const app = new WorkspaceTui(root, options)
  return app.run()
}
