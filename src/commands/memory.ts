import {
  assertNoExtraPositionalArgs,
  maybeHandleAppHelpOrSchema,
  parseLimit,
  parseParamsJson,
  printJson,
  readOptionalString,
  readStdinJson,
  readString,
  readStringArray,
  renderAppApiHelp,
  type AppApiContract,
} from "./app-api.js"

const MEMORY_CONTRACT: AppApiContract = {
  app: "memory",
  title: "Memory",
  summary: "File-based project and agent memory, with optional qmd support",
  actions: {
    collections: {
      summary: "List memory collections",
    },
    "collection-create": {
      summary: "Create a memory collection",
      stdinJson: {
        id: "research-notes",
        title: "Research Notes",
      },
    },
    add: {
      summary: "Create a memory record",
      stdinJson: {
        collection: "project",
        title: "CAC spike",
        text: "Meta ads CAC spiked this week",
        tags: ["ads", "cac"],
      },
    },
    list: {
      summary: "List memory records",
      params: {
        collection: "project",
        limit: 25,
      },
    },
    show: {
      summary: "Show one memory record",
      params: {
        id: "mem_abc123",
      },
    },
    search: {
      summary: "Search local memory records",
      params: {
        query: "csv export",
        collection: "project",
        limit: 10,
      },
    },
    history: {
      summary: "Read memory history",
      params: {
        limit: 25,
      },
    },
    "qmd.status": {
      summary: "Read qmd integration status",
    },
    "qmd.sync": {
      summary: "Export current memory into qmd",
      params: {
        embed: true,
      },
    },
    "qmd.query": {
      summary: "Run a qmd query against exported memory",
      params: {
        query: "csv export",
        collection: "project",
        limit: 10,
      },
    },
  },
  notes: [
    "Use `schema` before unfamiliar actions to inspect the exact JSON contract.",
    "Built-in collections include `project`, `shared`, and `agent-<slug>`.",
    "qmd is optional. Local memory search still works without it.",
  ],
}

export async function handleMemory(flags: Set<string>, positional: string[], opts: Record<string, string>): Promise<void> {
  const {
    createMemoryCollection,
    createMemoryRecord,
    formatMemoryCollections,
    formatMemoryHistory,
    formatMemoryRecord,
    formatMemoryRecords,
    formatMemorySearchResults,
    getMemoryRecord,
    getQmdStatus,
    listMemoryCollections,
    listMemoryRecords,
    readMemoryHistory,
    runQmdQuery,
    searchMemoryRecords,
    syncMemoryQmd,
  } = await import("../engine/memory.js")

  if (maybeHandleAppHelpOrSchema(MEMORY_CONTRACT, flags, positional)) return

  const subcommand = positional[1] || "list"
  const params = parseParamsJson(opts)

  try {
    if (subcommand === "collections") {
      assertNoExtraPositionalArgs(positional, 2, "memory", "collections")
      const collections = listMemoryCollections()
      if (flags.has("json")) printJson(collections)
      else console.log(formatMemoryCollections(collections))
      return
    }

    if (subcommand === "collection-create") {
      assertNoExtraPositionalArgs(positional, 2, "memory", "collection-create")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const collection = createMemoryCollection(readString(body.id, "id"), readString(body.title, "title"))
      if (flags.has("json")) printJson(collection)
      else console.log(formatMemoryCollections([collection]))
      return
    }

    if (subcommand === "add") {
      assertNoExtraPositionalArgs(positional, 2, "memory", "add")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const record = createMemoryRecord({
        collection: readString(body.collection, "collection"),
        text: readString(body.text, "text"),
        title: readOptionalString(body.title),
        tags: Array.isArray(body.tags) ? readStringArray(body.tags, "tags") : [],
      })
      if (flags.has("json")) printJson(record)
      else console.log(formatMemoryRecord(record))
      return
    }

    if (subcommand === "list") {
      assertNoExtraPositionalArgs(positional, 2, "memory", "list")
      const records = listMemoryRecords({
        collection: readOptionalString(params.collection),
        limit: parseLimit(params.limit, 25),
      })
      if (flags.has("json")) printJson(records)
      else console.log(formatMemoryRecords(records))
      return
    }

    if (subcommand === "show") {
      assertNoExtraPositionalArgs(positional, 2, "memory", "show")
      const id = readString(params.id, "id")
      const record = getMemoryRecord(id)
      if (!record) throw new Error(`Memory not found: ${id}`)
      if (flags.has("json")) printJson(record)
      else console.log(formatMemoryRecord(record))
      return
    }

    if (subcommand === "search") {
      assertNoExtraPositionalArgs(positional, 2, "memory", "search")
      const query = readString(params.query, "query")
      const results = searchMemoryRecords(query, {
        collection: readOptionalString(params.collection),
        limit: parseLimit(params.limit, 10),
      })
      if (flags.has("json")) printJson(results)
      else console.log(formatMemorySearchResults(results))
      return
    }

    if (subcommand === "history") {
      assertNoExtraPositionalArgs(positional, 2, "memory", "history")
      const history = readMemoryHistory(parseLimit(params.limit, 25))
      if (flags.has("json")) printJson(history)
      else console.log(formatMemoryHistory(history))
      return
    }

    if (subcommand === "qmd") {
      const qmdSubcommand = positional[2] || "status"
      if (qmdSubcommand === "status") {
        assertNoExtraPositionalArgs(positional, 3, "memory", "qmd status")
        const status = getQmdStatus()
        if (flags.has("json")) printJson(status)
        else console.log(JSON.stringify(status, null, 2))
        return
      }
      if (qmdSubcommand === "sync") {
        assertNoExtraPositionalArgs(positional, 3, "memory", "qmd sync")
        const result = syncMemoryQmd({ embed: Boolean(params.embed) })
        if (flags.has("json")) printJson(result)
        else console.log(JSON.stringify(result, null, 2))
        return
      }
      if (qmdSubcommand === "query") {
        assertNoExtraPositionalArgs(positional, 3, "memory", "qmd query")
        const result = runQmdQuery(readString(params.query, "query"), {
          collection: readOptionalString(params.collection),
          limit: parseLimit(params.limit, 10),
        })
        if (flags.has("json")) printJson(result)
        else console.log(result.stdout || result.stderr || "No qmd output")
        return
      }
      throw new Error(`Unknown memory qmd command: ${qmdSubcommand}`)
    }

    console.error(`Unknown memory command: ${subcommand}`)
    console.error(renderAppApiHelp(MEMORY_CONTRACT))
    process.exit(1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  }
}
