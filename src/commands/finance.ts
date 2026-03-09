import {
  assertNoExtraPositionalArgs,
  maybeHandleAppHelpOrSchema,
  parseLimit,
  parseParamsJson,
  printJson,
  renderAppApiHelp,
  type AppApiContract,
} from "./app-api.js"

const FINANCE_CONTRACT: AppApiContract = {
  app: "finance",
  title: "Finance",
  summary: "File-based revenue and subscription sync",
  actions: {
    accounts: {
      summary: "List connected finance providers",
    },
    sync: {
      summary: "Pull fresh finance snapshots",
      params: {
        provider: "stripe",
        last: "30d",
      },
    },
    metrics: {
      summary: "Read revenue metrics for a time window",
      params: {
        last: "30d",
      },
    },
    revenue: {
      summary: "Read revenue series for a time window",
      params: {
        last: "30d",
      },
    },
    customers: {
      summary: "Read normalized customer snapshots",
      params: {
        limit: 25,
      },
    },
    subscriptions: {
      summary: "Read normalized subscription snapshots",
      params: {
        status: "active",
        limit: 25,
      },
    },
    invoices: {
      summary: "Read normalized invoice snapshots",
      params: {
        status: "all",
        limit: 25,
      },
    },
    refunds: {
      summary: "Read normalized refund snapshots",
      params: {
        limit: 25,
      },
    },
    report: {
      summary: "Read the latest finance report",
      params: {
        last: "30d",
      },
    },
    "schedule.list": {
      summary: "List recurring finance sync schedules",
    },
    "schedule.create": {
      summary: "Create a recurring finance sync schedule",
      stdinJson: {
        action: "sync",
        recurrence: "weekly",
        time: "09:00",
        provider: "stripe",
        last: "30d",
        timezone: "Europe/Oslo",
        weekday: "mon",
        date: "2026-03-10",
      },
    },
    "schedule.remove": {
      summary: "Remove a finance schedule",
      params: {
        id: "finance_schedule_abc123",
      },
    },
  },
  env: [
    "STRIPE_API_KEY",
    "STRIPE_ACCOUNT_NAME",
    "STRIPE_SITE",
  ],
  notes: [
    "Use `schema` before unfamiliar actions to inspect the exact JSON contract.",
    "Request `STRIPE_API_KEY` into `.termlings/.env` with `termlings request env ... --scope termlings`.",
  ],
}

function validateProvider(input: string | undefined): "stripe" {
  const provider = (input || "stripe").trim().toLowerCase()
  if (provider !== "stripe") {
    throw new Error(`Unsupported finance provider: ${input}`)
  }
  return "stripe"
}

export async function handleFinance(flags: Set<string>, positional: string[], opts: Record<string, string>): Promise<void> {
  const { handleAppScheduleCommand } = await import("./app-schedule.js")
  const {
    financeConfigHelpText,
    formatFinanceAccounts,
    formatFinanceCustomers,
    formatFinanceInvoices,
    formatFinanceMetrics,
    formatFinanceRefunds,
    formatFinanceReport,
    formatFinanceRevenue,
    formatFinanceSubscriptions,
    listFinanceAccounts,
    readFinanceCustomers,
    readFinanceInvoices,
    readFinanceMetrics,
    readFinanceRefunds,
    readFinanceRevenue,
    readFinanceSubscriptions,
    readLatestFinanceReport,
    syncFinance,
  } = await import("../engine/finance.js")

  if (maybeHandleAppHelpOrSchema(FINANCE_CONTRACT, flags, positional)) return

  const subcommand = positional[1] || "report"

  if (subcommand === "schedule") {
    try {
      await handleAppScheduleCommand({
        app: "finance",
        label: "Finance",
        defaultProvider: "stripe",
        allowedProviders: ["stripe"],
      }, flags, positional, opts)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(message)
      process.exit(1)
    }
  }

  const params = parseParamsJson(opts)
  const last = typeof params.last === "string" && params.last.trim() ? params.last.trim() : "30d"

  try {
    if (subcommand === "accounts") {
      assertNoExtraPositionalArgs(positional, 2, "finance", "accounts")
      const accounts = listFinanceAccounts()
      if (flags.has("json")) printJson(accounts)
      else console.log(formatFinanceAccounts(accounts))
      return
    }

    if (subcommand === "sync") {
      assertNoExtraPositionalArgs(positional, 2, "finance", "sync")
      const result = await syncFinance({
        provider: validateProvider(typeof params.provider === "string" ? params.provider : undefined),
        last,
      })
      if (flags.has("json")) {
        printJson(result)
      } else {
        console.log(`✓ Synced finance for ${result.account.name}`)
        console.log(`Window: ${result.report.window} (${result.report.from} → ${result.report.to})`)
        console.log(`Customers: ${result.state.counts.customers}`)
        console.log(`Subscriptions: ${result.state.counts.subscriptions}`)
        console.log(`Invoices: ${result.state.counts.invoices}`)
        console.log(`Refunds: ${result.state.counts.refunds}`)
      }
      return
    }

    if (subcommand === "metrics") {
      assertNoExtraPositionalArgs(positional, 2, "finance", "metrics")
      const view = readFinanceMetrics(last)
      if (flags.has("json")) printJson(view)
      else console.log(formatFinanceMetrics(view))
      return
    }

    if (subcommand === "revenue") {
      assertNoExtraPositionalArgs(positional, 2, "finance", "revenue")
      const view = readFinanceRevenue(last)
      if (flags.has("json")) printJson(view)
      else console.log(formatFinanceRevenue(view))
      return
    }

    if (subcommand === "customers") {
      assertNoExtraPositionalArgs(positional, 2, "finance", "customers")
      const customers = readFinanceCustomers().slice(0, parseLimit(params.limit, 25))
      if (flags.has("json")) printJson(customers)
      else console.log(formatFinanceCustomers(customers))
      return
    }

    if (subcommand === "subscriptions") {
      assertNoExtraPositionalArgs(positional, 2, "finance", "subscriptions")
      const status = typeof params.status === "string" && params.status.trim() ? params.status.trim() : "active"
      const subscriptions = readFinanceSubscriptions(process.cwd(), status).slice(0, parseLimit(params.limit, 25))
      if (flags.has("json")) printJson(subscriptions)
      else console.log(formatFinanceSubscriptions(subscriptions))
      return
    }

    if (subcommand === "invoices") {
      assertNoExtraPositionalArgs(positional, 2, "finance", "invoices")
      const status = typeof params.status === "string" && params.status.trim() ? params.status.trim() : "all"
      const invoices = readFinanceInvoices(process.cwd(), status).slice(0, parseLimit(params.limit, 25))
      if (flags.has("json")) printJson(invoices)
      else console.log(formatFinanceInvoices(invoices))
      return
    }

    if (subcommand === "refunds") {
      assertNoExtraPositionalArgs(positional, 2, "finance", "refunds")
      const refunds = readFinanceRefunds().slice(0, parseLimit(params.limit, 25))
      if (flags.has("json")) printJson(refunds)
      else console.log(formatFinanceRefunds(refunds))
      return
    }

    if (subcommand === "report") {
      assertNoExtraPositionalArgs(positional, 2, "finance", "report")
      const report = readLatestFinanceReport(last)
      if (flags.has("json")) printJson(report)
      else console.log(formatFinanceReport(report))
      return
    }

    console.error(`Unknown finance command: ${subcommand}`)
    console.error(renderAppApiHelp(FINANCE_CONTRACT))
    process.exit(1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("STRIPE_")) {
      console.error(financeConfigHelpText())
    } else {
      console.error(message)
    }
    process.exit(1)
  }
}
