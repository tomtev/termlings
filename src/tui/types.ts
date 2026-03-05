import type { CalendarEvent } from "../engine/calendar.js"
import type { Task } from "../engine/tasks.js"
import type { AgentRequest } from "../engine/requests.js"
import type { WorkspaceMessage, WorkspaceSession } from "../workspace/state.js"

export type MainView = "messages" | "requests" | "tasks" | "calendar"

export interface Identity {
  sessionId: string
  name: string
  dna: string
  ephemeral: boolean
}

export interface AgentPresence {
  dna: string
  slug?: string
  name: string
  online: boolean
  typing: boolean
  title?: string
  title_short?: string
  sort_order?: number
}

export interface DmThread {
  id: string
  dna: string
  slug?: string
  label: string
  online: boolean
  typing: boolean
  sort_order?: number
}

export interface Snapshot {
  sessions: WorkspaceSession[]
  messages: WorkspaceMessage[]
  tasks: Task[]
  calendarEvents: CalendarEvent[]
  agents: AgentPresence[]
  dmThreads: DmThread[]
  requests: AgentRequest[]
  generatedAt: number
}

export interface AvatarBlock {
  kind: "activity" | "agent"
  label: string
  displayLabel: string
  subtitle: string
  typing?: boolean
  lines: string[]
  width: number
  selected: boolean
}

export interface InboxSummary {
  key: string
  label: string
  threadId: string
  count: number
  lastMessage: WorkspaceMessage
  dna?: string
}

export interface MessageCardOptions {
  borderColor?: string
  prependLines?: string[]
  borderless?: boolean
}

export interface MentionCandidate {
  id: string
  label: string
  token: string
  insertText: string
  subtitle?: string
  online: boolean
  sort_order?: number
}
