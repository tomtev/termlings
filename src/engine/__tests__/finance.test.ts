import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import {
  formatFinanceMetrics,
  listFinanceAccounts,
  parseFinanceWindow,
  readFinanceCustomers,
  readFinanceMetrics,
  readFinanceRefunds,
  readFinanceRevenue,
  readFinanceSubscriptions,
  readLatestFinanceReport,
  syncFinance,
} from "../finance.js"
import { readRecentAppActivityEntries } from "../activity.js"
import { ensureWorkspaceDirs } from "../../workspace/state.js"

function unixSecondsAgo(days: number): number {
  return Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)
}

describe("finance app", () => {
  let root = ""
  let originalCwd = ""
  const originalEnv = {
    stripeApiKey: process.env.STRIPE_API_KEY,
    stripeAccountName: process.env.STRIPE_ACCOUNT_NAME,
    stripeSite: process.env.STRIPE_SITE,
    sessionId: process.env.TERMLINGS_SESSION_ID,
    agentSlug: process.env.TERMLINGS_AGENT_SLUG,
    agentName: process.env.TERMLINGS_AGENT_NAME,
    agentDna: process.env.TERMLINGS_AGENT_DNA,
    ipcDir: process.env.TERMLINGS_IPC_DIR,
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "termlings-finance-test-"))
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
    if (originalEnv.stripeApiKey === undefined) delete process.env.STRIPE_API_KEY
    else process.env.STRIPE_API_KEY = originalEnv.stripeApiKey
    if (originalEnv.stripeAccountName === undefined) delete process.env.STRIPE_ACCOUNT_NAME
    else process.env.STRIPE_ACCOUNT_NAME = originalEnv.stripeAccountName
    if (originalEnv.stripeSite === undefined) delete process.env.STRIPE_SITE
    else process.env.STRIPE_SITE = originalEnv.stripeSite
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

  it("creates finance store directories during workspace setup", () => {
    expect(existsSync(join(root, ".termlings", "store", "finance", "customers"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "finance", "subscriptions"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "finance", "invoices"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "finance", "refunds"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "finance", "metrics"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "finance", "reports"))).toBe(true)
  })

  it("syncs Stripe snapshots, reports, and activity entries", async () => {
    process.env.STRIPE_API_KEY = "sk_test_123"
    process.env.STRIPE_ACCOUNT_NAME = "Main Stripe"
    process.env.STRIPE_SITE = "termlings.com"

    const fetchCalls: string[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      fetchCalls.push(url)
      const parsed = new URL(url)

      expect(init?.headers).toMatchObject({
        authorization: "Bearer sk_test_123",
      })

      if (parsed.pathname === "/v1/balance") {
        return new Response(JSON.stringify({
          available: [{ currency: "usd", amount: 125000 }],
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      if (parsed.pathname === "/v1/customers") {
        return new Response(JSON.stringify({
          data: [
            { id: "cus_alpha", email: "alpha@example.com", name: "Alpha", currency: "usd", created: unixSecondsAgo(2) },
            { id: "cus_beta", email: "beta@example.com", name: "Beta", currency: "usd", created: unixSecondsAgo(50) },
          ],
          has_more: false,
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      if (parsed.pathname === "/v1/subscriptions") {
        return new Response(JSON.stringify({
          data: [
            {
              id: "sub_active",
              customer: "cus_alpha",
              status: "active",
              created: unixSecondsAgo(2),
              current_period_start: unixSecondsAgo(2),
              current_period_end: unixSecondsAgo(-28),
              items: {
                data: [
                  {
                    price: {
                      id: "price_starter",
                      unit_amount: 5000,
                      currency: "usd",
                      recurring: { interval: "month" },
                    },
                  },
                ],
              },
            },
            {
              id: "sub_old",
              customer: "cus_beta",
              status: "canceled",
              created: unixSecondsAgo(60),
              canceled_at: unixSecondsAgo(40),
              items: {
                data: [
                  {
                    price: {
                      id: "price_old",
                      unit_amount: 2000,
                      currency: "usd",
                      recurring: { interval: "month" },
                    },
                  },
                ],
              },
            },
          ],
          has_more: false,
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      if (parsed.pathname === "/v1/invoices") {
        return new Response(JSON.stringify({
          data: [
            {
              id: "in_current",
              customer: "cus_alpha",
              subscription: "sub_active",
              status: "paid",
              amount_due: 5000,
              amount_paid: 5000,
              amount_remaining: 0,
              currency: "usd",
              created: unixSecondsAgo(1),
              status_transitions: { paid_at: unixSecondsAgo(1) },
            },
            {
              id: "in_previous",
              customer: "cus_beta",
              subscription: "sub_old",
              status: "paid",
              amount_due: 2000,
              amount_paid: 2000,
              amount_remaining: 0,
              currency: "usd",
              created: unixSecondsAgo(40),
              status_transitions: { paid_at: unixSecondsAgo(40) },
            },
          ],
          has_more: false,
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      if (parsed.pathname === "/v1/refunds") {
        return new Response(JSON.stringify({
          data: [
            {
              id: "re_current",
              charge: "ch_123",
              payment_intent: "pi_123",
              amount: 500,
              currency: "usd",
              reason: "requested_by_customer",
              status: "succeeded",
              created: unixSecondsAgo(1),
            },
          ],
          has_more: false,
        }), { status: 200, headers: { "content-type": "application/json" } })
      }

      return new Response(JSON.stringify({ error: { message: `Unexpected request: ${url}` } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    }

    const result = await syncFinance({ last: "30d" }, root, fetchImpl)

    expect(result.account.name).toBe("Main Stripe")
    expect(result.account.currency).toBe("usd")
    expect(result.state.counts.customers).toBe(2)
    expect(result.state.counts.subscriptions).toBe(2)
    expect(result.state.counts.invoices).toBe(2)
    expect(result.state.counts.refunds).toBe(1)
    expect(result.report.current.mrr).toBe(5000)
    expect(result.report.current.arr).toBe(60000)
    expect(result.report.current.activeSubscriptions).toBe(1)
    expect(result.report.current.newSubscriptions).toBe(1)
    expect(result.report.current.revenue).toBe(5000)
    expect(result.report.current.refunds).toBe(500)
    expect(result.report.current.netRevenue).toBe(4500)
    expect(result.report.previous.revenue).toBe(2000)
    expect(result.report.topCustomers[0]?.value).toBe("Alpha")
    expect(result.report.topPlans[0]?.value).toBe("price_starter")

    expect(existsSync(join(root, ".termlings", "store", "finance", "providers.json"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "finance", "sync-state.json"))).toBe(true)
    expect(existsSync(join(root, ".termlings", "store", "finance", "metrics", "daily.jsonl"))).toBe(true)

    const accounts = listFinanceAccounts(root)
    expect(accounts[0]?.status).toBe("synced")

    const customers = readFinanceCustomers(root)
    expect(customers[0]?.name).toBe("Alpha")

    const subscriptions = readFinanceSubscriptions(root, "active")
    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0]?.plan).toBe("price_starter")

    const refunds = readFinanceRefunds(root)
    expect(refunds[0]?.reason).toBe("requested_by_customer")

    const metrics = readFinanceMetrics("30d", root)
    expect(metrics.snapshot.netRevenue).toBe(4500)
    expect(formatFinanceMetrics(metrics)).toContain("Main Stripe")

    const revenue = readFinanceRevenue("30d", root)
    expect(revenue.revenue).toBe(5000)
    expect(revenue.refunds).toBe(500)
    expect(revenue.netRevenue).toBe(4500)

    const report = readLatestFinanceReport("30d", root)
    expect(report?.accountName).toBe("Main Stripe")

    const activities = readRecentAppActivityEntries(10, root)
    expect(activities.map((entry) => entry.app)).toContain("finance")
    expect(activities.map((entry) => entry.kind)).toContain("sync.completed")

    expect(fetchCalls).toHaveLength(5)
  })

  it("parses day and month finance windows", () => {
    const monthWindow = parseFinanceWindow("12m", new Date("2026-03-08T12:00:00Z"))
    expect(monthWindow.label).toBe("12m")
    expect(monthWindow.to).toBe("2026-03-08")

    const dayWindow = parseFinanceWindow("7d", new Date("2026-03-08T12:00:00Z"))
    expect(dayWindow.label).toBe("7d")
    expect(dayWindow.from).toBe("2026-03-02")
    expect(dayWindow.to).toBe("2026-03-08")
  })
})
