import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs"
import { join } from "path"

import { appendAppActivity, resolveAgentActivityThreadId, type AppActivityEntry } from "./activity.js"

export type FinanceProvider = "stripe"

export interface FinanceAccount {
  id: string
  provider: FinanceProvider
  name: string
  currency: string
  status: "configured" | "synced"
  livemode?: boolean
  lastSyncAt?: number
}

export interface FinanceCustomer {
  id: string
  provider: FinanceProvider
  providerCustomerId: string
  email?: string
  name?: string
  status: "active" | "deleted"
  currency?: string
  createdAt: number
  updatedAt: number
}

export interface FinanceSubscription {
  id: string
  provider: FinanceProvider
  providerSubscriptionId: string
  customerId?: string
  status: string
  plan: string
  interval: "day" | "week" | "month" | "year" | "unknown"
  amount: number
  currency: string
  startedAt: number
  currentPeriodStart?: number
  currentPeriodEnd?: number
  cancelAt?: number | null
  canceledAt?: number | null
  createdAt: number
  updatedAt: number
}

export interface FinanceInvoice {
  id: string
  provider: FinanceProvider
  providerInvoiceId: string
  customerId?: string
  subscriptionId?: string
  status: string
  amountDue: number
  amountPaid: number
  amountRemaining: number
  currency: string
  paidAt?: number
  createdAt: number
  updatedAt: number
}

export interface FinanceRefund {
  id: string
  provider: FinanceProvider
  providerRefundId: string
  chargeId?: string
  paymentIntentId?: string
  amount: number
  currency: string
  reason?: string
  status: string
  createdAt: number
  updatedAt: number
}

export interface FinanceMetricsSnapshot {
  ts: number
  window: string
  currency: string
  mrr: number
  arr: number
  activeSubscriptions: number
  newSubscriptions: number
  churnedSubscriptions: number
  revenue: number
  refunds: number
  netRevenue: number
}

export interface FinanceReportEntry {
  value: string
  amount: number
  count: number
}

export interface FinanceReport {
  id: string
  provider: FinanceProvider
  accountId: string
  accountName: string
  window: string
  from: string
  to: string
  previousFrom: string
  previousTo: string
  generatedAt: number
  current: FinanceMetricsSnapshot
  previous: FinanceMetricsSnapshot
  delta: FinanceMetricsSnapshot
  topCustomers: FinanceReportEntry[]
  topPlans: FinanceReportEntry[]
}

export interface FinanceSyncState {
  provider: FinanceProvider
  accountId: string
  accountName: string
  lastSyncAt: number
  lastWindow: string
  counts: {
    customers: number
    subscriptions: number
    invoices: number
    refunds: number
  }
}

export interface FinanceWindowSpec {
  label: string
  from: string
  to: string
  previousFrom: string
  previousTo: string
}

export interface SyncFinanceOptions {
  provider?: FinanceProvider
  last?: string
}

export interface FinanceSyncResult {
  account: FinanceAccount
  report: FinanceReport
  state: FinanceSyncState
}

export interface FinanceMetricsView {
  account: FinanceAccount | null
  window: FinanceWindowSpec
  snapshot: FinanceMetricsSnapshot
}

export interface StripeFinanceConfig {
  provider: FinanceProvider
  accountName: string
  site?: string
  apiKey: string
}

interface StripeListResponse<T> {
  data?: T[]
  has_more?: boolean
}

interface StripeCustomer {
  id: string
  email?: string | null
  name?: string | null
  deleted?: boolean
  currency?: string | null
  created?: number
}

interface StripePrice {
  id?: string
  unit_amount?: number | null
  currency?: string | null
  recurring?: {
    interval?: "day" | "week" | "month" | "year"
  } | null
}

interface StripeSubscriptionItem {
  price?: StripePrice | null
}

interface StripeSubscription {
  id: string
  customer?: string | { id?: string } | null
  status?: string | null
  items?: { data?: StripeSubscriptionItem[] } | null
  cancel_at?: number | null
  canceled_at?: number | null
  current_period_start?: number | null
  current_period_end?: number | null
  created?: number
}

interface StripeInvoice {
  id: string
  customer?: string | null
  subscription?: string | null
  status?: string | null
  amount_due?: number | null
  amount_paid?: number | null
  amount_remaining?: number | null
  currency?: string | null
  created?: number
  status_transitions?: {
    paid_at?: number | null
  } | null
}

interface StripeRefund {
  id: string
  charge?: string | null
  payment_intent?: string | null
  amount?: number | null
  currency?: string | null
  reason?: string | null
  status?: string | null
  created?: number
}

interface StripeBalance {
  available?: Array<{ currency?: string; amount?: number }>
}

type FetchLike = typeof fetch

function financeRoot(root = process.cwd()): string {
  return join(root, ".termlings", "store", "finance")
}

function financeCustomersDir(root = process.cwd()): string {
  return join(financeRoot(root), "customers")
}

function financeSubscriptionsDir(root = process.cwd()): string {
  return join(financeRoot(root), "subscriptions")
}

function financeInvoicesDir(root = process.cwd()): string {
  return join(financeRoot(root), "invoices")
}

function financeRefundsDir(root = process.cwd()): string {
  return join(financeRoot(root), "refunds")
}

function financeMetricsDir(root = process.cwd()): string {
  return join(financeRoot(root), "metrics")
}

function financeReportsDir(root = process.cwd()): string {
  return join(financeRoot(root), "reports")
}

function financeProvidersPath(root = process.cwd()): string {
  return join(financeRoot(root), "providers.json")
}

function financeSyncStatePath(root = process.cwd()): string {
  return join(financeRoot(root), "sync-state.json")
}

function financeMetricsDailyPath(root = process.cwd()): string {
  return join(financeMetricsDir(root), "daily.jsonl")
}

function financeMetricsMrrPath(root = process.cwd()): string {
  return join(financeMetricsDir(root), "mrr.jsonl")
}

function financeReportPath(id: string, root = process.cwd()): string {
  return join(financeReportsDir(root), `${id}.json`)
}

export function ensureFinanceDirs(root = process.cwd()): void {
  mkdirSync(financeRoot(root), { recursive: true })
  mkdirSync(financeCustomersDir(root), { recursive: true })
  mkdirSync(financeSubscriptionsDir(root), { recursive: true })
  mkdirSync(financeInvoicesDir(root), { recursive: true })
  mkdirSync(financeRefundsDir(root), { recursive: true })
  mkdirSync(financeMetricsDir(root), { recursive: true })
  mkdirSync(financeReportsDir(root), { recursive: true })
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

function createWindowFromDays(days: number, now = new Date()): FinanceWindowSpec {
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

function createWindowFromMonths(months: number, now = new Date()): FinanceWindowSpec {
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

export function parseFinanceWindow(input = "30d", now = new Date()): FinanceWindowSpec {
  const normalized = String(input || "30d").trim().toLowerCase()
  const match = normalized.match(/^(\d+)([dm])$/)
  if (!match) {
    throw new Error(`Invalid finance window: ${input}. Expected values like 7d, 30d, 90d, or 12m.`)
  }
  const count = Number.parseInt(match[1] || "", 10)
  const unit = match[2]
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(`Invalid finance window: ${input}`)
  }
  if (unit === "d") return createWindowFromDays(count, now)
  return createWindowFromMonths(count, now)
}

function round(value: number, places = 4): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
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

function appendFinanceActivity(kind: string, text: string, result: AppActivityEntry["result"], meta: Record<string, unknown> | undefined, root: string): void {
  appendAppActivity({
    ts: Date.now(),
    app: "finance",
    kind,
    text,
    result,
    surface: "both",
    level: "summary",
    meta,
    ...currentActivityMeta(),
  }, root)
}

function asTimestamp(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value * 1000 : 0
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function asCents(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function normalizeCurrency(value: string | null | undefined, fallback = "usd"): string {
  return String(value || fallback).trim().toLowerCase() || fallback
}

function intervalToMonthlyAmount(amount: number, interval: FinanceSubscription["interval"]): number {
  if (interval === "year") return Math.round(amount / 12)
  if (interval === "week") return Math.round((amount * 52) / 12)
  if (interval === "day") return Math.round((amount * 365) / 12)
  return amount
}

function dayRangeIncludes(timestampMs: number | undefined, from: string, to: string): boolean {
  if (!timestampMs || !Number.isFinite(timestampMs) || timestampMs <= 0) return false
  const day = isoDay(new Date(timestampMs))
  return day >= from && day <= to
}

function accountIdForProvider(provider: FinanceProvider): string {
  return provider === "stripe" ? "acct_stripe_main" : "acct_unknown"
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
  ensureFinanceDirs(root)
  writeJsonFile(join(dir, `${id}.json`), value)
}

function readMetricsSnapshots(root = process.cwd()): FinanceMetricsSnapshot[] {
  return readJsonLinesFile<FinanceMetricsSnapshot>(financeMetricsDailyPath(root))
}

function writeMetricsSnapshots(rows: FinanceMetricsSnapshot[], root = process.cwd()): void {
  ensureFinanceDirs(root)
  writeJsonLinesFile(financeMetricsDailyPath(root), rows)
  writeJsonLinesFile(financeMetricsMrrPath(root), rows.map((row) => ({
    ts: row.ts,
    window: row.window,
    currency: row.currency,
    mrr: row.mrr,
    arr: row.arr,
  })))
}

function createReportId(window: FinanceWindowSpec, generatedAt: number): string {
  const day = isoDay(new Date(generatedAt)).replace(/-/g, "")
  return `rpt_${day}_${window.label}`
}

export function readStripeFinanceConfig(): StripeFinanceConfig | null {
  const apiKey = String(process.env.STRIPE_API_KEY || "").trim()
  if (!apiKey) return null
  return {
    provider: "stripe",
    apiKey,
    accountName: String(process.env.STRIPE_ACCOUNT_NAME || "").trim() || "Main Stripe Account",
    site: String(process.env.STRIPE_SITE || "").trim() || undefined,
  }
}

export function financeConfigHelpText(): string {
  return [
    "Missing Stripe finance configuration.",
    "Add these vars to .termlings/.env:",
    "  STRIPE_API_KEY=<stripe-secret-key>",
    "Optional:",
    "  STRIPE_ACCOUNT_NAME=<display name>",
    "  STRIPE_SITE=<site or business label>",
  ].join("\n")
}

function configuredAccountFromEnv(root = process.cwd()): FinanceAccount | null {
  const config = readStripeFinanceConfig()
  if (!config) return null
  const stored = readJsonFile<FinanceAccount[]>(financeProvidersPath(root), [])
  const existing = stored.find((account) => account.id === accountIdForProvider(config.provider))
  return {
    id: accountIdForProvider(config.provider),
    provider: config.provider,
    name: config.accountName,
    currency: existing?.currency || "usd",
    status: existing?.lastSyncAt ? "synced" : "configured",
    livemode: existing?.livemode,
    lastSyncAt: existing?.lastSyncAt,
  }
}

export function listFinanceAccounts(root = process.cwd()): FinanceAccount[] {
  const stored = readJsonFile<FinanceAccount[]>(financeProvidersPath(root), [])
  const configured = configuredAccountFromEnv(root)
  if (!configured) return stored
  return [configured, ...stored.filter((account) => account.id !== configured.id)]
}

async function stripeFetchJson<T>(url: string, apiKey: string, fetchImpl: FetchLike): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  })
  const payload = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { message?: string } }).error?.message
      : undefined
    throw new Error(detail || `Stripe request failed: HTTP ${response.status}`)
  }
  return payload
}

async function stripeListAll<T extends { id: string }>(
  endpoint: string,
  apiKey: string,
  fetchImpl: FetchLike,
  extraParams: Record<string, string> = {},
): Promise<T[]> {
  const items: T[] = []
  let startingAfter: string | undefined
  for (;;) {
    const params = new URLSearchParams({
      limit: "100",
      ...extraParams,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    const payload = await stripeFetchJson<StripeListResponse<T>>(
      `https://api.stripe.com/v1/${endpoint}?${params.toString()}`,
      apiKey,
      fetchImpl,
    )
    const page = Array.isArray(payload.data) ? payload.data : []
    items.push(...page)
    if (!payload.has_more || page.length <= 0) break
    startingAfter = page[page.length - 1]?.id
    if (!startingAfter) break
  }
  return items
}

function mapStripeCustomer(customer: StripeCustomer): FinanceCustomer {
  const createdAt = asTimestamp(customer.created)
  return {
    id: `cus_stripe_${customer.id}`,
    provider: "stripe",
    providerCustomerId: customer.id,
    email: asString(customer.email),
    name: asString(customer.name),
    status: customer.deleted ? "deleted" : "active",
    currency: asString(customer.currency)?.toLowerCase(),
    createdAt,
    updatedAt: createdAt,
  }
}

function pickSubscriptionPrice(items: StripeSubscriptionItem[]): StripePrice | null {
  for (const item of items) {
    if (item.price) return item.price
  }
  return null
}

function mapStripeSubscription(subscription: StripeSubscription): FinanceSubscription {
  const items = Array.isArray(subscription.items?.data) ? subscription.items?.data || [] : []
  const price = pickSubscriptionPrice(items)
  const interval = price?.recurring?.interval || "unknown"
  const customerId = typeof subscription.customer === "string"
    ? `cus_stripe_${subscription.customer}`
    : subscription.customer?.id
      ? `cus_stripe_${subscription.customer.id}`
      : undefined
  const createdAt = asTimestamp(subscription.created)
  return {
    id: `sub_stripe_${subscription.id}`,
    provider: "stripe",
    providerSubscriptionId: subscription.id,
    customerId,
    status: asString(subscription.status) || "unknown",
    plan: asString(price?.id) || "unknown",
    interval,
    amount: asCents(price?.unit_amount),
    currency: normalizeCurrency(price?.currency),
    startedAt: createdAt,
    currentPeriodStart: asTimestamp(subscription.current_period_start),
    currentPeriodEnd: asTimestamp(subscription.current_period_end),
    cancelAt: subscription.cancel_at ? asTimestamp(subscription.cancel_at) : null,
    canceledAt: subscription.canceled_at ? asTimestamp(subscription.canceled_at) : null,
    createdAt,
    updatedAt: Math.max(
      createdAt,
      asTimestamp(subscription.current_period_end),
      asTimestamp(subscription.canceled_at),
      asTimestamp(subscription.cancel_at),
    ),
  }
}

function mapStripeInvoice(invoice: StripeInvoice): FinanceInvoice {
  const createdAt = asTimestamp(invoice.created)
  const paidAt = asTimestamp(invoice.status_transitions?.paid_at)
  return {
    id: `inv_stripe_${invoice.id}`,
    provider: "stripe",
    providerInvoiceId: invoice.id,
    customerId: asString(invoice.customer) ? `cus_stripe_${invoice.customer}` : undefined,
    subscriptionId: asString(invoice.subscription) ? `sub_stripe_${invoice.subscription}` : undefined,
    status: asString(invoice.status) || "unknown",
    amountDue: asCents(invoice.amount_due),
    amountPaid: asCents(invoice.amount_paid),
    amountRemaining: asCents(invoice.amount_remaining),
    currency: normalizeCurrency(invoice.currency),
    paidAt: paidAt > 0 ? paidAt : undefined,
    createdAt,
    updatedAt: Math.max(createdAt, paidAt),
  }
}

function mapStripeRefund(refund: StripeRefund): FinanceRefund {
  const createdAt = asTimestamp(refund.created)
  return {
    id: `rf_stripe_${refund.id}`,
    provider: "stripe",
    providerRefundId: refund.id,
    chargeId: asString(refund.charge),
    paymentIntentId: asString(refund.payment_intent),
    amount: asCents(refund.amount),
    currency: normalizeCurrency(refund.currency),
    reason: asString(refund.reason),
    status: asString(refund.status) || "unknown",
    createdAt,
    updatedAt: createdAt,
  }
}

function writeEntityRecords<T extends { id: string }>(dir: string, items: T[], root = process.cwd()): void {
  for (const item of items) {
    writeDirectoryRecord(dir, item.id, item, root)
  }
}

function calculateCurrentMetrics(
  account: FinanceAccount,
  subscriptions: FinanceSubscription[],
  invoices: FinanceInvoice[],
  refunds: FinanceRefund[],
  window: FinanceWindowSpec,
  generatedAt: number,
): FinanceMetricsSnapshot {
  const activeSubscriptions = subscriptions.filter((subscription) =>
    ["active", "trialing", "past_due", "unpaid"].includes(subscription.status),
  )
  const mrr = activeSubscriptions.reduce((sum, subscription) => (
    sum + intervalToMonthlyAmount(subscription.amount, subscription.interval)
  ), 0)
  const newSubscriptions = subscriptions.filter((subscription) => dayRangeIncludes(subscription.createdAt, window.from, window.to)).length
  const churnedSubscriptions = subscriptions.filter((subscription) => dayRangeIncludes(subscription.canceledAt ?? undefined, window.from, window.to)).length
  const revenue = invoices
    .filter((invoice) => invoice.status === "paid" && dayRangeIncludes(invoice.paidAt ?? invoice.createdAt, window.from, window.to))
    .reduce((sum, invoice) => sum + invoice.amountPaid, 0)
  const refundAmount = refunds
    .filter((refund) => dayRangeIncludes(refund.createdAt, window.from, window.to))
    .reduce((sum, refund) => sum + refund.amount, 0)
  return {
    ts: generatedAt,
    window: window.label,
    currency: account.currency,
    mrr,
    arr: mrr * 12,
    activeSubscriptions: activeSubscriptions.length,
    newSubscriptions,
    churnedSubscriptions,
    revenue,
    refunds: refundAmount,
    netRevenue: revenue - refundAmount,
  }
}

function metricsDelta(current: FinanceMetricsSnapshot, previous: FinanceMetricsSnapshot): FinanceMetricsSnapshot {
  return {
    ts: current.ts,
    window: current.window,
    currency: current.currency,
    mrr: current.mrr - previous.mrr,
    arr: current.arr - previous.arr,
    activeSubscriptions: current.activeSubscriptions - previous.activeSubscriptions,
    newSubscriptions: current.newSubscriptions - previous.newSubscriptions,
    churnedSubscriptions: current.churnedSubscriptions - previous.churnedSubscriptions,
    revenue: current.revenue - previous.revenue,
    refunds: current.refunds - previous.refunds,
    netRevenue: current.netRevenue - previous.netRevenue,
  }
}

function aggregateCustomerRevenue(invoices: FinanceInvoice[], customers: FinanceCustomer[], from: string, to: string): FinanceReportEntry[] {
  const customerNames = new Map(customers.map((customer) => [customer.id, customer.name || customer.email || customer.providerCustomerId]))
  const buckets = new Map<string, FinanceReportEntry>()
  for (const invoice of invoices) {
    if (invoice.status !== "paid") continue
    const ts = invoice.paidAt || invoice.createdAt
    if (!dayRangeIncludes(ts, from, to)) continue
    const label = customerNames.get(invoice.customerId || "") || invoice.customerId || "unknown"
    const existing = buckets.get(label) || { value: label, amount: 0, count: 0 }
    existing.amount += invoice.amountPaid
    existing.count += 1
    buckets.set(label, existing)
  }
  return Array.from(buckets.values()).sort((a, b) => b.amount - a.amount || a.value.localeCompare(b.value))
}

function aggregatePlans(subscriptions: FinanceSubscription[]): FinanceReportEntry[] {
  const buckets = new Map<string, FinanceReportEntry>()
  for (const subscription of subscriptions) {
    const label = subscription.plan
    const existing = buckets.get(label) || { value: label, amount: 0, count: 0 }
    existing.amount += intervalToMonthlyAmount(subscription.amount, subscription.interval)
    existing.count += 1
    buckets.set(label, existing)
  }
  return Array.from(buckets.values()).sort((a, b) => b.amount - a.amount || a.value.localeCompare(b.value))
}

function writeProviders(accounts: FinanceAccount[], root = process.cwd()): void {
  ensureFinanceDirs(root)
  writeJsonFile(financeProvidersPath(root), accounts)
}

function writeSyncState(state: FinanceSyncState, root = process.cwd()): void {
  ensureFinanceDirs(root)
  writeJsonFile(financeSyncStatePath(root), state)
}

export function readFinanceSyncState(root = process.cwd()): FinanceSyncState | null {
  return readJsonFile<FinanceSyncState | null>(financeSyncStatePath(root), null)
}

function writeReport(report: FinanceReport, root = process.cwd()): void {
  ensureFinanceDirs(root)
  writeJsonFile(financeReportPath(report.id, root), report)
}

export function readLatestFinanceReport(windowSpec = "30d", root = process.cwd()): FinanceReport | null {
  if (!existsSync(financeReportsDir(root))) return null
  const wanted = String(windowSpec || "30d").trim().toLowerCase()
  const reports: FinanceReport[] = []
  for (const file of readdirSync(financeReportsDir(root))) {
    if (!file.endsWith(".json")) continue
    const report = readJsonFile<FinanceReport | null>(join(financeReportsDir(root), file), null)
    if (report) reports.push(report)
  }
  reports.sort((a, b) => b.generatedAt - a.generatedAt)
  return reports.find((report) => report.window === wanted) || reports[0] || null
}

export async function syncFinance(
  options: SyncFinanceOptions = {},
  root = process.cwd(),
  fetchImpl: FetchLike = fetch,
): Promise<FinanceSyncResult> {
  const provider = options.provider || "stripe"
  if (provider !== "stripe") {
    throw new Error(`Unsupported finance provider: ${provider}`)
  }
  const config = readStripeFinanceConfig()
  if (!config) {
    throw new Error(financeConfigHelpText())
  }
  const window = parseFinanceWindow(options.last || "30d")
  ensureFinanceDirs(root)
  const generatedAt = Date.now()
  try {
    const [balance, rawCustomers, rawSubscriptions, rawInvoices, rawRefunds] = await Promise.all([
      stripeFetchJson<StripeBalance>("https://api.stripe.com/v1/balance", config.apiKey, fetchImpl),
      stripeListAll<StripeCustomer>("customers", config.apiKey, fetchImpl),
      stripeListAll<StripeSubscription>("subscriptions", config.apiKey, fetchImpl, { status: "all" }),
      stripeListAll<StripeInvoice>("invoices", config.apiKey, fetchImpl),
      stripeListAll<StripeRefund>("refunds", config.apiKey, fetchImpl),
    ])

    const primaryCurrency = normalizeCurrency(balance.available?.[0]?.currency, "usd")
    const account: FinanceAccount = {
      id: accountIdForProvider("stripe"),
      provider: "stripe",
      name: config.accountName,
      currency: primaryCurrency,
      livemode: String(config.apiKey).startsWith("sk_live_"),
      status: "synced",
      lastSyncAt: generatedAt,
    }
    writeProviders([account], root)

    const customers = rawCustomers.map(mapStripeCustomer)
    const subscriptions = rawSubscriptions.map(mapStripeSubscription)
    const invoices = rawInvoices.map(mapStripeInvoice)
    const refunds = rawRefunds.map(mapStripeRefund)

    writeEntityRecords(financeCustomersDir(root), customers, root)
    writeEntityRecords(financeSubscriptionsDir(root), subscriptions, root)
    writeEntityRecords(financeInvoicesDir(root), invoices, root)
    writeEntityRecords(financeRefundsDir(root), refunds, root)

    const current = calculateCurrentMetrics(account, subscriptions, invoices, refunds, window, generatedAt)
    const previousWindow: FinanceWindowSpec = {
      label: window.label,
      from: window.previousFrom,
      to: window.previousTo,
      previousFrom: window.previousFrom,
      previousTo: window.previousTo,
    }
    const previous = calculateCurrentMetrics(account, subscriptions, invoices, refunds, previousWindow, generatedAt)
    const delta = metricsDelta(current, previous)

    const metricSnapshots = readMetricsSnapshots(root)
      .filter((snapshot) => !(snapshot.window === current.window && isoDay(new Date(snapshot.ts)) === isoDay(new Date(current.ts))))
    metricSnapshots.push(current)
    metricSnapshots.sort((a, b) => a.ts - b.ts)
    writeMetricsSnapshots(metricSnapshots, root)

    const report: FinanceReport = {
      id: createReportId(window, generatedAt),
      provider: "stripe",
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
      topCustomers: aggregateCustomerRevenue(invoices, customers, window.from, window.to).slice(0, 10),
      topPlans: aggregatePlans(subscriptions.filter((subscription) => ["active", "trialing", "past_due", "unpaid"].includes(subscription.status))).slice(0, 10),
    }
    writeReport(report, root)

    const state: FinanceSyncState = {
      provider: "stripe",
      accountId: account.id,
      accountName: account.name,
      lastSyncAt: generatedAt,
      lastWindow: window.label,
      counts: {
        customers: customers.length,
        subscriptions: subscriptions.length,
        invoices: invoices.length,
        refunds: refunds.length,
      },
    }
    writeSyncState(state, root)

    appendFinanceActivity("sync.completed", `synced finance for ${account.name}`, "success", {
      provider: "stripe",
      accountId: account.id,
      window: window.label,
      counts: state.counts,
    }, root)

    return { account, report, state }
  } catch (error) {
    appendFinanceActivity("sync.failed", `finance sync failed for ${config.accountName}`, "error", {
      provider: "stripe",
      window: window.label,
      error: error instanceof Error ? error.message : String(error),
    }, root)
    throw error
  }
}

export function readFinanceCustomers(root = process.cwd()): FinanceCustomer[] {
  return readDirectoryRecords<FinanceCustomer>(financeCustomersDir(root))
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}

export function readFinanceSubscriptions(root = process.cwd(), status?: string): FinanceSubscription[] {
  const normalized = String(status || "").trim().toLowerCase()
  return readDirectoryRecords<FinanceSubscription>(financeSubscriptionsDir(root))
    .filter((subscription) => !normalized || normalized === "all" || subscription.status.toLowerCase() === normalized)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
}

export function readFinanceInvoices(root = process.cwd(), status?: string): FinanceInvoice[] {
  const normalized = String(status || "").trim().toLowerCase()
  return readDirectoryRecords<FinanceInvoice>(financeInvoicesDir(root))
    .filter((invoice) => !normalized || normalized === "all" || invoice.status.toLowerCase() === normalized)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
}

export function readFinanceRefunds(root = process.cwd()): FinanceRefund[] {
  return readDirectoryRecords<FinanceRefund>(financeRefundsDir(root))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
}

export function readFinanceMetrics(windowSpec = "30d", root = process.cwd()): FinanceMetricsView {
  const window = parseFinanceWindow(windowSpec)
  const account = listFinanceAccounts(root)[0] || null
  const report = readLatestFinanceReport(window.label, root)
  const snapshots = readMetricsSnapshots(root)
  const snapshot = report?.window === window.label
    ? report.current
    : snapshots.findLast((entry) => entry.window === window.label)
      || {
        ts: Date.now(),
        window: window.label,
        currency: account?.currency || "usd",
        mrr: 0,
        arr: 0,
        activeSubscriptions: 0,
        newSubscriptions: 0,
        churnedSubscriptions: 0,
        revenue: 0,
        refunds: 0,
        netRevenue: 0,
      }
  return { account, window, snapshot }
}

export function readFinanceRevenue(windowSpec = "30d", root = process.cwd()): {
  account: FinanceAccount | null
  window: FinanceWindowSpec
  revenue: number
  refunds: number
  netRevenue: number
} {
  const { account, window, snapshot } = readFinanceMetrics(windowSpec, root)
  return {
    account,
    window,
    revenue: snapshot.revenue,
    refunds: snapshot.refunds,
    netRevenue: snapshot.netRevenue,
  }
}

export function formatFinanceAccounts(accounts: FinanceAccount[]): string {
  if (accounts.length <= 0) {
    return "No finance accounts configured.\n\n" + financeConfigHelpText()
  }
  return accounts
    .map((account) => {
      const synced = account.lastSyncAt ? ` • last sync ${new Date(account.lastSyncAt).toISOString()}` : ""
      return `${account.name} (${account.provider}) [${account.status}] • ${account.currency.toUpperCase()}${synced}`
    })
    .join("\n")
}

function formatMoney(cents: number, currency: string): string {
  const value = cents / 100
  return `${currency.toUpperCase()} ${value.toFixed(2)}`
}

export function formatFinanceMetrics(view: FinanceMetricsView): string {
  if (!view.account) {
    return "No finance data found.\nRun: termlings finance sync"
  }
  const snapshot = view.snapshot
  return [
    `${view.account.name} • ${view.window.label} (${view.window.from} → ${view.window.to})`,
    `mrr: ${formatMoney(snapshot.mrr, snapshot.currency)}`,
    `arr: ${formatMoney(snapshot.arr, snapshot.currency)}`,
    `active subscriptions: ${snapshot.activeSubscriptions}`,
    `new subscriptions: ${snapshot.newSubscriptions}`,
    `churned subscriptions: ${snapshot.churnedSubscriptions}`,
    `revenue: ${formatMoney(snapshot.revenue, snapshot.currency)}`,
    `refunds: ${formatMoney(snapshot.refunds, snapshot.currency)}`,
    `net revenue: ${formatMoney(snapshot.netRevenue, snapshot.currency)}`,
  ].join("\n")
}

export function formatFinanceRevenue(view: ReturnType<typeof readFinanceRevenue>): string {
  if (!view.account) {
    return "No finance data found.\nRun: termlings finance sync"
  }
  return [
    `${view.account.name} • revenue • ${view.window.label} (${view.window.from} → ${view.window.to})`,
    `revenue: ${formatMoney(view.revenue, view.account.currency)}`,
    `refunds: ${formatMoney(view.refunds, view.account.currency)}`,
    `net revenue: ${formatMoney(view.netRevenue, view.account.currency)}`,
  ].join("\n")
}

export function formatFinanceCustomers(customers: FinanceCustomer[], currency = "usd"): string {
  if (customers.length <= 0) return "No customers found.\nRun: termlings finance sync"
  return customers
    .slice(0, 25)
    .map((customer) => `${customer.name || customer.email || customer.providerCustomerId} [${customer.status}]${customer.currency ? ` • ${customer.currency.toUpperCase()}` : ` • ${currency.toUpperCase()}`}`)
    .join("\n")
}

export function formatFinanceSubscriptions(subscriptions: FinanceSubscription[]): string {
  if (subscriptions.length <= 0) return "No subscriptions found.\nRun: termlings finance sync"
  return subscriptions
    .slice(0, 25)
    .map((subscription) => `${subscription.plan} [${subscription.status}] • ${formatMoney(subscription.amount, subscription.currency)} / ${subscription.interval}`)
    .join("\n")
}

export function formatFinanceInvoices(invoices: FinanceInvoice[]): string {
  if (invoices.length <= 0) return "No invoices found.\nRun: termlings finance sync"
  return invoices
    .slice(0, 25)
    .map((invoice) => `${invoice.providerInvoiceId} [${invoice.status}] • paid ${formatMoney(invoice.amountPaid, invoice.currency)} • due ${formatMoney(invoice.amountDue, invoice.currency)}`)
    .join("\n")
}

export function formatFinanceRefunds(refunds: FinanceRefund[]): string {
  if (refunds.length <= 0) return "No refunds found.\nRun: termlings finance sync"
  return refunds
    .slice(0, 25)
    .map((refund) => `${refund.providerRefundId} [${refund.status}] • ${formatMoney(refund.amount, refund.currency)}${refund.reason ? ` • ${refund.reason}` : ""}`)
    .join("\n")
}

export function formatFinanceReport(report: FinanceReport | null): string {
  if (!report) {
    return "No finance report found.\nRun: termlings finance sync"
  }
  return [
    `${report.accountName} • report • ${report.window} (${report.from} → ${report.to})`,
    `mrr: ${formatMoney(report.current.mrr, report.current.currency)} (${report.delta.mrr >= 0 ? "+" : ""}${formatMoney(report.delta.mrr, report.current.currency)})`,
    `active subscriptions: ${report.current.activeSubscriptions} (${report.delta.activeSubscriptions >= 0 ? "+" : ""}${report.delta.activeSubscriptions})`,
    `revenue: ${formatMoney(report.current.revenue, report.current.currency)} (${report.delta.revenue >= 0 ? "+" : ""}${formatMoney(report.delta.revenue, report.current.currency)})`,
    `refunds: ${formatMoney(report.current.refunds, report.current.currency)} (${report.delta.refunds >= 0 ? "+" : ""}${formatMoney(report.delta.refunds, report.current.currency)})`,
    `net revenue: ${formatMoney(report.current.netRevenue, report.current.currency)} (${report.delta.netRevenue >= 0 ? "+" : ""}${formatMoney(report.delta.netRevenue, report.current.currency)})`,
    "",
    "top customers:",
    ...report.topCustomers.slice(0, 5).map((entry) => `  ${entry.value} • ${formatMoney(entry.amount, report.current.currency)} • ${entry.count} invoices`),
    "",
    "top plans:",
    ...report.topPlans.slice(0, 5).map((entry) => `  ${entry.value} • ${formatMoney(entry.amount, report.current.currency)} mrr • ${entry.count} subscriptions`),
  ].filter(Boolean).join("\n")
}
