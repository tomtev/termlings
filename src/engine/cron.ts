import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"


export interface CronJob {
  id: string
  agentId: string              // session ID of agent
  agentName?: string           // display name for convenience
  schedule: string             // cron expression: "0 9 * * *" or simple: "hourly", "daily", "daily@9am"
  message: string              // message to send to agent
  lastRun?: number             // timestamp of last execution
  nextRun?: number             // timestamp of next scheduled execution
  enabled: boolean
  createdAt: number
  createdBy: string            // "OWNER"
  updatedAt: number
}

function cronsDir(): string {
  return join(process.cwd(), ".termlings", "store", "crons")
}

function cronsFile(): string {
  return join(cronsDir(), "crons.json")
}

function generateCronId(): string {
  return `cron_${Date.now()}_${Math.random().toString(36).substring(7)}`
}

/**
 * Parse cron schedule and calculate next run
 */
function parseSchedule(schedule: string): number {
  const now = Date.now()

  // Simple schedules
  if (schedule === "hourly") {
    return now + 60 * 60 * 1000
  }
  if (schedule === "daily") {
    return now + 24 * 60 * 60 * 1000
  }

  // Daily at specific time: "daily@9am", "daily@14:30"
  const dailyMatch = schedule.match(/daily@(\d+)(?::(\d+))?/)
  if (dailyMatch) {
    const hour = parseInt(dailyMatch[1]!)
    const min = parseInt(dailyMatch[2] || "0")

    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(hour, min, 0, 0)

    // If time hasn't passed today, schedule for today
    const today = new Date(now)
    today.setHours(hour, min, 0, 0)
    if (today.getTime() > now) {
      return today.getTime()
    }

    return tomorrow.getTime()
  }

  // Cron expression (simplified - just basic patterns)
  // "0 9 * * *" = daily at 9am
  const cronMatch = schedule.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/)
  if (cronMatch) {
    const min = parseInt(cronMatch[1]!)
    const hour = parseInt(cronMatch[2]!)

    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(hour, min, 0, 0)

    const today = new Date(now)
    today.setHours(hour, min, 0, 0)
    if (today.getTime() > now) {
      return today.getTime()
    }

    return tomorrow.getTime()
  }

  // Default: 1 hour from now
  return now + 60 * 60 * 1000
}

/**
 * Create a new cron job
 */
export function createCronJob(
  agentId: string,
  agentName: string,
  schedule: string,
  message: string
): CronJob {
  mkdirSync(cronsDir(), { recursive: true })

  const cron: CronJob = {
    id: generateCronId(),
    agentId,
    agentName,
    schedule,
    message,
    enabled: true,
    createdAt: Date.now(),
    createdBy: "OWNER",
    updatedAt: Date.now(),
    nextRun: parseSchedule(schedule),
  }

  saveCrons([...getAllCrons(), cron])
  return cron
}

/**
 * Get all cron jobs
 */
export function getAllCrons(): CronJob[] {
  const file = cronsFile()
  try {
    if (!existsSync(file)) {
      return []
    }
    const data = readFileSync(file, "utf-8")
    return JSON.parse(data) as CronJob[]
  } catch (e) {
    console.error(`Error reading crons: ${e}`)
    return []
  }
}

/**
 * Get specific cron job
 */
export function getCron(cronId: string): CronJob | null {
  const crons = getAllCrons()
  return crons.find(c => c.id === cronId) || null
}

/**
 * Get crons for a specific agent
 */
export function getAgentCrons(agentId: string): CronJob[] {
  const crons = getAllCrons()
  return crons.filter(c => c.agentId === agentId)
}

/**
 * Update cron job
 */
export function updateCron(
  cronId: string,
  updates: Partial<CronJob>
): CronJob | null {
  const crons = getAllCrons()
  const cron = crons.find(c => c.id === cronId)

  if (!cron) return null

  Object.assign(cron, updates)
  cron.updatedAt = Date.now()

  // Recalculate nextRun if schedule changed
  if (updates.schedule) {
    cron.nextRun = parseSchedule(updates.schedule)
  }

  saveCrons(crons)
  return cron
}

/**
 * Delete cron job
 */
export function deleteCron(cronId: string): boolean {
  const crons = getAllCrons()
  const filtered = crons.filter(c => c.id !== cronId)

  if (filtered.length === crons.length) return false

  if (filtered.length === 0) {
    try {
      require("fs").unlinkSync(cronsFile())
    } catch {}
  } else {
    saveCrons(filtered)
  }

  return true
}

/**
 * Enable/disable cron job
 */
export function toggleCron(cronId: string, enabled: boolean): CronJob | null {
  return updateCron(cronId, { enabled })
}

/**
 * Check which crons should run now and update them
 */
export function checkAndRunCrons(): Array<{ cron: CronJob; shouldRun: boolean }> {
  const crons = getAllCrons()
  const now = Date.now()
  const results: Array<{ cron: CronJob; shouldRun: boolean }> = []

  for (const cron of crons) {
    const shouldRun = cron.enabled && cron.nextRun && cron.nextRun <= now

    if (shouldRun) {
      cron.lastRun = now
      cron.nextRun = parseSchedule(cron.schedule)
    }

    results.push({ cron, shouldRun })
  }

  // Save updated crons
  saveCrons(crons)

  return results
}

/**
 * Save crons to disk
 */
function saveCrons(crons: CronJob[]): void {
  const file = cronsFile()
  mkdirSync(cronsDir(), { recursive: true })
  writeFileSync(file, JSON.stringify(crons, null, 2) + "\n")
}

/**
 * Format cron for display
 */
export function formatCron(cron: CronJob): string {
  const lines: string[] = []

  lines.push(`⏰ Cron Job: ${cron.id}`)
  lines.push(`Agent: ${cron.agentName} (${cron.agentId})`)
  lines.push(`Schedule: ${cron.schedule}`)
  lines.push(`Status: ${cron.enabled ? "✓ Enabled" : "✗ Disabled"}`)

  if (cron.nextRun) {
    const nextDate = new Date(cron.nextRun)
    const now = new Date()
    const minutesUntil = Math.ceil((cron.nextRun - Date.now()) / (1000 * 60))
    lines.push(`Next run: ${nextDate.toLocaleString()} (in ${minutesUntil} minutes)`)
  }

  if (cron.lastRun) {
    const lastDate = new Date(cron.lastRun)
    lines.push(`Last run: ${lastDate.toLocaleString()}`)
  }

  lines.push("")
  lines.push(`Message: "${cron.message}"`)

  return lines.join("\n")
}

/**
 * Format cron list
 */
export function formatCronList(crons: CronJob[]): string {
  if (crons.length === 0) {
    return "No cron jobs scheduled"
  }

  const lines: string[] = []
  lines.push(`⏰ Scheduled Jobs (${crons.length}):`)
  lines.push("")

  for (const cron of crons) {
    const status = cron.enabled ? "✓" : "✗"
    const nextDate = cron.nextRun ? new Date(cron.nextRun).toLocaleString() : "unknown"
    const msg = cron.message.substring(0, 40) + (cron.message.length > 40 ? "..." : "")

    lines.push(`${status} [${cron.id}] ${cron.agentName}: "${msg}"`)
    lines.push(`     Next: ${nextDate}`)
  }

  lines.push("")
  lines.push("Use: termlings cron show <id>           - See full details")
  lines.push("     termlings cron edit <id> ...       - Edit schedule or message")
  lines.push("     termlings cron delete <id>         - Delete cron job")

  return lines.join("\n")
}

/**
 * Format schedule display
 */
export function formatSchedule(schedule: string): string {
  if (schedule === "hourly") return "Every hour"
  if (schedule === "daily") return "Daily (every 24 hours)"
  if (schedule.startsWith("daily@")) {
    const time = schedule.split("@")[1]
    return `Daily at ${time}`
  }
  if (schedule.match(/^\d+ \d+ \* \* \*$/)) {
    const parts = schedule.split(" ")
    const min = parts[0]
    const hour = parts[1]
    return `Daily at ${hour}:${min}`
  }
  return schedule
}
