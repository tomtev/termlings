# 👾 termlings

**AI agents that build and run companies with you.**

Termlings runs in a shared workspace (`.termlings/`) in your project folders where AI agents collaborate through messaging, tasks, calendars, and browser automation. Each agent has a soul, title, and reporting line - they know their role and who they answer to.

Our vision is to make building and running companies with AI agents feel like a video game, while still producing the best possible websites, apps and services.

Run `termlings` in your project folder to open the TUI and manage your team.  
Use `termlings --spawn-all` for a single-terminal startup (spawns all agents in detached tmux PTYs, then opens the TUI), or run `termlings` + `termlings spawn` in separate terminals.

Every agent gets access to these tools (via termlings CLI):

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
termlings init

# 2A) One-terminal startup (requires tmux)
termlings --spawn-all

# 2B) Or: keep workspace and spawning separate
termlings
# in another terminal:
termlings spawn
```

## IMPORTANT!
Default spawn presets run in dangerous/autonomous mode for supported runtimes.

## How it works
Termlings adds an agent coordination layer in `.termlings/` on top of your existing coding-agent runtime.

1. `termlings spawn` launches an agent using `.termlings/spawn.json` routing:
   - `default` sets workspace-wide runtime/preset
   - `agents.<slug>` can override runtime/preset per agent
   - `runtimes` defines runtime preset commands
   - `termlings --spawn-all` is a convenience wrapper around batch spawn (`--all --detached`) before opening the workspace TUI
2. Termlings injects workspace + role context into the runtime session.
3. The runtime starts with that context:
   - Claude Code (`termlings claude`) via `--append-system-prompt "<termlings context>"`
   - Codex CLI (`termlings codex`) via `-i "<termlings context>"`
   - Pi (`termlings pi`) via `--append-system-prompt "<termlings context>"`
4. Agents coordinate through `termlings` commands (`message`, `task`, `calendar`, `request`, etc.), while shared state in `.termlings/store/*` keeps TUI + CLI in sync across terminals.

Each Termling agent gets role-specific context derived from its `SOUL.md` plus shared workspace context.
   
## Why Termlings? 
There are many ways to orchestrate AI agents — but Termlings makes it feel like running a real company. Agents have roles, personalities, and report to each other through a natural org chart. 

The built-in terminal UI is like an AI-native Slack: chat with your agents, track tasks, and manage scheduled events — all from your terminal.

## Core Commands

### Operator-first (Human) commands

| Command | What it does | Docs |
| --- | --- | --- |
| `termlings` | Start the workspace TUI | [docs/INIT.md](docs/INIT.md) |
| `termlings --spawn-all` | Spawn all agents (detached tmux PTYs) + open workspace TUI | [docs/INIT.md](docs/INIT.md) |
| `termlings spawn` | Pick an agent + launch preset | [AGENTS.md](AGENTS.md) |
| `termlings create` | Create a new agent in .termlings/agents | [AGENTS.md](AGENTS.md) |
| `termlings init` | Initialize `.termlings/` in current project | [docs/INIT.md](docs/INIT.md) |
| `termlings avatar <dna|name>` | Render avatar identity | [docs/AVATARS.md](docs/AVATARS.md) |
| `termlings --help` | Full command reference | CLI help |
| `termlings --server` | Run secure HTTP API server [WIP] | [docs/SERVER.md](docs/SERVER.md) |
| `termlings scheduler --deamon` | Run cron jobs for calendear | [docs/SCHEDULER.md](docs/SCHEDULER.md) |

### Agent-facing commands
These are primarily for agents running inside sessions. You can run them manually when needed.
You should not run these commands since they mostly work inside a agent session.

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
    presence/
      tl-*.typing.json
    tasks/tasks.json
    calendar/calendar.json
    requests/requests.jsonl
  browser/
    history.jsonl
```

What each file/folder is for:

- `.termlings/VISION.md` - simple project vision injected into every agent context.
- `.termlings/sessions/tl-*.json` - live session presence and metadata.
- `.termlings/agents/<slug>/SOUL.md` - saved agent identity, title, role, DNA, and optional `sort_order` for TUI ordering.
- `.termlings/brand/brand.json` - default brand profile.
- `.termlings/brand/profiles/<id>.json` - additional named brand profiles.
- `.termlings/store/messages/` - append-only channel/DM/system history.
- `.termlings/store/presence/` - session typing/activity state.
- `.termlings/store/tasks/tasks.json` - task list and task state.
- `.termlings/store/calendar/calendar.json` - events and recurrence.
- `.termlings/store/requests/requests.jsonl` - operator request log.
- `.termlings/browser/history.jsonl` - browser action history/audit trail.

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
