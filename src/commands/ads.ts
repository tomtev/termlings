import {
  assertNoExtraPositionalArgs,
  maybeHandleAppHelpOrSchema,
  parseLimit,
  parseParamsJson,
  printJson,
  renderAppApiHelp,
  type AppApiContract,
} from "./app-api.js"

const ADS_CONTRACT: AppApiContract = {
  app: "ads",
  title: "Ads",
  summary: "File-based ad sync and reporting",
  actions: {
    accounts: {
      summary: "List connected ad accounts",
    },
    sync: {
      summary: "Pull fresh ads snapshots",
      params: {
        provider: "meta",
        last: "30d",
      },
    },
    campaigns: {
      summary: "Read campaign snapshots",
      params: {
        status: "all",
        limit: 25,
      },
    },
    creatives: {
      summary: "Read creative snapshots",
      params: {
        status: "all",
        limit: 25,
      },
    },
    metrics: {
      summary: "Read aggregate ad metrics",
      params: {
        last: "30d",
      },
    },
    report: {
      summary: "Read the latest ads report",
      params: {
        last: "30d",
      },
    },
    "schedule.list": {
      summary: "List recurring ads sync schedules",
    },
    "schedule.create": {
      summary: "Create a recurring ads sync schedule",
      stdinJson: {
        action: "sync",
        recurrence: "daily",
        time: "07:00",
        provider: "meta",
        last: "30d",
        timezone: "Europe/Oslo",
        weekday: "mon",
        date: "2026-03-10",
      },
    },
    "schedule.remove": {
      summary: "Remove an ads schedule",
      params: {
        id: "ads_schedule_abc123",
      },
    },
  },
  env: [
    "META_ADS_ACCESS_TOKEN",
    "META_AD_ACCOUNT_ID",
    "META_ADS_ACCOUNT_NAME",
    "META_ADS_SITE",
    "META_ADS_API_VERSION",
  ],
  notes: [
    "Use `schema` before unfamiliar actions to inspect the exact JSON contract.",
    "Request Meta credentials into `.termlings/.env` with `termlings request env ... --scope termlings`.",
  ],
}

function validateProvider(input: string | undefined): "meta" {
  const provider = (input || "meta").trim().toLowerCase()
  if (provider !== "meta") {
    throw new Error(`Unsupported ads provider: ${input}`)
  }
  return "meta"
}

export async function handleAds(flags: Set<string>, positional: string[], opts: Record<string, string>): Promise<void> {
  const { handleAppScheduleCommand } = await import("./app-schedule.js")
  const {
    adsConfigHelpText,
    formatAdsAccounts,
    formatAdsCampaigns,
    formatAdsCreatives,
    formatAdsMetrics,
    formatAdsReport,
    listAdsAccounts,
    readAdsCampaignMetrics,
    readAdsCampaigns,
    readAdsCreatives,
    readAdsMetrics,
    readLatestAdsReport,
    syncAds,
  } = await import("../engine/ads.js")

  if (maybeHandleAppHelpOrSchema(ADS_CONTRACT, flags, positional)) return

  const subcommand = positional[1] || "report"

  if (subcommand === "schedule") {
    try {
      await handleAppScheduleCommand({
        app: "ads",
        label: "Ads",
        defaultProvider: "meta",
        allowedProviders: ["meta"],
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
      assertNoExtraPositionalArgs(positional, 2, "ads", "accounts")
      const accounts = listAdsAccounts()
      if (flags.has("json")) printJson(accounts)
      else console.log(formatAdsAccounts(accounts))
      return
    }

    if (subcommand === "sync") {
      assertNoExtraPositionalArgs(positional, 2, "ads", "sync")
      const result = await syncAds({
        provider: validateProvider(typeof params.provider === "string" ? params.provider : undefined),
        last,
      })
      if (flags.has("json")) {
        printJson(result)
      } else {
        console.log(`✓ Synced ads for ${result.account.name}`)
        console.log(`Window: ${result.report.window} (${result.report.from} → ${result.report.to})`)
        console.log(`Campaigns: ${result.state.counts.campaigns}`)
        console.log(`Creatives: ${result.state.counts.creatives}`)
        console.log(`Campaign metrics: ${result.state.counts.campaignMetrics}`)
      }
      return
    }

    if (subcommand === "campaigns") {
      assertNoExtraPositionalArgs(positional, 2, "ads", "campaigns")
      const status = typeof params.status === "string" && params.status.trim() ? params.status.trim() : "all"
      const campaigns = readAdsCampaigns(process.cwd(), status).slice(0, parseLimit(params.limit, 25))
      if (flags.has("json")) {
        printJson(campaigns)
      } else {
        const account = listAdsAccounts()[0]
        console.log(formatAdsCampaigns(campaigns, account?.currency || "usd"))
      }
      return
    }

    if (subcommand === "creatives") {
      assertNoExtraPositionalArgs(positional, 2, "ads", "creatives")
      const status = typeof params.status === "string" && params.status.trim() ? params.status.trim() : "all"
      const creatives = readAdsCreatives(process.cwd(), status).slice(0, parseLimit(params.limit, 25))
      if (flags.has("json")) printJson(creatives)
      else console.log(formatAdsCreatives(creatives))
      return
    }

    if (subcommand === "metrics") {
      assertNoExtraPositionalArgs(positional, 2, "ads", "metrics")
      const view = readAdsMetrics(last)
      if (flags.has("json")) {
        printJson({
          ...view,
          campaigns: readAdsCampaignMetrics(last),
        })
      } else {
        console.log(formatAdsMetrics(view))
      }
      return
    }

    if (subcommand === "report") {
      assertNoExtraPositionalArgs(positional, 2, "ads", "report")
      const report = readLatestAdsReport(last)
      if (flags.has("json")) printJson(report)
      else console.log(formatAdsReport(report))
      return
    }

    console.error(`Unknown ads command: ${subcommand}`)
    console.error(renderAppApiHelp(ADS_CONTRACT))
    process.exit(1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("META_AD")) {
      console.error(adsConfigHelpText())
    } else {
      console.error(message)
    }
    process.exit(1)
  }
}
