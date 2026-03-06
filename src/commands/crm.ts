/**
 * CRM commands
 */

interface ParsedScalar {
  value: unknown
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

function parseLimit(input: string | undefined): number | undefined {
  if (!input) return undefined
  const value = Number.parseInt(input, 10)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid limit: ${input}`)
  }
  return value
}

function parseTags(input: string | undefined): string[] | undefined {
  if (!input) return undefined
  const values = input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  return values.length > 0 ? values : undefined
}

function parseJsonObject(input: string | undefined, label: string): Record<string, unknown> | undefined {
  if (!input) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch (error) {
    throw new Error(`Invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`)
  }

  return parsed as Record<string, unknown>
}

function parseScalarValue(raw: string): ParsedScalar {
  const input = raw.trim()
  if (input.length === 0) {
    return { value: "" }
  }

  if (
    input === "true" ||
    input === "false" ||
    input === "null" ||
    input.startsWith("{") ||
    input.startsWith("[") ||
    input.startsWith("\"")
  ) {
    return { value: JSON.parse(input) }
  }

  if (/^-?\d+(\.\d+)?$/.test(input)) {
    return { value: Number(input) }
  }

  return { value: raw }
}

function parseTimestampInput(raw: string): number | null {
  const input = raw.trim()
  const lower = input.toLowerCase()
  if (lower === "clear" || lower === "none" || lower === "unset") {
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

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

export async function handleCrm(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  const { workspaceFeatureEnabled } = await import("../engine/features.js")
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

  const subcommand = positional[1]
  const actor = actorFromEnvironment()
  const agentSlug = process.env.TERMLINGS_AGENT_SLUG || undefined
  const crmEnabled = workspaceFeatureEnabled("crm", agentSlug)

  if (!crmEnabled) {
    console.error("CRM is disabled by workspace feature flags for this agent.")
    process.exit(1)
  }

  if (!subcommand || subcommand === "--help" || subcommand === "help") {
    console.log(`
CRM - File-based customer relationship memory

Store external records, relationship links, activity history, and next actions.
Records live under .termlings/store/crm/records/<type>/<slug>.json
Activity lives under .termlings/store/crm/activity/<type>/<slug>.jsonl

COMMANDS:
  termlings crm create <type> <name>          Create a record
  termlings crm list                          List records
  termlings crm show <ref>                    Show one record
  termlings crm set <ref> <path> <value>      Set a mutable field
  termlings crm unset <ref> <path>            Clear a mutable field
  termlings crm note <ref> <text...>          Append activity note
  termlings crm link <from> <rel> <to>        Add a directional relationship
  termlings crm followup <ref> <when|clear> [text...]
  termlings crm timeline <ref>                Show record activity
  termlings crm archive <ref>                 Archive a record
  termlings crm restore <ref>                 Restore a record

CREATE OPTIONS:
  --slug <slug>         Override generated slug
  --owner <target>      Owner (example: agent:growth)
  --status <status>     Free-form status
  --stage <stage>       Free-form stage
  --tags a,b,c          Comma-separated tags
  --attrs <json>        Initial attrs object
  --json                Print JSON instead of text

LIST OPTIONS:
  --type <type>         Filter by type
  --owner <target>      Filter by owner
  --status <status>     Filter by status
  --stage <stage>       Filter by stage
  --tags a,b,c          Filter by tags
  --query <text>        Full-text match across name/ref/attrs
  --due                 Only records with due follow-ups
  --archived            Only archived records
  --all                 Include archived + active
  --limit <n>           Limit result count
  --json                Print JSON instead of text

SET PATHS:
  name
  owner
  status
  stage
  tags
  attrs
  attrs.domain
  attrs.company.size
  next
  next.at
  next.text
  next.owner

EXAMPLES:
  termlings crm create org "Acme" --owner agent:growth --stage lead --tags warm,b2b
  termlings crm set org/acme attrs.domain acme.com
  termlings crm note org/acme "Warm intro from Nora"
  termlings crm link person/jane-doe works_at org/acme
  termlings crm followup org/acme 2026-03-10 "Send pricing"
  termlings crm list --type org --stage lead --due
`)
    return
  }

  if (subcommand === "create") {
    const type = positional[2]
    const name = positional[3]
    if (!type || !name) {
      console.error("Usage: termlings crm create <type> <name>")
      process.exit(1)
    }

    try {
      const record = createCrmRecord(type, name, {
        slug: opts.slug,
        owner: opts.owner,
        status: opts.status,
        stage: opts.stage,
        tags: parseTags(opts.tags),
        attrs: parseJsonObject(opts.attrs, "attrs"),
      }, actor)

      if (flags.has("json")) {
        printJson(record)
      } else {
        console.log(`✓ CRM record created: ${record.ref}`)
      }
      return
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }

  if (subcommand === "list") {
    try {
      const records = listCrmRecords({
        type: opts.type,
        owner: opts.owner,
        status: opts.status,
        stage: opts.stage,
        tags: parseTags(opts.tags),
        query: opts.query,
        archived: flags.has("all") ? "include" : flags.has("archived") ? "only" : "exclude",
        dueOnly: flags.has("due"),
        limit: parseLimit(opts.limit),
      })

      if (flags.has("json")) {
        printJson(records)
      } else {
        console.log(formatCrmRecordList(records))
      }
      return
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }

  if (subcommand === "show") {
    const ref = positional[2]
    if (!ref) {
      console.error("Usage: termlings crm show <ref>")
      process.exit(1)
    }

    const record = getCrmRecord(ref)
    if (!record) {
      console.error(`CRM record not found: ${ref}`)
      process.exit(1)
    }

    if (flags.has("json")) {
      printJson(record)
    } else {
      console.log(formatCrmRecord(record))
    }
    return
  }

  if (subcommand === "set") {
    const ref = positional[2]
    const path = positional[3]
    const rawValue = positional.slice(4).join(" ")
    if (!ref || !path || rawValue.length === 0) {
      console.error("Usage: termlings crm set <ref> <path> <value>")
      process.exit(1)
    }

    try {
      const { value } = parseScalarValue(rawValue)
      const outcome = setCrmRecordValue(ref, path, value, actor)
      if (!outcome) {
        console.error(`CRM record not found: ${ref}`)
        process.exit(1)
      }
      console.log(outcome.changed ? `✓ CRM field updated: ${ref} ${path}` : `No change: ${ref} ${path}`)
      return
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }

  if (subcommand === "unset") {
    const ref = positional[2]
    const path = positional[3]
    if (!ref || !path) {
      console.error("Usage: termlings crm unset <ref> <path>")
      process.exit(1)
    }

    try {
      const outcome = unsetCrmRecordValue(ref, path, actor)
      if (!outcome) {
        console.error(`CRM record not found: ${ref}`)
        process.exit(1)
      }
      console.log(outcome.changed ? `✓ CRM field cleared: ${ref} ${path}` : `No change: ${ref} ${path}`)
      return
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }

  if (subcommand === "note") {
    const ref = positional[2]
    const text = positional.slice(3).join(" ")
    if (!ref || !text) {
      console.error("Usage: termlings crm note <ref> <text...>")
      process.exit(1)
    }

    try {
      const outcome = addCrmNote(ref, text, actor)
      if (!outcome) {
        console.error(`CRM record not found: ${ref}`)
        process.exit(1)
      }
      console.log(`✓ CRM note added: ${ref}`)
      return
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }

  if (subcommand === "link") {
    const fromRef = positional[2]
    const rel = positional[3]
    const toRef = positional[4]
    if (!fromRef || !rel || !toRef) {
      console.error("Usage: termlings crm link <from-ref> <rel> <to-ref>")
      process.exit(1)
    }

    try {
      const outcome = addCrmLink(fromRef, rel, toRef, actor)
      if (!outcome) {
        console.error(`CRM record not found: ${fromRef}`)
        process.exit(1)
      }
      console.log(outcome.changed ? `✓ CRM link added: ${fromRef} ${rel} ${toRef}` : `No change: ${fromRef} ${rel} ${toRef}`)
      return
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }

  if (subcommand === "followup") {
    const ref = positional[2]
    const when = positional[3]
    const text = positional.slice(4).join(" ")
    if (!ref || !when) {
      console.error("Usage: termlings crm followup <ref> <when|clear> [text...]")
      process.exit(1)
    }

    const record = getCrmRecord(ref)
    if (!record) {
      console.error(`CRM record not found: ${ref}`)
      process.exit(1)
    }

    try {
      const timestamp = parseTimestampInput(when)
      const outcome = setCrmFollowup(
        ref,
        timestamp === null
          ? undefined
          : {
              at: timestamp,
              text: text || record.next?.text,
              owner: opts.owner || record.next?.owner || record.owner,
            },
        actor,
      )
      if (!outcome) {
        console.error(`CRM record not found: ${ref}`)
        process.exit(1)
      }
      console.log(outcome.changed ? `✓ CRM follow-up updated: ${ref}` : `No change: ${ref}`)
      return
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }

  if (subcommand === "timeline") {
    const ref = positional[2]
    if (!ref) {
      console.error("Usage: termlings crm timeline <ref>")
      process.exit(1)
    }

    const record = getCrmRecord(ref)
    if (!record) {
      console.error(`CRM record not found: ${ref}`)
      process.exit(1)
    }

    try {
      const limit = parseLimit(opts.limit)
      const timeline = getCrmTimeline(record.ref).slice(0, limit || undefined)
      if (flags.has("json")) {
        printJson(timeline)
      } else {
        console.log(formatCrmTimeline(timeline))
      }
      return
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }

  if (subcommand === "archive") {
    const ref = positional[2]
    if (!ref) {
      console.error("Usage: termlings crm archive <ref>")
      process.exit(1)
    }

    const outcome = archiveCrmRecord(ref, actor)
    if (!outcome) {
      console.error(`CRM record not found: ${ref}`)
      process.exit(1)
    }
    console.log(outcome.changed ? `✓ CRM record archived: ${ref}` : `No change: ${ref}`)
    return
  }

  if (subcommand === "restore") {
    const ref = positional[2]
    if (!ref) {
      console.error("Usage: termlings crm restore <ref>")
      process.exit(1)
    }

    const outcome = restoreCrmRecord(ref, actor)
    if (!outcome) {
      console.error(`CRM record not found: ${ref}`)
      process.exit(1)
    }
    console.log(outcome.changed ? `✓ CRM record restored: ${ref}` : `No change: ${ref}`)
    return
  }

  console.error("Usage: termlings crm <create|list|show|set|unset|note|link|followup|timeline|archive|restore>")
  process.exit(1)
}
