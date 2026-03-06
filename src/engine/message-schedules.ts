import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

export type MessageScheduleRecurrence = "once" | "hourly" | "daily" | "weekly"
export type MessageScheduleWeekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"

export interface ScheduledMessage {
  id: string
  target: string
  targetName?: string
  targetDna?: string
  text: string
  recurrence: MessageScheduleRecurrence
  time: string
  timezone: string
  date?: string
  weekday?: MessageScheduleWeekday
  nextRunAt: number | null
  lastRunAt?: number
  enabled: boolean
  createdAt: number
  createdBy: string
  updatedAt: number
}

export interface CreateScheduledMessageInput {
  target: string
  targetName?: string
  targetDna?: string
  text: string
  recurrence: MessageScheduleRecurrence
  time: string
  timezone: string
  date?: string
  weekday?: MessageScheduleWeekday
  createdBy: string
}

interface LocalDateParts {
  year: number
  month: number
  day: number
}

interface LocalDateTimeParts extends LocalDateParts {
  hour: number
  minute: number
  second: number
  weekday: MessageScheduleWeekday
}

const WEEKDAYS: MessageScheduleWeekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
const WEEKDAY_LABELS: Record<MessageScheduleWeekday, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function schedulesDir(root: string): string {
  return join(root, ".termlings", "store", "message-schedules")
}

function schedulesFile(root: string): string {
  return join(schedulesDir(root), "schedules.json")
}

function scheduleFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  })
  formatterCache.set(timezone, formatter)
  return formatter
}

function ensureTimezone(timezone: string): string {
  const normalized = timezone.trim()
  if (!normalized) {
    throw new Error("Timezone is required.")
  }
  try {
    scheduleFormatter(normalized).format(new Date(0))
    return normalized
  } catch {
    throw new Error(`Invalid timezone "${timezone}". Use an IANA timezone like "Europe/Oslo" or "UTC".`)
  }
}

function ensureTarget(target: string): string {
  const normalized = target.trim()
  if (!normalized) {
    throw new Error("Target is required.")
  }
  if (normalized === "everyone") {
    return normalized
  }
  if (normalized.startsWith("agent:")) {
    if (normalized.slice("agent:".length).trim().length === 0) {
      throw new Error("Agent target cannot be empty.")
    }
    return normalized
  }
  if (normalized.startsWith("human:")) {
    if (normalized.slice("human:".length).trim().length === 0) {
      throw new Error("Human target cannot be empty.")
    }
    return normalized
  }
  throw new Error(`Invalid target "${target}". Use agent:<slug> or human:<id>.`)
}

function parseTime(time: string): { hour: number; minute: number; normalized: string } {
  const match = time.trim().match(/^(\d{2}):(\d{2})$/)
  if (!match) {
    throw new Error(`Invalid time "${time}". Use HH:MM in 24-hour format.`)
  }

  const hour = Number.parseInt(match[1]!, 10)
  const minute = Number.parseInt(match[2]!, 10)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Invalid time "${time}". Hour must be between 00 and 23.`)
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error(`Invalid time "${time}". Minute must be between 00 and 59.`)
  }

  return {
    hour,
    minute,
    normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  }
}

function parseDate(date: string): { year: number; month: number; day: number; normalized: string } {
  const match = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new Error(`Invalid date "${date}". Use YYYY-MM-DD.`)
  }

  const year = Number.parseInt(match[1]!, 10)
  const month = Number.parseInt(match[2]!, 10)
  const day = Number.parseInt(match[3]!, 10)
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() + 1 !== month
    || probe.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date "${date}".`)
  }

  return {
    year,
    month,
    day,
    normalized: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  }
}

function parseWeekday(weekday: string): MessageScheduleWeekday {
  const normalized = weekday.trim().toLowerCase() as MessageScheduleWeekday
  if (!WEEKDAYS.includes(normalized)) {
    throw new Error(`Invalid weekday "${weekday}". Use one of: ${WEEKDAYS.join(", ")}.`)
  }
  return normalized
}

function getLocalDateTimeParts(timestamp: number, timezone: string): LocalDateTimeParts {
  const parts = scheduleFormatter(timezone).formatToParts(new Date(timestamp))
  const record: Record<string, string> = {}
  for (const part of parts) {
    if (part.type === "literal") continue
    record[part.type] = part.value
  }

  const weekdayRaw = (record.weekday || "").slice(0, 3).toLowerCase() as MessageScheduleWeekday
  const weekday = WEEKDAYS.includes(weekdayRaw) ? weekdayRaw : "sun"
  return {
    year: Number.parseInt(record.year || "0", 10),
    month: Number.parseInt(record.month || "0", 10),
    day: Number.parseInt(record.day || "0", 10),
    hour: Number.parseInt(record.hour || "0", 10),
    minute: Number.parseInt(record.minute || "0", 10),
    second: Number.parseInt(record.second || "0", 10),
    weekday,
  }
}

function toComparableUtc(parts: Omit<LocalDateTimeParts, "weekday">): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

function toUtcFromLocal(
  date: LocalDateParts,
  time: { hour: number; minute: number },
  timezone: string,
): number {
  let guess = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, 0)
  const desired = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, 0)

  for (let index = 0; index < 4; index += 1) {
    const actual = getLocalDateTimeParts(guess, timezone)
    const comparable = toComparableUtc({
      year: actual.year,
      month: actual.month,
      day: actual.day,
      hour: actual.hour,
      minute: actual.minute,
      second: actual.second,
    })
    const diff = desired - comparable
    if (diff === 0) return guess
    guess += diff
  }

  return guess
}

function addLocalDays(date: LocalDateParts, delta: number): LocalDateParts {
  const probe = new Date(Date.UTC(date.year, date.month - 1, date.day))
  probe.setUTCDate(probe.getUTCDate() + delta)
  return {
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate(),
  }
}

export function calculateScheduledMessageNextRun(
  input: Pick<ScheduledMessage, "recurrence" | "time" | "timezone" | "date" | "weekday">,
  now = Date.now(),
): number | null {
  const timezone = ensureTimezone(input.timezone)
  const time = parseTime(input.time)

  if (input.recurrence === "once") {
    if (!input.date) {
      throw new Error("One-time schedules require a date.")
    }
    const date = parseDate(input.date)
    const runAt = toUtcFromLocal(date, time, timezone)
    return runAt > now ? runAt : null
  }

  const localNow = getLocalDateTimeParts(now, timezone)
  const today: LocalDateParts = {
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
  }

  if (input.recurrence === "daily") {
    let candidateDate = today
    let candidate = toUtcFromLocal(candidateDate, time, timezone)
    if (candidate <= now) {
      candidateDate = addLocalDays(today, 1)
      candidate = toUtcFromLocal(candidateDate, time, timezone)
    }
    return candidate
  }

  if (input.recurrence === "hourly") {
    let candidateDate = today
    let candidate = toUtcFromLocal(candidateDate, { hour: localNow.hour, minute: time.minute }, timezone)
    if (candidate <= now) {
      const nextHourProbe = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day, localNow.hour, 0, 0))
      nextHourProbe.setUTCHours(nextHourProbe.getUTCHours() + 1)
      const nextHourLocal = getLocalDateTimeParts(nextHourProbe.getTime(), timezone)
      candidateDate = {
        year: nextHourLocal.year,
        month: nextHourLocal.month,
        day: nextHourLocal.day,
      }
      candidate = toUtcFromLocal(candidateDate, { hour: nextHourLocal.hour, minute: time.minute }, timezone)
    }
    return candidate
  }

  const weekday = parseWeekday(input.weekday || "")
  let delta = (WEEKDAYS.indexOf(weekday) - WEEKDAYS.indexOf(localNow.weekday) + 7) % 7
  let candidateDate = addLocalDays(today, delta)
  let candidate = toUtcFromLocal(candidateDate, time, timezone)
  if (candidate <= now) {
    delta += delta === 0 ? 7 : 0
    candidateDate = addLocalDays(today, delta === 0 ? 7 : delta)
    candidate = toUtcFromLocal(candidateDate, time, timezone)
    if (candidate <= now) {
      candidateDate = addLocalDays(candidateDate, 7)
      candidate = toUtcFromLocal(candidateDate, time, timezone)
    }
  }
  return candidate
}

function sanitizeSchedule(raw: unknown): ScheduledMessage | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null

  const record = raw as Record<string, unknown>
  const target = typeof record.target === "string" ? record.target.trim() : ""
  const text = typeof record.text === "string" ? record.text.trim() : ""
  const recurrence = record.recurrence
  const time = typeof record.time === "string" ? record.time.trim() : ""
  const timezone = typeof record.timezone === "string" ? record.timezone.trim() : ""
  const createdBy = typeof record.createdBy === "string" ? record.createdBy.trim() : ""
  const id = typeof record.id === "string" ? record.id : ""

  if (!id || !target || !text || !time || !timezone || !createdBy) return null
  if (recurrence !== "once" && recurrence !== "hourly" && recurrence !== "daily" && recurrence !== "weekly") return null

  try {
    ensureTarget(target)
    ensureTimezone(timezone)
    parseTime(time)
    if (recurrence === "once") {
      if (typeof record.date !== "string") return null
      parseDate(record.date)
    }
    if (recurrence === "weekly") {
      if (typeof record.weekday !== "string") return null
      parseWeekday(record.weekday)
    }
  } catch {
    return null
  }

  const nextRunAt = typeof record.nextRunAt === "number" && Number.isFinite(record.nextRunAt)
    ? record.nextRunAt
    : null
  const lastRunAt = typeof record.lastRunAt === "number" && Number.isFinite(record.lastRunAt)
    ? record.lastRunAt
    : undefined
  const createdAt = typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
    ? record.createdAt
    : Date.now()
  const updatedAt = typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : createdAt

  return {
    id,
    target,
    targetName: typeof record.targetName === "string" ? record.targetName : undefined,
    targetDna: typeof record.targetDna === "string" ? record.targetDna : undefined,
    text,
    recurrence,
    time,
    timezone,
    date: typeof record.date === "string" ? record.date : undefined,
    weekday: typeof record.weekday === "string" ? record.weekday as MessageScheduleWeekday : undefined,
    nextRunAt,
    lastRunAt,
    enabled: record.enabled !== false,
    createdAt,
    createdBy,
    updatedAt,
  }
}

export function getAllScheduledMessages(root = process.cwd()): ScheduledMessage[] {
  const path = schedulesFile(root)
  if (!existsSync(path)) return []

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(sanitizeSchedule)
      .filter((entry): entry is ScheduledMessage => Boolean(entry))
      .sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

export function saveScheduledMessages(schedules: ScheduledMessage[], root = process.cwd()): void {
  mkdirSync(schedulesDir(root), { recursive: true })
  writeFileSync(schedulesFile(root), JSON.stringify(schedules, null, 2) + "\n", "utf8")
}

export function createScheduledMessage(
  input: CreateScheduledMessageInput,
  root = process.cwd(),
  now = Date.now(),
): ScheduledMessage {
  const target = ensureTarget(input.target)
  const text = input.text.trim()
  if (!text) {
    throw new Error("Message text is required.")
  }

  if (input.recurrence !== "once" && input.recurrence !== "hourly" && input.recurrence !== "daily" && input.recurrence !== "weekly") {
    throw new Error(`Unsupported schedule recurrence "${String(input.recurrence)}".`)
  }

  const timezone = ensureTimezone(input.timezone)
  const time = parseTime(input.time).normalized
  const date = input.date ? parseDate(input.date).normalized : undefined
  const weekday = input.weekday ? parseWeekday(input.weekday) : undefined
  const nextRunAt = calculateScheduledMessageNextRun(
    {
      recurrence: input.recurrence,
      time,
      timezone,
      date,
      weekday,
    },
    now,
  )

  if (nextRunAt === null) {
    throw new Error("Scheduled time must be in the future.")
  }

  const schedule: ScheduledMessage = {
    id: `schedule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    target,
    targetName: input.targetName?.trim() || undefined,
    targetDna: input.targetDna?.trim() || undefined,
    text,
    recurrence: input.recurrence,
    time,
    timezone,
    date,
    weekday,
    nextRunAt,
    enabled: true,
    createdAt: now,
    createdBy: input.createdBy.trim() || "human:default",
    updatedAt: now,
  }

  saveScheduledMessages([...getAllScheduledMessages(root), schedule], root)
  return schedule
}

export function describeScheduledMessage(schedule: Pick<ScheduledMessage, "recurrence" | "time" | "timezone" | "date" | "weekday">): string {
  if (schedule.recurrence === "once") {
    return `once on ${schedule.date} at ${schedule.time} ${schedule.timezone}`
  }
  if (schedule.recurrence === "hourly") {
    return `hourly at :${schedule.time.slice(3)} ${schedule.timezone}`
  }
  if (schedule.recurrence === "weekly") {
    const weekday = schedule.weekday ? WEEKDAY_LABELS[schedule.weekday] : "?"
    return `weekly on ${weekday} at ${schedule.time} ${schedule.timezone}`
  }
  return `daily at ${schedule.time} ${schedule.timezone}`
}
