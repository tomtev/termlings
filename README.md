# 👾 termlings

**AI agents that build and run companies.**

Termlings runs a shared workspace (`.termlings/`) in your project folders where AI agents collaborate through messaging, tasks, calendars, and browser automation. Each agent has a soul, title, and reporting line - they know their role and who they answer to. 

Run `termlings` in your project folder to open the TUI and manage your team. Spawn agents by launching Claude Code, Codex, Pi sessions that connect to the shared workspace by running `termlings spawn` in another terminal.

Termlings runs on top of your existing Claude Code, Codex, and Pi setup. It orchestrates agents through a shared `.termlings/` workspace without replacing your current tooling.

Every agent gets access to (via termlings CLI):

- **Requests** — ask a human for decisions, credentials, or env vars
- **Messaging** — DMs to teammates and the human operator
- **Tasks** — claim, update status, add notes, set dependencies
- **Calendar** — view events, scheduling, and recurring meetings
- **Org chart** — see who's online, titles, and reporting lines
- **Brief** — full workspace snapshot on session start
- **Brand** — shared brand profile (colors, voice, logos, domains)
- **Browser** — shared browser for web interaction and automation (powered by PinchTab)
- **Skills** — installable skill packs for extended capabilities (powered by skills.sh)

## Install

```bash
npm install -g termlings@latest
# or
bun add -g termlings@latest
```

## Quick Start (Operator)

```bash
# 1) Initialize workspace files
termlings init --template default
# or from a git template
termlings init --template https://github.com/your-org/termlings-template.git#main

# 2) Start workspace TUI
termlings

# 3) Launch an agent session
termlings spawn
```

## Default Org Chart
When you install, you are asked to set up a default organization.
It looks like this. In the future there will be additional team and Termlings templates you can install.

```text
Operator (Human Owner - You) [human:default]
└── PM (Vision & Prioritization)
    ├── Designer (UX & Visual Design)
    ├── Developer (Build & Ship)
    ├── Growth (Customer & Adoption)
    └── Support (Operations)
```

## Core Commands

### Operator-first commands

| Command | What it does | Docs |
| --- | --- | --- |
| `termlings` | Start the workspace TUI | [docs/INIT.md](docs/INIT.md) |
| `termlings spawn` | Pick an agent + launch preset | [AGENTS.md](AGENTS.md) |
| `termlings create` | Create a new agent in .termlings/agents | [AGENTS.md](AGENTS.md) |
| `termlings init` | Initialize `.termlings/` in current project | [docs/INIT.md](docs/INIT.md) |
| `termlings --server` | Run secure HTTP API server | [docs/SERVER.md](docs/SERVER.md) |
| `termlings avatar <dna|name>` | Render avatar identity | [docs/AVATARS.md](docs/AVATARS.md) |
| `termlings --help` | Full command reference | CLI help |
| `termlings scheduler --deamon` | Run cron jobs for calendear | [docs/SCHEDULER.md](docs/SCHEDULER.md) |

### Mostly agent-facing commands

These are primarily for agents running inside sessions. You can run them manually when needed.

| Command | What it does | Docs |
| --- | --- | --- |
| `termlings brief` | Session startup snapshot | [AGENTS.md](AGENTS.md) |
| `termlings org-chart` | Show org + online status | [AGENTS.md](AGENTS.md) |
| `termlings skills <cmd>` | List/install/update agent skills (skills.sh wrapper) | [AGENTS.md](AGENTS.md) |
| `termlings brand <cmd>` | Manage brand profiles | [docs/BRAND.md](docs/BRAND.md) |
| `termlings message <target> <text>` | Send DM to session/agent/human | [docs/MESSAGING.md](docs/MESSAGING.md) |
| `termlings conversation <target>` | Read recent channel/DM history | [docs/MESSAGING.md](docs/MESSAGING.md) |
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
  brand/
    brand.json
    profiles/
      <id>.json
  store/
    messages/
      channels/*.jsonl
      dms/*.jsonl
      system.jsonl
      index.json
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
- `.termlings/brand/brand.json` - default brand profile.
- `.termlings/brand/profiles/<id>.json` - additional named brand profiles.
- `store/messages/` - append-only channel/DM/system history.
- `store/tasks/tasks.json` - task list and task state.
- `store/calendar/calendar.json` - events and recurrence.
- `store/requests/requests.jsonl` - operator request log.
- `browser/history.jsonl` - browser action history/audit trail.

## Lifecycle & Internals

For runtime internals (env vars, context injection, session lifecycle), see:

- [docs/LIFECYCLE.md](docs/LIFECYCLE.md)

This is intentionally separated so operator docs stay short.

## Documentation Index

- [docs/TERMLINGS.md](docs/TERMLINGS.md) - termling identity and concepts
- [AGENTS.md](AGENTS.md) - agent architecture and collaboration rules
- [docs/INIT.md](docs/INIT.md) - workspace initialization
- [docs/TEMPLATES.md](docs/TEMPLATES.md) - local and git template references
- [docs/MESSAGING.md](docs/MESSAGING.md) - messaging model
- [docs/SKILLS.md](docs/SKILLS.md) - skills.sh wrapper behavior and agent workflow
- [docs/TASK.md](docs/TASK.md) - task system
- [docs/CALENDAR.md](docs/CALENDAR.md) - calendar system
- [docs/SCHEDULER.md](docs/SCHEDULER.md) - scheduler daemon
- [docs/BRAND.md](docs/BRAND.md) - brand schema and commands
- [docs/browser.md](docs/browser.md) - browser automation
- [docs/API.md](docs/API.md) - HTTP API server reference
- [docs/SERVER.md](docs/SERVER.md) - `termlings --server` design and security plan
- [docs/AVATARS.md](docs/AVATARS.md) - avatar rendering
- [docs/PRESENCE.md](docs/PRESENCE.md) - presence + typing model
- [docs/HOOKS.md](docs/HOOKS.md) - legacy hook cleanup notes

## SIM (WIP Experiment)

SIM is an experimental runtime and not part of the default operator workflow.

- [docs/SIM.md](docs/SIM.md)

## License

MIT
