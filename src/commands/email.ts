import {
  emailsConfigPath,
  initEmailsConfig,
  listConfiguredAccounts,
  missingRequiredEnvVars,
  readEmailsConfig,
  resolveEmailContext,
  runAccountConfigureInteractive,
  runAccountDoctor,
  runAccountList,
  runInboxList,
  runMessageRead,
  runMessageSend,
} from "../engine/email.js"
import {
  createDraft,
  createTemplate,
  draftTemplatePaths,
  type EmailDraftData,
  type EmailTemplateData,
  getDraft,
  getTemplate,
  listDrafts,
  listTemplates,
  markDraftSent,
} from "../engine/email-drafts.js"

function parsePositiveInt(value: string | undefined, label: string): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
  return parsed
}

function parseEmailListOption(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function parseScheduledAt(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid --send-at value: ${value} (use ISO8601, e.g. 2026-03-05T18:30:00Z)`)
  }
  return new Date(parsed).toISOString()
}

function readDraftPretty(draft: EmailDraftData): string {
  const lines: string[] = []
  lines.push(`ID: ${draft.id}`)
  lines.push(`Title: ${draft.title}`)
  lines.push(`Status: ${draft.status}`)
  lines.push(`To: ${draft.to.join(", ") || "-"}`)
  lines.push(`Cc: ${draft.cc.join(", ") || "-"}`)
  lines.push(`Bcc: ${draft.bcc.join(", ") || "-"}`)
  lines.push(`Subject: ${draft.subject || "-"}`)
  lines.push(`Account: ${draft.account || "-"}`)
  lines.push(`From: ${draft.from || "-"}`)
  lines.push(`Template: ${draft.template || "-"}`)
  lines.push(`Send At: ${draft.sendAt || "-"}`)
  lines.push(`Sent At: ${draft.sentAt || "-"}`)
  lines.push(`Created: ${draft.createdAt}`)
  lines.push(`Updated: ${draft.updatedAt}`)
  lines.push(`Path: ${draft.path}`)
  lines.push("")
  lines.push(draft.body)
  return lines.join("\n")
}

function readTemplatePretty(template: EmailTemplateData): string {
  const lines: string[] = []
  lines.push(`Name: ${template.name}`)
  lines.push(`To: ${template.to.join(", ") || "-"}`)
  lines.push(`Cc: ${template.cc.join(", ") || "-"}`)
  lines.push(`Bcc: ${template.bcc.join(", ") || "-"}`)
  lines.push(`Subject: ${template.subject || "-"}`)
  lines.push(`Account: ${template.account || "-"}`)
  lines.push(`From: ${template.from || "-"}`)
  lines.push(`Path: ${template.path}`)
  lines.push("")
  lines.push(template.body)
  return lines.join("\n")
}

function activeAgentSlug(): string | undefined {
  const slug = process.env.TERMLINGS_AGENT_SLUG?.trim()
  return slug && slug.length > 0 ? slug : undefined
}

function requireEmailsConfig() {
  const config = readEmailsConfig()
  if (!config) {
    throw new Error(
      `Missing ${emailsConfigPath()}. Run: termlings email config init`,
    )
  }
  return config
}

function printMissingEnvAdvice(vars: string[]): void {
  if (vars.length === 0) return
  console.error(`Missing required env vars: ${vars.join(", ")}`)
  for (const envVar of vars) {
    console.error(`  termlings request env ${envVar} "Needed for termlings email wrapper" --scope termlings`)
  }
}

function printHelp(): void {
  console.log(`
✉️ Email - Simplified Himalaya wrapper for agents

USAGE:
  termlings email accounts
  termlings email inbox [query...] [--limit <n>] [--folder <name>] [--account <name>]
  termlings email read <id> [--folder <name>] [--account <name>]
  termlings email send <to> <subject> <body...> [--from <address>] [--account <name>]
  termlings email setup <account>
  termlings email doctor [--account <name>]
  termlings email draft <new|list|show|send> ...
  termlings email template <new|list|show> ...
  termlings email config init [--force]
  termlings email config show

ACCOUNT RESOLUTION:
  1) --account override (if provided)
  2) agents.<TERMLINGS_AGENT_SLUG> from .termlings/emails.json
  3) project mapping from .termlings/emails.json

CONFIG:
  .termlings/emails.json maps project and agent slugs to Himalaya account names.
  Env vars used by email config should usually be requested with:
    termlings request env VAR_NAME "reason" --scope termlings
`);
}

function printDraftHelp(): void {
  console.log(`
Draft commands:
  termlings email draft new <title> [body...] [--to <a,b>] [--cc <a,b>] [--bcc <a,b>] [--subject <s>] [--account <name>] [--from <addr>] [--template <name>] [--send-at <iso>]
  termlings email draft list
  termlings email draft show <id>
  termlings email draft send <id> [--account <name>]
`)
}

function printTemplateHelp(): void {
  console.log(`
Template commands:
  termlings email template new <name> [body...] [--to <a,b>] [--cc <a,b>] [--bcc <a,b>] [--subject <s>] [--account <name>] [--from <addr>] [--force]
  termlings email template list
  termlings email template show <name>
`)
}

export async function handleEmail(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  const subcommand = positional[1]

  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    printHelp()
    return
  }

  if (flags.has("help")) {
    if (subcommand === "draft") {
      printDraftHelp()
      return
    }
    if (subcommand === "template") {
      printTemplateHelp()
      return
    }
    if (subcommand === "config") {
      console.log(`
Email config commands:
  termlings email config init [--force]
  termlings email config show
`)
      return
    }
    printHelp()
    return
  }

  try {
    if (subcommand === "draft") {
      const action = positional[2]
      if (!action || action === "help" || action === "--help") {
        printDraftHelp()
        return
      }

      if (action === "new") {
        const title = positional[3]
        if (!title) {
          console.error("Usage: termlings email draft new <title> [body...] [--to <a,b>] [--cc <a,b>] [--bcc <a,b>] [--subject <s>] [--template <name>] [--send-at <iso>]")
          process.exit(1)
        }

        const templateName = opts.template?.trim()
        const template = templateName ? getTemplate(templateName) : null
        if (templateName && !template) {
          console.error(`Template not found: ${templateName}`)
          process.exit(1)
        }

        const explicitBody = positional.slice(4).join(" ").trim()
        const templateBody = template?.body || ""
        const body = explicitBody || templateBody || "Write your email body here."

        const draft = createDraft({
          title,
          to: parseEmailListOption(opts.to).length > 0 ? parseEmailListOption(opts.to) : (template?.to || []),
          cc: parseEmailListOption(opts.cc).length > 0 ? parseEmailListOption(opts.cc) : (template?.cc || []),
          bcc: parseEmailListOption(opts.bcc).length > 0 ? parseEmailListOption(opts.bcc) : (template?.bcc || []),
          subject: opts.subject?.trim() || template?.subject || title,
          account: opts.account?.trim() || template?.account,
          from: opts.from?.trim() || template?.from,
          template: template?.name,
          body,
          sendAt: parseScheduledAt(opts["send-at"] || opts.send_at),
        })
        console.log(`✓ Draft created: ${draft.id}`)
        console.log(draft.path)
        return
      }

      if (action === "list") {
        const drafts = listDrafts()
        if (drafts.length === 0) {
          console.log("No drafts")
          return
        }

        for (const draft of drafts) {
          const sendAt = draft.sendAt ? ` · send_at ${draft.sendAt}` : ""
          console.log(`[${draft.id}] ${draft.status.toUpperCase()} · ${draft.subject || draft.title}${sendAt}`)
        }
        return
      }

      if (action === "show") {
        const id = positional[3]
        if (!id) {
          console.error("Usage: termlings email draft show <id>")
          process.exit(1)
        }
        const draft = getDraft(id)
        if (!draft) {
          console.error(`Draft not found: ${id}`)
          process.exit(1)
        }
        console.log(readDraftPretty(draft))
        return
      }

      if (action === "send") {
        const id = positional[3]
        if (!id) {
          console.error("Usage: termlings email draft send <id> [--account <name>]")
          process.exit(1)
        }
        const draft = getDraft(id)
        if (!draft) {
          console.error(`Draft not found: ${id}`)
          process.exit(1)
        }
        if (draft.status === "sent") {
          console.log(`Draft already sent: ${draft.id}`)
          return
        }
        if (draft.to.length === 0) {
          console.error("Draft missing recipients in `to`")
          process.exit(1)
        }
        if (!draft.subject || draft.subject.trim().length === 0) {
          console.error("Draft missing subject")
          process.exit(1)
        }

        const config = requireEmailsConfig()
        const ctx = resolveEmailContext(config, activeAgentSlug(), opts.account?.trim() || draft.account)
        const missing = missingRequiredEnvVars(ctx)
        if (missing.length > 0) {
          printMissingEnvAdvice(missing)
          process.exit(1)
        }

        const output = runMessageSend(ctx, {
          to: draft.to.join(", "),
          cc: draft.cc.length > 0 ? draft.cc.join(", ") : undefined,
          bcc: draft.bcc.length > 0 ? draft.bcc.join(", ") : undefined,
          subject: draft.subject,
          body: draft.body,
          from: draft.from?.trim() || ctx.from,
        })
        markDraftSent(draft.id)
        if (output.length > 0) {
          console.log(output)
        }
        console.log(`✓ Draft sent: ${draft.id}`)
        return
      }

      console.error(`Unknown draft command: ${action}`)
      printDraftHelp()
      process.exit(1)
    }

    if (subcommand === "template") {
      const action = positional[2]
      if (!action || action === "help" || action === "--help") {
        printTemplateHelp()
        return
      }

      if (action === "new") {
        const name = positional[3]
        if (!name) {
          console.error("Usage: termlings email template new <name> [body...] [--to <a,b>] [--cc <a,b>] [--bcc <a,b>] [--subject <s>] [--account <name>] [--from <addr>] [--force]")
          process.exit(1)
        }

        const body = positional.slice(4).join(" ").trim() || "Write your template body here."
        const template = createTemplate({
          name,
          to: parseEmailListOption(opts.to),
          cc: parseEmailListOption(opts.cc),
          bcc: parseEmailListOption(opts.bcc),
          subject: opts.subject?.trim(),
          account: opts.account?.trim(),
          from: opts.from?.trim(),
          body,
        }, flags.has("force"))
        console.log(`✓ Template created: ${template.name}`)
        console.log(template.path)
        return
      }

      if (action === "list") {
        const templates = listTemplates()
        if (templates.length === 0) {
          console.log("No templates")
          return
        }
        for (const template of templates) {
          console.log(`[${template.name}] subject="${template.subject || ""}" to=${template.to.join(", ") || "-"}`)
        }
        return
      }

      if (action === "show") {
        const name = positional[3]
        if (!name) {
          console.error("Usage: termlings email template show <name>")
          process.exit(1)
        }
        const template = getTemplate(name)
        if (!template) {
          console.error(`Template not found: ${name}`)
          process.exit(1)
        }
        console.log(readTemplatePretty(template))
        return
      }

      console.error(`Unknown template command: ${action}`)
      printTemplateHelp()
      process.exit(1)
    }

    if (subcommand === "config") {
      const action = positional[2]

      if (!action || action === "help" || action === "--help") {
        console.log(`
Email config commands:
  termlings email config init [--force]
  termlings email config show
`)
        return
      }

      if (action === "init") {
        const result = initEmailsConfig(flags.has("force"))
        if (result.created) {
          console.log(`✓ Created ${result.path}`)
        } else {
          console.log(`Config already exists: ${result.path}`)
          console.log("Use --force to overwrite")
        }
        return
      }

      if (action === "show") {
        const config = requireEmailsConfig()
        console.log(JSON.stringify(config, null, 2))
        const paths = draftTemplatePaths()
        console.log("")
        console.log(`Drafts dir: ${paths.drafts}`)
        console.log(`Templates dir: ${paths.templates}`)
        return
      }

      console.error(`Unknown email config command: ${action}`)
      console.error("Use: termlings email config <init|show>")
      process.exit(1)
    }

    if (subcommand === "setup") {
      const account = positional[2]?.trim() || opts.account?.trim()
      if (!account) {
        console.error("Usage: termlings email setup <account>")
        process.exit(1)
      }

      const config = readEmailsConfig()
      const agentSlug = activeAgentSlug()
      const ctx = config
        ? resolveEmailContext(config, agentSlug, account)
        : {
          scope: "override" as const,
          account,
          folder: "INBOX",
          requiredEnv: [],
          binary: "himalaya",
        }

      const status = runAccountConfigureInteractive(ctx, account)
      if (status !== 0) {
        process.exit(status)
      }
      console.log(`✓ Himalaya account configured: ${account}`)
      if (!config) {
        console.log(`Next: termlings email config init`)
      }
      return
    }

    const config = requireEmailsConfig()
    const accountOverride = opts.account?.trim()
    const agentSlug = activeAgentSlug()
    const ctx = resolveEmailContext(config, agentSlug, accountOverride)
    const missing = missingRequiredEnvVars(ctx)

    if (missing.length > 0) {
      printMissingEnvAdvice(missing)
      process.exit(1)
    }

    if (subcommand === "accounts") {
      console.log(`Active mapping -> account: ${ctx.account} (${ctx.scope})`)
      if (agentSlug) {
        console.log(`Active agent slug: ${agentSlug}`)
      }

      const configured = listConfiguredAccounts(config)
      if (configured.length > 0) {
        console.log(`Configured accounts: ${configured.join(", ")}`)
      }
      console.log("")
      console.log(runAccountList(ctx))
      return
    }

    if (subcommand === "doctor") {
      const account = accountOverride || ctx.account
      console.log(runAccountDoctor(ctx, account))
      return
    }

    if (subcommand === "inbox") {
      const limit = parsePositiveInt(opts.limit, "limit")
      const query = positional.slice(2)
      const output = runInboxList(ctx, {
        folder: opts.folder,
        limit,
        query: query.length > 0 ? query : undefined,
      })
      console.log(output)
      return
    }

    if (subcommand === "read") {
      const id = positional[2]
      if (!id) {
        console.error("Usage: termlings email read <id> [--folder <name>] [--account <name>]")
        process.exit(1)
      }

      console.log(runMessageRead(ctx, id, opts.folder))
      return
    }

    if (subcommand === "send") {
      const to = positional[2]
      const subject = positional[3]
      const body = positional.slice(4).join(" ")

      if (!to || !subject || !body) {
        console.error("Usage: termlings email send <to> <subject> <body...> [--from <address>] [--account <name>]")
        process.exit(1)
      }

      const from = opts.from?.trim() || ctx.from
      const output = runMessageSend(ctx, { to, subject, body, from })
      if (output.length > 0) {
        console.log(output)
      } else {
        console.log("✓ Email sent")
      }
      return
    }

    console.error(`Unknown email command: ${subcommand}`)
    console.error("Use: termlings email --help")
    process.exit(1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Email command failed: ${message}`)
    process.exit(1)
  }
}
