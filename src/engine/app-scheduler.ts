import { appendAppActivity } from "./activity.js"
import { calculateScheduledMessageNextRun } from "./message-schedules.js"
import { getAllScheduledAppJobs, saveScheduledAppJobs, type ScheduledAppJob } from "./app-schedules.js"
import type { AnalyticsProvider } from "./analytics.js"
import type { FinanceProvider } from "./finance.js"
import type { AdsProvider } from "./ads.js"

export interface AppScheduleExecutionResult {
  scheduleId: string
  app: ScheduledAppJob["app"]
  action: ScheduledAppJob["action"]
  provider?: string
  window?: string
  recurrence: ScheduledAppJob["recurrence"]
  executed: boolean
  success: boolean
  timestamp: number
  error?: string
}

export interface AppScheduleRuntime {
  analyticsSync?: (options?: { provider?: AnalyticsProvider; last?: string }, root?: string) => Promise<unknown>
  financeSync?: (options?: { provider?: FinanceProvider; last?: string }, root?: string) => Promise<unknown>
  adsSync?: (options?: { provider?: AdsProvider; last?: string }, root?: string) => Promise<unknown>
}

async function runScheduledJob(job: ScheduledAppJob, root: string, runtime: AppScheduleRuntime): Promise<void> {
  if (job.app === "analytics") {
    const sync = runtime.analyticsSync || (await import("./analytics.js")).syncAnalytics
    await sync({
      provider: job.provider as AnalyticsProvider | undefined,
      last: job.last,
    }, root)
    return
  }
  if (job.app === "finance") {
    const sync = runtime.financeSync || (await import("./finance.js")).syncFinance
    await sync({
      provider: job.provider as FinanceProvider | undefined,
      last: job.last,
    }, root)
    return
  }
  if (job.app === "ads") {
    const sync = runtime.adsSync || (await import("./ads.js")).syncAds
    await sync({
      provider: job.provider as AdsProvider | undefined,
      last: job.last,
    }, root)
    return
  }
  throw new Error(`Unsupported scheduled app: ${job.app}`)
}

export async function executeScheduledAppJobs(
  now = Date.now(),
  root = process.cwd(),
  runtime: AppScheduleRuntime = {},
): Promise<AppScheduleExecutionResult[]> {
  const jobs = getAllScheduledAppJobs(root)
  if (jobs.length <= 0) return []
  const results: AppScheduleExecutionResult[] = []

  for (const job of jobs) {
    if (!job.enabled || job.nextRunAt === null || job.nextRunAt > now) {
      continue
    }

    const result: AppScheduleExecutionResult = {
      scheduleId: job.id,
      app: job.app,
      action: job.action,
      provider: job.provider,
      window: job.last,
      recurrence: job.recurrence,
      executed: true,
      success: false,
      timestamp: now,
    }

    job.lastRunAt = now
    job.updatedAt = now

    try {
      await runScheduledJob(job, root, runtime)
      job.lastSuccessAt = now
      job.lastError = undefined
      result.success = true
      appendAppActivity({
        ts: now,
        app: job.app,
        kind: "schedule.executed",
        text: `${job.action} schedule ran successfully`,
        level: "summary",
        surface: "feed",
        result: "success",
        meta: {
          scheduleId: job.id,
          action: job.action,
          provider: job.provider,
          window: job.last,
        },
      }, root)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      job.lastError = message
      result.error = message
      appendAppActivity({
        ts: now,
        app: job.app,
        kind: "schedule.failed",
        text: `${job.action} schedule failed: ${message}`,
        level: "summary",
        surface: "feed",
        result: "error",
        meta: {
          scheduleId: job.id,
          action: job.action,
          provider: job.provider,
          window: job.last,
          error: message,
        },
      }, root)
    }

    if (job.recurrence === "once") {
      job.enabled = false
      job.nextRunAt = null
    } else {
      job.nextRunAt = calculateScheduledMessageNextRun(job, now + 1_000)
    }

    results.push(result)
  }

  saveScheduledAppJobs(jobs, root)
  return results
}

export function formatAppScheduleExecutionResults(results: AppScheduleExecutionResult[]): string {
  if (results.length <= 0) return "No scheduled app work to execute"
  return results.map((result) => {
    const prefix = result.success ? "✓" : "✗"
    const detail = result.error ? ` (${result.error})` : ""
    return `${prefix} ${result.app} ${result.action}${result.window ? ` ${result.window}` : ""} -> ${result.provider || result.app}${detail}`
  }).join("\n")
}
