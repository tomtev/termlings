import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { join } from "path"

import { appendAppActivity, resolveAgentActivityThreadId, type AppActivityEntry } from "./activity.js"
import { createCalendarEvent, getCalendarEvent, toggleCalendarEvent, updateCalendarEvent } from "./calendar.js"

export type SocialPlatform = "x" | "linkedin" | "instagram" | "facebook" | "tiktok"
export type SocialPostStatus = "draft" | "scheduled" | "published" | "failed"

export interface SocialAccount {
  id: string
  platform: SocialPlatform
  handle?: string
  webhookConfigured: boolean
  status: "configured" | "missing"
}

export interface SocialPost {
  id: string
  platform: SocialPlatform
  title?: string
  text: string
  link?: string
  mediaPaths: string[]
  status: SocialPostStatus
  createdAt: number
  createdBy: string
  updatedAt: number
  scheduledAt?: number
  publishedAt?: number
  failedAt?: number
  calendarEventId?: string
  ownerAgent?: string
  webhookUrl?: string
  lastError?: string
  publishResponseStatus?: number
}

export interface SocialPublishHistoryEntry {
  ts: number
  postId: string
  platform: SocialPlatform
  status: "published" | "failed"
  scheduled: boolean
  responseStatus?: number
  error?: string
}

export interface CreateSocialPostInput {
  platform: SocialPlatform
  text: string
  title?: string
  link?: string
  media?: string[]
  createdBy?: string
}

interface PublishWebhookPayload {
  id: string
  platform: SocialPlatform
  title?: string
  text: string
  link?: string
  media: string[]
  scheduledAt?: string
  createdAt: string
}

const SOCIAL_PLATFORMS: SocialPlatform[] = ["x", "linkedin", "instagram", "facebook", "tiktok"]

function socialRoot(root = process.cwd()): string {
  return join(root, ".termlings", "store", "social")
}

function socialPostsDir(root = process.cwd()): string {
  return join(socialRoot(root), "posts")
}

function socialHistoryPath(root = process.cwd()): string {
  return join(socialRoot(root), "history.jsonl")
}

function socialPostPath(id: string, root = process.cwd()): string {
  return join(socialPostsDir(root), `${id}.json`)
}

function socialWebhookEnvKey(platform: SocialPlatform): string {
  return `SOCIAL_${platform.toUpperCase()}_WEBHOOK_URL`
}

function socialHandleEnvKey(platform: SocialPlatform): string {
  return `SOCIAL_${platform.toUpperCase()}_HANDLE`
}

function normalizePlatform(input: string): SocialPlatform {
  const normalized = input.trim().toLowerCase()
  if (SOCIAL_PLATFORMS.includes(normalized as SocialPlatform)) {
    return normalized as SocialPlatform
  }
  throw new Error(`Unsupported social platform: ${input}. Use one of: ${SOCIAL_PLATFORMS.join(", ")}`)
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

function currentActorId(): string {
  const agentSlug = (process.env.TERMLINGS_AGENT_SLUG || "").trim()
  if (agentSlug) return `agent:${agentSlug}`
  return "human:default"
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

function inferWebhookUrl(platform: SocialPlatform): string | undefined {
  const key = socialWebhookEnvKey(platform)
  const value = (process.env[key] || "").trim()
  return value || undefined
}

function socialCalendarDescription(post: SocialPost): string {
  const summary = post.text.length > 140 ? `${post.text.slice(0, 137)}...` : post.text
  return [`social:${post.id}`, summary, post.link || ""].filter(Boolean).join("\n")
}

function socialCalendarTitle(post: SocialPost): string {
  return `Post to ${post.platform}`
}

function appendSocialHistory(entry: SocialPublishHistoryEntry, root = process.cwd()): void {
  ensureSocialDirs(root)
  appendFileSync(socialHistoryPath(root), JSON.stringify(entry) + "\n", "utf8")
}

function readSocialHistoryLines(root = process.cwd()): SocialPublishHistoryEntry[] {
  if (!existsSync(socialHistoryPath(root))) return []
  try {
    return readFileSync(socialHistoryPath(root), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SocialPublishHistoryEntry)
      .sort((a, b) => b.ts - a.ts)
  } catch {
    return []
  }
}

export function ensureSocialDirs(root = process.cwd()): void {
  mkdirSync(socialRoot(root), { recursive: true })
  mkdirSync(socialPostsDir(root), { recursive: true })
}

export function socialConfigHelpText(): string {
  return [
    "Social config",
    "",
    "Add any platform webhook you want to automate in .termlings/.env:",
    "  SOCIAL_X_WEBHOOK_URL",
    "  SOCIAL_LINKEDIN_WEBHOOK_URL",
    "  SOCIAL_INSTAGRAM_WEBHOOK_URL",
    "  SOCIAL_FACEBOOK_WEBHOOK_URL",
    "  SOCIAL_TIKTOK_WEBHOOK_URL",
    "",
    "Optional handles:",
    "  SOCIAL_X_HANDLE",
    "  SOCIAL_LINKEDIN_HANDLE",
    "  SOCIAL_INSTAGRAM_HANDLE",
    "  SOCIAL_FACEBOOK_HANDLE",
    "  SOCIAL_TIKTOK_HANDLE",
    "",
    "Request them with:",
    '  termlings request env SOCIAL_X_WEBHOOK_URL "Needed for social publishing" --scope termlings',
  ].join("\n")
}

export function listSocialAccounts(): SocialAccount[] {
  return SOCIAL_PLATFORMS.map((platform) => {
    const handle = (process.env[socialHandleEnvKey(platform)] || "").trim() || undefined
    const webhookUrl = inferWebhookUrl(platform)
    return {
      id: `social_${platform}`,
      platform,
      handle,
      webhookConfigured: Boolean(webhookUrl),
      status: webhookUrl ? "configured" : "missing",
    }
  })
}

function writeSocialPost(post: SocialPost, root = process.cwd()): void {
  ensureSocialDirs(root)
  writeJsonFile(socialPostPath(post.id, root), post)
}

export function getSocialPost(id: string, root = process.cwd()): SocialPost | null {
  const normalized = (id || "").trim()
  if (!normalized) return null
  return readJsonFile<SocialPost | null>(socialPostPath(normalized, root), null)
}

export function listSocialPosts(
  options: {
    status?: SocialPostStatus | "all"
    platform?: SocialPlatform
    limit?: number
  } = {},
  root = process.cwd(),
): SocialPost[] {
  ensureSocialDirs(root)
  const posts: SocialPost[] = []
  for (const file of readdirSync(socialPostsDir(root))) {
    if (!file.endsWith(".json")) continue
    const post = readJsonFile<SocialPost | null>(join(socialPostsDir(root), file), null)
    if (!post) continue
    posts.push(post)
  }
  let filtered = posts.sort((a, b) => b.updatedAt - a.updatedAt)
  if (options.status && options.status !== "all") {
    filtered = filtered.filter((post) => post.status === options.status)
  }
  if (options.platform) {
    filtered = filtered.filter((post) => post.platform === options.platform)
  }
  if (options.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit)
  }
  return filtered
}

export function listQueuedSocialPosts(root = process.cwd()): SocialPost[] {
  return listSocialPosts({ status: "scheduled" }, root)
    .sort((a, b) => (a.scheduledAt || 0) - (b.scheduledAt || 0))
}

export function readSocialHistory(limit = 25, root = process.cwd()): SocialPublishHistoryEntry[] {
  return readSocialHistoryLines(root).slice(0, Math.max(1, limit))
}

export function createSocialPost(input: CreateSocialPostInput, root = process.cwd()): SocialPost {
  const platform = normalizePlatform(input.platform)
  const text = input.text.trim()
  if (!text) {
    throw new Error("Social post text is required.")
  }
  const now = Date.now()
  const post: SocialPost = {
    id: `post_${platform}_${now}_${Math.random().toString(36).slice(2, 8)}`,
    platform,
    title: input.title?.trim() || undefined,
    text,
    link: input.link?.trim() || undefined,
    mediaPaths: (input.media || []).map((entry) => entry.trim()).filter(Boolean),
    status: "draft",
    createdAt: now,
    createdBy: input.createdBy?.trim() || currentActorId(),
    updatedAt: now,
  }
  writeSocialPost(post, root)
  appendAppActivity({
    ts: now,
    app: "social",
    kind: "post.created",
    text: `created ${platform} draft`,
    level: "summary",
    surface: currentActivityMeta().threadId ? "both" : "feed",
    ...currentActivityMeta(),
    result: "success",
    meta: {
      postId: post.id,
      platform: post.platform,
    },
  }, root)
  return post
}

function parseIsoTimestamp(input: string): number {
  const ts = Date.parse(input)
  if (!Number.isFinite(ts)) {
    throw new Error(`Invalid schedule time: ${input}. Use an ISO timestamp like 2026-03-10T09:00:00+01:00`)
  }
  return ts
}

export function scheduleSocialPost(
  id: string,
  whenIso: string,
  options: { agent?: string } = {},
  root = process.cwd(),
): SocialPost {
  const post = getSocialPost(id, root)
  if (!post) {
    throw new Error(`Social post not found: ${id}`)
  }
  const scheduledAt = parseIsoTimestamp(whenIso)
  if (scheduledAt <= Date.now()) {
    throw new Error("Scheduled publish time must be in the future.")
  }

  const ownerAgent = (options.agent || process.env.TERMLINGS_AGENT_SLUG || "").trim() || undefined
  let calendarEventId = post.calendarEventId
  if (ownerAgent) {
    if (calendarEventId && getCalendarEvent(calendarEventId)) {
      updateCalendarEvent(calendarEventId, {
        title: socialCalendarTitle(post),
        description: socialCalendarDescription(post),
        assignedAgents: [ownerAgent],
        startTime: scheduledAt,
        endTime: scheduledAt + 15 * 60 * 1000,
        enabled: true,
      })
    } else {
      const event = createCalendarEvent(
        socialCalendarTitle(post),
        socialCalendarDescription(post),
        [ownerAgent],
        scheduledAt,
        scheduledAt + 15 * 60 * 1000,
        "none",
      )
      calendarEventId = event.id
    }
  }

  const next: SocialPost = {
    ...post,
    status: "scheduled",
    scheduledAt,
    ownerAgent,
    calendarEventId,
    failedAt: undefined,
    lastError: undefined,
    updatedAt: Date.now(),
  }
  writeSocialPost(next, root)
  appendAppActivity({
    ts: next.updatedAt,
    app: "social",
    kind: "post.scheduled",
    text: `scheduled ${next.platform} post`,
    level: "summary",
    surface: currentActivityMeta().threadId ? "both" : "feed",
    ...currentActivityMeta(),
    result: "success",
    meta: {
      postId: next.id,
      platform: next.platform,
      scheduledAt: next.scheduledAt,
      ownerAgent: next.ownerAgent,
      calendarEventId: next.calendarEventId,
    },
  }, root)
  return next
}

export function unscheduleSocialPost(id: string, root = process.cwd()): SocialPost {
  const post = getSocialPost(id, root)
  if (!post) {
    throw new Error(`Social post not found: ${id}`)
  }
  if (post.calendarEventId) {
    toggleCalendarEvent(post.calendarEventId, false)
  }
  const next: SocialPost = {
    ...post,
    status: post.publishedAt ? "published" : "draft",
    scheduledAt: undefined,
    calendarEventId: post.calendarEventId,
    updatedAt: Date.now(),
  }
  writeSocialPost(next, root)
  appendAppActivity({
    ts: next.updatedAt,
    app: "social",
    kind: "post.unscheduled",
    text: `removed schedule for ${next.platform} post`,
    level: "summary",
    surface: currentActivityMeta().threadId ? "both" : "feed",
    ...currentActivityMeta(),
    result: "success",
    meta: {
      postId: next.id,
      platform: next.platform,
    },
  }, root)
  return next
}

async function postToWebhook(post: SocialPost, root: string, fetchImpl: typeof fetch): Promise<Response> {
  const webhookUrl = inferWebhookUrl(post.platform)
  if (!webhookUrl) {
    throw new Error(`${socialWebhookEnvKey(post.platform)} is not configured.\n\n${socialConfigHelpText()}`)
  }
  const payload: PublishWebhookPayload = {
    id: post.id,
    platform: post.platform,
    title: post.title,
    text: post.text,
    link: post.link,
    media: [...post.mediaPaths],
    scheduledAt: post.scheduledAt ? new Date(post.scheduledAt).toISOString() : undefined,
    createdAt: new Date(post.createdAt).toISOString(),
  }
  return fetchImpl(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-termlings-app": "social",
      "x-termlings-platform": post.platform,
    },
    body: JSON.stringify(payload),
  })
}

export async function publishSocialPost(
  id: string,
  root = process.cwd(),
  fetchImpl: typeof fetch = fetch,
  scheduled = false,
): Promise<SocialPost> {
  const post = getSocialPost(id, root)
  if (!post) {
    throw new Error(`Social post not found: ${id}`)
  }

  try {
    const response = await postToWebhook(post, root, fetchImpl)
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`Webhook publish failed (${response.status})${body ? `: ${body}` : ""}`)
    }

    if (post.calendarEventId) {
      toggleCalendarEvent(post.calendarEventId, false)
    }
    const next: SocialPost = {
      ...post,
      status: "published",
      publishedAt: Date.now(),
      failedAt: undefined,
      lastError: undefined,
      publishResponseStatus: response.status,
      updatedAt: Date.now(),
    }
    writeSocialPost(next, root)
    appendSocialHistory({
      ts: next.updatedAt,
      postId: next.id,
      platform: next.platform,
      status: "published",
      scheduled,
      responseStatus: response.status,
    }, root)
    appendAppActivity({
      ts: next.updatedAt,
      app: "social",
      kind: "post.published",
      text: `published ${next.platform} post`,
      level: "summary",
      surface: currentActivityMeta().threadId ? "both" : "feed",
      ...currentActivityMeta(),
      result: "success",
      meta: {
        postId: next.id,
        platform: next.platform,
        scheduled,
        responseStatus: response.status,
      },
    }, root)
    return next
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (post.calendarEventId) {
      toggleCalendarEvent(post.calendarEventId, false)
    }
    const failed: SocialPost = {
      ...post,
      status: "failed",
      failedAt: Date.now(),
      lastError: message,
      updatedAt: Date.now(),
    }
    writeSocialPost(failed, root)
    appendSocialHistory({
      ts: failed.updatedAt,
      postId: failed.id,
      platform: failed.platform,
      status: "failed",
      scheduled,
      error: message,
    }, root)
    appendAppActivity({
      ts: failed.updatedAt,
      app: "social",
      kind: "post.failed",
      text: `failed to publish ${failed.platform} post: ${message}`,
      level: "summary",
      surface: currentActivityMeta().threadId ? "both" : "feed",
      ...currentActivityMeta(),
      result: "error",
      meta: {
        postId: failed.id,
        platform: failed.platform,
        scheduled,
        error: message,
      },
    }, root)
    throw error
  }
}

export async function executeScheduledSocialPosts(
  now = Date.now(),
  root = process.cwd(),
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{ postId: string; platform: SocialPlatform; success: boolean; error?: string }>> {
  const posts = listQueuedSocialPosts(root)
  const due = posts.filter((post) => typeof post.scheduledAt === "number" && (post.scheduledAt || 0) <= now)
  const results: Array<{ postId: string; platform: SocialPlatform; success: boolean; error?: string }> = []
  for (const post of due) {
    try {
      await publishSocialPost(post.id, root, fetchImpl, true)
      results.push({ postId: post.id, platform: post.platform, success: true })
    } catch (error) {
      results.push({
        postId: post.id,
        platform: post.platform,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

export function formatSocialAccounts(accounts: SocialAccount[]): string {
  if (accounts.length <= 0) return "No social accounts configured"
  const lines = ["Social accounts", ""]
  for (const account of accounts) {
    lines.push(`${account.platform}`)
    lines.push(`  status: ${account.status}`)
    if (account.handle) lines.push(`  handle: ${account.handle}`)
    lines.push(`  webhook: ${account.webhookConfigured ? "configured" : "missing"}`)
    lines.push("")
  }
  return lines.join("\n").trimEnd()
}

function formatPostStatus(post: SocialPost): string {
  if (post.status === "scheduled" && post.scheduledAt) {
    return `scheduled for ${new Date(post.scheduledAt).toLocaleString()}`
  }
  if (post.status === "published" && post.publishedAt) {
    return `published ${new Date(post.publishedAt).toLocaleString()}`
  }
  if (post.status === "failed" && post.failedAt) {
    return `failed ${new Date(post.failedAt).toLocaleString()}`
  }
  return post.status
}

export function formatSocialPosts(posts: SocialPost[]): string {
  if (posts.length <= 0) return "No social posts found"
  const lines: string[] = []
  for (const post of posts) {
    lines.push(`${post.id}`)
    lines.push(`  ${post.platform} · ${formatPostStatus(post)}`)
    lines.push(`  ${post.text.length > 120 ? `${post.text.slice(0, 117)}...` : post.text}`)
    lines.push("")
  }
  return lines.join("\n").trimEnd()
}

export function formatSocialPost(post: SocialPost): string {
  const lines = [
    `Social post: ${post.id}`,
    `Platform: ${post.platform}`,
    `Status: ${post.status}`,
    `Created: ${new Date(post.createdAt).toLocaleString()}`,
  ]
  if (post.title) lines.push(`Title: ${post.title}`)
  if (post.scheduledAt) lines.push(`Scheduled: ${new Date(post.scheduledAt).toLocaleString()}`)
  if (post.publishedAt) lines.push(`Published: ${new Date(post.publishedAt).toLocaleString()}`)
  if (post.ownerAgent) lines.push(`Owner agent: ${post.ownerAgent}`)
  if (post.link) lines.push(`Link: ${post.link}`)
  if (post.mediaPaths.length > 0) lines.push(`Media: ${post.mediaPaths.join(", ")}`)
  if (post.lastError) lines.push(`Last error: ${post.lastError}`)
  lines.push("")
  lines.push(post.text)
  return lines.join("\n")
}

export function formatSocialHistory(entries: SocialPublishHistoryEntry[]): string {
  if (entries.length <= 0) return "No social publishing history"
  return entries.map((entry) => {
    const detail = entry.error
      ? ` (${entry.error})`
      : entry.responseStatus
        ? ` (${entry.responseStatus})`
        : ""
    return `${new Date(entry.ts).toLocaleString()} · ${entry.platform} · ${entry.status}${entry.scheduled ? " · scheduled" : ""} · ${entry.postId}${detail}`
  }).join("\n")
}
