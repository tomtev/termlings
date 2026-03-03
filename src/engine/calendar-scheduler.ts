import { checkAndNotifyCalendarEvents, getAllCalendarEvents } from "./calendar.js"
import { writeMessages } from "./ipc.js"
import { listSessions } from "../workspace/state.js"
import { discoverLocalAgents } from "../agents/discover.js"

export interface CalendarExecutionResult {
  eventId: string
  title: string
  agentsNotified: string[]
  executed: boolean
  timestamp: number
}

/**
 * Check and execute all due calendar events
 * This should be called periodically (e.g., every minute)
 */
export function executeScheduledCalendarEvents(): CalendarExecutionResult[] {
  const results: CalendarExecutionResult[] = []
  const toNotify = checkAndNotifyCalendarEvents()

  for (const { event, shouldNotify } of toNotify) {
    if (shouldNotify) {
      // Send message to each assigned agent (resolve slug to session)
      const localAgents = discoverLocalAgents()
      const sessions = listSessions()
      for (const agentSlug of event.assignedAgents) {
        try {
          // Resolve slug to DNA, then find active session
          const agent = localAgents.find((a) => a.name === agentSlug)
          const dna = agent?.soul?.dna
          if (dna) {
            const session = sessions
              .filter((s) => s.dna === dna)
              .sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0]
            if (session) {
              writeMessages(session.sessionId, [
                {
                  from: "SCHEDULER",
                  fromName: "Scheduler",
                  text: `[CALENDAR] ${event.title}: ${event.description}`,
                  ts: Date.now(),
                },
              ])
            }
          }
        } catch (e) {
          console.error(`Failed to notify agent ${agentSlug} for event ${event.id}: ${e}`)
        }
      }

      results.push({
        eventId: event.id,
        title: event.title,
        agentsNotified: event.assignedAgents,
        executed: true,
        timestamp: Date.now(),
      })
    }
  }

  return results
}

/**
 * Start a background scheduler that runs every minute
 * Returns an interval ID that can be used to stop the scheduler
 */
export function startScheduler(intervalSeconds = 60): NodeJS.Timeout {
  console.log(`📅 Starting calendar scheduler (checking every ${intervalSeconds} seconds)`)

  const interval = setInterval(() => {
    const results = executeScheduledCalendarEvents()

    if (results.length > 0) {
      for (const result of results) {
        if (result.executed) {
          const agentList = result.agentsNotified.join(", ")
          console.log(`✓ Calendar event "${result.title}" notified ${result.agentsNotified.length} agent(s): ${agentList}`)
        }
      }
    }
  }, intervalSeconds * 1000)

  return interval
}

/**
 * Get next scheduled notification time for any calendar event
 */
export function getNextScheduledTime(): number | null {
  const events = getAllCalendarEvents()
  const enabled = events.filter(e => e.enabled && e.nextNotification && e.nextNotification !== Infinity)

  if (enabled.length === 0) return null

  const nextTimes = enabled.map(e => e.nextNotification!).sort((a, b) => a - b)
  return nextTimes[0] || null
}

/**
 * Format execution results
 */
export function formatExecutionResults(results: CalendarExecutionResult[]): string {
  if (results.length === 0) {
    return "No calendar events executed"
  }

  const lines: string[] = []
  lines.push(`Executed ${results.length} calendar event(s):`)
  lines.push("")

  for (const result of results) {
    const time = new Date(result.timestamp).toLocaleTimeString()
    const agentList = result.agentsNotified.join(", ")
    lines.push(`✓ [${time}] "${result.title}" → ${result.agentsNotified.length} agent(s)`)
    if (result.agentsNotified.length > 0) {
      lines.push(`           ${agentList}`)
    }
  }

  return lines.join("\n")
}
