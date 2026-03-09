import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  createSocialPost,
  executeScheduledSocialPosts,
  listQueuedSocialPosts,
  listSocialAccounts,
  publishSocialPost,
  readSocialHistory,
  scheduleSocialPost,
} from "../social.js"
import { readRecentAppActivityEntries } from "../activity.js"
import { getCalendarEvent } from "../calendar.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

describe("social app", () => {
  let root = ""
  let originalCwd = ""
  const originalEnv = {
    xWebhook: process.env.SOCIAL_X_WEBHOOK_URL,
    xHandle: process.env.SOCIAL_X_HANDLE,
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
    ipcDir: process.env.TERMLINGS_IPC_DIR,
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-social-test-"))
    originalCwd = process.cwd()
    process.chdir(root)
    ensureWorkspaceDirs(root)
    process.env.TERMLINGS_IPC_DIR = join(root, ".termlings")
    process.env.TERMLINGS_SESSION_ID = "tl-growth-1"
    process.env.TERMLINGS_AGENT_SLUG = "growth"
    process.env.TERMLINGS_AGENT_NAME = "Mango"
    process.env.TERMLINGS_AGENT_DNA = "80bf40"
  })

  afterEach(() => {
    process.chdir(originalCwd)
    if (originalEnv.xWebhook === undefined) delete process.env.SOCIAL_X_WEBHOOK_URL
    else process.env.SOCIAL_X_WEBHOOK_URL = originalEnv.xWebhook
    if (originalEnv.xHandle === undefined) delete process.env.SOCIAL_X_HANDLE
    else process.env.SOCIAL_X_HANDLE = originalEnv.xHandle
    if (originalEnv.sessionId === undefined) delete process.env.TERMLINGS_SESSION_ID
    else process.env.TERMLINGS_SESSION_ID = originalEnv.sessionId
    if (originalEnv.agentSlug === undefined) delete process.env.TERMLINGS_AGENT_SLUG
    else process.env.TERMLINGS_AGENT_SLUG = originalEnv.agentSlug
    if (originalEnv.agentName === undefined) delete process.env.TERMLINGS_AGENT_NAME
    else process.env.TERMLINGS_AGENT_NAME = originalEnv.agentName
    if (originalEnv.agentDna === undefined) delete process.env.TERMLINGS_AGENT_DNA
    else process.env.TERMLINGS_AGENT_DNA = originalEnv.agentDna
    if (originalEnv.ipcDir === undefined) delete process.env.TERMLINGS_IPC_DIR
    else process.env.TERMLINGS_IPC_DIR = originalEnv.ipcDir
    rmSync(root, { recursive: true, force: true })
  })

  it("creates social store directories during workspace setup", () => {
    expect(existsSync(join(root, ".termlings", "store", "social", "posts"))).toBe(true)
  })

  it("lists configured social accounts from webhook env vars", () => {
    process.env.SOCIAL_X_WEBHOOK_URL = "https://example.com/social/x"
    process.env.SOCIAL_X_HANDLE = "@termlings"

    const accounts = listSocialAccounts()
    const x = accounts.find((account) => account.platform === "x")
    expect(x?.status).toBe("configured")
    expect(x?.handle).toBe("@termlings")
  })

  it("creates, schedules, and publishes a social post via webhook", async () => {
    process.env.SOCIAL_X_WEBHOOK_URL = "https://example.com/social/x"

    const post = createSocialPost({
      platform: "x",
      text: "Shipping social scheduling this week.",
      link: "https://termlings.com",
      media: ["./hero.png"],
    }, root)

    const scheduled = scheduleSocialPost(
      post.id,
      "2099-03-10T09:00:00+01:00",
      { agent: "growth" },
      root,
    )
    expect(scheduled.status).toBe("scheduled")
    expect(scheduled.calendarEventId).toBeTruthy()
    expect(getCalendarEvent(scheduled.calendarEventId || "")?.enabled).toBe(true)
    expect(listQueuedSocialPosts(root)).toHaveLength(1)

    const fetchCalls: Array<{ url: string; body: string }> = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      fetchCalls.push({ url, body: String(init?.body || "") })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })
    }

    const published = await publishSocialPost(post.id, root, fetchImpl)
    expect(published.status).toBe("published")
    expect(published.publishResponseStatus).toBe(200)
    expect(getCalendarEvent(scheduled.calendarEventId || "")?.enabled).toBe(false)
    expect(fetchCalls[0]?.url).toBe("https://example.com/social/x")
    expect(fetchCalls[0]?.body).toContain("Shipping social scheduling this week.")

    const history = readSocialHistory(10, root)
    expect(history[0]?.status).toBe("published")

    const activities = readRecentAppActivityEntries(10, root)
    expect(activities.map((entry) => entry.app)).toContain("social")
    expect(activities.map((entry) => entry.kind)).toEqual(expect.arrayContaining([
      "post.created",
      "post.scheduled",
      "post.published",
    ]))
  })

  it("publishes due scheduled posts through the scheduler path", async () => {
    process.env.SOCIAL_X_WEBHOOK_URL = "https://example.com/social/x"

    const post = createSocialPost({
      platform: "x",
      text: "Queued post",
    }, root)
    const scheduled = scheduleSocialPost(
      post.id,
      "2099-03-10T09:00:00+01:00",
      { agent: "growth" },
      root,
    )

    const postPath = join(root, ".termlings", "store", "social", "posts", `${post.id}.json`)
    const raw = JSON.parse(readFileSync(postPath, "utf8")) as Record<string, unknown>
    raw.scheduledAt = Date.now() - 1_000
    writeFileSync(postPath, JSON.stringify(raw, null, 2) + "\n")

    const results = await executeScheduledSocialPosts(Date.now(), root, async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 202, headers: { "content-type": "application/json" } })
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.success).toBe(true)

    const history = readSocialHistory(10, root)
    expect(history[0]?.scheduled).toBe(true)
    expect(getCalendarEvent(scheduled.calendarEventId || "")?.enabled).toBe(false)
  })
})
