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
- **Social** — file-based social drafts, queue, scheduling, and publishing
- **Ads** — file-based ad sync, campaigns, creatives, and performance reports
- **Memory** — file-based project and agent memory with optional qmd support
- **CMS** — file-based collections, entries, and scheduled publishing
- **CRM** — file-based CRM records, timelines, and follow-up tracking
- **Media** — file-based image and video generation jobs
- **Org chart** — see who's online, titles, and reporting lines
- **Brief** — full workspace snapshot on session start
- **Brand** — shared brand profile (colors, voice, logos, domains)
- **Browser** — shared browser for web interaction and automation (powered by [agent-browser.dev](https://agent-browser.dev) + Chrome CDP)
- **Analytics** — file-based website analytics sync and local reports
- **Finance** — file-based revenue, subscriptions, and finance reports
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

## Repo Layout

This repository is now the monorepo for the OSS Termlings stack:

- `.` — core `termlings` CLI, TUI, server, docs, templates, and npm package
- `apps/web` — termlings.com website and docs worker
- `apps/desktop` — Tauri desktop shell that runs Termlings in sidecar PTY/API mode

Useful monorepo commands:

```bash
bun test
bun run web:build
npm --prefix apps/desktop run check
```

## Quick Start (Operator)

Prerequisite: install and log in to at least one runtime CLI (`claude` or `codex`).

```bash
# Fastest path
termlings --spawn

# First run with a specific template
termlings --spawn --template personal-assistant

# Or initialize first, then start manually
termlings init

# Separate workspace and spawning
termlings
# in another terminal:
termlings spawn

# Optional: spawn agents inside Docker-isolated workers
termlings --spawn --docker
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
| `termlings spawn` | Pick an agent + launch preset | [docs/SPAWN.md](docs/SPAWN.md) |
| `termlings create` | Create a new agent in .termlings/agents | [docs/TERMLINGS.md](docs/TERMLINGS.md) |
| `termlings agents <cmd>` | Browse/install predefined teams and agent presets | [docs/TERMLINGS.md](docs/TERMLINGS.md) |
| `termlings init` | Initialize `.termlings/` in current project | README |
| `termlings machine <cmd>` | SSH into a shared remote workspace | [docs/MACHINES.md](docs/MACHINES.md) |
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
| `termlings social <cmd>` | Social drafts, queue, scheduling, and publishing | [docs/SOCIAL.md](docs/SOCIAL.md) |
| `termlings ads <cmd>` | Ad sync, campaigns, creatives, and reports | [docs/ADS.md](docs/ADS.md) |
| `termlings memory <cmd>` | File-based project and agent memory | [docs/MEMORY.md](docs/MEMORY.md) |
| `termlings cms <cmd>` | File-based collections, entries, and scheduled publishing | [docs/CMS.md](docs/CMS.md) |
| `termlings crm <cmd>` | File-based CRM records + timelines | [docs/CRM.md](docs/CRM.md) |
| `termlings image <cmd>` | Generate and manage images | [docs/MEDIA.md](docs/MEDIA.md) |
| `termlings video <cmd>` | Generate and manage videos | [docs/MEDIA.md](docs/MEDIA.md) |
| `termlings analytics <cmd>` | File-based website analytics sync | [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| `termlings finance <cmd>` | File-based revenue and subscription sync | [docs/FINANCE.md](docs/FINANCE.md) |
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
    social/
      posts/*.json
      history.jsonl
    ads/
      campaigns/*.json
      creatives/*.json
      metrics/*.jsonl
      reports/*.json
    memory/
      records/<collection>/*.json
      qmd/<collection>/*.md
      history.jsonl
    cms/
      entries/<collection>/*.json
      publish/<collection>/*
      history.jsonl
    media/
      jobs/*.json
      outputs/*
    analytics/
      traffic/daily.jsonl
      channels/daily.jsonl
      pages/daily.jsonl
      conversions/daily.jsonl
      reports/*.json
    finance/
      customers/*.json
      subscriptions/*.json
      invoices/*.json
      refunds/*.json
      metrics/*.jsonl
      reports/*.json
    app-schedules/
      schedules.json
    evals/
      tasks/*.json
      runs/*.json
      reports/*.json
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
- `.termlings/store/social/` - local social drafts, queue, and publish history.
- `.termlings/store/ads/` - ad accounts, campaigns, creatives, metrics, and reports.
- `.termlings/store/memory/` - project and agent memory records plus optional qmd exports.
- `.termlings/store/cms/` - file-based collections, entries, publish outputs, and history.
- `.termlings/store/media/` - image and video jobs plus generated outputs.
- `.termlings/store/analytics/` - normalized analytics snapshots and reports.
- `.termlings/store/finance/` - normalized customers, subscriptions, invoices, refunds, metrics, and reports.
- `.termlings/store/app-schedules/schedules.json` - recurring app sync schedules for ads, analytics, and finance.
- `.termlings/store/evals/` - operator eval tasks, runs, and comparison reports.
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
- `.termlings/machines.json` - saved SSH machine definitions for remote shared workspaces.

## Lifecycle & Internals

For runtime internals (env vars, context injection, session lifecycle), see:

- [docs/APPS.md](docs/APPS.md) - core apps, app injection, and agent app availability
- [docs/LIFECYCLE.md](docs/LIFECYCLE.md)

This is intentionally separated so operator docs stay short.

## Documentation Index

- [docs/TERMLINGS.md](docs/TERMLINGS.md) - termling identity, SOUL conventions, and creation flows
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
- [docs/SOCIAL.md](docs/SOCIAL.md) - social drafts, queue, scheduling, and publishing
- [docs/ADS.md](docs/ADS.md) - ad sync, campaigns, creatives, and reports
- [docs/MEMORY.md](docs/MEMORY.md) - project and agent memory with optional qmd support
- [docs/CMS.md](docs/CMS.md) - file-based collections, entries, and scheduled publishing
- [docs/CRM.md](docs/CRM.md) - file-based CRM records and timelines
- [docs/MEDIA.md](docs/MEDIA.md) - image and video generation jobs
- [docs/ANALYTICS.md](docs/ANALYTICS.md) - website analytics sync and local reports
- [docs/FINANCE.md](docs/FINANCE.md) - revenue, subscriptions, and finance reports
- [docs/EVAL.md](docs/EVAL.md) - operator-only eval harness for benchmarking strategies
- [docs/REQUESTS.md](docs/REQUESTS.md) - operator request workflow
- [docs/SCHEDULER.md](docs/SCHEDULER.md) - scheduler daemon
- [docs/BRAND.md](docs/BRAND.md) - brand schema and commands
- [docs/browser.md](docs/browser.md) - browser automation
- [docs/MACHINES.md](docs/MACHINES.md) - SSH into shared remote workspaces
- [docs/DOCKER.md](docs/DOCKER.md) - full Docker-native workspace
- [docs/SECURITY.md](docs/SECURITY.md) - current hardening model and safest deployment paths
- [docs/SERVER.md](docs/SERVER.md) - `termlings --server` command, API, architecture, and security
- [docs/AVATARS.md](docs/AVATARS.md) - avatar rendering
- [docs/PRESENCE.md](docs/PRESENCE.md) - presence + typing model
- [docs/SETTINGS.md](docs/SETTINGS.md) - workspace.json settings

## License

MIT
