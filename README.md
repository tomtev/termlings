# 👾 termlings

**A local workspace for coordinating autonomous AI agents.**

Termlings gives you a shared workspace (`.termlings/`) where agents can coordinate through messaging, tasks, calendar, and optional browser automation.

## Install

```bash
npm install -g termlings@latest
# or
bun add -g termlings@latest
```

## Quick Start (Operator)

```bash
# 1) Initialize workspace files
termlings init --template office

# 2) Start workspace TUI
termlings

# 3) Launch an agent session
termlings spawn
```

## Core Commands

### Operator-first commands

| Command | What it does | Docs |
| --- | --- | --- |
| `termlings` | Start the workspace TUI | [docs/WEB.md](docs/WEB.md) |
| `termlings spawn` | Pick an agent + launch preset | [AGENTS.md](AGENTS.md) |
| `termlings create` | Create a new agent in .termlings/agents | [AGENTS.md](AGENTS.md) |
| `termlings init` | Initialize `.termlings/` in current project | [docs/INIT.md](docs/INIT.md) |
| `termlings avatar <dna|name>` | Render avatar identity | [docs/AVATARS.md](docs/AVATARS.md) |
| `termlings --help` | Full command reference | CLI help |
| `termlings scheduler --deamon` | Run cron jobs for calendear | [docs/SCHEDULER.md](docs/SCHEDULER.md) |

### Mostly agent-facing commands

These are primarily for agents running inside sessions. You can run them manually when needed.

| Command | What it does | Docs |
| --- | --- | --- |
| `termlings brief` | Session startup snapshot | [AGENTS.md](AGENTS.md) |
| `termlings org-chart` | Show org + online status | [AGENTS.md](AGENTS.md) |
| `termlings brand <cmd>` | Manage brand profiles | [docs/BRAND.md](docs/BRAND.md) |
| `termlings message <target> <text>` | Send DM to session/agent/human | [docs/MESSAGING.md](docs/MESSAGING.md) |
| `termlings task <cmd>` | Task workflow commands | [docs/TASK.md](docs/TASK.md) |
| `termlings calendar <cmd>` | Calendar/event workflow | [docs/CALENDAR.md](docs/CALENDAR.md) |
| `termlings request <type>` | Ask operator for decisions/credentials | [docs/HUMANS.md](docs/HUMANS.md) |
| `termlings browser <cmd>` | Browser automation commands | [docs/browser.md](docs/browser.md) |

## `.termlings` Structure

```text
.termlings/
  VISION.md
  sessions/
    tl-*.json
  agents/
    <slug>/
      SOUL.md
      avatar.svg
  store/
    messages.jsonl
    tasks/tasks.json
    calendar/calendar.json
    requests/requests.jsonl
    browser/
      history.jsonl
```

What each file/folder is for:

- `VISION.md` - project vision injected into every agent context.
- `sessions/tl-*.json` - live session presence and metadata.
- `agents/<slug>/SOUL.md` - saved agent identity, title, role, DNA.
- `store/messages.jsonl` - append-only message history.
- `store/tasks/tasks.json` - task list and task state.
- `store/calendar/calendar.json` - events and recurrence.
- `store/requests/requests.jsonl` - operator request log.
- `store/browser/history.jsonl` - browser action history/audit trail.

Related:

- `brand/brand.json` - default brand profile.
- `brand/profiles/<id>.json` - additional named brand profiles.

## Lifecycle & Internals

For runtime internals (env vars, context injection, session lifecycle), see:

- [docs/LIFECYCLE.md](docs/LIFECYCLE.md)

This is intentionally separated so operator docs stay short.

## Documentation Index

- [docs/TERMLINGS.md](docs/TERMLINGS.md) - termling identity and concepts
- [AGENTS.md](AGENTS.md) - agent architecture and collaboration rules
- [docs/INIT.md](docs/INIT.md) - workspace initialization
- [docs/MESSAGING.md](docs/MESSAGING.md) - messaging model
- [docs/TASK.md](docs/TASK.md) - task system
- [docs/CALENDAR.md](docs/CALENDAR.md) - calendar system
- [docs/SCHEDULER.md](docs/SCHEDULER.md) - scheduler daemon
- [docs/BRAND.md](docs/BRAND.md) - brand schema and commands
- [docs/browser.md](docs/browser.md) - browser automation
- [docs/WEB.md](docs/WEB.md) - web workspace UI
- [docs/API.md](docs/API.md) - HTTP API
- [docs/AVATARS.md](docs/AVATARS.md) - avatar rendering
- [docs/PRESENCE.md](docs/PRESENCE.md) - presence + typing model
- [docs/HOOKS.md](docs/HOOKS.md) - legacy hook cleanup notes

## SIM (WIP Experiment)

SIM is an experimental runtime and not part of the default operator workflow.

- [docs/SIM.md](docs/SIM.md)

## License

MIT
