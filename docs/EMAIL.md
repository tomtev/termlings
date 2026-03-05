# Email CLI (`termlings email`)

`termlings email` is a simplified wrapper around [Himalaya](https://github.com/pimalaya/himalaya) for agent workflows.

## Goals / Plan

1. Keep agent API small: inbox, read, send, doctor, config.
2. Resolve accounts automatically from `.termlings/emails.json`.
3. Support both project-wide email and per-agent email account mappings.
4. Keep secrets out of config JSON by using env vars requested via `termlings request env`.

## Commands

```bash
termlings email accounts
termlings email inbox [query...] [--limit <n>] [--folder <name>] [--account <name>]
termlings email read <id> [--folder <name>] [--account <name>]
termlings email send <to> <subject> <body...> [--from <address>] [--account <name>]
termlings email setup <account>
termlings email doctor [--account <name>]
termlings email draft new <title> [body...] [--template <name>] [--to <a,b>] [--send-at <iso>]
termlings email draft list
termlings email draft show <id>
termlings email draft send <id>
termlings email template new <name> [body...]
termlings email template list
termlings email template show <name>
termlings email config init [--force]
termlings email config show
```

## Config (`.termlings/emails.json`)

```json
{
  "version": 1,
  "himalaya": {
    "binary": "himalaya",
    "configPath": "~/.config/himalaya/config.toml"
  },
  "project": {
    "account": "team",
    "folder": "INBOX",
    "from": "Team <team@example.com>",
    "requiredEnv": ["TEAM_EMAIL_PASSWORD"]
  },
  "agents": {
    "developer": {
      "account": "developer",
      "folder": "INBOX",
      "from": "Developer <developer@example.com>",
      "requiredEnv": ["DEV_EMAIL_PASSWORD"]
    }
  }
}
```

Account resolution order:
1. `--account` override
2. `agents.<TERMLINGS_AGENT_SLUG>`
3. `project`

## Env Variable Scope

Use request scopes:

- Project app/runtime secrets: `termlings request env VAR --scope project` (writes to project `.env`)
- Termlings-internal secrets: `termlings request env VAR --scope termlings` (writes to `.termlings/.env`)

For email-wrapper-only secrets, prefer `--scope termlings`.

## Internal Drafts and Templates

Drafts and templates are Markdown files with frontmatter:

- Drafts: `.termlings/email/drafts/*.md`
- Templates: `.termlings/email/templates/*.md`

Template behavior (`--template <name>` on `draft new`):
- The template values are copied into the draft when the draft is created.
- The draft stores `template: <name>` as provenance/traceability.
- Drafts are standalone after creation; editing a template later does not update existing drafts.
- If you want updated template content, create a new draft from that template (or edit the draft file directly).

Draft frontmatter supports fields such as:
- `to`, `cc`, `bcc` (comma-separated)
- `subject`
- `account`
- `from`
- `send_at` (ISO datetime)

If `send_at` is set and draft status is `draft`, the scheduler daemon can auto-send it:

```bash
termlings scheduler --daemon
```
