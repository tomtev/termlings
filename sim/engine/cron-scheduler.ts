import { checkAndRunCrons, getAllCrons } from "./cron.js"
import { writeMessages } from "./ipc.js"

export interface CronExecutionResult {
  cronId: string
  agentId: string
  agentName?: string
  message: string
  executed: boolean
  timestamp: number
}

/**
 * Check and execute all due cron jobs
 * This should be called periodically (e.g., every minute)
 */
export function executeScheduledCrons(room = "default"): CronExecutionResult[] {
  const results: CronExecutionResult[] = []
  const toRun = checkAndRunCrons()

  for (const { cron, shouldRun } of toRun) {
    if (shouldRun) {
      // Send message to agent
      try {
        writeMessages(cron.agentId, [
          {
            from: "SCHEDULER",
            fromName: "Scheduler",
            text: `[CRON JOB] ${cron.message}`,
            ts: Date.now(),
          },
        ])

        results.push({
          cronId: cron.id,
          agentId: cron.agentId,
          agentName: cron.agentName,
          message: cron.message,
          executed: true,
          timestamp: Date.now(),
        })
      } catch (e) {
        console.error(`Failed to execute cron ${cron.id}: ${e}`)
        results.push({
          cronId: cron.id,
          agentId: cron.agentId,
          agentName: cron.agentName,
          message: cron.message,
          executed: false,
          timestamp: Date.now(),
        })
      }
    }
  }

  return results
}

/**
 * Start a background scheduler that runs every minute
 * Returns an interval ID that can be used to stop the scheduler
 */
export function startScheduler(room = "default", intervalSeconds = 60): NodeJS.Timeout {
  console.log(`⏰ Starting cron scheduler (checking every ${intervalSeconds} seconds)`)

  const interval = setInterval(() => {
    const results = executeScheduledCrons(room)

    if (results.length > 0) {
      for (const result of results) {
        if (result.executed) {
          console.log(`✓ Executed cron for ${result.agentName}: "${result.message}"`)
        } else {
          console.error(`✗ Failed to execute cron for ${result.agentName}`)
        }
      }
    }
  }, intervalSeconds * 1000)

  return interval
}

/**
 * Get next scheduled time for any cron job
 */
export function getNextScheduledTime(room = "default"): number | null {
  const crons = getAllCrons()
  const enabled = crons.filter(c => c.enabled && c.nextRun)

  if (enabled.length === 0) return null

  const nextTimes = enabled.map(c => c.nextRun!).sort((a, b) => a - b)
  return nextTimes[0] || null
}

/**
 * Format execution results
 */
export function formatExecutionResults(results: CronExecutionResult[]): string {
  if (results.length === 0) {
    return "No cron jobs executed"
  }

  const lines: string[] = []
  lines.push(`Executed ${results.length} cron job(s):`)
  lines.push("")

  for (const result of results) {
    const status = result.executed ? "✓" : "✗"
    const time = new Date(result.timestamp).toLocaleTimeString()
    lines.push(`${status} [${time}] ${result.agentName}: "${result.message}"`)
  }

  return lines.join("\n")
}
