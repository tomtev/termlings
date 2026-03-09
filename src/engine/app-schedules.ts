import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

import {
  calculateScheduledMessageNextRun,
  describeScheduledMessage,
  type MessageScheduleRecurrence,
  type MessageScheduleWeekday,
} from "./message-schedules.js"
import { appendAppActivity, resolveAgentActivityThreadId, type AppActivityEntry } from "./activity.js"

export type ScheduledAppName = "analytics" | "finance" | "ads"
export type ScheduledAppAction = "sync"

export interface ScheduledAppJob {
  id: string
  app: ScheduledAppName
  action: ScheduledAppAction
  provider?: string
  last?: string
  recurrence: MessageScheduleRecurrence
  time: string
  timezone: string
  date?: string
  weekday?: MessageScheduleWeekday
  nextRunAt: number | null
  lastRunAt?: number
  lastSuccessAt?: number
  lastError?: string
  enabled: boolean
  createdAt: number
  createdBy: string
  updatedAt: number
}

export interface CreateScheduledAppJobInput {
  app: ScheduledAppName
  action: ScheduledAppAction
  provider?: string
  last?: string
  recurrence: MessageScheduleRecurrence
  time: string
  timezone: string
  date?: string
  weekday?: MessageScheduleWeekday
  createdBy: string
}

function appSchedulesDir(root: string): string {
  return join(root, ".termlings", "store", "app-schedules")
}

function appSchedulesPath(root: string): string {
  return join(appSchedulesDir(root), "schedules.json")
}

function scheduleActor(createdBy: string): { actorName?: string; actorSlug?: string; actorSessionId?: string; threadId?: string } {
  const normalized = createdBy.trim()
  if (normalized.startsWith("agent:")) {
    const actorSlug = normalized.slice("agent:".length).trim()
    return {
      actorName: actorSlug || undefined,
      actorSlug: actorSlug || undefined,
      actorSessionId: normalized,
      threadId: resolveAgentActivityThreadId({ agentSlug: actorSlug || undefined }),
    }
  }
  if (normalized.startsWith("human:")) {
    return {
      actorName: "Owner",
      actorSessionId: normalized,
    }
  }
  return {
    actorName: normalized || "Owner",
    actorSessionId: normalized || undefined,
  }
}

function currentActorId(): string {
  const agentSlug = (process.env.TERMLINGS_AGENT_SLUG || "").trim()
  if (agentSlug) return `agent:${agentSlug}`
  return "human:default"
}

function normalizeScheduledAppJob(raw: unknown): ScheduledAppJob | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const app = String(value.app || "").trim() as ScheduledAppName
  const action = String(value.action || "").trim() as ScheduledAppAction
  const recurrence = String(value.recurrence || "").trim() as MessageScheduleRecurrence
  const time = String(value.time || "").trim()
  const timezone = String(value.timezone || "").trim()
  const id = String(value.id || "").trim()
  const createdBy = String(value.createdBy || "").trim()
  const createdAt = Number(value.createdAt)
  const updatedAt = Number(value.updatedAt)
  const nextRunAt = value.nextRunAt === null ? null : Number(value.nextRunAt)
  const lastRunAt = typeof value.lastRunAt === "number" && Number.isFinite(value.lastRunAt) ? value.lastRunAt : undefined
  const lastSuccessAt = typeof value.lastSuccessAt === "number" && Number.isFinite(value.lastSuccessAt) ? value.lastSuccessAt : undefined
  const lastError = typeof value.lastError === "string" && value.lastError.trim() ? value.lastError.trim() : undefined
  const enabled = typeof value.enabled === "boolean" ? value.enabled : true
  if (!id || !createdBy || !time || !timezone) return null
  if (app !== "analytics" && app !== "finance" && app !== "ads") return null
  if (action !== "sync") return null
  if (recurrence !== "once" && recurrence !== "hourly" && recurrence !== "daily" && recurrence !== "weekly") return null
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null
  if (nextRunAt !== null && !Number.isFinite(nextRunAt)) return null
  return {
    id,
    app,
    action,
    provider: typeof value.provider === "string" && value.provider.trim() ? value.provider.trim() : undefined,
    last: typeof value.last === "string" && value.last.trim() ? value.last.trim() : undefined,
    recurrence,
    time,
    timezone,
    date: typeof value.date === "string" && value.date.trim() ? value.date.trim() : undefined,
    weekday: typeof value.weekday === "string" && value.weekday.trim()
      ? value.weekday.trim().toLowerCase() as MessageScheduleWeekday
      : undefined,
    nextRunAt,
    lastRunAt,
    lastSuccessAt,
    lastError,
    enabled,
    createdAt,
    createdBy,
    updatedAt,
  }
}

export function ensureScheduledAppJobDirs(root = process.cwd()): void {
  mkdirSync(appSchedulesDir(root), { recursive: true })
}

export function getAllScheduledAppJobs(root = process.cwd()): ScheduledAppJob[] {
  ensureScheduledAppJobDirs(root)
  const path = appSchedulesPath(root)
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => normalizeScheduledAppJob(entry))
      .filter((entry): entry is ScheduledAppJob => Boolean(entry))
      .sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

export function saveScheduledAppJobs(jobs: ScheduledAppJob[], root = process.cwd()): void {
  ensureScheduledAppJobDirs(root)
  writeFileSync(appSchedulesPath(root), JSON.stringify(jobs, null, 2) + "\n", "utf8")
}

function appendScheduleActivity(
  app: ScheduledAppName,
  kind: string,
  text: string,
  createdBy: string,
  meta: Record<string, unknown>,
  root: string,
  result?: AppActivityEntry["result"],
): void {
  const actor = scheduleActor(createdBy)
  appendAppActivity({
    ts: Date.now(),
    app,
    kind,
    text,
    level: "summary",
    surface: actor.threadId ? "both" : "feed",
    actorName: actor.actorName,
    actorSlug: actor.actorSlug,
    actorSessionId: actor.actorSessionId,
    threadId: actor.threadId,
    result,
    meta,
  }, root)
}

export function createScheduledAppJob(input: CreateScheduledAppJobInput, root = process.cwd()): ScheduledAppJob {
  const createdAt = Date.now()
  const createdBy = input.createdBy.trim() || currentActorId()
  const nextRunAt = calculateScheduledMessageNextRun({
    recurrence: input.recurrence,
    time: input.time,
    timezone: input.timezone,
    date: input.date,
    weekday: input.weekday,
  }, createdAt)
  if (nextRunAt === null) {
    throw new Error("Scheduled app job resolves to a past run time. Choose a future date/time.")
  }
  const job: ScheduledAppJob = {
    id: `appsch_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
    app: input.app,
    action: input.action,
    provider: input.provider?.trim() || undefined,
    last: input.last?.trim() || undefined,
    recurrence: input.recurrence,
    time: input.time,
    timezone: input.timezone,
    date: input.date,
    weekday: input.weekday,
    nextRunAt,
    enabled: true,
    createdAt,
    createdBy,
    updatedAt: createdAt,
  }
  saveScheduledAppJobs([...getAllScheduledAppJobs(root), job], root)
  appendScheduleActivity(
    input.app,
    "schedule.created",
    `${input.action} scheduled (${describeScheduledMessage(job)})`,
    createdBy,
    {
      scheduleId: job.id,
      action: input.action,
      provider: job.provider,
      recurrence: job.recurrence,
      last: job.last,
    },
    root,
    "success",
  )
  return job
}

export function removeScheduledAppJob(id: string, root = process.cwd(), app?: ScheduledAppName): ScheduledAppJob | null {
  const jobs = getAllScheduledAppJobs(root)
  const target = jobs.find((job) => job.id === id && (!app || job.app === app)) || null
  if (!target) return null
  saveScheduledAppJobs(jobs.filter((job) => job.id !== id), root)
  appendScheduleActivity(
    target.app,
    "schedule.removed",
    `${target.action} schedule removed`,
    currentActorId(),
    {
      scheduleId: target.id,
      action: target.action,
    },
    root,
    "success",
  )
  return target
}

export function listScheduledAppJobs(app?: ScheduledAppName, root = process.cwd()): ScheduledAppJob[] {
  const jobs = getAllScheduledAppJobs(root)
  if (!app) return jobs
  return jobs.filter((job) => job.app === app)
}

export function formatScheduledAppJobs(app: ScheduledAppName, jobs: ScheduledAppJob[]): string {
  if (jobs.length <= 0) {
    return `No ${app} schedules configured`
  }
  const lines = [`${app[0].toUpperCase()}${app.slice(1)} schedules`, ""]
  for (const job of jobs) {
    const nextRun = job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "disabled"
    const last = job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "never"
    const error = job.lastError ? ` error: ${job.lastError}` : ""
    lines.push(`${job.id}`)
    lines.push(`  ${job.action} ${job.provider || app} ${job.last || "30d"}`)
    lines.push(`  ${describeScheduledMessage(job)}`)
    lines.push(`  next ${nextRun} | last ${last}${error}`)
    lines.push("")
  }
  return lines.join("\n").trimEnd()
}
