/**
 * Workspace delta computation - calculate only what changed
 *
 * Enables efficient streaming: instead of sending full snapshot (100KB+),
 * send only deltas (100 bytes) when files change
 */

import { readFileSync, existsSync, readdirSync } from "fs"
import { join } from "path"

export interface WorkspaceMessage {
  id: string
  kind: "chat" | "dm" | "system"
  channel?: string
  from: string
  fromName: string
  fromDna?: string
  target?: string
  targetName?: string
  targetDna?: string
  text: string
  ts: number
}

export interface Task {
  id: string
  title: string
  status: string
  priority: string
  assignedTo?: string
  updatedAt: number
}

export interface CalendarEvent {
  id: string
  title: string
  description: string
  assignedAgents: string[]
  startTime: number
  endTime: number
  recurrence: string
  enabled: boolean
}

export interface WorkspaceSession {
  sessionId: string
  name: string
  dna: string
  joinedAt: number
  lastSeenAt: number
}

// Delta types
export type DeltaType =
  | "message.added"
  | "messages.batch"
  | "channel.created"
  | "channel.updated"
  | "dm.created"
  | "dm.updated"
  | "task.added"
  | "task.updated"
  | "task.deleted"
  | "event.added"
  | "event.updated"
  | "event.deleted"
  | "session.joined"
  | "session.left"
  | "index.updated"

export interface Delta {
  type: DeltaType
  timestamp: number
  data: any
}

interface StoredSnapshot {
  messageIds: Set<string>
  taskIds: Set<string>
  eventIds: Set<string>
  sessionIds: Set<string>
  channels: Set<string>
  dms: Set<string>
}

/**
 * Compute workspace deltas by comparing current state with previous
 * Returns only the changes
 */
export class WorkspaceDeltaComputer {
  private lastSnapshot: StoredSnapshot | null = null

  /**
   * Load current workspace state efficiently
   */
  private loadWorkspaceState(root: string) {
    const storageDir = join(root, ".termlings", "store", "messages")
    const messagesState = {
      messageIds: new Set<string>(),
      channels: new Set<string>(),
      dms: new Set<string>(),
    }

    // Quick scan of message files
    if (existsSync(storageDir)) {
      try {
        // Check channels
        const channelsDir = join(storageDir, "channels")
        if (existsSync(channelsDir)) {
          for (const file of readdirSync(channelsDir)) {
            if (file.endsWith(".jsonl")) {
              const channel = file.replace(".jsonl", "")
              messagesState.channels.add(channel)

              // Quick message count
              const content = readFileSync(join(channelsDir, file), "utf8")
              for (const line of content.split("\n")) {
                if (line.trim()) {
                  try {
                    const msg = JSON.parse(line)
                    messagesState.messageIds.add(msg.id)
                  } catch {}
                }
              }
            }
          }
        }

        // Check DMs
        const dmsDir = join(storageDir, "dms")
        if (existsSync(dmsDir)) {
          for (const file of readdirSync(dmsDir)) {
            if (file.endsWith(".jsonl")) {
              const target = file.replace(".jsonl", "")
              messagesState.dms.add(target)

              // Quick message count
              const content = readFileSync(join(dmsDir, file), "utf8")
              for (const line of content.split("\n")) {
                if (line.trim()) {
                  try {
                    const msg = JSON.parse(line)
                    messagesState.messageIds.add(msg.id)
                  } catch {}
                }
              }
            }
          }
        }
      } catch {}
    }

    return messagesState
  }

  /**
   * Compute deltas from changed channels/DMs
   */
  computeDeltas(
    root: string,
    changes: {
      channels: Set<string>
      dms: Set<string>
      indexChanged: boolean
    },
  ): Delta[] {
    const deltas: Delta[] = []
    const now = Date.now()

    // Load new state
    const newState = this.loadWorkspaceState(root)

    // If no last snapshot, this is first load - don't send deltas
    if (!this.lastSnapshot) {
      this.lastSnapshot = {
        ...newState,
        taskIds: new Set(),
        eventIds: new Set(),
        sessionIds: new Set(),
      }
      return []
    }

    // Check for new channels
    for (const channel of newState.channels) {
      if (!this.lastSnapshot.channels.has(channel)) {
        deltas.push({
          type: "channel.created",
          timestamp: now,
          data: { name: channel },
        })
      }
    }

    // Check for new DMs
    for (const dm of newState.dms) {
      if (!this.lastSnapshot.dms.has(dm)) {
        deltas.push({
          type: "dm.created",
          timestamp: now,
          data: { target: dm },
        })
      }
    }

    // Load recent messages from changed channels/DMs
    const storageDir = join(root, ".termlings", "store", "messages")

    // Get new messages from changed channels
    for (const channel of changes.channels) {
      const channelPath = join(storageDir, "channels", `${channel}.jsonl`)
      if (existsSync(channelPath)) {
        try {
          const content = readFileSync(channelPath, "utf8")
          const lines = content.split("\n").filter((l) => l.trim())

          // Load last 20 messages from changed channel
          const recentLines = lines.slice(-20)
          for (const line of recentLines) {
            try {
              const msg = JSON.parse(line) as WorkspaceMessage
              if (!this.lastSnapshot.messageIds.has(msg.id)) {
                deltas.push({
                  type: "message.added",
                  timestamp: msg.ts,
                  data: msg,
                })
                this.lastSnapshot.messageIds.add(msg.id)
              }
            } catch {}
          }
        } catch {}
      }
    }

    // Get new messages from changed DMs
    for (const dm of changes.dms) {
      const dmPath = join(storageDir, "dms", `${dm}.jsonl`)
      if (existsSync(dmPath)) {
        try {
          const content = readFileSync(dmPath, "utf8")
          const lines = content.split("\n").filter((l) => l.trim())

          // Load last 20 messages from changed DM
          const recentLines = lines.slice(-20)
          for (const line of recentLines) {
            try {
              const msg = JSON.parse(line) as WorkspaceMessage
              if (!this.lastSnapshot.messageIds.has(msg.id)) {
                deltas.push({
                  type: "message.added",
                  timestamp: msg.ts,
                  data: msg,
                })
                this.lastSnapshot.messageIds.add(msg.id)
              }
            } catch {}
          }
        } catch {}
      }
    }

    // Update snapshot
    this.lastSnapshot = {
      ...newState,
      taskIds: new Set(),
      eventIds: new Set(),
      sessionIds: new Set(),
    }

    return deltas
  }

  /**
   * Reset snapshot for next comparison
   */
  reset() {
    this.lastSnapshot = null
  }
}
