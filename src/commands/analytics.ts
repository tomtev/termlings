import {
  assertNoExtraPositionalArgs,
  maybeHandleAppHelpOrSchema,
  parseLimit,
  parseParamsJson,
  printJson,
  renderAppApiHelp,
  type AppApiContract,
} from "./app-api.js"

const ANALYTICS_CONTRACT: AppApiContract = {
  app: "analytics",
  title: "Analytics",
  summary: "File-based website analytics sync",
  actions: {
    properties: {
      summary: "List configured analytics properties",
    },
    sync: {
      summary: "Pull fresh analytics snapshots",
      params: {
        provider: "google-analytics",
        last: "30d",
      },
    },
    traffic: {
      summary: "Read traffic metrics for a time window",
      params: {
        last: "30d",
      },
    },
    channels: {
      summary: "Read channel performance for a time window",
      params: {
        last: "30d",
        limit: 10,
      },
    },
    pages: {
      summary: "Read page performance for a time window",
      params: {
        last: "30d",
        limit: 10,
      },
    },
    conversions: {
      summary: "Read conversion metrics for a time window",
      params: {
        last: "30d",
      },
    },
    report: {
      summary: "Read the latest analytics report",
      params: {
        last: "30d",
      },
    },
    "schedule.list": {
      summary: "List recurring analytics sync schedules",
    },
    "schedule.create": {
      summary: "Create a recurring analytics sync schedule",
      stdinJson: {
        action: "sync",
        recurrence: "daily",
        time: "07:00",
        provider: "google-analytics",
        last: "30d",
        timezone: "Europe/Oslo",
      },
      notes: [
        "Use `weekday` only for weekly schedules.",
        "Use `date` only for one-time schedules with `recurrence: \"once\"`.",
        "The only supported scheduled action is `sync`.",
      ],
    },
    "schedule.remove": {
      summary: "Remove an analytics schedule",
      params: {
        id: "appsch_1773055000000_ab12cd",
      },
    },
  },
  env: [
    "GOOGLE_ANALYTICS_PROPERTY_ID",
    "GOOGLE_ANALYTICS_CLIENT_EMAIL",
    "GOOGLE_ANALYTICS_PRIVATE_KEY",
    "GOOGLE_ANALYTICS_PROPERTY_NAME",
    "GOOGLE_ANALYTICS_SITE",
  ],
  notes: [
    "Use `schema` before unfamiliar actions to inspect the exact JSON contract.",
    "Grant the service account viewer access to the GA4 property before syncing.",
    "Request secrets into `.termlings/.env` with `termlings request env ... --scope termlings`.",
  ],
}

function validateProvider(input: string | undefined): "google-analytics" {
  const provider = (input || "google-analytics").trim().toLowerCase()
  if (provider !== "google-analytics") {
    throw new Error(`Unsupported analytics provider: ${input}`)
  }
  return "google-analytics"
}

export async function handleAnalytics(flags: Set<string>, positional: string[], opts: Record<string, string>): Promise<void> {
  const { handleAppScheduleCommand } = await import("./app-schedule.js")
  const {
    analyticsConfigHelpText,
    formatAnalyticsConversions,
    formatAnalyticsEntries,
    formatAnalyticsProperties,
    formatAnalyticsReport,
    formatAnalyticsTraffic,
    listAnalyticsProperties,
    readAnalyticsChannels,
    readAnalyticsConversions,
    readAnalyticsPages,
    readAnalyticsTraffic,
    readLatestAnalyticsReport,
    syncAnalytics,
  } = await import("../engine/analytics.js")

  if (maybeHandleAppHelpOrSchema(ANALYTICS_CONTRACT, flags, positional)) return

  const subcommand = positional[1] || "report"

  if (subcommand === "schedule") {
    try {
      await handleAppScheduleCommand({
        app: "analytics",
        label: "Analytics",
        defaultProvider: "google-analytics",
        allowedProviders: ["google-analytics"],
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
    if (subcommand === "properties") {
      assertNoExtraPositionalArgs(positional, 2, "analytics", "properties")
      const properties = listAnalyticsProperties()
      if (flags.has("json")) printJson(properties)
      else console.log(formatAnalyticsProperties(properties))
      return
    }

    if (subcommand === "sync") {
      assertNoExtraPositionalArgs(positional, 2, "analytics", "sync")
      const result = await syncAnalytics({
        provider: validateProvider(typeof params.provider === "string" ? params.provider : undefined),
        last,
      })
      if (flags.has("json")) {
        printJson(result)
      } else {
        console.log(`✓ Synced analytics for ${result.property.name} (${result.property.propertyId})`)
        console.log(`Window: ${result.report.window} (${result.report.from} → ${result.report.to})`)
        console.log(`Traffic rows: ${result.state.counts.traffic}`)
        console.log(`Channel rows: ${result.state.counts.channels}`)
        console.log(`Page rows: ${result.state.counts.pages}`)
        console.log(`Conversion rows: ${result.state.counts.conversions}`)
      }
      return
    }

    if (subcommand === "traffic") {
      assertNoExtraPositionalArgs(positional, 2, "analytics", "traffic")
      const view = readAnalyticsTraffic(last)
      if (flags.has("json")) printJson(view)
      else console.log(formatAnalyticsTraffic(view))
      return
    }

    if (subcommand === "channels") {
      assertNoExtraPositionalArgs(positional, 2, "analytics", "channels")
      const view = readAnalyticsChannels(last, process.cwd(), parseLimit(params.limit, 10))
      if (flags.has("json")) printJson(view)
      else console.log(formatAnalyticsEntries("channels", view.property, view.window, view.items))
      return
    }

    if (subcommand === "pages") {
      assertNoExtraPositionalArgs(positional, 2, "analytics", "pages")
      const view = readAnalyticsPages(last, process.cwd(), parseLimit(params.limit, 10))
      if (flags.has("json")) printJson(view)
      else console.log(formatAnalyticsEntries("pages", view.property, view.window, view.items))
      return
    }

    if (subcommand === "conversions") {
      assertNoExtraPositionalArgs(positional, 2, "analytics", "conversions")
      const view = readAnalyticsConversions(last)
      if (flags.has("json")) printJson(view)
      else console.log(formatAnalyticsConversions(view))
      return
    }

    if (subcommand === "report") {
      assertNoExtraPositionalArgs(positional, 2, "analytics", "report")
      const report = readLatestAnalyticsReport(last)
      if (flags.has("json")) printJson(report)
      else console.log(formatAnalyticsReport(report))
      return
    }

    console.error(`Unknown analytics command: ${subcommand}`)
    console.error(renderAppApiHelp(ANALYTICS_CONTRACT))
    process.exit(1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("GOOGLE_ANALYTICS_")) {
      console.error(analyticsConfigHelpText())
    } else {
      console.error(message)
    }
    process.exit(1)
  }
}
