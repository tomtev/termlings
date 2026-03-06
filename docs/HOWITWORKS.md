# How It Works

Termlings is a local coordination layer on top of agent runtimes like Claude Code and Codex CLI.

Agents do not need a hosted control plane to collaborate. They run the same `termlings` CLI inside one project and share state through the `.termlings/` workspace directory.

## Mental Model

Termlings does four things:

1. Launches an agent session with role and workspace context.
2. Injects identity into that session through environment variables.
3. Routes messages, tasks, requests, and presence through files in `.termlings/`.
4. Keeps the TUI and every CLI process in sync by reading the same file-backed state.

## Launch Flow

Typical launch path:

1. `termlings spawn` resolves a route from `.termlings/spawn.json`.
2. The launcher reads agent identity from `.termlings/agents/<slug>/SOUL.md`.
3. Shared workspace context is loaded from:
   - `src/termlings-system-message.md`
   - `.termlings/VISION.md` when present
4. A runtime session ID is created and written to `.termlings/sessions/<session-id>.json`.
5. Termlings starts the runtime and injects the final context:
   - Claude: `--append-system-prompt "<context>"`
   - Codex: `-i "<context>"`
6. The launcher keeps the session fresh with heartbeats and polls for incoming messages to inject back into the terminal.

## Injected Environment Variables

Every launched agent session gets runtime metadata like:

```bash
TERMLINGS_SESSION_ID=tl-a8ab0631
TERMLINGS_AGENT_NAME=Rusty
TERMLINGS_AGENT_DNA=0a3f201
TERMLINGS_AGENT_SLUG=developer
TERMLINGS_AGENT_TITLE="Developer"
TERMLINGS_AGENT_TITLE_SHORT=Dev
TERMLINGS_AGENT_ROLE="Build and ship product"
TERMLINGS_AGENT_MANAGE_AGENTS=0
TERMLINGS_IPC_DIR=/path/to/project/.termlings
TERMLINGS_CONTEXT_PROFILE=default
TERMLINGS_CONTEXT="..."
```

The important distinction:

- `TERMLINGS_CONTEXT` mirrors the final context in the environment.
- The primary instruction injection still happens through the runtime CLI args.

## Why Agent CLI Commands Work

Agent-facing commands use the injected env vars to understand who is calling and which workspace to operate on.

Examples:

- `termlings message ...` uses `TERMLINGS_SESSION_ID` and `TERMLINGS_AGENT_*` to stamp the sender.
- `termlings request env|confirm|choice ...` requires `TERMLINGS_SESSION_ID` so the operator can see who asked.
- `termlings task ...` attributes claims, notes, and status changes to the active agent session.
- `termlings brief` and `termlings org-chart` read shared workspace files and optionally highlight the current session when `TERMLINGS_SESSION_ID` is set.

If you run these commands outside a launched agent session, commands that need session identity will fail or run in a reduced, read-only style.

## How Agents Communicate

Agents communicate by calling the same local CLI against shared workspace files.

### Direct messages

```bash
termlings message agent:developer "task-42 is ready"
termlings message human:default "Blocked on credentials"
termlings message tl-a8ab0631 "Ping"
```

Message targets:

- `agent:<slug>`: stable identity, recommended
- `human:default`: human operator
- `tl-...`: one live session only
- `channel:<name>`: shared channel history

Delivery model:

- Online session: delivered immediately through `.termlings/message-queue/tl-*.msg.json`
- Offline agent: queued in `.termlings/message-queue/*.queue.jsonl`
- Durable history: appended to `.termlings/store/messages/*`

The launcher polls for inbound messages and injects them into the agent terminal so they show up inside the runtime session.

## How Env Var Requests Work

This is the safe path for secrets and approvals:

```bash
termlings request env OPENAI_API_KEY "Needed for app runtime" --scope project
termlings request env TERMLINGS_API_TOKEN "Needed for local API server" --scope termlings
```

Flow:

1. The agent creates a request record in `.termlings/store/requests/<id>.json`.
2. The operator resolves it in the TUI Requests view.
3. Termlings writes the value to:
   - project scope: `.env`
   - termlings scope: `.termlings/.env`
4. The secret is not stored in the request JSON itself.

Important behavior:

- New `termlings` CLI processes load `.termlings/.env` on startup.
- Existing agent runtime sessions do not hot-reload newly added env vars.
- If the value needs to be present in the live agent runtime, restart that session.
- Project `.env` is for your app/tooling workflow; Termlings does not automatically load it the way it loads `.termlings/.env`.

## File-Backed State

The TUI and CLI stay consistent because they read and write the same files:

```text
.termlings/
  .env
  VISION.md
  workspace.json
  spawn.json
  sessions/*.json
  agents/<slug>/SOUL.md
  store/messages/*
  store/tasks/tasks.json
  store/calendar/calendar.json
  store/requests/*.json
  store/presence/*.typing.json
  message-queue/*.msg.json
  message-queue/*.queue.jsonl
```

Practical meaning:

- no central database is required
- multiple terminals can cooperate safely
- the TUI reflects the same state agents mutate through CLI commands
- history survives process restarts because the workspace is persistent on disk

## Read This With

- [SPAWN.md](SPAWN.md)
- [MESSAGING.md](MESSAGING.md)
- [REQUESTS.md](REQUESTS.md)
- [LIFECYCLE.md](LIFECYCLE.md)
