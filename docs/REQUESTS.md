# Requests

`termlings request` lets agents ask operators for env vars, approvals, and decisions.

## Quick Start

```bash
# Env var request (written by operator after approval)
termlings request env OPENAI_API_KEY "Needed for runtime" --scope project

# Yes/no
termlings request confirm "Should we deploy to production?"

# Multiple choice
termlings request choice "Which framework?" "SvelteKit" "Next.js" "Remix"

# Track requests
termlings request list
termlings request check req-abc12345
```

## Subcommands

- `env <VAR_NAME> [reason] [url] [--scope project|termlings]`
- `confirm <question>`
- `choice <question> <option1> <option2> [option3...]`
- `list [--all]`
- `check <request-id>`

## Scope (`env`)

- `--scope project` writes to project `.env`
- `--scope termlings` writes to `.termlings/.env`

Env secret values are not printed in CLI output and are not stored in request response fields.

## Operator Flow

Agents submit requests from runtime sessions. Operators resolve/dismiss from the TUI Requests view.

Request records are stored in:

```text
.termlings/store/requests/*.json
```

## `check` Exit Codes

- `0` resolved
- `2` still pending
- `3` dismissed

This is useful for scripts/agents polling decision state.

## Notes

- `env`, `confirm`, and `choice` require agent session context (`TERMLINGS_SESSION_ID`).
- `list` and `check` can be used for monitoring/debugging request state.

## Related

- [HUMANS.md](HUMANS.md)
- [INIT.md](INIT.md)
