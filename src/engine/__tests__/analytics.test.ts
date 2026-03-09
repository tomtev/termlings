import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { generateKeyPairSync } from "crypto"
import { existsSync, mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  __analyticsTestUtils,
  listAnalyticsProperties,
  parseAnalyticsWindow,
  readAnalyticsChannels,
  readAnalyticsConversions,
  readAnalyticsTraffic,
  readLatestAnalyticsReport,
  syncAnalytics,
} from "../analytics.js"
import { readRecentAppActivityEntries } from "../activity.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

describe("analytics app", () => {
  let root = ""
  let originalCwd = ""
  const originalEnv = {
    propertyId: process.env.GOOGLE_ANALYTICS_PROPERTY_ID,
    propertyName: process.env.GOOGLE_ANALYTICS_PROPERTY_NAME,
    site: process.env.GOOGLE_ANALYTICS_SITE,
    clientEmail: process.env.GOOGLE_ANALYTICS_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_ANALYTICS_PRIVATE_KEY,
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
    ipcDir: process.env.TERMLINGS_IPC_DIR,
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-analytics-test-"))
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
    if (originalEnv.propertyId === undefined) delete process.env.GOOGLE_ANALYTICS_PROPERTY_ID
    else process.env.GOOGLE_ANALYTICS_PROPERTY_ID = originalEnv.propertyId
    if (originalEnv.propertyName === undefined) delete process.env.GOOGLE_ANALYTICS_PROPERTY_NAME
    else process.env.GOOGLE_ANALYTICS_PROPERTY_NAME = originalEnv.propertyName
    if (originalEnv.site === undefined) delete process.env.GOOGLE_ANALYTICS_SITE
    else process.env.GOOGLE_ANALYTICS_SITE = originalEnv.site
    if (originalEnv.clientEmail === undefined) delete process.env.GOOGLE_ANALYTICS_CLIENT_EMAIL
    else process.env.GOOGLE_ANALYTICS_CLIENT_EMAIL = originalEnv.clientEmail
    if (originalEnv.privateKey === undefined) delete process.env.GOOGLE_ANALYTICS_PRIVATE_KEY
    else process.env.GOOGLE_ANALYTICS_PRIVATE_KEY = originalEnv.privateKey
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

  it("creates analytics store directories during workspace setup", () => {
    expect(existsSync(join(root, ".termlings", "store", "analytics", "traffic"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "analytics", "channels"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "analytics", "pages"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "analytics", "conversions"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "analytics", "reports"))).toBe(true)
  })

  it("syncs Google Analytics snapshots, report files, and activity entries", async () => {
    const window = parseAnalyticsWindow("30d")
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    })

    process.env.GOOGLE_ANALYTICS_PROPERTY_ID = "123456789"
    process.env.GOOGLE_ANALYTICS_PROPERTY_NAME = "Termlings Website"
    process.env.GOOGLE_ANALYTICS_SITE = "termlings.com"
    process.env.GOOGLE_ANALYTICS_CLIENT_EMAIL = "analytics-bot@example.iam.gserviceaccount.com"
    process.env.GOOGLE_ANALYTICS_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n")

    const fetchCalls: string[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      fetchCalls.push(url)

      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "token-123", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      if (url.endsWith("/properties/123456789:runReport")) {
        const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
        const dimensionNames = Array.isArray(body.dimensions)
          ? (body.dimensions as Array<Record<string, unknown>>).map((entry) => String(entry.name || ""))
          : []
        const metricNames = Array.isArray(body.metrics)
          ? (body.metrics as Array<Record<string, unknown>>).map((entry) => String(entry.name || ""))
          : []
        const firstRange = Array.isArray(body.dateRanges) && body.dateRanges[0] && typeof body.dateRanges[0] === "object"
          ? body.dateRanges[0] as Record<string, unknown>
          : {}
        const startDate = String(firstRange.startDate || "")

        if (dimensionNames.join(",") === "date" && metricNames.join(",") === "sessions,totalUsers,screenPageViews,bounceRate,averageSessionDuration,keyEvents") {
          if (startDate === window.from) {
            return new Response(JSON.stringify({
              rows: [
                { dimensionValues: [{ value: "20260307" }], metricValues: [{ value: "100" }, { value: "80" }, { value: "140" }, { value: "0.4" }, { value: "90" }, { value: "8" }] },
                { dimensionValues: [{ value: "20260308" }], metricValues: [{ value: "200" }, { value: "150" }, { value: "260" }, { value: "0.35" }, { value: "95" }, { value: "12" }] },
              ],
            }), { status: 200, headers: { "content-type": "application/json" } })
          }

          return new Response(JSON.stringify({
            rows: [
              { metricValues: [{ value: "300" }, { value: "230" }, { value: "400" }, { value: "0.37" }, { value: "92" }, { value: "20" }] },
            ],
          }), { status: 200, headers: { "content-type": "application/json" } })
        }

        if (dimensionNames.join(",") === "date,sessionDefaultChannelGroup") {
          return new Response(JSON.stringify({
            rows: [
              { dimensionValues: [{ value: "20260307" }, { value: "Organic Search" }], metricValues: [{ value: "70" }, { value: "55" }, { value: "6" }] },
              { dimensionValues: [{ value: "20260308" }, { value: "Organic Search" }], metricValues: [{ value: "90" }, { value: "70" }, { value: "8" }] },
              { dimensionValues: [{ value: "20260308" }, { value: "Direct" }], metricValues: [{ value: "30" }, { value: "20" }, { value: "2" }] },
            ],
          }), { status: 200, headers: { "content-type": "application/json" } })
        }

        if (dimensionNames.join(",") === "date,landingPagePlusQueryString") {
          return new Response(JSON.stringify({
            rows: [
              { dimensionValues: [{ value: "20260307" }, { value: "/" }], metricValues: [{ value: "80" }, { value: "64" }, { value: "5" }] },
              { dimensionValues: [{ value: "20260308" }, { value: "/" }], metricValues: [{ value: "120" }, { value: "90" }, { value: "9" }] },
              { dimensionValues: [{ value: "20260308" }, { value: "/pricing" }], metricValues: [{ value: "25" }, { value: "18" }, { value: "4" }] },
            ],
          }), { status: 200, headers: { "content-type": "application/json" } })
        }

        if (dimensionNames.join(",") === "date" && metricNames.join(",") === "sessions,totalUsers,keyEvents") {
          return new Response(JSON.stringify({
            rows: [
              { dimensionValues: [{ value: "20260307" }], metricValues: [{ value: "100" }, { value: "80" }, { value: "8" }] },
              { dimensionValues: [{ value: "20260308" }], metricValues: [{ value: "200" }, { value: "150" }, { value: "12" }] },
            ],
          }), { status: 200, headers: { "content-type": "application/json" } })
        }

        if (dimensionNames.length === 0 && metricNames.join(",") === "sessions,totalUsers,screenPageViews,bounceRate,averageSessionDuration,keyEvents") {
          const row = startDate === window.previousFrom
            ? [{ metricValues: [{ value: "250" }, { value: "190" }, { value: "320" }, { value: "0.44" }, { value: "84" }, { value: "14" }] }]
            : [{ metricValues: [{ value: "300" }, { value: "230" }, { value: "400" }, { value: "0.37" }, { value: "92" }, { value: "20" }] }]
          return new Response(JSON.stringify({ rows: row }), { status: 200, headers: { "content-type": "application/json" } })
        }
      }

      return new Response(JSON.stringify({ error: { message: `Unexpected request: ${url}` } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    }

    const result = await syncAnalytics({ last: "30d" }, root, fetchImpl)

    expect(result.property.propertyId).toBe("123456789")
    expect(result.state.counts.traffic).toBe(2)
    expect(result.state.counts.channels).toBe(3)
    expect(result.state.counts.pages).toBe(3)
    expect(result.state.counts.conversions).toBe(2)
    expect(result.report.current.sessions).toBe(300)
    expect(result.report.previous.sessions).toBe(250)
    expect(result.report.delta.sessions).toBe(50)
    expect(result.report.topChannels[0]?.value).toBe("Organic Search")

    expect(existsSync(join(root, ".termlings", "store", "analytics", "properties.json"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "analytics", "sync-state.json"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "analytics", "traffic", "daily.jsonl"))).toBe(true)

    const trafficView = readAnalyticsTraffic("30d", root)
    expect(trafficView.summary.sessions).toBe(300)
    expect(trafficView.daily).toHaveLength(2)
    expect(trafficView.daily[1]?.day).toBe("2026-03-08")

    const channelsView = readAnalyticsChannels("30d", root)
    expect(channelsView.items[0]?.value).toBe("Organic Search")
    expect(channelsView.items[0]?.sessions).toBe(160)

    const conversionsView = readAnalyticsConversions("30d", root)
    expect(conversionsView.totalKeyEvents).toBe(20)
    expect(conversionsView.conversionRate).toBeCloseTo(20 / 300)

    const latestReport = readLatestAnalyticsReport("30d", root)
    expect(latestReport?.propertyName).toBe("Termlings Website")
    expect(latestReport?.topPages[0]?.value).toBe("/")

    const properties = listAnalyticsProperties(root)
    expect(properties[0]?.status).toBe("synced")

    const activities = readRecentAppActivityEntries(10, root)
    expect(activities.map((entry) => entry.app)).toContain("analytics")
    expect(activities.map((entry) => entry.kind)).toContain("sync.completed")
    expect(fetchCalls.filter((url) => url.includes(":runReport"))).toHaveLength(6)
  })

  it("parses day and month-based analytics windows", () => {
    const daily = parseAnalyticsWindow("7d", new Date("2026-03-08T09:00:00Z"))
    expect(daily.from).toBe("2026-03-02")
    expect(daily.to).toBe("2026-03-08")
    expect(daily.previousFrom).toBe("2026-02-23")
    expect(daily.previousTo).toBe("2026-03-01")

    const monthly = parseAnalyticsWindow("12m", new Date("2026-03-08T09:00:00Z"))
    expect(monthly.label).toBe("12m")
    expect(monthly.to).toBe("2026-03-08")
    expect(monthly.from < monthly.to).toBe(true)
  })

  it("creates JWT assertions for Google service-account auth", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    })

    const assertion = __analyticsTestUtils.createJwtAssertion({
      provider: "google-analytics",
      propertyId: "123",
      propertyName: "Test",
      clientEmail: "analytics-bot@example.iam.gserviceaccount.com",
      privateKey,
    }, Date.UTC(2026, 2, 8, 9, 0, 0))

    expect(assertion.split(".")).toHaveLength(3)
    expect(assertion).toContain(".")
  })
})
