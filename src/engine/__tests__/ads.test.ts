import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  formatAdsMetrics,
  listAdsAccounts,
  parseAdsWindow,
  readAdsCampaignMetrics,
  readAdsCampaigns,
  readAdsCreatives,
  readAdsMetrics,
  readLatestAdsReport,
  syncAds,
} from "../ads.js"
import { readRecentAppActivityEntries } from "../activity.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

describe("ads app", () => {
  let root = ""
  let originalCwd = ""
  const originalEnv = {
    accessToken: process.env.META_ADS_ACCESS_TOKEN,
    accountId: process.env.META_AD_ACCOUNT_ID,
    accountName: process.env.META_ADS_ACCOUNT_NAME,
    site: process.env.META_ADS_SITE,
    apiVersion: process.env.META_ADS_API_VERSION,
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
    ipcDir: process.env.TERMLINGS_IPC_DIR,
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-ads-test-"))
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
    if (originalEnv.accessToken === undefined) delete process.env.META_ADS_ACCESS_TOKEN
    else process.env.META_ADS_ACCESS_TOKEN = originalEnv.accessToken
    if (originalEnv.accountId === undefined) delete process.env.META_AD_ACCOUNT_ID
    else process.env.META_AD_ACCOUNT_ID = originalEnv.accountId
    if (originalEnv.accountName === undefined) delete process.env.META_ADS_ACCOUNT_NAME
    else process.env.META_ADS_ACCOUNT_NAME = originalEnv.accountName
    if (originalEnv.site === undefined) delete process.env.META_ADS_SITE
    else process.env.META_ADS_SITE = originalEnv.site
    if (originalEnv.apiVersion === undefined) delete process.env.META_ADS_API_VERSION
    else process.env.META_ADS_API_VERSION = originalEnv.apiVersion
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

  it("creates ads store directories during workspace setup", () => {
    expect(existsSync(join(root, ".termlings", "store", "ads", "campaigns"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "ads", "creatives"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "ads", "metrics"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "ads", "reports"))).toBe(true)
  })

  it("syncs Meta ads snapshots, reports, and activity entries", async () => {
    const window = parseAdsWindow("30d")
    process.env.META_ADS_ACCESS_TOKEN = "meta-token"
    process.env.META_AD_ACCOUNT_ID = "123456"
    process.env.META_ADS_ACCOUNT_NAME = "Main Meta Ads"
    process.env.META_ADS_SITE = "termlings.com"
    process.env.META_ADS_API_VERSION = "v24.0"

    const fetchCalls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      fetchCalls.push(url)
      const parsed = new URL(url)

      expect(parsed.searchParams.get("access_token")).toBe("meta-token")

      if (parsed.pathname === "/v24.0/act_123456") {
        return new Response(JSON.stringify({
          id: "act_123456",
          account_id: "123456",
          name: "Main Meta Ads",
          currency: "USD",
          account_status: 1,
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      if (parsed.pathname === "/v24.0/act_123456/campaigns") {
        return new Response(JSON.stringify({
          data: [
            {
              id: "cmp_1",
              name: "Launch Campaign",
              objective: "OUTCOME_TRAFFIC",
              status: "ACTIVE",
              effective_status: "ACTIVE",
              daily_budget: "2500",
              created_time: "2026-03-01T10:00:00+0000",
              updated_time: "2026-03-08T09:00:00+0000",
            },
            {
              id: "cmp_2",
              name: "Retargeting",
              objective: "OUTCOME_SALES",
              status: "PAUSED",
              effective_status: "PAUSED",
              daily_budget: "1000",
              created_time: "2026-02-10T10:00:00+0000",
              updated_time: "2026-03-07T09:00:00+0000",
            },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      if (parsed.pathname === "/v24.0/act_123456/ads") {
        return new Response(JSON.stringify({
          data: [
            {
              id: "ad_1",
              name: "Launch Ad 1",
              status: "ACTIVE",
              effective_status: "ACTIVE",
              created_time: "2026-03-01T10:00:00+0000",
              updated_time: "2026-03-08T09:00:00+0000",
              campaign: { id: "cmp_1", name: "Launch Campaign" },
              creative: { id: "creative_1", name: "Launch Creative" },
            },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      if (parsed.pathname === "/v24.0/act_123456/insights") {
        const since = parsed.searchParams.get("time_range[since]")
        if (since === window.previousFrom) {
          return new Response(JSON.stringify({
            data: [
              {
                campaign_id: "cmp_2",
                campaign_name: "Retargeting",
                spend: "25.00",
                impressions: "700",
                clicks: "18",
                reach: "550",
                ctr: "2.57",
                cpc: "1.39",
                cpm: "35.71",
              },
            ],
          }), { status: 200, headers: { "content-type": "application/json" } })
        }

        return new Response(JSON.stringify({
          data: [
            {
              campaign_id: "cmp_1",
              campaign_name: "Launch Campaign",
              spend: "123.45",
              impressions: "15000",
              clicks: "320",
              reach: "9100",
              ctr: "2.13",
              cpc: "0.39",
              cpm: "8.23",
            },
            {
              campaign_id: "cmp_2",
              campaign_name: "Retargeting",
              spend: "40.00",
              impressions: "1000",
              clicks: "25",
              reach: "700",
              ctr: "2.50",
              cpc: "1.60",
              cpm: "40.00",
            },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      return new Response(JSON.stringify({ error: { message: `Unexpected request: ${url}` } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    }

    const result = await syncAds({ last: "30d" }, root, fetchImpl)

    expect(result.account.name).toBe("Main Meta Ads")
    expect(result.account.currency).toBe("usd")
    expect(result.state.counts.campaigns).toBe(2)
    expect(result.state.counts.creatives).toBe(1)
    expect(result.state.counts.campaignMetrics).toBe(2)
    expect(result.report.current.spend).toBe(16345)
    expect(result.report.current.impressions).toBe(16000)
    expect(result.report.current.clicks).toBe(345)
    expect(result.report.current.reach).toBe(9800)
    expect(result.report.previous.spend).toBe(2500)
    expect(result.report.topCampaigns[0]?.campaignName).toBe("Launch Campaign")

    expect(existsSync(join(root, ".termlings", "store", "ads", "providers.json"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "ads", "sync-state.json"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "ads", "metrics", "daily.jsonl"))).toBe(true)

    const accounts = listAdsAccounts(root)
    expect(accounts[0]?.status).toBe("synced")

    const campaigns = readAdsCampaigns(root, "all")
    expect(campaigns).toHaveLength(2)
    expect(campaigns[0]?.name).toBe("Launch Campaign")

    const creatives = readAdsCreatives(root, "all")
    expect(creatives).toHaveLength(1)
    expect(creatives[0]?.name).toBe("Launch Creative")

    const metrics = readAdsMetrics("30d", root)
    expect(metrics.snapshot.spend).toBe(16345)
    expect(formatAdsMetrics(metrics)).toContain("Main Meta Ads")

    const campaignMetrics = readAdsCampaignMetrics("30d", root)
    expect(campaignMetrics[0]?.campaignName).toBe("Launch Campaign")

    const report = readLatestAdsReport("30d", root)
    expect(report?.accountName).toBe("Main Meta Ads")

    const activities = readRecentAppActivityEntries(10, root)
    expect(activities.map((entry) => entry.app)).toContain("ads")
    expect(activities.map((entry) => entry.kind)).toContain("sync.completed")

    expect(fetchCalls).toHaveLength(5)
  })

  it("parses day and month ads windows", () => {
    const monthWindow = parseAdsWindow("12m", new Date("2026-03-08T12:00:00Z"))
    expect(monthWindow.label).toBe("12m")
    expect(monthWindow.to).toBe("2026-03-08")

    const dayWindow = parseAdsWindow("7d", new Date("2026-03-08T12:00:00Z"))
    expect(dayWindow.label).toBe("7d")
    expect(dayWindow.from).toBe("2026-03-02")
    expect(dayWindow.to).toBe("2026-03-08")
  })
})
