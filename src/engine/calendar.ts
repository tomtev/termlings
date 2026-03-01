import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"

export type CalendarRecurrence = "none" | "hourly" | "daily" | "weekly" | "monthly"

export interface CalendarEvent {
  id: string
  title: string
  description: string
  assignedAgents: string[] // Array of session IDs
  startTime: number // Unix timestamp when event starts
  endTime: number // Unix timestamp when event ends
  recurrence: CalendarRecurrence
  nextNotification?: number // Timestamp of next notification to send
  lastNotification?: number // Timestamp of last notification sent
  enabled: boolean
  createdAt: number
  createdBy: string // "OWNER" or session ID
  updatedAt: number
}

function calendarDir(): string {
  return join(process.cwd(), ".termlings", "store", "calendar")
}

function calendarFile(): string {
  return join(calendarDir(), "calendar.json")
}

function generateEventId(): string {
  return `event_${Date.now()}_${Math.random().toString(36).substring(7)}`
}

/**
 * Calculate next notification timestamp based on recurrence
 */
function calculateNextNotification(event: CalendarEvent): number {
  const now = Date.now()

  if (event.recurrence === "none") {
    // One-time event: notify at startTime if not yet notified
    if (!event.lastNotification && event.startTime > now) {
      return event.startTime
    }
    // Already notified or event is in the past - no more notifications
    return Infinity
  }

  const lastNotif = event.lastNotification || event.startTime

  switch (event.recurrence) {
    case "hourly":
      return lastNotif + 60 * 60 * 1000

    case "daily":
      return lastNotif + 24 * 60 * 60 * 1000

    case "weekly":
      return lastNotif + 7 * 24 * 60 * 60 * 1000

    case "monthly":
      return lastNotif + 30 * 24 * 60 * 60 * 1000

    default:
      return Infinity
  }
}

/**
 * Create a new calendar event
 */
export function createCalendarEvent(
  title: string,
  description: string,
  assignedAgents: string[],
  startTime: number,
  endTime: number,
  recurrence: CalendarRecurrence = "none"
): CalendarEvent {
  mkdirSync(calendarDir(), { recursive: true })

  const event: CalendarEvent = {
    id: generateEventId(),
    title,
    description,
    assignedAgents,
    startTime,
    endTime,
    recurrence,
    enabled: true,
    createdAt: Date.now(),
    createdBy: "OWNER",
    updatedAt: Date.now(),
    nextNotification: calculateNextNotification({
      id: "",
      title,
      description,
      assignedAgents,
      startTime,
      endTime,
      recurrence,
      enabled: true,
      createdAt: 0,
      createdBy: "OWNER",
      updatedAt: 0,
    }),
  }

  saveCalendarEvents([...getAllCalendarEvents(), event])
  return event
}

/**
 * Get all calendar events
 */
export function getAllCalendarEvents(): CalendarEvent[] {
  const file = calendarFile()
  try {
    if (!existsSync(file)) {
      return []
    }
    const data = readFileSync(file, "utf-8")
    return JSON.parse(data) as CalendarEvent[]
  } catch (e) {
    console.error(`Error reading calendar events: ${e}`)
    return []
  }
}

/**
 * Get specific calendar event
 */
export function getCalendarEvent(eventId: string): CalendarEvent | null {
  const events = getAllCalendarEvents()
  return events.find(e => e.id === eventId) || null
}

/**
 * Get calendar events assigned to an agent
 */
export function getAgentCalendarEvents(agentId: string): CalendarEvent[] {
  const events = getAllCalendarEvents()
  return events.filter(e => e.assignedAgents.includes(agentId))
}

/**
 * Update calendar event
 */
export function updateCalendarEvent(
  eventId: string,
  updates: Partial<CalendarEvent>
): CalendarEvent | null {
  const events = getAllCalendarEvents()
  const event = events.find(e => e.id === eventId)

  if (!event) return null

  Object.assign(event, updates)
  event.updatedAt = Date.now()

  // Recalculate nextNotification if recurrence or timing changed
  if (updates.recurrence || updates.startTime) {
    event.nextNotification = calculateNextNotification(event)
  }

  saveCalendarEvents(events)
  return event
}

/**
 * Delete calendar event
 */
export function deleteCalendarEvent(eventId: string): boolean {
  const events = getAllCalendarEvents()
  const filtered = events.filter(e => e.id !== eventId)

  if (filtered.length === events.length) return false

  if (filtered.length === 0) {
    try {
      require("fs").unlinkSync(calendarFile())
    } catch {}
  } else {
    saveCalendarEvents(filtered)
  }

  return true
}

/**
 * Enable/disable calendar event
 */
export function toggleCalendarEvent(eventId: string, enabled: boolean): CalendarEvent | null {
  return updateCalendarEvent(eventId, { enabled })
}

/**
 * Check which events should notify now and update them
 */
export function checkAndNotifyCalendarEvents(): Array<{ event: CalendarEvent; shouldNotify: boolean }> {
  const events = getAllCalendarEvents()
  const now = Date.now()
  const results: Array<{ event: CalendarEvent; shouldNotify: boolean }> = []

  for (const event of events) {
    const shouldNotify = event.enabled && event.nextNotification && event.nextNotification <= now

    if (shouldNotify) {
      event.lastNotification = now
      event.nextNotification = calculateNextNotification(event)
    }

    results.push({ event, shouldNotify })
  }

  // Save updated events
  saveCalendarEvents(events)

  return results
}

/**
 * Save calendar events to disk
 */
function saveCalendarEvents(events: CalendarEvent[]): void {
  const file = calendarFile()
  mkdirSync(calendarDir(), { recursive: true })
  writeFileSync(file, JSON.stringify(events, null, 2) + "\n")
}

/**
 * Format calendar event for display
 */
export function formatCalendarEvent(event: CalendarEvent): string {
  const lines: string[] = []

  lines.push(`📅 Calendar Event: ${event.id}`)
  lines.push(`Title: ${event.title}`)
  lines.push(`Status: ${event.enabled ? "✓ Enabled" : "✗ Disabled"}`)

  lines.push("")
  lines.push(`Assigned to: ${event.assignedAgents.length} agent(s)`)
  for (const agentId of event.assignedAgents) {
    lines.push(`  • ${agentId}`)
  }

  lines.push("")
  const startDate = new Date(event.startTime)
  const endDate = new Date(event.endTime)
  lines.push(`Starts: ${startDate.toLocaleString()}`)
  lines.push(`Ends: ${endDate.toLocaleString()}`)
  lines.push(`Recurrence: ${formatRecurrence(event.recurrence)}`)

  if (event.nextNotification && event.nextNotification !== Infinity) {
    const nextDate = new Date(event.nextNotification)
    const minutesUntil = Math.ceil((event.nextNotification - Date.now()) / (1000 * 60))
    lines.push(`Next notification: ${nextDate.toLocaleString()} (in ${minutesUntil} minutes)`)
  }

  if (event.lastNotification) {
    const lastDate = new Date(event.lastNotification)
    lines.push(`Last notification: ${lastDate.toLocaleString()}`)
  }

  lines.push("")
  lines.push(`Description: ${event.description}`)

  return lines.join("\n")
}

/**
 * Format calendar event list
 */
export function formatCalendarEventList(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return "No calendar events scheduled"
  }

  const lines: string[] = []
  lines.push(`📅 Calendar Events (${events.length}):`)
  lines.push("")

  for (const event of events) {
    const status = event.enabled ? "✓" : "✗"
    const nextDate = event.nextNotification && event.nextNotification !== Infinity
      ? new Date(event.nextNotification).toLocaleString()
      : "never"
    const agents = event.assignedAgents.length
    const title = event.title.substring(0, 40) + (event.title.length > 40 ? "..." : "")

    lines.push(`${status} [${event.id}] ${title}`)
    lines.push(`     Assigned to: ${agents} agent(s) | Next: ${nextDate}`)
  }

  lines.push("")
  lines.push("Use: termlings calendar show <id>       - See full details")
  lines.push("     termlings calendar edit <id> ...   - Edit event")
  lines.push("     termlings calendar delete <id>     - Delete event")

  return lines.join("\n")
}

/**
 * Format event list for agents
 */
export function formatAgentCalendarEventList(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return "No calendar events assigned to you"
  }

  const lines: string[] = []
  lines.push(`📅 Your Calendar Events (${events.length}):`)
  lines.push("")

  for (const event of events) {
    const status = event.enabled ? "✓" : "✗"
    const nextDate = event.nextNotification && event.nextNotification !== Infinity
      ? new Date(event.nextNotification).toLocaleString()
      : "never"
    const title = event.title.substring(0, 40) + (event.title.length > 40 ? "..." : "")

    lines.push(`${status} [${event.id}] ${title}`)
    lines.push(`   Next: ${nextDate}`)
  }

  lines.push("")
  lines.push("Use: termlings action calendar show <id> - See full details")

  return lines.join("\n")
}

/**
 * Format recurrence for display
 */
export function formatRecurrence(recurrence: CalendarRecurrence): string {
  switch (recurrence) {
    case "none":
      return "One-time event"
    case "hourly":
      return "Every hour"
    case "daily":
      return "Daily (every 24 hours)"
    case "weekly":
      return "Weekly (every 7 days)"
    case "monthly":
      return "Monthly (every 30 days)"
  }
}
