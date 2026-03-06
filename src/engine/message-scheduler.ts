import { discoverLocalAgents } from "../agents/discover.js"
import { appendWorkspaceMessage, listSessions } from "../workspace/state.js"
import { queueMessage, writeMessages } from "./ipc.js"
import {
  calculateScheduledMessageNextRun,
  getAllScheduledMessages,
  saveScheduledMessages,
  type ScheduledMessage,
} from "./message-schedules.js"

export interface MessageScheduleExecutionResult {
  scheduleId: string
  target: string
  recurrence: ScheduledMessage["recurrence"]
  executed: boolean
  timestamp: number
}

function deliverScheduledMessage(schedule: ScheduledMessage, root: string, now: number): void {
  const payload = {
    from: "SCHEDULER",
    fromName: "Scheduler",
    text: schedule.text,
    ts: now,
    fromDna: "0000000",
  }

  if (schedule.target === "everyone") {
    const agents = discoverLocalAgents()
    for (const agent of agents) {
      if (!agent.name) continue
      deliverScheduledMessage(
        {
          ...schedule,
          target: `agent:${agent.name}`,
          targetName: agent.soul?.name || agent.name,
          targetDna: agent.soul?.dna,
        },
        root,
        now,
      )
    }
    return
  }

  if (schedule.target.startsWith("agent:")) {
    const slug = schedule.target.slice("agent:".length).trim()
    if (!slug) return

    const agents = discoverLocalAgents()
    const sessions = listSessions(root)
    const agent = agents.find((entry) => entry.name === slug)
    const dna = schedule.targetDna || agent?.soul?.dna
    const session = dna
      ? sessions
        .filter((entry) => entry.dna === dna)
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0]
      : null

    if (session) {
      writeMessages(session.sessionId, [
        {
          from: "SCHEDULER",
          fromName: "Scheduler",
          text: schedule.text,
          ts: now,
        },
      ])
    } else {
      queueMessage(slug, payload)
    }

    appendWorkspaceMessage(
      {
        kind: "dm",
        from: "system:scheduler",
        fromName: "Scheduler",
        target: `agent:${slug}`,
        targetName: schedule.targetName || agent?.soul?.name || slug,
        targetDna: dna,
        text: schedule.text,
      },
      root,
    )
    return
  }

  appendWorkspaceMessage(
    {
      kind: "dm",
      from: "system:scheduler",
      fromName: "Scheduler",
      target: schedule.target,
      targetName: schedule.targetName || "Owner",
      text: schedule.text,
    },
    root,
  )
}

export function executeScheduledMessages(now = Date.now(), root = process.cwd()): MessageScheduleExecutionResult[] {
  const schedules = getAllScheduledMessages(root)
  if (schedules.length === 0) return []

  const results: MessageScheduleExecutionResult[] = []
  let changed = false

  for (const schedule of schedules) {
    if (!schedule.enabled || schedule.nextRunAt === null || schedule.nextRunAt > now) {
      continue
    }

    deliverScheduledMessage(schedule, root, now)
    schedule.lastRunAt = now
    schedule.updatedAt = now
    changed = true

    if (schedule.recurrence === "once") {
      schedule.enabled = false
      schedule.nextRunAt = null
    } else {
      schedule.nextRunAt = calculateScheduledMessageNextRun(schedule, now + 1_000)
    }

    results.push({
      scheduleId: schedule.id,
      target: schedule.target,
      recurrence: schedule.recurrence,
      executed: true,
      timestamp: now,
    })
  }

  if (changed) {
    saveScheduledMessages(schedules, root)
  }

  return results
}
