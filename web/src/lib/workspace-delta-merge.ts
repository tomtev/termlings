/**
 * Client-side delta merging for file-first streaming
 * Merges incremental deltas into workspace state
 */

import type { WorkspaceMessage, Task, CalendarEvent, WorkspaceSession, WorkspaceAgent } from "$lib/server/workspace"

export interface WorkspaceState {
  meta: { projectName: string } | null
  sessions: WorkspaceSession[]
  agents: WorkspaceAgent[]
  messages: WorkspaceMessage[]
  channels: Array<{ name: string; count: number; lastTs: number }>
  dmThreads: Array<{ target: string; count: number; lastTs: number }>
  tasks: Task[]
  calendarEvents: CalendarEvent[]
  activityUpdatedAt?: number
  generatedAt: number
}

export interface Delta {
  type: string
  timestamp: number
  data: any
}

/**
 * Apply a delta to workspace state
 * Returns updated state (modifies in place for performance)
 */
export function applyDelta(state: WorkspaceState, delta: Delta): WorkspaceState {
  const { type, data } = delta

  switch (type) {
    case "message.added": {
      // Add new message to appropriate location
      const msg = data as WorkspaceMessage
      // Avoid duplicates
      if (!state.messages.find((m) => m.id === msg.id)) {
        state.messages.push(msg)
        // Keep recent 300 messages
        if (state.messages.length > 300) {
          state.messages = state.messages.slice(-300)
        }
      }
      break
    }

    case "messages.batch": {
      // Add multiple messages at once
      const messages = data as WorkspaceMessage[]
      for (const msg of messages) {
        if (!state.messages.find((m) => m.id === msg.id)) {
          state.messages.push(msg)
        }
      }
      if (state.messages.length > 300) {
        state.messages = state.messages.slice(-300)
      }
      break
    }

    case "channel.created": {
      // Add channel to list if not exists
      const { name } = data
      if (!state.channels.find((c) => c.name === name)) {
        state.channels.push({
          name,
          count: 0,
          lastTs: Date.now(),
        })
        // Sort channels
        state.channels.sort((a, b) => a.name.localeCompare(b.name))
      }
      break
    }

    case "channel.updated": {
      // Update channel count
      const { name, count, lastTs } = data
      const channel = state.channels.find((c) => c.name === name)
      if (channel) {
        channel.count = count
        channel.lastTs = lastTs
      }
      break
    }

    case "dm.created": {
      // Add DM thread if not exists
      const { target } = data
      if (!state.dmThreads.find((d) => d.target === target)) {
        state.dmThreads.push({
          target,
          count: 0,
          lastTs: Date.now(),
        })
        // Sort by lastTs
        state.dmThreads.sort((a, b) => b.lastTs - a.lastTs)
      }
      break
    }

    case "dm.updated": {
      // Update DM thread count
      const { target, count, lastTs } = data
      const dm = state.dmThreads.find((d) => d.target === target)
      if (dm) {
        dm.count = count
        dm.lastTs = lastTs
      }
      break
    }

    case "task.added": {
      // Add new task
      const task = data as Task
      if (!state.tasks.find((t) => t.id === task.id)) {
        state.tasks.push(task)
        // Keep recent 200 tasks
        if (state.tasks.length > 200) {
          state.tasks = state.tasks.slice(-200)
        }
      }
      break
    }

    case "task.updated": {
      // Update existing task
      const task = data as Task
      const existing = state.tasks.find((t) => t.id === task.id)
      if (existing) {
        Object.assign(existing, task)
      } else {
        state.tasks.push(task)
      }
      break
    }

    case "task.deleted": {
      // Remove task
      const { id } = data
      state.tasks = state.tasks.filter((t) => t.id !== id)
      break
    }

    case "event.added": {
      // Add new calendar event
      const event = data as CalendarEvent
      if (!state.calendarEvents.find((e) => e.id === event.id)) {
        state.calendarEvents.push(event)
        // Sort by startTime
        state.calendarEvents.sort((a, b) => a.startTime - b.startTime)
      }
      break
    }

    case "event.updated": {
      // Update existing event
      const event = data as CalendarEvent
      const existing = state.calendarEvents.find((e) => e.id === event.id)
      if (existing) {
        Object.assign(existing, event)
      } else {
        state.calendarEvents.push(event)
      }
      break
    }

    case "event.deleted": {
      // Remove event
      const { id } = data
      state.calendarEvents = state.calendarEvents.filter((e) => e.id !== id)
      break
    }

    case "session.joined": {
      // Add new session
      const session = data as WorkspaceSession
      if (!state.sessions.find((s) => s.sessionId === session.sessionId)) {
        state.sessions.push(session)
        // Sort by joinedAt
        state.sessions.sort((a, b) => a.joinedAt - b.joinedAt)
      }
      break
    }

    case "session.left": {
      // Remove session
      const { sessionId } = data
      state.sessions = state.sessions.filter((s) => s.sessionId !== sessionId)
      break
    }

    case "index.updated": {
      // Update channels/DMs list
      const { channels, dms } = data
      if (channels) {
        state.channels = channels
      }
      if (dms) {
        state.dmThreads = dms
      }
      break
    }

    default:
      // Unknown delta type - ignore
      break
  }

  // Update timestamp
  state.generatedAt = Date.now()
  return state
}

/**
 * Merge batch of deltas into state
 */
export function applyDeltas(state: WorkspaceState, deltas: Delta[]): WorkspaceState {
  for (const delta of deltas) {
    applyDelta(state, delta)
  }
  return state
}

/**
 * Create a deep copy of state (for initial snapshot)
 */
export function copyState(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    sessions: [...state.sessions],
    agents: [...state.agents],
    messages: [...state.messages],
    channels: state.channels.map((c) => ({ ...c })),
    dmThreads: state.dmThreads.map((d) => ({ ...d })),
    tasks: [...state.tasks],
    calendarEvents: state.calendarEvents.map((e) => ({ ...e })),
  }
}
