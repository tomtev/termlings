import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { discoverLocalAgents } from "../agents/discover.js"
import { queueMessage, writeMessages } from "./ipc.js"
import { getAllTasks, type Task } from "./tasks.js"
import { appendWorkspaceMessage, listSessions } from "../workspace/state.js"

const STATE_VERSION = 1
const PRE_DUE_WINDOW_MS = 24 * 60 * 60 * 1000
const OVERDUE_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000

type TaskReminderStage = "upcoming" | "due" | "overdue"

interface TaskReminderEntry {
  dueDate: number
  upcomingSentAt?: number
  dueSentAt?: number
  overdueSentAt?: number
}

interface TaskSchedulerState {
  version: number
  reminders: Record<string, TaskReminderEntry>
}

export interface TaskScheduleExecutionResult {
  taskId: string
  title: string
  stage: TaskReminderStage
  targets: string[]
  executed: boolean
  timestamp: number
}

function stateFile(root: string): string {
  return join(root, ".termlings", "store", "tasks", "scheduler-state.json")
}

function emptyState(): TaskSchedulerState {
  return {
    version: STATE_VERSION,
    reminders: {},
  }
}

function loadState(root: string): TaskSchedulerState {
  const path = stateFile(root)
  if (!existsSync(path)) return emptyState()

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      version?: unknown
      reminders?: unknown
    }

    const reminders: Record<string, TaskReminderEntry> = {}
    if (parsed.reminders && typeof parsed.reminders === "object" && !Array.isArray(parsed.reminders)) {
      for (const [taskId, value] of Object.entries(parsed.reminders as Record<string, unknown>)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue
        const raw = value as Record<string, unknown>
        const dueDate = typeof raw.dueDate === "number" && Number.isFinite(raw.dueDate) ? raw.dueDate : 0
        if (dueDate <= 0) continue
        reminders[taskId] = {
          dueDate,
          upcomingSentAt: typeof raw.upcomingSentAt === "number" && Number.isFinite(raw.upcomingSentAt) ? raw.upcomingSentAt : undefined,
          dueSentAt: typeof raw.dueSentAt === "number" && Number.isFinite(raw.dueSentAt) ? raw.dueSentAt : undefined,
          overdueSentAt: typeof raw.overdueSentAt === "number" && Number.isFinite(raw.overdueSentAt) ? raw.overdueSentAt : undefined,
        }
      }
    }

    return {
      version: typeof parsed.version === "number" ? parsed.version : STATE_VERSION,
      reminders,
    }
  } catch {
    return emptyState()
  }
}

function saveState(root: string, state: TaskSchedulerState): void {
  const path = stateFile(root)
  mkdirSync(join(root, ".termlings", "store", "tasks"), { recursive: true })
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n")
}

function durationLabel(ms: number): string {
  const abs = Math.max(0, Math.floor(ms))
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (abs >= day) {
    const days = Math.round(abs / day)
    return `${days} day${days === 1 ? "" : "s"}`
  }
  if (abs >= hour) {
    const hours = Math.round(abs / hour)
    return `${hours} hour${hours === 1 ? "" : "s"}`
  }
  const minutes = Math.max(1, Math.round(abs / minute))
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

function normalizeCreatorTarget(createdBy: string | undefined): string {
  const raw = (createdBy || "").trim()
  if (!raw) return "human:default"

  const lower = raw.toLowerCase()
  if (
    lower === "owner"
    || lower === "operator"
    || lower === "human"
    || lower === "human:owner"
    || lower === "human:operator"
    || lower === "human:default"
  ) {
    return "human:default"
  }

  if (raw.startsWith("human:") || raw.startsWith("agent:")) {
    return raw
  }

  return `agent:${raw}`
}

function reminderTargets(task: Task): string[] {
  if (task.assignedTo && task.assignedTo.trim().length > 0) {
    return [`agent:${task.assignedTo.trim()}`]
  }
  return [normalizeCreatorTarget(task.createdBy)]
}

function reminderMessage(task: Task, stage: TaskReminderStage, now: number): string {
  if (!task.dueDate) return `[TASK] ${task.id} "${task.title}" requires attention.`
  if (stage === "upcoming") {
    return `[TASK] ${task.id} "${task.title}" is due in ${durationLabel(task.dueDate - now)} (status: ${task.status}).`
  }
  if (stage === "due") {
    return `[TASK] ${task.id} "${task.title}" is due now (status: ${task.status}).`
  }
  return `[TASK] ${task.id} "${task.title}" is overdue by ${durationLabel(now - task.dueDate)} (status: ${task.status}).`
}

function notifyTargets(targets: string[], text: string, root: string): void {
  const sessions = listSessions(root)
  const agents = discoverLocalAgents()
  const now = Date.now()
  const payload = {
    from: "SCHEDULER",
    fromName: "Scheduler",
    text,
    ts: now,
    fromDna: "0000000",
  }

  for (const target of targets) {
    const normalized = target.trim()
    if (!normalized) continue

    if (normalized.startsWith("agent:")) {
      const slug = normalized.slice("agent:".length).trim()
      if (!slug) continue
      const agent = agents.find((entry) => entry.name === slug)
      const dna = agent?.soul?.dna
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
            text,
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
          targetName: agent?.soul?.name || slug,
          targetDna: dna,
          text,
        },
        root,
      )
      continue
    }

    if (normalized.startsWith("human:")) {
      appendWorkspaceMessage(
        {
          kind: "dm",
          from: "system:scheduler",
          fromName: "Scheduler",
          target: normalized,
          targetName: "Owner",
          text,
        },
        root,
      )
      continue
    }
  }
}

export function executeScheduledTaskChecks(now = Date.now(), root = process.cwd()): TaskScheduleExecutionResult[] {
  const tasks = getAllTasks()
  const activeDueTasks = tasks.filter((task) => task.status !== "completed" && typeof task.dueDate === "number" && task.dueDate > 0)
  const activeTaskIds = new Set(activeDueTasks.map((task) => task.id))
  const state = loadState(root)
  const results: TaskScheduleExecutionResult[] = []

  for (const taskId of Object.keys(state.reminders)) {
    if (!activeTaskIds.has(taskId)) {
      delete state.reminders[taskId]
    }
  }

  for (const task of activeDueTasks) {
    const dueDate = task.dueDate as number
    const targets = reminderTargets(task)
    const existing = state.reminders[task.id]
    let reminder: TaskReminderEntry
    if (!existing || existing.dueDate !== dueDate) {
      reminder = { dueDate }
      state.reminders[task.id] = reminder
    } else {
      reminder = existing
    }

    const upcomingAt = dueDate - PRE_DUE_WINDOW_MS
    const hasUpcomingWindow = now < dueDate && now >= upcomingAt
    if (hasUpcomingWindow && !reminder.upcomingSentAt) {
      const text = reminderMessage(task, "upcoming", now)
      notifyTargets(targets, text, root)
      reminder.upcomingSentAt = now
      results.push({
        taskId: task.id,
        title: task.title,
        stage: "upcoming",
        targets,
        executed: true,
        timestamp: now,
      })
      continue
    }

    if (now >= dueDate && !reminder.dueSentAt) {
      const text = reminderMessage(task, "due", now)
      notifyTargets(targets, text, root)
      reminder.dueSentAt = now
      reminder.overdueSentAt = now
      results.push({
        taskId: task.id,
        title: task.title,
        stage: "due",
        targets,
        executed: true,
        timestamp: now,
      })
      continue
    }

    if (now > dueDate && reminder.dueSentAt) {
      const lastOverdue = reminder.overdueSentAt || reminder.dueSentAt
      if (now - lastOverdue >= OVERDUE_REMINDER_INTERVAL_MS) {
        const text = reminderMessage(task, "overdue", now)
        notifyTargets(targets, text, root)
        reminder.overdueSentAt = now
        results.push({
          taskId: task.id,
          title: task.title,
          stage: "overdue",
          targets,
          executed: true,
          timestamp: now,
        })
      }
    }
  }

  saveState(root, state)
  return results
}

export function formatTaskScheduleExecutionResults(results: TaskScheduleExecutionResult[]): string {
  if (results.length === 0) return "No task reminders executed"

  const lines: string[] = []
  lines.push(`Processed ${results.length} task reminder(s):`)
  for (const result of results) {
    const when = new Date(result.timestamp).toLocaleTimeString()
    const targetText = result.targets.join(", ") || "none"
    lines.push(`✓ [${when}] ${result.stage.toUpperCase()} ${result.taskId} "${result.title}" -> ${targetText}`)
  }
  return lines.join("\n")
}
