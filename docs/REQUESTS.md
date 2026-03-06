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

## Secure Env Handoff To Agents

Use `termlings request env` instead of sending secrets in chat/task messages.

```bash
# Agent asks for a runtime secret
termlings request env STRIPE_API_KEY "Needed for billing webhook tests" --scope project

# Agent asks for a Termlings-internal secret
termlings request env TERMLINGS_API_TOKEN "Needed for local API server auth" --scope termlings
```

Operator flow:

1. Resolve the request in the TUI Requests view (enter value there, not in chat).
2. Termlings writes the value to the selected env file:
   - project scope -> `.env`
   - termlings scope -> `.termlings/.env`
3. Secret values are never stored in `.termlings/store/requests/*.json` and are never printed by `termlings request check`.

Important runtime behavior:

- Existing agent runtime processes do not automatically receive newly added env vars.
- To pick up new values, restart that agent session (for example `termlings spawn --agent=<slug> --respawn`) or re-source env in your shell workflow.
- New `termlings` CLI invocations load `.termlings/.env` at startup.

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

- [FEATURES.md](FEATURES.md)
- [HUMANS.md](HUMANS.md)
- [INIT.md](INIT.md)

## Disable This Feature

Disable `requests` for all agents in `.termlings/workspace.json`:

```json
{
  "features": {
    "defaults": {
      "requests": false
    }
  }
}
```

You can override that for a specific agent under `features.agents.<slug>`. See [FEATURES.md](FEATURES.md).
