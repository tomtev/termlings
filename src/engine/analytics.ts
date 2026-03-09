import { createPrivateKey, sign as signBytes } from "crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs"
import { join } from "path"

import { appendAppActivity, resolveAgentActivityThreadId, type AppActivityEntry } from "./activity.js"

export type AnalyticsProvider = "google-analytics"

export interface AnalyticsProperty {
  id: string
  provider: AnalyticsProvider
  propertyId: string
  name: string
  site?: string
  status: "configured" | "synced"
  lastSyncAt?: number
}

export interface AnalyticsTrafficSnapshot {
  ts: number
  propertyId: string
  day: string
  window: "daily"
  sessions: number
  users: number
  pageviews: number
  bounceRate: number
  avgSessionDuration: number
  keyEvents: number
}

export interface AnalyticsChannelSnapshot {
  ts: number
  propertyId: string
  day: string
  channel: string
  sessions: number
  users: number
  keyEvents: number
}

export interface AnalyticsPageSnapshot {
  ts: number
  propertyId: string
  day: string
  path: string
  sessions: number
  users: number
  keyEvents: number
  conversionRate: number
}

export interface AnalyticsConversionSnapshot {
  ts: number
  propertyId: string
  day: string
  sessions: number
  users: number
  keyEvents: number
  conversionRate: number
}

export interface AnalyticsWindowSummary {
  sessions: number
  users: number
  pageviews: number
  bounceRate: number
  avgSessionDuration: number
  keyEvents: number
}

export interface AnalyticsReportEntry {
  value: string
  sessions: number
  users: number
  keyEvents: number
  conversionRate: number
}

export interface AnalyticsReport {
  id: string
  provider: AnalyticsProvider
  propertyId: string
  propertyName: string
  site?: string
  window: string
  from: string
  to: string
  previousFrom: string
  previousTo: string
  generatedAt: number
  current: AnalyticsWindowSummary
  previous: AnalyticsWindowSummary
  delta: AnalyticsWindowSummary
  topChannels: AnalyticsReportEntry[]
  topPages: AnalyticsReportEntry[]
}

export interface AnalyticsSyncState {
  provider: AnalyticsProvider
  propertyId: string
  propertyName: string
  lastSyncAt: number
  lastWindow: string
  counts: {
    traffic: number
    channels: number
    pages: number
    conversions: number
  }
}

export interface AnalyticsWindowSpec {
  label: string
  from: string
  to: string
  previousFrom: string
  previousTo: string
}

export interface SyncAnalyticsOptions {
  provider?: AnalyticsProvider
  last?: string
}

export interface AnalyticsSyncResult {
  property: AnalyticsProperty
  report: AnalyticsReport
  state: AnalyticsSyncState
}

export interface AnalyticsTrafficView {
  property: AnalyticsProperty | null
  window: AnalyticsWindowSpec
  summary: AnalyticsWindowSummary
  daily: AnalyticsTrafficSnapshot[]
}

export interface AnalyticsConversionsView {
  property: AnalyticsProperty | null
  window: AnalyticsWindowSpec
  totalSessions: number
  totalUsers: number
  totalKeyEvents: number
  conversionRate: number
  daily: AnalyticsConversionSnapshot[]
}

export interface GoogleAnalyticsConfig {
  provider: AnalyticsProvider
  propertyId: string
  propertyName: string
  site?: string
  clientEmail: string
  privateKey: string
}

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface GoogleRunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>
    metricValues?: Array<{ value?: string }>
  }>
}

type FetchLike = typeof fetch

const GOOGLE_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_ANALYTICS_RUN_REPORT_BASE = "https://analyticsdata.googleapis.com/v1beta"

function analyticsRoot(root = process.cwd()): string {
  return join(root, ".termlings", "store", "analytics")
}

function analyticsTrafficPath(root = process.cwd()): string {
  return join(analyticsRoot(root), "traffic", "daily.jsonl")
}

function analyticsChannelsPath(root = process.cwd()): string {
  return join(analyticsRoot(root), "channels", "daily.jsonl")
}

function analyticsPagesPath(root = process.cwd()): string {
  return join(analyticsRoot(root), "pages", "daily.jsonl")
}

function analyticsConversionsPath(root = process.cwd()): string {
  return join(analyticsRoot(root), "conversions", "daily.jsonl")
}

function analyticsPropertiesPath(root = process.cwd()): string {
  return join(analyticsRoot(root), "properties.json")
}

function analyticsSyncStatePath(root = process.cwd()): string {
  return join(analyticsRoot(root), "sync-state.json")
}

function analyticsReportsDir(root = process.cwd()): string {
  return join(analyticsRoot(root), "reports")
}

function analyticsReportPath(id: string, root = process.cwd()): string {
  return join(analyticsReportsDir(root), `${id}.json`)
}

export function ensureAnalyticsDirs(root = process.cwd()): void {
  mkdirSync(analyticsRoot(root), { recursive: true })
  mkdirSync(join(analyticsRoot(root), "traffic"), { recursive: true })
  mkdirSync(join(analyticsRoot(root), "channels"), { recursive: true })
  mkdirSync(join(analyticsRoot(root), "pages"), { recursive: true })
  mkdirSync(join(analyticsRoot(root), "conversions"), { recursive: true })
  mkdirSync(analyticsReportsDir(root), { recursive: true })
}

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return fallback
  }
}

function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8")
}

function readJsonLinesFile<T>(path: string): T[] {
  if (!existsSync(path)) return []
  try {
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T)
  } catch {
    return []
  }
}

function writeJsonLinesFile<T>(path: string, rows: T[]): void {
  const content = rows
    .map((row) => JSON.stringify(row))
    .join("\n")
  writeFileSync(path, content.length > 0 ? `${content}\n` : "", "utf8")
}

function isoDay(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

function utcDayFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function startOfUtcDay(date: Date): Date {
  const copy = new Date(date.getTime())
  copy.setUTCHours(0, 0, 0, 0)
  return copy
}

function createWindowFromDays(days: number, now = new Date()): AnalyticsWindowSpec {
  const toDate = startOfUtcDay(now)
  const fromDate = startOfUtcDay(now)
  fromDate.setUTCDate(fromDate.getUTCDate() - days + 1)

  const previousToDate = startOfUtcDay(fromDate)
  previousToDate.setUTCDate(previousToDate.getUTCDate() - 1)
  const previousFromDate = startOfUtcDay(previousToDate)
  previousFromDate.setUTCDate(previousFromDate.getUTCDate() - days + 1)

  return {
    label: `${days}d`,
    from: isoDay(fromDate),
    to: isoDay(toDate),
    previousFrom: isoDay(previousFromDate),
    previousTo: isoDay(previousToDate),
  }
}

function createWindowFromMonths(months: number, now = new Date()): AnalyticsWindowSpec {
  const toDate = startOfUtcDay(now)
  const fromDate = startOfUtcDay(now)
  fromDate.setUTCMonth(fromDate.getUTCMonth() - months)
  fromDate.setUTCDate(fromDate.getUTCDate() + 1)

  const previousToDate = startOfUtcDay(fromDate)
  previousToDate.setUTCDate(previousToDate.getUTCDate() - 1)
  const previousFromDate = startOfUtcDay(previousToDate)
  previousFromDate.setUTCMonth(previousFromDate.getUTCMonth() - months)
  previousFromDate.setUTCDate(previousFromDate.getUTCDate() + 1)

  return {
    label: `${months}m`,
    from: isoDay(fromDate),
    to: isoDay(toDate),
    previousFrom: isoDay(previousFromDate),
    previousTo: isoDay(previousToDate),
  }
}

export function parseAnalyticsWindow(input = "30d", now = new Date()): AnalyticsWindowSpec {
  const normalized = String(input || "30d").trim().toLowerCase()
  const match = normalized.match(/^(\d+)([dm])$/)
  if (!match) {
    throw new Error(`Invalid analytics window: ${input}. Expected values like 7d, 30d, 90d, or 12m.`)
  }

  const count = Number.parseInt(match[1] || "", 10)
  const unit = match[2]
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(`Invalid analytics window: ${input}`)
  }

  if (unit === "d") return createWindowFromDays(count, now)
  return createWindowFromMonths(count, now)
}

function parseGoogleDate(raw: string): string {
  const value = String(raw || "").trim()
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  throw new Error(`Unsupported Google Analytics date value: ${raw}`)
}

function asNumber(raw: string | undefined): number {
  const value = Number(raw || "0")
  return Number.isFinite(value) ? value : 0
}

function round(value: number, places = 4): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function base64url(input: string | Buffer): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function createReportId(window: AnalyticsWindowSpec, generatedAt: number): string {
  const day = isoDay(new Date(generatedAt)).replace(/-/g, "")
  return `rpt_${day}_${window.label}`
}

function ensurePropertyIdPrefix(raw: string): string {
  return String(raw || "").replace(/^properties\//, "").trim()
}

function currentActivityMeta(): Partial<AppActivityEntry> {
  const agentSlug = (process.env.TERMLINGS_AGENT_SLUG || "").trim() || undefined
  const agentDna = (process.env.TERMLINGS_AGENT_DNA || "").trim() || undefined
  const sessionId = (process.env.TERMLINGS_SESSION_ID || "").trim() || undefined
  const agentName = (process.env.TERMLINGS_AGENT_NAME || "").trim() || undefined

  return {
    actorSessionId: sessionId,
    actorName: agentName,
    actorSlug: agentSlug,
    actorDna: agentDna,
    threadId: resolveAgentActivityThreadId({
      agentSlug,
      agentDna,
    }),
  }
}

function appendAnalyticsActivity(kind: string, text: string, result: AppActivityEntry["result"], meta: Record<string, unknown> | undefined, root: string): void {
  appendAppActivity({
    ts: Date.now(),
    app: "analytics",
    kind,
    text,
    result,
    surface: "both",
    level: "summary",
    meta,
    ...currentActivityMeta(),
  }, root)
}

function readStoredProperties(root = process.cwd()): AnalyticsProperty[] {
  return readJsonFile<AnalyticsProperty[]>(analyticsPropertiesPath(root), [])
}

function writeStoredProperties(properties: AnalyticsProperty[], root = process.cwd()): void {
  ensureAnalyticsDirs(root)
  writeJsonFile(analyticsPropertiesPath(root), properties)
}

function writeSyncState(state: AnalyticsSyncState, root = process.cwd()): void {
  ensureAnalyticsDirs(root)
  writeJsonFile(analyticsSyncStatePath(root), state)
}

export function readAnalyticsSyncState(root = process.cwd()): AnalyticsSyncState | null {
  const state = readJsonFile<AnalyticsSyncState | null>(analyticsSyncStatePath(root), null)
  return state && typeof state === "object" ? state : null
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n").trim()
}

export function readGoogleAnalyticsConfig(): GoogleAnalyticsConfig | null {
  const propertyId = ensurePropertyIdPrefix(process.env.GOOGLE_ANALYTICS_PROPERTY_ID || "")
  const clientEmail = String(process.env.GOOGLE_ANALYTICS_CLIENT_EMAIL || "").trim()
  const privateKey = normalizePrivateKey(String(process.env.GOOGLE_ANALYTICS_PRIVATE_KEY || ""))
  if (!propertyId || !clientEmail || !privateKey) return null

  return {
    provider: "google-analytics",
    propertyId,
    propertyName: String(process.env.GOOGLE_ANALYTICS_PROPERTY_NAME || "").trim() || `GA4 ${propertyId}`,
    site: String(process.env.GOOGLE_ANALYTICS_SITE || "").trim() || undefined,
    clientEmail,
    privateKey,
  }
}

export function analyticsConfigHelpText(): string {
  return [
    "Missing Google Analytics configuration.",
    "Add these vars to .termlings/.env:",
    "  GOOGLE_ANALYTICS_PROPERTY_ID=<ga4-property-id>",
    "  GOOGLE_ANALYTICS_CLIENT_EMAIL=<service-account-email>",
    "  GOOGLE_ANALYTICS_PRIVATE_KEY=\"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n\"",
    "Optional:",
    "  GOOGLE_ANALYTICS_PROPERTY_NAME=<display name>",
    "  GOOGLE_ANALYTICS_SITE=<domain or site label>",
    "Grant the service account viewer access to the GA4 property before syncing.",
  ].join("\n")
}

function configuredPropertyFromEnv(root = process.cwd()): AnalyticsProperty | null {
  const config = readGoogleAnalyticsConfig()
  if (!config) return null
  const stored = readStoredProperties(root)
  const existing = stored.find((property) => property.propertyId === config.propertyId)
  return {
    id: `ga4_${config.propertyId}`,
    provider: "google-analytics",
    propertyId: config.propertyId,
    name: config.propertyName,
    site: config.site,
    status: existing?.lastSyncAt ? "synced" : "configured",
    lastSyncAt: existing?.lastSyncAt,
  }
}

export function listAnalyticsProperties(root = process.cwd()): AnalyticsProperty[] {
  const stored = readStoredProperties(root)
  const configured = configuredPropertyFromEnv(root)
  if (!configured) return stored
  const next = stored.filter((property) => property.propertyId !== configured.propertyId)
  next.unshift(configured)
  return next
}

function createJwtAssertion(config: GoogleAnalyticsConfig, now = Date.now()): string {
  const iat = Math.floor(now / 1000)
  const exp = iat + 3600
  const header = base64url(JSON.stringify({
    alg: "RS256",
    typ: "JWT",
  }))
  const payload = base64url(JSON.stringify({
    iss: config.clientEmail,
    scope: GOOGLE_ANALYTICS_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp,
    iat,
  }))
  const signingInput = `${header}.${payload}`
  const privateKey = createPrivateKey({
    key: config.privateKey,
    format: "pem",
  })
  const signature = signBytes("RSA-SHA256", Buffer.from(signingInput, "utf8"), privateKey)
  return `${signingInput}.${base64url(signature)}`
}

async function fetchGoogleAccessToken(config: GoogleAnalyticsConfig, fetchImpl: FetchLike): Promise<string> {
  const assertion = createJwtAssertion(config)
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  })
  const response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  })
  const payload = await response.json() as GoogleTokenResponse
  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`
    throw new Error(`Failed to fetch Google Analytics access token: ${detail}`)
  }
  return payload.access_token
}

async function runGoogleAnalyticsReport(
  config: GoogleAnalyticsConfig,
  accessToken: string,
  body: Record<string, unknown>,
  fetchImpl: FetchLike,
): Promise<GoogleRunReportResponse> {
  const response = await fetchImpl(
    `${GOOGLE_ANALYTICS_RUN_REPORT_BASE}/properties/${config.propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  )
  const payload = await response.json() as GoogleRunReportResponse & { error?: { message?: string } }
  if (!response.ok) {
    const detail = payload.error?.message || `HTTP ${response.status}`
    throw new Error(`Google Analytics report failed: ${detail}`)
  }
  return payload
}

function mapTrafficRows(
  propertyId: string,
  response: GoogleRunReportResponse,
  ts: number,
): AnalyticsTrafficSnapshot[] {
  return (response.rows || []).map((row) => {
    const dimensions = row.dimensionValues || []
    const metrics = row.metricValues || []
    return {
      ts,
      propertyId,
      day: parseGoogleDate(dimensions[0]?.value || ""),
      window: "daily",
      sessions: asNumber(metrics[0]?.value),
      users: asNumber(metrics[1]?.value),
      pageviews: asNumber(metrics[2]?.value),
      bounceRate: round(asNumber(metrics[3]?.value), 6),
      avgSessionDuration: round(asNumber(metrics[4]?.value), 6),
      keyEvents: asNumber(metrics[5]?.value),
    }
  })
}

function mapChannelRows(
  propertyId: string,
  response: GoogleRunReportResponse,
  ts: number,
): AnalyticsChannelSnapshot[] {
  return (response.rows || []).map((row) => {
    const dimensions = row.dimensionValues || []
    const metrics = row.metricValues || []
    return {
      ts,
      propertyId,
      day: parseGoogleDate(dimensions[0]?.value || ""),
      channel: String(dimensions[1]?.value || "(not set)").trim() || "(not set)",
      sessions: asNumber(metrics[0]?.value),
      users: asNumber(metrics[1]?.value),
      keyEvents: asNumber(metrics[2]?.value),
    }
  })
}

function mapPageRows(
  propertyId: string,
  response: GoogleRunReportResponse,
  ts: number,
): AnalyticsPageSnapshot[] {
  return (response.rows || []).map((row) => {
    const dimensions = row.dimensionValues || []
    const metrics = row.metricValues || []
    const sessions = asNumber(metrics[0]?.value)
    const keyEvents = asNumber(metrics[2]?.value)
    return {
      ts,
      propertyId,
      day: parseGoogleDate(dimensions[0]?.value || ""),
      path: String(dimensions[1]?.value || "/").trim() || "/",
      sessions,
      users: asNumber(metrics[1]?.value),
      keyEvents,
      conversionRate: sessions > 0 ? round(keyEvents / sessions, 6) : 0,
    }
  })
}

function mapConversionRows(
  propertyId: string,
  response: GoogleRunReportResponse,
  ts: number,
): AnalyticsConversionSnapshot[] {
  return (response.rows || []).map((row) => {
    const dimensions = row.dimensionValues || []
    const metrics = row.metricValues || []
    const sessions = asNumber(metrics[0]?.value)
    const keyEvents = asNumber(metrics[2]?.value)
    return {
      ts,
      propertyId,
      day: parseGoogleDate(dimensions[0]?.value || ""),
      sessions,
      users: asNumber(metrics[1]?.value),
      keyEvents,
      conversionRate: sessions > 0 ? round(keyEvents / sessions, 6) : 0,
    }
  })
}

function mapSummaryRow(response: GoogleRunReportResponse): AnalyticsWindowSummary {
  const row = response.rows?.[0]
  const metrics = row?.metricValues || []
  return {
    sessions: asNumber(metrics[0]?.value),
    users: asNumber(metrics[1]?.value),
    pageviews: asNumber(metrics[2]?.value),
    bounceRate: round(asNumber(metrics[3]?.value), 6),
    avgSessionDuration: round(asNumber(metrics[4]?.value), 6),
    keyEvents: asNumber(metrics[5]?.value),
  }
}

function byDayAscending<T extends { day: string }>(a: T, b: T): number {
  return a.day.localeCompare(b.day)
}

function upsertSnapshots<T>(existing: T[], incoming: T[], keyFn: (value: T) => string): T[] {
  const map = new Map<string, T>()
  for (const entry of existing) {
    map.set(keyFn(entry), entry)
  }
  for (const entry of incoming) {
    map.set(keyFn(entry), entry)
  }
  return Array.from(map.values())
}

function diffSummary(current: AnalyticsWindowSummary, previous: AnalyticsWindowSummary): AnalyticsWindowSummary {
  return {
    sessions: current.sessions - previous.sessions,
    users: current.users - previous.users,
    pageviews: current.pageviews - previous.pageviews,
    bounceRate: round(current.bounceRate - previous.bounceRate, 6),
    avgSessionDuration: round(current.avgSessionDuration - previous.avgSessionDuration, 6),
    keyEvents: current.keyEvents - previous.keyEvents,
  }
}

function aggregateReportEntries<T extends { sessions: number; users: number; keyEvents: number }>(
  rows: T[],
  key: (value: T) => string,
): AnalyticsReportEntry[] {
  const aggregated = new Map<string, AnalyticsReportEntry>()
  for (const row of rows) {
    const value = key(row)
    const current = aggregated.get(value) || {
      value,
      sessions: 0,
      users: 0,
      keyEvents: 0,
      conversionRate: 0,
    }
    current.sessions += row.sessions
    current.users += row.users
    current.keyEvents += row.keyEvents
    current.conversionRate = current.sessions > 0 ? round(current.keyEvents / current.sessions, 6) : 0
    aggregated.set(value, current)
  }
  return Array.from(aggregated.values())
    .sort((a, b) => b.sessions - a.sessions || b.keyEvents - a.keyEvents || a.value.localeCompare(b.value))
}

function filterWindowRows<T extends { propertyId: string; day: string }>(
  rows: T[],
  propertyId: string,
  window: AnalyticsWindowSpec,
): T[] {
  return rows
    .filter((row) => row.propertyId === propertyId && row.day >= window.from && row.day <= window.to)
    .sort(byDayAscending)
}

function summarizeTrafficRows(rows: AnalyticsTrafficSnapshot[]): AnalyticsWindowSummary {
  if (rows.length <= 0) {
    return {
      sessions: 0,
      users: 0,
      pageviews: 0,
      bounceRate: 0,
      avgSessionDuration: 0,
      keyEvents: 0,
    }
  }
  const totalSessions = rows.reduce((sum, row) => sum + row.sessions, 0)
  const totalUsers = rows.reduce((sum, row) => sum + row.users, 0)
  const totalPageviews = rows.reduce((sum, row) => sum + row.pageviews, 0)
  const totalKeyEvents = rows.reduce((sum, row) => sum + row.keyEvents, 0)
  const bounceWeighted = rows.reduce((sum, row) => sum + row.bounceRate * row.sessions, 0)
  const durationWeighted = rows.reduce((sum, row) => sum + row.avgSessionDuration * row.sessions, 0)
  return {
    sessions: totalSessions,
    users: totalUsers,
    pageviews: totalPageviews,
    bounceRate: totalSessions > 0 ? round(bounceWeighted / totalSessions, 6) : 0,
    avgSessionDuration: totalSessions > 0 ? round(durationWeighted / totalSessions, 6) : 0,
    keyEvents: totalKeyEvents,
  }
}

function writeReport(report: AnalyticsReport, root = process.cwd()): void {
  ensureAnalyticsDirs(root)
  writeJsonFile(analyticsReportPath(report.id, root), report)
}

export function readAnalyticsReports(root = process.cwd()): AnalyticsReport[] {
  if (!existsSync(analyticsReportsDir(root))) return []
  const reports: AnalyticsReport[] = []
  for (const file of readdirSync(analyticsReportsDir(root))) {
    if (!file.endsWith(".json")) continue
    const report = readJsonFile<AnalyticsReport | null>(join(analyticsReportsDir(root), file), null)
    if (!report || typeof report !== "object") continue
    reports.push(report)
  }
  return reports.sort((a, b) => b.generatedAt - a.generatedAt)
}

export function readLatestAnalyticsReport(windowSpec = "30d", root = process.cwd()): AnalyticsReport | null {
  const reports = readAnalyticsReports(root)
  const wanted = String(windowSpec || "30d").trim().toLowerCase()
  return reports.find((report) => report.window === wanted) || reports[0] || null
}

export async function syncAnalytics(
  options: SyncAnalyticsOptions = {},
  root = process.cwd(),
  fetchImpl: FetchLike = fetch,
): Promise<AnalyticsSyncResult> {
  const provider = options.provider || "google-analytics"
  if (provider !== "google-analytics") {
    throw new Error(`Unsupported analytics provider: ${provider}`)
  }

  const config = readGoogleAnalyticsConfig()
  if (!config) {
    throw new Error(analyticsConfigHelpText())
  }

  const window = parseAnalyticsWindow(options.last || "30d")
  ensureAnalyticsDirs(root)

  const accessToken = await fetchGoogleAccessToken(config, fetchImpl)
  const ts = Date.now()

  try {
    const [trafficResponse, channelResponse, pageResponse, conversionResponse, currentSummaryResponse, previousSummaryResponse] =
      await Promise.all([
        runGoogleAnalyticsReport(config, accessToken, {
          dateRanges: [{ startDate: window.from, endDate: window.to }],
          dimensions: [{ name: "date" }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "screenPageViews" },
            { name: "bounceRate" },
            { name: "averageSessionDuration" },
            { name: "keyEvents" },
          ],
        }, fetchImpl),
        runGoogleAnalyticsReport(config, accessToken, {
          dateRanges: [{ startDate: window.from, endDate: window.to }],
          dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "keyEvents" },
          ],
        }, fetchImpl),
        runGoogleAnalyticsReport(config, accessToken, {
          dateRanges: [{ startDate: window.from, endDate: window.to }],
          dimensions: [{ name: "date" }, { name: "landingPagePlusQueryString" }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "keyEvents" },
          ],
        }, fetchImpl),
        runGoogleAnalyticsReport(config, accessToken, {
          dateRanges: [{ startDate: window.from, endDate: window.to }],
          dimensions: [{ name: "date" }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "keyEvents" },
          ],
        }, fetchImpl),
        runGoogleAnalyticsReport(config, accessToken, {
          dateRanges: [{ startDate: window.from, endDate: window.to }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "screenPageViews" },
            { name: "bounceRate" },
            { name: "averageSessionDuration" },
            { name: "keyEvents" },
          ],
        }, fetchImpl),
        runGoogleAnalyticsReport(config, accessToken, {
          dateRanges: [{ startDate: window.previousFrom, endDate: window.previousTo }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "screenPageViews" },
            { name: "bounceRate" },
            { name: "averageSessionDuration" },
            { name: "keyEvents" },
          ],
        }, fetchImpl),
      ])

    const traffic = mapTrafficRows(config.propertyId, trafficResponse, ts).sort(byDayAscending)
    const channels = mapChannelRows(config.propertyId, channelResponse, ts).sort(byDayAscending)
    const pages = mapPageRows(config.propertyId, pageResponse, ts).sort(byDayAscending)
    const conversions = mapConversionRows(config.propertyId, conversionResponse, ts).sort(byDayAscending)

    writeJsonLinesFile(
      analyticsTrafficPath(root),
      upsertSnapshots(
        readJsonLinesFile<AnalyticsTrafficSnapshot>(analyticsTrafficPath(root)),
        traffic,
        (row) => `${row.propertyId}:${row.day}`,
      ).sort(byDayAscending),
    )
    writeJsonLinesFile(
      analyticsChannelsPath(root),
      upsertSnapshots(
        readJsonLinesFile<AnalyticsChannelSnapshot>(analyticsChannelsPath(root)),
        channels,
        (row) => `${row.propertyId}:${row.day}:${row.channel}`,
      ).sort(byDayAscending),
    )
    writeJsonLinesFile(
      analyticsPagesPath(root),
      upsertSnapshots(
        readJsonLinesFile<AnalyticsPageSnapshot>(analyticsPagesPath(root)),
        pages,
        (row) => `${row.propertyId}:${row.day}:${row.path}`,
      ).sort(byDayAscending),
    )
    writeJsonLinesFile(
      analyticsConversionsPath(root),
      upsertSnapshots(
        readJsonLinesFile<AnalyticsConversionSnapshot>(analyticsConversionsPath(root)),
        conversions,
        (row) => `${row.propertyId}:${row.day}`,
      ).sort(byDayAscending),
    )

    const property: AnalyticsProperty = {
      id: `ga4_${config.propertyId}`,
      provider: config.provider,
      propertyId: config.propertyId,
      name: config.propertyName,
      site: config.site,
      status: "synced",
      lastSyncAt: ts,
    }

    writeStoredProperties([
      property,
      ...readStoredProperties(root).filter((entry) => entry.propertyId !== property.propertyId),
    ], root)

    const report: AnalyticsReport = {
      id: createReportId(window, ts),
      provider: config.provider,
      propertyId: config.propertyId,
      propertyName: config.propertyName,
      site: config.site,
      window: window.label,
      from: window.from,
      to: window.to,
      previousFrom: window.previousFrom,
      previousTo: window.previousTo,
      generatedAt: ts,
      current: mapSummaryRow(currentSummaryResponse),
      previous: mapSummaryRow(previousSummaryResponse),
      delta: diffSummary(mapSummaryRow(currentSummaryResponse), mapSummaryRow(previousSummaryResponse)),
      topChannels: aggregateReportEntries(channels, (row) => row.channel).slice(0, 10),
      topPages: aggregateReportEntries(pages, (row) => row.path).slice(0, 10),
    }
    writeReport(report, root)

    const state: AnalyticsSyncState = {
      provider: config.provider,
      propertyId: config.propertyId,
      propertyName: config.propertyName,
      lastSyncAt: ts,
      lastWindow: window.label,
      counts: {
        traffic: traffic.length,
        channels: channels.length,
        pages: pages.length,
        conversions: conversions.length,
      },
    }
    writeSyncState(state, root)

    appendAnalyticsActivity(
      "sync.completed",
      `synced analytics for ${config.propertyName}`,
      "success",
      {
        provider: config.provider,
        propertyId: config.propertyId,
        window: window.label,
        counts: state.counts,
      },
      root,
    )

    return { property, report, state }
  } catch (error) {
    appendAnalyticsActivity(
      "sync.failed",
      `analytics sync failed for ${config.propertyName}`,
      "error",
      {
        provider: config.provider,
        propertyId: config.propertyId,
        window: window.label,
        error: error instanceof Error ? error.message : String(error),
      },
      root,
    )
    throw error
  }
}

export function readAnalyticsTraffic(windowSpec = "30d", root = process.cwd()): AnalyticsTrafficView {
  const window = parseAnalyticsWindow(windowSpec)
  const property = listAnalyticsProperties(root)[0] || null
  const rows = filterWindowRows(
    readJsonLinesFile<AnalyticsTrafficSnapshot>(analyticsTrafficPath(root)),
    property?.propertyId || "",
    window,
  )
  const latestReport = readLatestAnalyticsReport(window.label, root)
  return {
    property,
    window,
    summary: latestReport?.window === window.label ? latestReport.current : summarizeTrafficRows(rows),
    daily: rows,
  }
}

export function readAnalyticsChannels(
  windowSpec = "30d",
  root = process.cwd(),
  limit = 10,
): { property: AnalyticsProperty | null; window: AnalyticsWindowSpec; items: AnalyticsReportEntry[] } {
  const window = parseAnalyticsWindow(windowSpec)
  const property = listAnalyticsProperties(root)[0] || null
  const rows = filterWindowRows(
    readJsonLinesFile<AnalyticsChannelSnapshot>(analyticsChannelsPath(root)),
    property?.propertyId || "",
    window,
  )
  return {
    property,
    window,
    items: aggregateReportEntries(rows, (row) => row.channel).slice(0, Math.max(1, limit)),
  }
}

export function readAnalyticsPages(
  windowSpec = "30d",
  root = process.cwd(),
  limit = 10,
): { property: AnalyticsProperty | null; window: AnalyticsWindowSpec; items: AnalyticsReportEntry[] } {
  const window = parseAnalyticsWindow(windowSpec)
  const property = listAnalyticsProperties(root)[0] || null
  const rows = filterWindowRows(
    readJsonLinesFile<AnalyticsPageSnapshot>(analyticsPagesPath(root)),
    property?.propertyId || "",
    window,
  )
  return {
    property,
    window,
    items: aggregateReportEntries(rows, (row) => row.path).slice(0, Math.max(1, limit)),
  }
}

export function readAnalyticsConversions(windowSpec = "30d", root = process.cwd()): AnalyticsConversionsView {
  const window = parseAnalyticsWindow(windowSpec)
  const property = listAnalyticsProperties(root)[0] || null
  const rows = filterWindowRows(
    readJsonLinesFile<AnalyticsConversionSnapshot>(analyticsConversionsPath(root)),
    property?.propertyId || "",
    window,
  )
  const totalSessions = rows.reduce((sum, row) => sum + row.sessions, 0)
  const totalUsers = rows.reduce((sum, row) => sum + row.users, 0)
  const totalKeyEvents = rows.reduce((sum, row) => sum + row.keyEvents, 0)
  return {
    property,
    window,
    totalSessions,
    totalUsers,
    totalKeyEvents,
    conversionRate: totalSessions > 0 ? round(totalKeyEvents / totalSessions, 6) : 0,
    daily: rows,
  }
}

export function formatAnalyticsProperties(properties: AnalyticsProperty[]): string {
  if (properties.length <= 0) {
    return "No analytics properties configured.\n\n" + analyticsConfigHelpText()
  }
  return properties
    .map((property) => {
      const status = property.status === "synced" ? "synced" : "configured"
      const synced = property.lastSyncAt ? ` • last sync ${new Date(property.lastSyncAt).toISOString()}` : ""
      return `${property.name} (${property.propertyId}) [${status}]${property.site ? ` • ${property.site}` : ""}${synced}`
    })
    .join("\n")
}

function formatPercent(value: number): string {
  return `${round(value * 100, 2).toFixed(2)}%`
}

function formatDurationSeconds(value: number): string {
  const seconds = Math.max(0, Math.round(value))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes <= 0) return `${rest}s`
  return `${minutes}m ${String(rest).padStart(2, "0")}s`
}

export function formatAnalyticsTraffic(view: AnalyticsTrafficView): string {
  if (!view.property) {
    return "No analytics data found.\nRun: termlings analytics sync"
  }
  return [
    `${view.property.name} • ${view.window.label} (${view.window.from} → ${view.window.to})`,
    `sessions: ${view.summary.sessions}`,
    `users: ${view.summary.users}`,
    `pageviews: ${view.summary.pageviews}`,
    `bounce: ${formatPercent(view.summary.bounceRate)}`,
    `avg session: ${formatDurationSeconds(view.summary.avgSessionDuration)}`,
    `key events: ${view.summary.keyEvents}`,
    view.daily.length > 0 ? "" : "No daily traffic rows found.",
    ...view.daily.slice(-10).map((row) => `  ${row.day}  sessions ${row.sessions}  users ${row.users}  pageviews ${row.pageviews}`),
  ]
    .filter(Boolean)
    .join("\n")
}

export function formatAnalyticsEntries(
  label: string,
  property: AnalyticsProperty | null,
  window: AnalyticsWindowSpec,
  items: AnalyticsReportEntry[],
): string {
  if (!property) {
    return "No analytics data found.\nRun: termlings analytics sync"
  }
  if (items.length <= 0) {
    return `${property.name} • ${label} • ${window.label}\nNo rows found.`
  }
  return [
    `${property.name} • ${label} • ${window.label} (${window.from} → ${window.to})`,
    ...items.map((item) => `${item.value}  sessions ${item.sessions}  users ${item.users}  key events ${item.keyEvents}  conversion ${formatPercent(item.conversionRate)}`),
  ].join("\n")
}

export function formatAnalyticsConversions(view: AnalyticsConversionsView): string {
  if (!view.property) {
    return "No analytics data found.\nRun: termlings analytics sync"
  }
  return [
    `${view.property.name} • conversions • ${view.window.label} (${view.window.from} → ${view.window.to})`,
    `sessions: ${view.totalSessions}`,
    `users: ${view.totalUsers}`,
    `key events: ${view.totalKeyEvents}`,
    `conversion rate: ${formatPercent(view.conversionRate)}`,
    view.daily.length > 0 ? "" : "No daily conversion rows found.",
    ...view.daily.slice(-10).map((row) => `  ${row.day}  key events ${row.keyEvents}  conversion ${formatPercent(row.conversionRate)}`),
  ]
    .filter(Boolean)
    .join("\n")
}

export function formatAnalyticsReport(report: AnalyticsReport | null): string {
  if (!report) {
    return "No analytics report found.\nRun: termlings analytics sync"
  }
  return [
    `${report.propertyName} • report • ${report.window} (${report.from} → ${report.to})`,
    report.site ? `site: ${report.site}` : "",
    "",
    `sessions: ${report.current.sessions} (${report.delta.sessions >= 0 ? "+" : ""}${report.delta.sessions})`,
    `users: ${report.current.users} (${report.delta.users >= 0 ? "+" : ""}${report.delta.users})`,
    `pageviews: ${report.current.pageviews} (${report.delta.pageviews >= 0 ? "+" : ""}${report.delta.pageviews})`,
    `bounce: ${formatPercent(report.current.bounceRate)} (${report.delta.bounceRate >= 0 ? "+" : ""}${formatPercent(report.delta.bounceRate)})`,
    `avg session: ${formatDurationSeconds(report.current.avgSessionDuration)} (${report.delta.avgSessionDuration >= 0 ? "+" : ""}${formatDurationSeconds(report.delta.avgSessionDuration)})`,
    `key events: ${report.current.keyEvents} (${report.delta.keyEvents >= 0 ? "+" : ""}${report.delta.keyEvents})`,
    "",
    "top channels:",
    ...report.topChannels.slice(0, 5).map((item) => `  ${item.value}  sessions ${item.sessions}  key events ${item.keyEvents}`),
    "",
    "top pages:",
    ...report.topPages.slice(0, 5).map((item) => `  ${item.value}  sessions ${item.sessions}  key events ${item.keyEvents}`),
  ]
    .filter(Boolean)
    .join("\n")
}

export const __analyticsTestUtils = {
  createJwtAssertion,
}
