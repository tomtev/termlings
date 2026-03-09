import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs"
import { join } from "path"

import { appendAppActivity, resolveAgentActivityThreadId, type AppActivityEntry } from "./activity.js"

export type AdsProvider = "meta"

export interface AdsAccount {
  id: string
  provider: AdsProvider
  providerAccountId: string
  name: string
  currency: string
  status: "configured" | "synced"
  accountStatus?: string
  lastSyncAt?: number
}

export interface AdsCampaign {
  id: string
  provider: AdsProvider
  accountId: string
  providerCampaignId: string
  name: string
  objective?: string
  status: string
  effectiveStatus?: string
  dailyBudget?: number
  lifetimeBudget?: number
  createdAt: number
  updatedAt: number
}

export interface AdsCreative {
  id: string
  provider: AdsProvider
  accountId: string
  providerCreativeId: string
  adId: string
  adName: string
  campaignId?: string
  campaignName?: string
  name?: string
  status: string
  effectiveStatus?: string
  createdAt: number
  updatedAt: number
}

export interface AdsCampaignMetrics {
  campaignId: string
  campaignName: string
  spend: number
  impressions: number
  clicks: number
  reach: number
  ctr: number
  cpc: number
  cpm: number
}

export interface AdsMetricsSnapshot {
  ts: number
  window: string
  currency: string
  spend: number
  impressions: number
  clicks: number
  reach: number
  ctr: number
  cpc: number
  cpm: number
  campaignCount: number
}

export interface AdsReport {
  id: string
  provider: AdsProvider
  accountId: string
  accountName: string
  window: string
  from: string
  to: string
  previousFrom: string
  previousTo: string
  generatedAt: number
  current: AdsMetricsSnapshot
  previous: AdsMetricsSnapshot
  delta: AdsMetricsSnapshot
  topCampaigns: AdsCampaignMetrics[]
}

export interface AdsSyncState {
  provider: AdsProvider
  accountId: string
  accountName: string
  lastSyncAt: number
  lastWindow: string
  counts: {
    campaigns: number
    creatives: number
    campaignMetrics: number
  }
}

export interface AdsWindowSpec {
  label: string
  from: string
  to: string
  previousFrom: string
  previousTo: string
}

export interface SyncAdsOptions {
  provider?: AdsProvider
  last?: string
}

export interface AdsSyncResult {
  account: AdsAccount
  report: AdsReport
  state: AdsSyncState
}

export interface AdsMetricsView {
  account: AdsAccount | null
  window: AdsWindowSpec
  snapshot: AdsMetricsSnapshot
}

interface MetaAdsConfig {
  provider: AdsProvider
  accessToken: string
  accountId: string
  accountName: string
  site?: string
  apiVersion: string
}

interface MetaPaging {
  next?: string
}

interface MetaListResponse<T> {
  data?: T[]
  paging?: MetaPaging
}

interface MetaAccountResponse {
  id?: string
  account_id?: string
  name?: string
  currency?: string
  account_status?: number | string
}

interface MetaCampaign {
  id: string
  name?: string
  objective?: string
  status?: string
  effective_status?: string
  daily_budget?: string
  lifetime_budget?: string
  created_time?: string
  updated_time?: string
}

interface MetaAd {
  id: string
  name?: string
  status?: string
  effective_status?: string
  created_time?: string
  updated_time?: string
  campaign?: {
    id?: string
    name?: string
  }
  creative?: {
    id?: string
    name?: string
  }
}

interface MetaInsightsRow {
  campaign_id?: string
  campaign_name?: string
  spend?: string
  impressions?: string
  clicks?: string
  reach?: string
  ctr?: string
  cpc?: string
  cpm?: string
}

type FetchLike = typeof fetch

function adsRoot(root = process.cwd()): string {
  return join(root, ".termlings", "store", "ads")
}

function adsCampaignsDir(root = process.cwd()): string {
  return join(adsRoot(root), "campaigns")
}

function adsCreativesDir(root = process.cwd()): string {
  return join(adsRoot(root), "creatives")
}

function adsMetricsDir(root = process.cwd()): string {
  return join(adsRoot(root), "metrics")
}

function adsReportsDir(root = process.cwd()): string {
  return join(adsRoot(root), "reports")
}

function adsProvidersPath(root = process.cwd()): string {
  return join(adsRoot(root), "providers.json")
}

function adsSyncStatePath(root = process.cwd()): string {
  return join(adsRoot(root), "sync-state.json")
}

function adsMetricsDailyPath(root = process.cwd()): string {
  return join(adsMetricsDir(root), "daily.jsonl")
}

function adsCampaignMetricsPath(window: string, root = process.cwd()): string {
  return join(adsMetricsDir(root), `${window}-campaigns.json`)
}

function adsReportPath(id: string, root = process.cwd()): string {
  return join(adsReportsDir(root), `${id}.json`)
}

export function ensureAdsDirs(root = process.cwd()): void {
  mkdirSync(adsRoot(root), { recursive: true })
  mkdirSync(adsCampaignsDir(root), { recursive: true })
  mkdirSync(adsCreativesDir(root), { recursive: true })
  mkdirSync(adsMetricsDir(root), { recursive: true })
  mkdirSync(adsReportsDir(root), { recursive: true })
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
  const content = rows.map((row) => JSON.stringify(row)).join("\n")
  writeFileSync(path, content.length > 0 ? `${content}\n` : "", "utf8")
}

function isoDay(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

function startOfUtcDay(date: Date): Date {
  const copy = new Date(date.getTime())
  copy.setUTCHours(0, 0, 0, 0)
  return copy
}

function createWindowFromDays(days: number, now = new Date()): AdsWindowSpec {
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

function createWindowFromMonths(months: number, now = new Date()): AdsWindowSpec {
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

export function parseAdsWindow(input = "30d", now = new Date()): AdsWindowSpec {
  const normalized = String(input || "30d").trim().toLowerCase()
  const match = normalized.match(/^(\d+)([dm])$/)
  if (!match) {
    throw new Error(`Invalid ads window: ${input}. Expected values like 7d, 30d, 90d, or 12m.`)
  }
  const count = Number.parseInt(match[1] || "", 10)
  const unit = match[2]
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(`Invalid ads window: ${input}`)
  }
  if (unit === "d") return createWindowFromDays(count, now)
  return createWindowFromMonths(count, now)
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
    threadId: resolveAgentActivityThreadId({ agentSlug, agentDna }),
  }
}

function appendAdsActivity(kind: string, text: string, result: AppActivityEntry["result"], meta: Record<string, unknown> | undefined, root: string): void {
  appendAppActivity({
    ts: Date.now(),
    app: "ads",
    kind,
    text,
    result,
    surface: "both",
    level: "summary",
    meta,
    ...currentActivityMeta(),
  }, root)
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function asTimestamp(value: string | undefined): number {
  if (!value) return 0
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

function parseMoney(value: string | undefined): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeCurrency(value: string | undefined, fallback = "usd"): string {
  return String(value || fallback).trim().toLowerCase() || fallback
}

function readMetaAdsConfig(): MetaAdsConfig | null {
  const accessToken = String(process.env.META_ADS_ACCESS_TOKEN || "").trim()
  const accountId = String(process.env.META_AD_ACCOUNT_ID || "").trim().replace(/^act_/, "")
  if (!accessToken || !accountId) return null
  return {
    provider: "meta",
    accessToken,
    accountId,
    accountName: String(process.env.META_ADS_ACCOUNT_NAME || "").trim() || "Main Meta Ads Account",
    site: String(process.env.META_ADS_SITE || "").trim() || undefined,
    apiVersion: String(process.env.META_ADS_API_VERSION || "v24.0").trim() || "v24.0",
  }
}

export function adsConfigHelpText(): string {
  return [
    "Missing Meta ads configuration.",
    "Add these vars to .termlings/.env:",
    "  META_ADS_ACCESS_TOKEN=<meta-marketing-api-token>",
    "  META_AD_ACCOUNT_ID=<ad-account-id-without-act_>",
    "Optional:",
    "  META_ADS_ACCOUNT_NAME=<display name>",
    "  META_ADS_SITE=<site or business label>",
    "  META_ADS_API_VERSION=v24.0",
  ].join("\n")
}

function accountIdForProvider(provider: AdsProvider, providerAccountId: string): string {
  return provider === "meta" ? `acct_meta_${providerAccountId}` : `acct_unknown_${providerAccountId}`
}

function readDirectoryRecords<T>(dir: string): T[] {
  if (!existsSync(dir)) return []
  const items: T[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    const record = readJsonFile<T | null>(join(dir, file), null)
    if (record) items.push(record)
  }
  return items
}

function writeDirectoryRecord(dir: string, id: string, value: unknown, root = process.cwd()): void {
  ensureAdsDirs(root)
  writeJsonFile(join(dir, `${id}.json`), value)
}

function writeEntityRecords<T extends { id: string }>(dir: string, items: T[], root = process.cwd()): void {
  for (const item of items) {
    writeDirectoryRecord(dir, item.id, item, root)
  }
}

function configuredAccountFromEnv(root = process.cwd()): AdsAccount | null {
  const config = readMetaAdsConfig()
  if (!config) return null
  const stored = readJsonFile<AdsAccount[]>(adsProvidersPath(root), [])
  const existing = stored.find((account) => account.id === accountIdForProvider(config.provider, config.accountId))
  return {
    id: accountIdForProvider(config.provider, config.accountId),
    provider: config.provider,
    providerAccountId: config.accountId,
    name: config.accountName,
    currency: existing?.currency || "usd",
    status: existing?.lastSyncAt ? "synced" : "configured",
    accountStatus: existing?.accountStatus,
    lastSyncAt: existing?.lastSyncAt,
  }
}

export function listAdsAccounts(root = process.cwd()): AdsAccount[] {
  const stored = readJsonFile<AdsAccount[]>(adsProvidersPath(root), [])
  const configured = configuredAccountFromEnv(root)
  if (!configured) return stored
  return [configured, ...stored.filter((account) => account.id !== configured.id)]
}

async function metaFetchJson<T>(url: string, accessToken: string, fetchImpl: FetchLike): Promise<T> {
  const parsed = new URL(url)
  parsed.searchParams.set("access_token", accessToken)
  const response = await fetchImpl(parsed.toString())
  const payload = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message || `Meta ads request failed: HTTP ${response.status}`)
  }
  return payload
}

async function metaListAll<T>(
  url: string,
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<T[]> {
  const items: T[] = []
  let nextUrl: string | undefined = url
  while (nextUrl) {
    const payload = await metaFetchJson<MetaListResponse<T>>(nextUrl, accessToken, fetchImpl)
    const page = Array.isArray(payload.data) ? payload.data : []
    items.push(...page)
    nextUrl = payload.paging?.next
  }
  return items
}

function mapMetaCampaign(campaign: MetaCampaign, accountId: string): AdsCampaign {
  return {
    id: `cmp_meta_${campaign.id}`,
    provider: "meta",
    accountId,
    providerCampaignId: campaign.id,
    name: asString(campaign.name) || campaign.id,
    objective: asString(campaign.objective),
    status: asString(campaign.status) || "unknown",
    effectiveStatus: asString(campaign.effective_status),
    dailyBudget: campaign.daily_budget ? parseMoney(campaign.daily_budget) : undefined,
    lifetimeBudget: campaign.lifetime_budget ? parseMoney(campaign.lifetime_budget) : undefined,
    createdAt: asTimestamp(campaign.created_time),
    updatedAt: asTimestamp(campaign.updated_time) || asTimestamp(campaign.created_time),
  }
}

function mapMetaAd(ad: MetaAd, accountId: string): AdsCreative {
  const creativeId = asString(ad.creative?.id) || ad.id
  return {
    id: `crt_meta_${creativeId}_${ad.id}`,
    provider: "meta",
    accountId,
    providerCreativeId: creativeId,
    adId: ad.id,
    adName: asString(ad.name) || ad.id,
    campaignId: ad.campaign?.id ? `cmp_meta_${ad.campaign.id}` : undefined,
    campaignName: asString(ad.campaign?.name),
    name: asString(ad.creative?.name),
    status: asString(ad.status) || "unknown",
    effectiveStatus: asString(ad.effective_status),
    createdAt: asTimestamp(ad.created_time),
    updatedAt: asTimestamp(ad.updated_time) || asTimestamp(ad.created_time),
  }
}

function mapMetaCampaignMetrics(row: MetaInsightsRow): AdsCampaignMetrics {
  return {
    campaignId: asString(row.campaign_id) ? `cmp_meta_${row.campaign_id}` : "cmp_meta_unknown",
    campaignName: asString(row.campaign_name) || "Unknown campaign",
    spend: parseMoney(row.spend),
    impressions: Math.round(parseNumber(row.impressions)),
    clicks: Math.round(parseNumber(row.clicks)),
    reach: Math.round(parseNumber(row.reach)),
    ctr: parseNumber(row.ctr),
    cpc: parseMoney(row.cpc),
    cpm: parseMoney(row.cpm),
  }
}

function calculateSnapshot(
  currency: string,
  rows: AdsCampaignMetrics[],
  window: AdsWindowSpec,
  generatedAt: number,
): AdsMetricsSnapshot {
  const spend = rows.reduce((sum, row) => sum + row.spend, 0)
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0)
  const reach = rows.reduce((sum, row) => sum + row.reach, 0)
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
  const cpc = clicks > 0 ? Math.round(spend / clicks) : 0
  const cpm = impressions > 0 ? Math.round((spend / impressions) * 1000) : 0
  return {
    ts: generatedAt,
    window: window.label,
    currency,
    spend,
    impressions,
    clicks,
    reach,
    ctr,
    cpc,
    cpm,
    campaignCount: rows.length,
  }
}

function metricsDelta(current: AdsMetricsSnapshot, previous: AdsMetricsSnapshot): AdsMetricsSnapshot {
  return {
    ts: current.ts,
    window: current.window,
    currency: current.currency,
    spend: current.spend - previous.spend,
    impressions: current.impressions - previous.impressions,
    clicks: current.clicks - previous.clicks,
    reach: current.reach - previous.reach,
    ctr: current.ctr - previous.ctr,
    cpc: current.cpc - previous.cpc,
    cpm: current.cpm - previous.cpm,
    campaignCount: current.campaignCount - previous.campaignCount,
  }
}

function createReportId(window: AdsWindowSpec, generatedAt: number): string {
  const day = isoDay(new Date(generatedAt)).replace(/-/g, "")
  return `rpt_${day}_${window.label}`
}

function writeProviders(accounts: AdsAccount[], root = process.cwd()): void {
  ensureAdsDirs(root)
  writeJsonFile(adsProvidersPath(root), accounts)
}

function writeSyncState(state: AdsSyncState, root = process.cwd()): void {
  ensureAdsDirs(root)
  writeJsonFile(adsSyncStatePath(root), state)
}

export function readAdsSyncState(root = process.cwd()): AdsSyncState | null {
  return readJsonFile<AdsSyncState | null>(adsSyncStatePath(root), null)
}

function writeMetricsSnapshots(rows: AdsMetricsSnapshot[], root = process.cwd()): void {
  ensureAdsDirs(root)
  writeJsonLinesFile(adsMetricsDailyPath(root), rows)
}

function readMetricsSnapshots(root = process.cwd()): AdsMetricsSnapshot[] {
  return readJsonLinesFile<AdsMetricsSnapshot>(adsMetricsDailyPath(root))
}

function writeCampaignMetrics(window: string, rows: AdsCampaignMetrics[], root = process.cwd()): void {
  ensureAdsDirs(root)
  writeJsonFile(adsCampaignMetricsPath(window, root), rows)
}

function readCampaignMetrics(window: string, root = process.cwd()): AdsCampaignMetrics[] {
  return readJsonFile<AdsCampaignMetrics[]>(adsCampaignMetricsPath(window, root), [])
}

function writeReport(report: AdsReport, root = process.cwd()): void {
  ensureAdsDirs(root)
  writeJsonFile(adsReportPath(report.id, root), report)
}

export function readLatestAdsReport(windowSpec = "30d", root = process.cwd()): AdsReport | null {
  if (!existsSync(adsReportsDir(root))) return null
  const wanted = String(windowSpec || "30d").trim().toLowerCase()
  const reports: AdsReport[] = []
  for (const file of readdirSync(adsReportsDir(root))) {
    if (!file.endsWith(".json")) continue
    const report = readJsonFile<AdsReport | null>(join(adsReportsDir(root), file), null)
    if (report) reports.push(report)
  }
  reports.sort((a, b) => b.generatedAt - a.generatedAt)
  return reports.find((report) => report.window === wanted) || reports[0] || null
}

export async function syncAds(
  options: SyncAdsOptions = {},
  root = process.cwd(),
  fetchImpl: FetchLike = fetch,
): Promise<AdsSyncResult> {
  const provider = options.provider || "meta"
  if (provider !== "meta") {
    throw new Error(`Unsupported ads provider: ${provider}`)
  }
  const config = readMetaAdsConfig()
  if (!config) {
    throw new Error(adsConfigHelpText())
  }
  const window = parseAdsWindow(options.last || "30d")
  ensureAdsDirs(root)
  const generatedAt = Date.now()

  try {
    const base = `https://graph.facebook.com/${config.apiVersion}/act_${config.accountId}`
    const [accountPayload, rawCampaigns, rawAds, currentInsights, previousInsights] = await Promise.all([
      metaFetchJson<MetaAccountResponse>(
        `${base}?fields=id,account_id,name,currency,account_status`,
        config.accessToken,
        fetchImpl,
      ),
      metaListAll<MetaCampaign>(
        `${base}/campaigns?fields=id,name,objective,status,effective_status,created_time,updated_time,daily_budget,lifetime_budget&limit=100`,
        config.accessToken,
        fetchImpl,
      ),
      metaListAll<MetaAd>(
        `${base}/ads?fields=id,name,status,effective_status,created_time,updated_time,campaign{id,name},creative{id,name}&limit=100`,
        config.accessToken,
        fetchImpl,
      ),
      metaListAll<MetaInsightsRow>(
        `${base}/insights?level=campaign&fields=campaign_id,campaign_name,spend,impressions,clicks,reach,ctr,cpc,cpm&time_range[since]=${window.from}&time_range[until]=${window.to}&limit=100`,
        config.accessToken,
        fetchImpl,
      ),
      metaListAll<MetaInsightsRow>(
        `${base}/insights?level=campaign&fields=campaign_id,campaign_name,spend,impressions,clicks,reach,ctr,cpc,cpm&time_range[since]=${window.previousFrom}&time_range[until]=${window.previousTo}&limit=100`,
        config.accessToken,
        fetchImpl,
      ),
    ])

    const providerAccountId = asString(accountPayload.account_id) || config.accountId
    const account: AdsAccount = {
      id: accountIdForProvider("meta", providerAccountId),
      provider: "meta",
      providerAccountId,
      name: asString(accountPayload.name) || config.accountName,
      currency: normalizeCurrency(asString(accountPayload.currency), "usd"),
      status: "synced",
      accountStatus: accountPayload.account_status !== undefined ? String(accountPayload.account_status) : undefined,
      lastSyncAt: generatedAt,
    }
    writeProviders([account], root)

    const campaigns = rawCampaigns.map((campaign) => mapMetaCampaign(campaign, account.id))
    const creatives = rawAds.map((ad) => mapMetaAd(ad, account.id))
    const currentRows = currentInsights.map(mapMetaCampaignMetrics)
    const previousRows = previousInsights.map(mapMetaCampaignMetrics)

    writeEntityRecords(adsCampaignsDir(root), campaigns, root)
    writeEntityRecords(adsCreativesDir(root), creatives, root)
    writeCampaignMetrics(window.label, currentRows, root)

    const current = calculateSnapshot(account.currency, currentRows, window, generatedAt)
    const previousWindow: AdsWindowSpec = {
      label: window.label,
      from: window.previousFrom,
      to: window.previousTo,
      previousFrom: window.previousFrom,
      previousTo: window.previousTo,
    }
    const previous = calculateSnapshot(account.currency, previousRows, previousWindow, generatedAt)
    const delta = metricsDelta(current, previous)

    const metricSnapshots = readMetricsSnapshots(root)
      .filter((snapshot) => !(snapshot.window === current.window && isoDay(new Date(snapshot.ts)) === isoDay(new Date(current.ts))))
    metricSnapshots.push(current)
    metricSnapshots.sort((a, b) => a.ts - b.ts)
    writeMetricsSnapshots(metricSnapshots, root)

    const report: AdsReport = {
      id: createReportId(window, generatedAt),
      provider: "meta",
      accountId: account.id,
      accountName: account.name,
      window: window.label,
      from: window.from,
      to: window.to,
      previousFrom: window.previousFrom,
      previousTo: window.previousTo,
      generatedAt,
      current,
      previous,
      delta,
      topCampaigns: [...currentRows].sort((a, b) => b.spend - a.spend || a.campaignName.localeCompare(b.campaignName)).slice(0, 10),
    }
    writeReport(report, root)

    const state: AdsSyncState = {
      provider: "meta",
      accountId: account.id,
      accountName: account.name,
      lastSyncAt: generatedAt,
      lastWindow: window.label,
      counts: {
        campaigns: campaigns.length,
        creatives: creatives.length,
        campaignMetrics: currentRows.length,
      },
    }
    writeSyncState(state, root)

    appendAdsActivity("sync.completed", `synced ads for ${account.name}`, "success", {
      provider: "meta",
      accountId: account.id,
      window: window.label,
      counts: state.counts,
    }, root)

    return { account, report, state }
  } catch (error) {
    appendAdsActivity("sync.failed", `ads sync failed for ${config.accountName}`, "error", {
      provider: "meta",
      window: window.label,
      error: error instanceof Error ? error.message : String(error),
    }, root)
    throw error
  }
}

export function readAdsCampaigns(root = process.cwd(), status?: string): AdsCampaign[] {
  const normalized = String(status || "").trim().toLowerCase()
  return readDirectoryRecords<AdsCampaign>(adsCampaignsDir(root))
    .filter((campaign) => !normalized || normalized === "all" || campaign.status.toLowerCase() === normalized || (campaign.effectiveStatus || "").toLowerCase() === normalized)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
}

export function readAdsCreatives(root = process.cwd(), status?: string): AdsCreative[] {
  const normalized = String(status || "").trim().toLowerCase()
  return readDirectoryRecords<AdsCreative>(adsCreativesDir(root))
    .filter((creative) => !normalized || normalized === "all" || creative.status.toLowerCase() === normalized || (creative.effectiveStatus || "").toLowerCase() === normalized)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
}

export function readAdsMetrics(windowSpec = "30d", root = process.cwd()): AdsMetricsView {
  const window = parseAdsWindow(windowSpec)
  const account = listAdsAccounts(root)[0] || null
  const report = readLatestAdsReport(window.label, root)
  const snapshots = readMetricsSnapshots(root)
  const snapshot = report?.window === window.label
    ? report.current
    : snapshots.findLast((entry) => entry.window === window.label)
      || {
        ts: Date.now(),
        window: window.label,
        currency: account?.currency || "usd",
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        campaignCount: 0,
      }
  return { account, window, snapshot }
}

export function readAdsCampaignMetrics(windowSpec = "30d", root = process.cwd()): AdsCampaignMetrics[] {
  const window = parseAdsWindow(windowSpec)
  return readCampaignMetrics(window.label, root).sort((a, b) => b.spend - a.spend || a.campaignName.localeCompare(b.campaignName))
}

function formatMoney(cents: number, currency: string): string {
  const value = cents / 100
  return `${currency.toUpperCase()} ${value.toFixed(2)}`
}

export function formatAdsAccounts(accounts: AdsAccount[]): string {
  if (accounts.length <= 0) {
    return "No ads accounts configured.\n\n" + adsConfigHelpText()
  }
  return accounts
    .map((account) => {
      const synced = account.lastSyncAt ? ` • last sync ${new Date(account.lastSyncAt).toISOString()}` : ""
      return `${account.name} (${account.provider}) [${account.status}] • ${account.currency.toUpperCase()}${synced}`
    })
    .join("\n")
}

export function formatAdsMetrics(view: AdsMetricsView): string {
  if (!view.account) {
    return "No ads data found.\nRun: termlings ads sync"
  }
  const snapshot = view.snapshot
  return [
    `${view.account.name} • ${view.window.label} (${view.window.from} → ${view.window.to})`,
    `spend: ${formatMoney(snapshot.spend, snapshot.currency)}`,
    `impressions: ${snapshot.impressions}`,
    `clicks: ${snapshot.clicks}`,
    `reach: ${snapshot.reach}`,
    `ctr: ${snapshot.ctr.toFixed(2)}%`,
    `cpc: ${formatMoney(snapshot.cpc, snapshot.currency)}`,
    `cpm: ${formatMoney(snapshot.cpm, snapshot.currency)}`,
    `campaigns: ${snapshot.campaignCount}`,
  ].join("\n")
}

export function formatAdsCampaigns(campaigns: AdsCampaign[], currency = "usd"): string {
  if (campaigns.length <= 0) return "No campaigns found.\nRun: termlings ads sync"
  return campaigns
    .slice(0, 25)
    .map((campaign) => `${campaign.name} [${campaign.status}]${campaign.objective ? ` • ${campaign.objective}` : ""}${campaign.dailyBudget ? ` • daily ${formatMoney(campaign.dailyBudget, currency)}` : ""}`)
    .join("\n")
}

export function formatAdsCreatives(creatives: AdsCreative[]): string {
  if (creatives.length <= 0) return "No creatives found.\nRun: termlings ads sync"
  return creatives
    .slice(0, 25)
    .map((creative) => `${creative.name || creative.adName} [${creative.status}]${creative.campaignName ? ` • ${creative.campaignName}` : ""}`)
    .join("\n")
}

export function formatAdsReport(report: AdsReport | null): string {
  if (!report) {
    return "No ads report found.\nRun: termlings ads sync"
  }
  return [
    `${report.accountName} • report • ${report.window} (${report.from} → ${report.to})`,
    `spend: ${formatMoney(report.current.spend, report.current.currency)} (${report.delta.spend >= 0 ? "+" : ""}${formatMoney(report.delta.spend, report.current.currency)})`,
    `impressions: ${report.current.impressions} (${report.delta.impressions >= 0 ? "+" : ""}${report.delta.impressions})`,
    `clicks: ${report.current.clicks} (${report.delta.clicks >= 0 ? "+" : ""}${report.delta.clicks})`,
    `reach: ${report.current.reach} (${report.delta.reach >= 0 ? "+" : ""}${report.delta.reach})`,
    `ctr: ${report.current.ctr.toFixed(2)}% (${report.delta.ctr >= 0 ? "+" : ""}${report.delta.ctr.toFixed(2)}%)`,
    `cpc: ${formatMoney(report.current.cpc, report.current.currency)} (${report.delta.cpc >= 0 ? "+" : ""}${formatMoney(report.delta.cpc, report.current.currency)})`,
    "",
    "top campaigns:",
    ...report.topCampaigns.slice(0, 5).map((entry) => `  ${entry.campaignName} • ${formatMoney(entry.spend, report.current.currency)} • ${entry.clicks} clicks • ${entry.impressions} impressions`),
  ].filter(Boolean).join("\n")
}
