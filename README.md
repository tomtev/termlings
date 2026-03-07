# 👾 termlings

**AI agents that build and run companies with you.**

Termlings turns your terminal into a live AI startup: a full agent team building and marketing products around the clock, coordinating work in real time, running browser workflows, and shipping outcomes end to end from one shared command center.

The core model is agent-native file-based apps: local workspace apps exposed consistently through CLI, TUI, and injected agent context.

Every agent gets access to these core apps (via termlings CLI):

- **Messaging** — DMs to teammates and the human operator
- **Requests** — ask a human for decisions, credentials, or env vars
- **Tasks** — claim, update status, add notes, set dependencies
- **Workflows** — reusable checklist workflows with per-agent running copies
- **Calendar** — view events, scheduling, and recurring meetings
- **CRM** — file-based CRM records, timelines, and follow-up tracking
- **Org chart** — see who's online, titles, and reporting lines
- **Brief** — full workspace snapshot on session start
- **Brand** — shared brand profile (colors, voice, logos, domains)
- **Browser** — shared browser for web interaction and automation (powered by [agent-browser.dev](https://agent-browser.dev) + Chrome CDP)
- **Skills** — installable skill packs for extended capabilities (powered by skills.sh)

Apps can be disabled globally per workspace or per agent.
`messaging` is required and always stays enabled.

## Install

```bash
# Instant start
npx termlings@latest --spawn 
# Instant start with a specific template
npx termlings@latest --spawn --template personal-assistant
# Manual
bun add -g termlings@latest
# or
npm install -g termlings@latest
```

Runtime requirement: Bun must be installed because the `termlings` executable runs via Bun.

## Quick Start (Operator)

Prerequisite: install and log in to at least one runtime CLI (`claude` or `codex`).

```bash
# 1) Initialize workspace files
termlings init

# 2A) One-terminal startup
termlings --spawn

# 2A alt) One-terminal startup with a specific template on first run
termlings --spawn --template personal-assistant

# 2B) Or: keep workspace and spawning separate
termlings
# in another terminal:
termlings spawn
```

## IMPORTANT!
Default spawn presets run in dangerous/autonomous/yolo mode for supported runtimes.

## How it works
Termlings adds an agent coordination layer in `.termlings/` on top of your existing coding-agent runtime.

1. `termlings spawn` launches an agent using `.termlings/spawn.json` routing:
   - `default` sets workspace-wide runtime/preset
   - `agents.<slug>` can override runtime/preset per agent
   - `runtimes` defines runtime preset commands
   - `termlings` auto-starts the scheduler daemon before opening the workspace UI
   - `termlings --spawn` opens the workspace UI immediately and starts scheduler + background spawn startup
2. Termlings injects workspace + role context into the runtime session.
3. The runtime starts with that context:
   - Claude Code (`termlings claude`) via `--append-system-prompt "<termlings context>"`
   - Codex CLI (`termlings codex`) via a trailing prompt argument
4. Agents coordinate through `termlings` commands (`message`, `task`, `calendar`, `request`, etc.), while shared state in `.termlings/store/*` keeps TUI + CLI in sync across terminals.

Each Termling agent gets role-specific context derived from its `SOUL.md` plus shared workspace context.
   
## Why Termlings? 
There are many ways to orchestrate AI agents — but Termlings makes it feel like running a real company. Agents have roles, personalities, and report to each other through a natural org chart. 

The built-in terminal UI is like an AI-native Slack: chat with your agents, track tasks, manage scheduled events, and create one-time or recurring DMs with `/schedule` — all from your terminal.

## Core Commands

### Operator-first (Human) commands

| Command | What it does | Docs |
| --- | --- | --- |
| `termlings` | Start workspace UI + auto-start scheduler daemon | README |
| `termlings --spawn` | Open workspace UI immediately + start scheduler daemon + background spawn startup | README |
| `termlings spawn` | Pick an agent + launch preset | [docs/AGENTS.md](docs/AGENTS.md) |
| `termlings create` | Create a new agent in .termlings/agents | [docs/AGENTS.md](docs/AGENTS.md) |
| `termlings agents <cmd>` | Browse/install predefined teams and agent presets | [docs/AGENTS.md](docs/AGENTS.md) |
| `termlings init` | Initialize `.termlings/` in current project | README |
| `termlings avatar <dna|name>` | Render avatar identity | [docs/AVATARS.md](docs/AVATARS.md) |
| `termlings --help` | Full command reference | CLI help |
| `termlings --server` | Run secure HTTP API server [WIP] | [docs/SERVER.md](docs/SERVER.md) |
| `termlings scheduler --daemon` | Run scheduler daemon (calendar/messages/tasks) | [docs/SCHEDULER.md](docs/SCHEDULER.md) |

### Agent Apps
These are primarily for agents running inside sessions. You can run them manually when needed.
You should not run these commands since they mostly work inside a agent session.

| Command | What it does | Docs |
| --- | --- | --- |
| `termlings brief` | Session startup snapshot | [docs/BRIEF.md](docs/BRIEF.md) |
| `termlings org-chart` | Show org + online status | [docs/ORG-CHART.md](docs/ORG-CHART.md) |
| `termlings skills <cmd>` | List/install/update agent skills (skills.sh wrapper) | [docs/SKILLS.md](docs/SKILLS.md) |
| `termlings brand <cmd>` | Manage brand profiles | [docs/BRAND.md](docs/BRAND.md) |
| `termlings message <target> <text>` | Send DM to session/agent/human | [docs/MESSAGING.md](docs/MESSAGING.md) |
| `termlings conversation <target>` | Read recent channel/DM history | [docs/MESSAGING.md](docs/MESSAGING.md) |
| `termlings workflow <cmd>` | Workflow checklist commands | [docs/WORKFLOWS.md](docs/WORKFLOWS.md) |
| `termlings task <cmd>` | Task workflow commands | [docs/TASK.md](docs/TASK.md) |
| `termlings calendar <cmd>` | Calendar/event workflow | [docs/CALENDAR.md](docs/CALENDAR.md) |
| `termlings crm <cmd>` | File-based CRM records + timelines | [docs/CRM.md](docs/CRM.md) |
| `termlings request <type>` | Ask operator for decisions/credentials | [docs/REQUESTS.md](docs/REQUESTS.md) |
| `termlings browser <cmd>` | Browser automation commands | [docs/browser.md](docs/browser.md) |

## `.termlings` Structure

```text
.termlings/
  VISION.md
  .env
  workspace.json
  agents/
    <slug>/
      SOUL.md
  brand/
    brand.json
    profiles/
      <id>.json
  store/
    sessions/
      tl-*.json
    message-queue/
      tl-*.msg.json
      *.queue.jsonl
    messages/
      channels/*.jsonl
      dms/*.jsonl
      system.jsonl
      index.json
    message-schedules/
      schedules.json
    presence/
      tl-*.typing.json
    crm/
      records/<type>/*.json
      activity/<type>/*.jsonl
    tasks/tasks.json
    calendar/calendar.json
    workflows/
      <slug>/*.json
    requests/*.json
  workflows/
    org/*.json
    agents/
      <slug>/*.json
  browser/
    config.json
    process.json
    profile.json
    history/
      all.jsonl
      agent/*.jsonl
```

What each file/folder is for:

- `.termlings/VISION.md` - simple project vision injected into every agent context.
- `.termlings/.env` - Termlings-internal environment values resolved from scoped requests.
- `.termlings/workspace.json` - workspace metadata, TUI settings, and app availability.
- `.termlings/agents/<slug>/SOUL.md` - saved agent identity, title, role, DNA, and optional `sort_order` for TUI ordering.
- `.termlings/brand/brand.json` - default brand profile.
- `.termlings/brand/profiles/<id>.json` - additional named brand profiles.
- `.termlings/store/sessions/tl-*.json` - live session presence and metadata.
- `.termlings/store/message-queue/` - transient live inboxes (`tl-*.msg.json`) and offline agent queues (`*.queue.jsonl`).
- `.termlings/store/messages/` - append-only channel/DM/system history.
- `.termlings/store/message-schedules/schedules.json` - one-time, hourly, daily, and weekly DM definitions.
- `.termlings/store/presence/` - session typing/activity state.
- `.termlings/store/crm/records/<type>/*.json` - one file per CRM record.
- `.termlings/store/crm/activity/<type>/*.jsonl` - append-only activity timelines per CRM record.
- `.termlings/store/tasks/tasks.json` - task list and task state.
- `.termlings/store/calendar/calendar.json` - events and recurrence.
- `.termlings/store/workflows/<slug>/*.json` - running workflow copies with step completion state.
- `.termlings/store/requests/*.json` - operator request records.
- `.termlings/workflows/org/*.json` - org-wide workflow checklists.
- `.termlings/workflows/agents/<slug>/*.json` - agent-specific workflow checklists.
- `.termlings/browser/config.json` - browser runtime settings (CDP port, binary, profile path).
- `.termlings/browser/process.json` - active browser process/CDP state.
- `.termlings/browser/profile.json` - workspace profile metadata.
- `.termlings/browser/history/all.jsonl` - global browser action stream.
- `.termlings/browser/history/agent/*.jsonl` - per-agent browser action streams.

## Lifecycle & Internals

For runtime internals (env vars, context injection, session lifecycle), see:

- [docs/APPS.md](docs/APPS.md) - core apps, app injection, and agent app availability
- [docs/LIFECYCLE.md](docs/LIFECYCLE.md)

This is intentionally separated so operator docs stay short.

## Documentation Index

- [docs/TERMLINGS.md](docs/TERMLINGS.md) - termling identity and concepts
- [docs/AGENTS.md](docs/AGENTS.md) - SOUL frontmatter and identity conventions
- [docs/AGENTS.md](docs/AGENTS.md) - preset catalog and install flows
- [docs/SPAWN.md](docs/SPAWN.md) - launch agent runtime sessions
- [docs/APPS.md](docs/APPS.md) - core apps, injection, and app availability
- [docs/ORG-CHART.md](docs/ORG-CHART.md) - team hierarchy and reporting lines
- [docs/BRIEF.md](docs/BRIEF.md) - full workspace startup snapshot
- [docs/TEMPLATES.md](docs/TEMPLATES.md) - local and git template references
- [docs/MESSAGING.md](docs/MESSAGING.md) - messaging model
- [docs/SKILLS.md](docs/SKILLS.md) - skills.sh wrapper behavior and agent workflow
- [docs/WORKFLOWS.md](docs/WORKFLOWS.md) - workflow checklist system
- [docs/plans/README.md](docs/plans/README.md) - planning model and future direction
- [docs/TASK.md](docs/TASK.md) - task system
- [docs/CALENDAR.md](docs/CALENDAR.md) - calendar system
- [docs/CRM.md](docs/CRM.md) - file-based CRM records and timelines
- [docs/REQUESTS.md](docs/REQUESTS.md) - operator request workflow
- [docs/SCHEDULER.md](docs/SCHEDULER.md) - scheduler daemon
- [docs/BRAND.md](docs/BRAND.md) - brand schema and commands
- [docs/browser.md](docs/browser.md) - browser automation
- [docs/DOCKER.md](docs/DOCKER.md) - full Docker-native workspace
- [docs/SERVER.md](docs/SERVER.md) - `termlings --server` command, API, architecture, and security
- [docs/AVATARS.md](docs/AVATARS.md) - avatar rendering
- [docs/PRESENCE.md](docs/PRESENCE.md) - presence + typing model
- [docs/SETTINGS.md](docs/SETTINGS.md) - workspace.json settings

## License

MIT
