import {
  assertNoExtraPositionalArgs,
  parseParamsJson,
  printJson,
  readStdinJson,
  readOptionalString,
  readString,
} from "./app-api.js"
import type { ScheduledAppName } from "../engine/app-schedules.js"
import type { MessageScheduleRecurrence, MessageScheduleWeekday } from "../engine/message-schedules.js"

interface AppScheduleCommandConfig {
  app: ScheduledAppName
  label: string
  defaultProvider: string
  allowedProviders: string[]
}

function validateProvider(input: string | undefined, allowedProviders: string[], defaultProvider: string): string {
  const provider = (input || defaultProvider).trim().toLowerCase()
  if (!allowedProviders.includes(provider)) {
    throw new Error(`Unsupported provider: ${input}`)
  }
  return provider
}

function normalizeRecurrence(input: string | undefined): MessageScheduleRecurrence {
  const recurrence = (input || "").trim().toLowerCase()
  if (recurrence === "once" || recurrence === "hourly" || recurrence === "daily" || recurrence === "weekly") {
    return recurrence
  }
  throw new Error(`Unsupported recurrence: ${input}. Use once, hourly, daily, or weekly.`)
}

function normalizeWeekday(input: string | undefined): MessageScheduleWeekday | undefined {
  const weekday = (input || "").trim().toLowerCase()
  if (!weekday) return undefined
  if (weekday === "sun" || weekday === "mon" || weekday === "tue" || weekday === "wed" || weekday === "thu" || weekday === "fri" || weekday === "sat") {
    return weekday
  }
  throw new Error(`Unsupported weekday: ${input}. Use sun, mon, tue, wed, thu, fri, or sat.`)
}

function actorId(): string {
  const agentSlug = (process.env.TERMLINGS_AGENT_SLUG || "").trim()
  if (agentSlug) return `agent:${agentSlug}`
  return "human:default"
}

export async function handleAppScheduleCommand(
  config: AppScheduleCommandConfig,
  flags: Set<string>,
  positional: string[],
  opts: Record<string, string>,
): Promise<boolean> {
  if (positional[1] !== "schedule") return false

  const {
    createScheduledAppJob,
    formatScheduledAppJobs,
    listScheduledAppJobs,
    removeScheduledAppJob,
  } = await import("../engine/app-schedules.js")

  const action = positional[2] || "list"
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

  if (action === "list") {
    assertNoExtraPositionalArgs(positional, 3, config.app, "schedule list")
    const schedules = listScheduledAppJobs(config.app)
    if (flags.has("json")) {
      printJson(schedules)
    } else {
      console.log(formatScheduledAppJobs(config.app, schedules))
    }
    return true
  }

  if (action === "create") {
    assertNoExtraPositionalArgs(positional, 3, config.app, "schedule create")
    const body = await readStdinJson<Record<string, unknown>>(flags)
    const recurrence = normalizeRecurrence(readString(body.recurrence, "recurrence"))
    const time = readString(body.time, "time")
    const provider = validateProvider(readOptionalString(body.provider), config.allowedProviders, config.defaultProvider)
    const date = readOptionalString(body.date)
    const weekday = normalizeWeekday(readOptionalString(body.weekday))
    const resolvedTimezone = readOptionalString(body.timezone) || timezone
    const last = readOptionalString(body.last) || "30d"
    const scheduledAction = readOptionalString(body.action) || "sync"
    if (scheduledAction !== "sync") {
      throw new Error(`Unsupported ${config.app} schedule action: ${scheduledAction}. Use sync.`)
    }
    if (recurrence === "once" && !date) {
      throw new Error("One-time app schedules require a date field in the JSON body.")
    }
    if (recurrence === "weekly" && !weekday) {
      throw new Error("Weekly app schedules require a weekday field in the JSON body.")
    }
    const schedule = createScheduledAppJob({
      app: config.app,
      action: "sync",
      provider,
      last,
      recurrence,
      time,
      timezone: resolvedTimezone,
      date,
      weekday,
      createdBy: actorId(),
    })
    if (flags.has("json")) {
      printJson(schedule)
    } else {
      console.log(`✓ Scheduled ${config.app} sync: ${schedule.id}`)
      console.log(`Provider: ${schedule.provider || config.defaultProvider}`)
      console.log(`Window: ${schedule.last || "30d"}`)
      console.log(`Next run: ${schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : "disabled"}`)
    }
    return true
  }

  if (action === "remove") {
    assertNoExtraPositionalArgs(positional, 3, config.app, "schedule remove")
    const params = parseParamsJson(opts)
    const scheduleId = readString(params.id, "id")
    const removed = removeScheduledAppJob(scheduleId, process.cwd(), config.app)
    if (!removed) {
      throw new Error(`No ${config.app} schedule found for ${scheduleId}`)
    }
    if (flags.has("json")) {
      printJson(removed)
    } else {
      console.log(`✓ Removed ${config.app} schedule ${scheduleId}`)
    }
    return true
  }

  throw new Error(`Unknown ${config.app} schedule command: ${action}`)
}
