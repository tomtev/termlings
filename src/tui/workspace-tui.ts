import { basename } from "path"

import { discoverLocalAgents } from "../agents/discover.js"
import { getAllCalendarEvents, type CalendarEvent } from "../engine/calendar.js"
import { writeMessages } from "../engine/ipc.js"
import { getAllTasks, type Task } from "../engine/tasks.js"
import { renderTerminalSmall } from "../index.js"
import {
  appendWorkspaceMessage,
  ensureWorkspaceDirs,
  listSessions,
  readSession,
  readWorkspaceMessages,
  removeSession,
  upsertSession,
  type WorkspaceMessage,
  type WorkspaceSession,
} from "../workspace/state.js"

type MainView = "messages" | "inbox" | "tasks" | "calendar"

interface Identity {
  sessionId: string
  name: string
  dna: string
  ephemeral: boolean
}

interface AgentPresence {
  dna: string
  name: string
  online: boolean
}

interface DmThread {
  id: string // agent:<dna>
  dna: string
  label: string
  online: boolean
}

interface Snapshot {
  sessions: WorkspaceSession[]
  messages: WorkspaceMessage[]
  tasks: Task[]
  calendarEvents: CalendarEvent[]
  agents: AgentPresence[]
  dmThreads: DmThread[]
  generatedAt: number
}

interface AvatarBlock {
  label: string
  lines: string[]
  width: number
}

const ANSI_REGEX = /\u001B\[[0-9;?]*[ -/]*[@-~]/g
const REFRESH_MS = 1_000
const HEARTBEAT_MS = 10_000

function visibleLength(input: string): number {
  return input.replace(ANSI_REGEX, "").length
}

function padAnsi(input: string, width: number): string {
  const len = visibleLength(input)
  if (len >= width) return input
  return `${input}${" ".repeat(width - len)}`
}

function truncatePlain(input: string, maxWidth: number): string {
  if (maxWidth <= 0) return ""
  if (input.length <= maxWidth) return input
  if (maxWidth <= 1) return input.slice(0, maxWidth)
  return `${input.slice(0, maxWidth - 1)}…`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

function isHumanAddress(id?: string): boolean {
  if (!id) return false
  return id === "owner" || id === "operator" || id.startsWith("human:")
}

function statusIcon(status: string): string {
  if (status === "completed") return "✓"
  if (status === "blocked") return "!"
  if (status === "in-progress") return "~"
  if (status === "claimed") return "•"
  return "○"
}

class WorkspaceTui {
  private readonly root: string

  private readonly stdin = process.stdin

  private readonly stdout = process.stdout

  private readonly identity: Identity

  private view: MainView = "messages"

  private selectedThreadId = "activity"

  private draft = ""

  private statusMessage = "Ready"

  private snapshot: Snapshot = {
    sessions: [],
    messages: [],
    tasks: [],
    calendarEvents: [],
    agents: [],
    dmThreads: [],
    generatedAt: Date.now(),
  }

  private running = false

  private refreshing = false

  private sending = false

  private refreshTimer: ReturnType<typeof setInterval> | null = null

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  private readonly onDataBound: (chunk: Buffer | string) => void

  private readonly onResizeBound: () => void

  private readonly onSigIntBound: () => void

  private readonly onSigTermBound: () => void

  constructor(root = process.cwd()) {
    this.root = root
    ensureWorkspaceDirs(this.root)

    const envSessionId = process.env.TERMLINGS_SESSION_ID
    const identity: Identity = {
      sessionId: envSessionId || `tl-tui-${Math.random().toString(16).slice(2, 10)}`,
      name: process.env.TERMLINGS_AGENT_NAME || "Operator",
      dna: process.env.TERMLINGS_AGENT_DNA || "0000000",
      ephemeral: !envSessionId,
    }

    this.identity = identity
    upsertSession(
      identity.sessionId,
      {
        name: identity.name,
        dna: identity.dna,
      },
      this.root,
    )

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

  async run(): Promise<never> {
    if (!this.stdout.isTTY || !this.stdin.isTTY) {
      console.error("TUI requires an interactive terminal (TTY).")
      process.exit(1)
    }

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

    await new Promise(() => {})
  }

  private enterScreen(): void {
    this.stdout.write("\x1b[?1049h") // alternate screen
    this.stdout.write("\x1b[2J\x1b[H")
    this.stdout.write("\x1b[?25l") // hide cursor
    this.stdin.setRawMode(true)
    this.stdin.resume()
    this.stdin.setEncoding("utf8")
  }

  private leaveScreen(): void {
    try {
      this.stdout.write("\x1b[?25h") // show cursor
      this.stdout.write("\x1b[?1049l") // leave alternate screen
      this.stdin.setRawMode(false)
      this.stdin.pause()
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

    this.stdin.off("data", this.onDataBound)
    this.stdout.off("resize", this.onResizeBound)
    process.off("SIGINT", this.onSigIntBound)
    process.off("SIGTERM", this.onSigTermBound)

    if (this.identity.ephemeral) {
      removeSession(this.identity.sessionId, this.root)
    }

    this.leaveScreen()
    process.exit(code)
  }

  private async handleInput(input: string): Promise<void> {
    if (!input) return

    if (input === "\u0003") {
      this.stop(0)
      return
    }

    if (input === "\r" || input === "\n") {
      await this.submitDraft()
      this.render()
      return
    }

    if (input === "\x7f") {
      this.draft = this.draft.slice(0, -1)
      this.render()
      return
    }

    if (input === "\t") {
      this.cycleDmThread()
      this.render()
      return
    }

    // Ignore arrow/function key escape sequences.
    if (input.startsWith("\u001b[")) {
      return
    }

    for (const ch of input) {
      if (ch === "\u0003") {
        this.stop(0)
        return
      }

      if (ch === "\r" || ch === "\n") {
        await this.submitDraft()
        continue
      }

      if (ch === "\x7f") {
        this.draft = this.draft.slice(0, -1)
        continue
      }

      if (this.draft.length === 0) {
        const lower = ch.toLowerCase()
        if (lower === "q") {
          this.stop(0)
          return
        }

        if (lower === "m") {
          this.view = "messages"
          continue
        }

        if (lower === "i") {
          this.view = "inbox"
          continue
        }

        if (lower === "t") {
          this.view = "tasks"
          continue
        }

        if (lower === "c") {
          this.view = "calendar"
          continue
        }

        if (this.view === "messages" && ch >= "1" && ch <= "9") {
          this.selectMessageRoomByNumber(Number.parseInt(ch, 10))
          continue
        }
      }

      if (ch >= " " && ch <= "~") {
        this.draft += ch
      }
    }

    this.render()
  }

  private cycleDmThread(): void {
    if (this.view !== "messages") return

    const rooms = ["activity", ...this.snapshot.dmThreads.map((thread) => thread.id)]
    if (rooms.length <= 1) return

    const currentIndex = rooms.findIndex((id) => id === this.selectedThreadId)
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % rooms.length : 0
    this.selectedThreadId = rooms[nextIndex]!
  }

  private selectMessageRoomByNumber(roomNumber: number): void {
    const rooms = ["activity", ...this.snapshot.dmThreads.map((thread) => thread.id)]
    const index = roomNumber - 1
    if (index < 0 || index >= rooms.length) {
      this.statusMessage = `Room ${roomNumber} is not available.`
      return
    }
    this.selectedThreadId = rooms[index]!
    this.view = "messages"
  }

  private async submitDraft(): Promise<void> {
    const text = this.draft.trim()
    if (text.length === 0) return

    if (this.sending) return

    if (this.view !== "messages") {
      this.statusMessage = "Sending is enabled in Messages view only."
      return
    }

    if (this.selectedThreadId === "activity") {
      this.statusMessage = "All Activity is read-only. Select a DM room (2-9) to send."
      return
    }

    if (!this.selectedThreadId.startsWith("agent:")) {
      this.statusMessage = "Select a DM room to send messages."
      return
    }

    this.sending = true

    try {
      await this.sendDm(this.selectedThreadId, text)
      this.draft = ""
      this.statusMessage = `Sent to ${this.threadLabel(this.selectedThreadId)}.`
      await this.reloadSnapshot()
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : "Failed to send message."
    } finally {
      this.sending = false
    }
  }

  private async sendDm(target: string, text: string): Promise<void> {
    const rawTarget = target
    const resolvedTarget = rawTarget === "owner" || rawTarget === "operator" ? "human:default" : rawTarget

    const fromName = this.identity.name || "Operator"
    const fromDna = this.identity.dna || "0000000"

    const isHumanTarget = resolvedTarget.startsWith("human:")

    let targetSession = isHumanTarget ? null : readSession(resolvedTarget, this.root)
    let targetDna = targetSession?.dna
    let finalTarget = resolvedTarget

    if (!isHumanTarget && resolvedTarget.startsWith("agent:")) {
      const dna = resolvedTarget.slice("agent:".length)
      if (dna.length > 0) {
        const candidates = listSessions(this.root)
          .filter((session) => session.dna === dna)
          .sort((a, b) => b.lastSeenAt - a.lastSeenAt)

        targetSession = candidates[0] ?? null
        targetDna = dna
        finalTarget = targetSession?.sessionId ?? resolvedTarget
      }
    }

    if (!isHumanTarget && !targetSession) {
      throw new Error(`Target ${resolvedTarget} is offline or unknown.`)
    }

    upsertSession(
      this.identity.sessionId,
      {
        name: fromName,
        dna: fromDna,
      },
      this.root,
    )

    if (targetSession) {
      writeMessages(finalTarget, [
        {
          from: this.identity.sessionId,
          fromName,
          text,
          ts: Date.now(),
        },
      ])
    }

    appendWorkspaceMessage(
      {
        kind: "dm",
        from: this.identity.sessionId,
        fromName,
        fromDna,
        target: finalTarget,
        targetName: targetSession?.name ?? (isHumanTarget ? "Human Operator" : undefined),
        targetDna,
        text,
      },
      this.root,
    )
  }

  private async reloadSnapshot(): Promise<void> {
    if (this.refreshing) return
    this.refreshing = true

    try {
      const sessions = listSessions(this.root)
      const messages = readWorkspaceMessages({ limit: 300 }, this.root)
      const tasks = getAllTasks()
      const calendarEvents = [...getAllCalendarEvents()].sort((a, b) => a.startTime - b.startTime)
      const agents = this.buildAgentPresence(sessions)
      const dmThreads = this.buildDmThreads(messages, agents, sessions)

      this.snapshot = {
        sessions,
        messages,
        tasks,
        calendarEvents,
        agents,
        dmThreads,
        generatedAt: Date.now(),
      }

      if (this.selectedThreadId !== "activity" && !dmThreads.some((thread) => thread.id === this.selectedThreadId)) {
        this.selectedThreadId = "activity"
      }
    } finally {
      this.refreshing = false
    }
  }

  private buildAgentPresence(sessions: WorkspaceSession[]): AgentPresence[] {
    const byDna = new Map<string, AgentPresence>()

    for (const local of discoverLocalAgents()) {
      const dna = local.soul?.dna
      if (!dna) continue
      const name = local.soul?.name || local.name
      byDna.set(dna, {
        dna,
        name,
        online: false,
      })
    }

    for (const session of sessions) {
      const existing = byDna.get(session.dna)
      if (existing) {
        existing.online = true
        if (!existing.name || existing.name === existing.dna) {
          existing.name = session.name
        }
        continue
      }

      byDna.set(session.dna, {
        dna: session.dna,
        name: session.name,
        online: true,
      })
    }

    return Array.from(byDna.values()).sort((a, b) => {
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
      byDna.set(agent.dna, {
        id: `agent:${agent.dna}`,
        dna: agent.dna,
        label: agent.name,
        online: agent.online,
      })
    }

    for (const message of messages) {
      if (message.kind !== "dm") continue

      const fromDna = message.fromDna ?? (message.from ? sessionDnaById.get(message.from) : undefined)
      const targetDna = message.targetDna ?? (message.target ? sessionDnaById.get(message.target) : undefined)

      if (fromDna && !isHumanAddress(message.from) && !byDna.has(fromDna)) {
        const known = agentByDna.get(fromDna)
        byDna.set(fromDna, {
          id: `agent:${fromDna}`,
          dna: fromDna,
          label: message.fromName || known?.name || fromDna,
          online: known?.online ?? false,
        })
      }

      if (targetDna && !isHumanAddress(message.target) && !byDna.has(targetDna)) {
        const known = agentByDna.get(targetDna)
        byDna.set(targetDna, {
          id: `agent:${targetDna}`,
          dna: targetDna,
          label: message.targetName || known?.name || targetDna,
          online: known?.online ?? false,
        })
      }
    }

    return Array.from(byDna.values()).sort((a, b) => a.label.localeCompare(b.label))
  }

  private threadLabel(threadId: string): string {
    if (threadId === "activity") return "all-activity"
    if (!threadId.startsWith("agent:")) return threadId

    const thread = this.snapshot.dmThreads.find((candidate) => candidate.id === threadId)
    if (thread) return thread.label
    return threadId.slice("agent:".length)
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

  private isMessageInThread(message: WorkspaceMessage, threadId: string): boolean {
    if (threadId === "activity") return true
    if (message.kind !== "dm") return false

    if (!threadId.startsWith("agent:")) return false
    const threadDna = threadId.slice("agent:".length)
    const fromDna = this.messageFromDna(message)
    const targetDna = this.messageTargetDna(message)
    return fromDna === threadDna || targetDna === threadDna
  }

  private renderMessagesView(height: number, width: number): string[] {
    const out: string[] = []
    const rooms = ["activity", ...this.snapshot.dmThreads.map((thread) => thread.id)]

    const roomHints = rooms
      .slice(0, 9)
      .map((id, index) => `[${index + 1}] ${this.threadLabel(id)}`)
      .join("  ")

    out.push(truncatePlain(`Messages · Rooms ${roomHints || "[1] all-activity"}`, width))
    out.push(truncatePlain(`Current: ${this.threadLabel(this.selectedThreadId)}`, width))

    const visible = this.snapshot.messages
      .filter((message) => this.isMessageInThread(message, this.selectedThreadId))
      .slice(-(Math.max(1, height - out.length)))

    if (visible.length === 0) {
      out.push("No messages yet.")
      return out
    }

    for (const message of visible) {
      const route = message.kind === "chat"
        ? `${message.fromName} -> #${message.channel || "workspace"}`
        : message.kind === "dm"
        ? `${message.fromName} -> ${message.targetName || message.target || "unknown"}`
        : `${message.fromName} -> system`
      out.push(truncatePlain(`[${formatTime(message.ts)}] ${route}: ${message.text}`, width))
    }

    return out
  }

  private renderInboxView(height: number, width: number): string[] {
    const out: string[] = ["Inbox · incoming direct messages"]

    const incoming = this.snapshot.messages
      .filter((message) => {
        if (message.kind !== "dm") return false

        const target = message.target
        if (!target) return false

        if (target === this.identity.sessionId || target === `agent:${this.identity.dna}`) {
          return true
        }

        if (this.identity.name === "Operator" && isHumanAddress(target)) {
          return true
        }

        return false
      })
      .slice(-(Math.max(1, height - out.length)))

    if (incoming.length === 0) {
      out.push("No inbox messages.")
      return out
    }

    for (const message of incoming) {
      const from = message.fromName || message.from
      out.push(truncatePlain(`[${formatTime(message.ts)}] ${from}: ${message.text}`, width))
    }

    return out
  }

  private renderTasksView(height: number, width: number): string[] {
    const out: string[] = ["Tasks"]
    const tasks = [...this.snapshot.tasks].sort((a, b) => b.updatedAt - a.updatedAt)

    if (tasks.length === 0) {
      out.push("No tasks created.")
      return out
    }

    for (const task of tasks.slice(0, Math.max(1, height - out.length))) {
      const assigned = task.assignedTo ? ` · ${task.assignedTo}` : ""
      out.push(
        truncatePlain(
          `${statusIcon(task.status)} [${task.status}] ${task.title}${assigned}`,
          width,
        ),
      )
    }

    return out
  }

  private renderCalendarView(height: number, width: number): string[] {
    const out: string[] = ["Calendar"]

    if (this.snapshot.calendarEvents.length === 0) {
      out.push("No calendar events scheduled.")
      return out
    }

    for (const event of this.snapshot.calendarEvents.slice(0, Math.max(1, height - out.length))) {
      const prefix = event.enabled ? "✓" : "x"
      out.push(
        truncatePlain(
          `${prefix} ${event.title} · ${formatDateTime(event.startTime)} -> ${formatDateTime(event.endTime)}`,
          width,
        ),
      )
    }

    return out
  }

  private renderAvatarStrip(width: number): string[] {
    const agents = this.snapshot.agents
    if (agents.length === 0) {
      return ["Agents: none"]
    }

    const blocks: AvatarBlock[] = agents.map((agent) => {
      const lines = renderTerminalSmall(agent.dna, 0, !agent.online).split("\n")
      const blockWidth = Math.max(...lines.map((line) => visibleLength(line)), 1)
      const label = agent.online ? agent.name : `${agent.name} off`
      return {
        label,
        lines,
        width: blockWidth,
      }
    })

    const shown: AvatarBlock[] = []
    let usedWidth = 0
    for (const block of blocks) {
      const needed = block.width + (shown.length > 0 ? 2 : 0)
      if (shown.length > 0 && usedWidth + needed > width) {
        break
      }
      shown.push(block)
      usedWidth += needed
    }

    if (shown.length === 0) {
      shown.push(blocks[0]!)
    }

    const avatarHeight = Math.max(...shown.map((block) => block.lines.length), 1)
    const lines: string[] = ["Agents (color=online, bw=offline)"]

    for (let row = 0; row < avatarHeight; row++) {
      let line = ""
      for (let index = 0; index < shown.length; index++) {
        const block = shown[index]!
        const piece = block.lines[row] ?? ""
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
      labels += padAnsi(truncatePlain(block.label, block.width), block.width)
      if (index < shown.length - 1) {
        labels += "  "
      }
    }
    lines.push(labels)

    return lines
  }

  private renderBody(height: number, width: number): string[] {
    if (this.view === "messages") {
      return this.renderMessagesView(height, width)
    }

    if (this.view === "inbox") {
      return this.renderInboxView(height, width)
    }

    if (this.view === "tasks") {
      return this.renderTasksView(height, width)
    }

    return this.renderCalendarView(height, width)
  }

  private renderPrompt(width: number): [string, string] {
    const canSend = this.view === "messages" && this.selectedThreadId.startsWith("agent:")

    const hint = canSend
      ? "Enter send · M/I/T/C views · 1..9 rooms · Tab next room · q quit"
      : "M/I/T/C views · 1..9 rooms in Messages · q quit"

    let prefix = `${this.view}> `
    if (this.view === "messages") {
      prefix = `${this.threadLabel(this.selectedThreadId)}> `
    }

    const available = Math.max(0, width - prefix.length - 1)
    const draft = this.draft.length > available ? this.draft.slice(this.draft.length - available) : this.draft

    return [truncatePlain(hint, width), `${prefix}${draft}█`]
  }

  private render(): void {
    if (!this.running) return

    const width = Math.max(this.stdout.columns || 120, 40)
    const height = Math.max(this.stdout.rows || 30, 18)

    const topLines: string[] = [
      truncatePlain(
        `Termlings TUI · ${basename(this.root)} · online ${this.snapshot.sessions.length} · ${formatTime(this.snapshot.generatedAt)}`,
        width,
      ),
      truncatePlain(
        `Views: ${this.view === "messages" ? "[M]essages" : "M)essages"}  ${this.view === "inbox" ? "[I]nbox" : "I)nbox"}  ${this.view === "tasks" ? "[T]asks" : "T)asks"}  ${this.view === "calendar" ? "[C]alendar" : "C)alendar"}`,
        width,
      ),
      truncatePlain(this.statusMessage, width),
    ]

    let avatarLines = this.renderAvatarStrip(width)
    const minBodyHeight = 6
    const promptLineCount = 2

    while (topLines.length + minBodyHeight + avatarLines.length + promptLineCount > height && avatarLines.length > 0) {
      avatarLines = avatarLines.slice(0, -1)
    }

    const bodyHeight = Math.max(1, height - topLines.length - avatarLines.length - promptLineCount)
    const bodyLines = this.renderBody(bodyHeight, width)
    const [hintLine, promptLine] = this.renderPrompt(width)

    const lines: string[] = []
    lines.push(...topLines)

    const trimmedBody = bodyLines.slice(-bodyHeight)
    for (const line of trimmedBody) {
      lines.push(truncatePlain(line, width))
    }
    while (lines.length < topLines.length + bodyHeight) {
      lines.push("")
    }

    lines.push(...avatarLines)
    lines.push(truncatePlain(hintLine, width))
    lines.push(truncatePlain(promptLine, width))

    while (lines.length < height) {
      lines.push("")
    }

    this.stdout.write("\x1b[H\x1b[2J")
    this.stdout.write(lines.slice(0, height).join("\n"))
  }
}

export async function launchWorkspaceTui(root = process.cwd()): Promise<never> {
  const app = new WorkspaceTui(root)
  return app.run()
}
