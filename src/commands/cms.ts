import {
  assertNoExtraPositionalArgs,
  maybeHandleAppHelpOrSchema,
  parseLimit,
  parseParamsJson,
  printJson,
  readOptionalString,
  readStdinJson,
  readString,
  renderAppApiHelp,
  type AppApiContract,
} from "./app-api.js"

const CMS_CONTRACT: AppApiContract = {
  app: "cms",
  title: "CMS",
  summary: "File-based collections, entries, and scheduled publishing",
  actions: {
    collections: {
      summary: "List content collections",
    },
    "collection-create": {
      summary: "Create a content collection",
      stdinJson: {
        id: "resources",
        title: "Resources",
        description: "Guides and reference content",
      },
    },
    create: {
      summary: "Create a CMS entry draft",
      stdinJson: {
        collection: "blog",
        title: "Launch Week Recap",
        slug: "launch-week-recap",
        body: "# Launch Week Recap",
      },
    },
    list: {
      summary: "List CMS entries",
      params: {
        collection: "blog",
        status: "all",
        limit: 25,
      },
    },
    show: {
      summary: "Show one CMS entry",
      params: {
        id: "entry_abc123",
      },
    },
    body: {
      summary: "Replace the markdown body of a CMS entry",
      stdinJson: {
        id: "entry_abc123",
        body: "# Launch Week Recap",
      },
    },
    field: {
      summary: "Set a structured field on a CMS entry",
      stdinJson: {
        id: "entry_abc123",
        key: "seo_title",
        value: "Launch Week Recap | Termlings",
      },
    },
    schedule: {
      summary: "Schedule a CMS publish",
      stdinJson: {
        id: "entry_abc123",
        at: "2026-03-10T09:00:00+01:00",
      },
    },
    unschedule: {
      summary: "Clear a CMS publish schedule",
      params: {
        id: "entry_abc123",
      },
    },
    publish: {
      summary: "Publish a CMS entry immediately",
      params: {
        id: "entry_abc123",
      },
    },
    archive: {
      summary: "Archive a CMS entry",
      params: {
        id: "entry_abc123",
      },
    },
    history: {
      summary: "Read CMS publish history",
      params: {
        limit: 25,
      },
    },
    "run-due": {
      summary: "Execute due scheduled publishes now",
    },
  },
  notes: [
    "Use `schema` before unfamiliar actions to inspect the exact JSON contract.",
    "Published outputs are written under `.termlings/store/cms/publish/<collection>/`.",
    "Due CMS publishes are executed by `termlings scheduler`.",
  ],
}

export async function handleCms(flags: Set<string>, positional: string[], opts: Record<string, string>): Promise<void> {
  const {
    archiveCmsEntry,
    cmsCollectionsHelpText,
    cmsPublishedSnapshot,
    createCmsCollection,
    createCmsEntry,
    executeScheduledCmsPublishes,
    formatCmsCollections,
    formatCmsEntries,
    formatCmsEntry,
    formatCmsHistory,
    getCmsEntry,
    listCmsCollections,
    listCmsEntries,
    publishCmsEntry,
    readCmsHistory,
    scheduleCmsEntry,
    setCmsField,
    unscheduleCmsEntry,
    updateCmsBody,
  } = await import("../engine/cms.js")

  if (maybeHandleAppHelpOrSchema(CMS_CONTRACT, flags, positional)) return

  const subcommand = positional[1] || "list"
  const params = parseParamsJson(opts)

  try {
    if (subcommand === "collections") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "collections")
      const collections = listCmsCollections()
      if (flags.has("json")) printJson(collections)
      else console.log(formatCmsCollections(collections))
      return
    }

    if (subcommand === "collection-create") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "collection-create")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const collection = createCmsCollection({
        id: readString(body.id, "id"),
        title: readString(body.title, "title"),
        description: readOptionalString(body.description),
      })
      if (flags.has("json")) printJson(collection)
      else console.log(formatCmsCollections([collection]))
      return
    }

    if (subcommand === "create") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "create")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const entry = createCmsEntry({
        collection: readString(body.collection, "collection"),
        title: readString(body.title, "title"),
        slug: readOptionalString(body.slug),
        body: readOptionalString(body.body) || "",
      })
      if (flags.has("json")) printJson(entry)
      else console.log(formatCmsEntry(entry))
      return
    }

    if (subcommand === "list") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "list")
      const entries = listCmsEntries({
        collection: readOptionalString(params.collection),
        status: (readOptionalString(params.status)?.toLowerCase() || "all") as never,
        limit: parseLimit(params.limit, 25),
      })
      if (flags.has("json")) printJson(entries)
      else console.log(formatCmsEntries(entries))
      return
    }

    if (subcommand === "show") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "show")
      const id = readString(params.id, "id")
      const entry = getCmsEntry(id)
      if (!entry) throw new Error(`CMS entry not found: ${id}`)
      if (flags.has("json")) printJson(entry)
      else console.log(formatCmsEntry(entry))
      return
    }

    if (subcommand === "body") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "body")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const entry = updateCmsBody(readString(body.id, "id"), readString(body.body, "body"))
      if (flags.has("json")) printJson(entry)
      else console.log(formatCmsEntry(entry))
      return
    }

    if (subcommand === "field") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "field")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const entry = setCmsField(
        readString(body.id, "id"),
        readString(body.key, "key"),
        readString(body.value, "value"),
      )
      if (flags.has("json")) printJson(entry)
      else console.log(formatCmsEntry(entry))
      return
    }

    if (subcommand === "schedule") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "schedule")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const entry = scheduleCmsEntry(readString(body.id, "id"), readString(body.at, "at"))
      if (flags.has("json")) printJson(entry)
      else console.log(formatCmsEntry(entry))
      return
    }

    if (subcommand === "unschedule") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "unschedule")
      const id = readString(params.id, "id")
      const entry = unscheduleCmsEntry(id)
      if (flags.has("json")) printJson(entry)
      else console.log(formatCmsEntry(entry))
      return
    }

    if (subcommand === "publish") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "publish")
      const id = readString(params.id, "id")
      const entry = publishCmsEntry(id)
      if (flags.has("json")) printJson(cmsPublishedSnapshot(entry))
      else console.log(formatCmsEntry(entry))
      return
    }

    if (subcommand === "archive") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "archive")
      const id = readString(params.id, "id")
      const entry = archiveCmsEntry(id)
      if (flags.has("json")) printJson(entry)
      else console.log(formatCmsEntry(entry))
      return
    }

    if (subcommand === "history") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "history")
      const history = readCmsHistory(parseLimit(params.limit, 25))
      if (flags.has("json")) printJson(history)
      else console.log(formatCmsHistory(history))
      return
    }

    if (subcommand === "run-due") {
      assertNoExtraPositionalArgs(positional, 2, "cms", "run-due")
      const results = executeScheduledCmsPublishes()
      if (flags.has("json")) {
        printJson(results)
      } else if (results.length <= 0) {
        console.log("No scheduled CMS publishes to run")
      } else {
        console.log(results.map((entry) => `${entry.success ? "✓" : "✗"} ${entry.collection}/${entry.slug}${entry.error ? ` (${entry.error})` : ""}`).join("\n"))
      }
      return
    }

    console.error(`Unknown cms command: ${subcommand}`)
    console.error(renderAppApiHelp(CMS_CONTRACT))
    process.exit(1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("Unknown CMS collection")) {
      console.error(`${message}\n\n${cmsCollectionsHelpText()}`)
    } else {
      console.error(message)
    }
    process.exit(1)
  }
}
