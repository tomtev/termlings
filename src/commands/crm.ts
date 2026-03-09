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

interface FollowupBody {
  ref: unknown
  at?: unknown
  text?: unknown
  owner?: unknown
}

const CRM_CONTRACT: AppApiContract = {
  app: "crm",
  title: "CRM",
  summary: "File-based customer relationship memory",
  actions: {
    create: {
      summary: "Create a CRM record",
      stdinJson: {
        type: "org",
        name: "Acme",
        slug: "acme",
        owner: "agent:growth",
        status: "active",
        stage: "lead",
        tags: ["warm", "b2b"],
        attrs: {
          domain: "acme.com",
        },
      },
    },
    list: {
      summary: "List CRM records",
      params: {
        type: "org",
        owner: "agent:growth",
        status: "active",
        stage: "lead",
        tags: ["warm", "b2b"],
        query: "acme",
        archived: "exclude",
        dueOnly: true,
        limit: 25,
      },
    },
    show: {
      summary: "Show one CRM record",
      params: {
        ref: "org/acme",
      },
    },
    set: {
      summary: "Set a mutable CRM field",
      stdinJson: {
        ref: "org/acme",
        path: "attrs.domain",
        value: "acme.com",
      },
    },
    unset: {
      summary: "Clear a mutable CRM field",
      stdinJson: {
        ref: "org/acme",
        path: "attrs.domain",
      },
    },
    note: {
      summary: "Append a CRM activity note",
      stdinJson: {
        ref: "org/acme",
        text: "Warm intro from Nora",
      },
    },
    link: {
      summary: "Add a directional CRM relationship",
      stdinJson: {
        fromRef: "person/jane-doe",
        rel: "works_at",
        toRef: "org/acme",
      },
    },
    followup: {
      summary: "Set or clear a CRM follow-up",
      stdinJson: {
        ref: "org/acme",
        at: "2026-03-10T09:00:00+01:00",
        text: "Send pricing",
        owner: "agent:growth",
      },
    },
    timeline: {
      summary: "Read CRM timeline entries",
      params: {
        ref: "org/acme",
        limit: 25,
      },
    },
    archive: {
      summary: "Archive a CRM record",
      params: {
        ref: "org/acme",
      },
    },
    restore: {
      summary: "Restore a CRM record",
      params: {
        ref: "org/acme",
      },
    },
  },
  notes: [
    "Use `schema` before unfamiliar actions to inspect the exact JSON contract.",
    "CRM is the system of record for prospects, customers, deals, and relationship notes.",
    "Use tasks for execution work and CRM for relationship state and follow-ups.",
  ],
}

function actorFromEnvironment(): { by: string; byName: string } {
  const slug = process.env.TERMLINGS_AGENT_SLUG?.trim()
  const name = process.env.TERMLINGS_AGENT_NAME?.trim()
  if (slug) {
    return {
      by: `agent:${slug}`,
      byName: name || slug,
    }
  }

  return {
    by: "human:default",
    byName: "Owner",
  }
}

function parseTimestampInput(raw: string | null | undefined): number | null {
  if (raw === null) return null
  const input = (raw || "").trim()
  const lower = input.toLowerCase()
  if (!input || lower === "clear" || lower === "none" || lower === "unset") {
    return null
  }

  if (/^\d+$/.test(input)) {
    const num = Number.parseInt(input, 10)
    if (!Number.isFinite(num)) {
      throw new Error(`Invalid timestamp: ${raw}`)
    }
    return input.length <= 10 ? num * 1000 : num
  }

  const parsed = Date.parse(input)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid follow-up time: ${raw}`)
  }
  return parsed
}

function readObject(value: unknown, label: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

function readOptionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined || value === null) return undefined
  return readStringArray(value, label)
}

export async function handleCrm(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  const {
    addCrmLink,
    addCrmNote,
    archiveCrmRecord,
    createCrmRecord,
    formatCrmRecord,
    formatCrmRecordList,
    formatCrmTimeline,
    getCrmRecord,
    getCrmTimeline,
    listCrmRecords,
    restoreCrmRecord,
    setCrmFollowup,
    setCrmRecordValue,
    unsetCrmRecordValue,
  } = await import("../engine/crm.js")

  if (maybeHandleAppHelpOrSchema(CRM_CONTRACT, flags, positional)) return

  const subcommand = positional[1] || "list"
  const actor = actorFromEnvironment()
  const params = parseParamsJson(opts)

  try {
    if (subcommand === "create") {
      assertNoExtraPositionalArgs(positional, 2, "crm", "create")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const record = createCrmRecord(
        readString(body.type, "type"),
        readString(body.name, "name"),
        {
          slug: readOptionalString(body.slug),
          owner: readOptionalString(body.owner),
          status: readOptionalString(body.status),
          stage: readOptionalString(body.stage),
          tags: readOptionalStringArray(body.tags, "tags"),
          attrs: readObject(body.attrs, "attrs"),
        },
        actor,
      )
      if (flags.has("json")) printJson(record)
      else console.log(`✓ CRM record created: ${record.ref}`)
      return
    }

    if (subcommand === "list") {
      assertNoExtraPositionalArgs(positional, 2, "crm", "list")
      const archivedInput = readOptionalString(params.archived)?.toLowerCase()
      const archived = archivedInput === "include" || archivedInput === "only" ? archivedInput : "exclude"
      const records = listCrmRecords({
        type: readOptionalString(params.type),
        owner: readOptionalString(params.owner),
        status: readOptionalString(params.status),
        stage: readOptionalString(params.stage),
        tags: readOptionalStringArray(params.tags, "tags"),
        query: readOptionalString(params.query),
        archived,
        dueOnly: Boolean(params.dueOnly),
        limit: parseLimit(params.limit, 25),
      })
      if (flags.has("json")) printJson(records)
      else console.log(formatCrmRecordList(records))
      return
    }

    if (subcommand === "show") {
      assertNoExtraPositionalArgs(positional, 2, "crm", "show")
      const ref = readString(params.ref, "ref")
      const record = getCrmRecord(ref)
      if (!record) throw new Error(`CRM record not found: ${ref}`)
      if (flags.has("json")) printJson(record)
      else console.log(formatCrmRecord(record))
      return
    }

    if (subcommand === "set") {
      assertNoExtraPositionalArgs(positional, 2, "crm", "set")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const ref = readString(body.ref, "ref")
      const path = readString(body.path, "path")
      const outcome = setCrmRecordValue(ref, path, body.value, actor)
      if (!outcome) throw new Error(`CRM record not found: ${ref}`)
      if (flags.has("json")) printJson(outcome)
      else console.log(outcome.changed ? `✓ CRM field updated: ${ref} ${path}` : `No change: ${ref} ${path}`)
      return
    }

    if (subcommand === "unset") {
      assertNoExtraPositionalArgs(positional, 2, "crm", "unset")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const ref = readString(body.ref, "ref")
      const path = readString(body.path, "path")
      const outcome = unsetCrmRecordValue(ref, path, actor)
      if (!outcome) throw new Error(`CRM record not found: ${ref}`)
      if (flags.has("json")) printJson(outcome)
      else console.log(outcome.changed ? `✓ CRM field cleared: ${ref} ${path}` : `No change: ${ref} ${path}`)
      return
    }

    if (subcommand === "note") {
      assertNoExtraPositionalArgs(positional, 2, "crm", "note")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const ref = readString(body.ref, "ref")
      const outcome = addCrmNote(ref, readString(body.text, "text"), actor)
      if (!outcome) throw new Error(`CRM record not found: ${ref}`)
      if (flags.has("json")) printJson(outcome)
      else console.log(`✓ CRM note added: ${ref}`)
      return
    }

    if (subcommand === "link") {
      assertNoExtraPositionalArgs(positional, 2, "crm", "link")
      const body = await readStdinJson<Record<string, unknown>>(flags)
      const fromRef = readString(body.fromRef, "fromRef")
      const rel = readString(body.rel, "rel")
      const toRef = readString(body.toRef, "toRef")
      const outcome = addCrmLink(fromRef, rel, toRef, actor)
      if (!outcome) throw new Error(`CRM record not found: ${fromRef}`)
      if (flags.has("json")) printJson(outcome)
      else console.log(outcome.changed ? `✓ CRM link added: ${fromRef} ${rel} ${toRef}` : `No change: ${fromRef} ${rel} ${toRef}`)
      return
    }

    if (subcommand === "followup") {
      assertNoExtraPositionalArgs(positional, 2, "crm", "followup")
      const body = await readStdinJson<FollowupBody>(flags)
      const ref = readString(body.ref, "ref")
      const record = getCrmRecord(ref)
      if (!record) throw new Error(`CRM record not found: ${ref}`)
      const timestamp = parseTimestampInput(typeof body.at === "string" ? body.at : body.at === null ? null : undefined)
      const next = timestamp === null
        ? undefined
        : {
            at: timestamp,
            text: readOptionalString(body.text) || record.next?.text,
            owner: readOptionalString(body.owner) || record.next?.owner || record.owner,
          }
      const outcome = setCrmFollowup(ref, next, actor)
      if (!outcome) throw new Error(`CRM record not found: ${ref}`)
      if (flags.has("json")) printJson(outcome)
      else console.log(outcome.changed ? `✓ CRM follow-up updated: ${ref}` : `No change: ${ref}`)
      return
    }

    if (subcommand === "timeline") {
      assertNoExtraPositionalArgs(positional, 2, "crm", "timeline")
      const ref = readString(params.ref, "ref")
      const record = getCrmRecord(ref)
      if (!record) throw new Error(`CRM record not found: ${ref}`)
      const timeline = getCrmTimeline(record.ref).slice(0, parseLimit(params.limit, 25) || undefined)
      if (flags.has("json")) printJson(timeline)
      else console.log(formatCrmTimeline(timeline))
      return
    }

    if (subcommand === "archive") {
      assertNoExtraPositionalArgs(positional, 2, "crm", "archive")
      const ref = readString(params.ref, "ref")
      const outcome = archiveCrmRecord(ref, actor)
      if (!outcome) throw new Error(`CRM record not found: ${ref}`)
      if (flags.has("json")) printJson(outcome)
      else console.log(outcome.changed ? `✓ CRM record archived: ${ref}` : `No change: ${ref}`)
      return
    }

    if (subcommand === "restore") {
      assertNoExtraPositionalArgs(positional, 2, "crm", "restore")
      const ref = readString(params.ref, "ref")
      const outcome = restoreCrmRecord(ref, actor)
      if (!outcome) throw new Error(`CRM record not found: ${ref}`)
      if (flags.has("json")) printJson(outcome)
      else console.log(outcome.changed ? `✓ CRM record restored: ${ref}` : `No change: ${ref}`)
      return
    }

    console.error(renderAppApiHelp(CRM_CONTRACT))
    process.exit(1)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
