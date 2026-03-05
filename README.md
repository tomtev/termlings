# 👾 termlings

**AI agents that build and run companies with you.**

Termlings runs in a shared workspace (`.termlings/`) in your project folders where AI agents collaborate through messaging, tasks, calendars, and browser automation. Each agent has a soul, title, and reporting line - they know their role and who they answer to.

Our vision is to make building and running companies with AI agents feel like a video game, while still producing the best possible websites, apps and services.

Run `termlings` in your project folder to open the TUI and manage your team.  
Use `termlings --auto-spawn` for a single-terminal startup (opens the control panel inside tmux, starts the scheduler daemon, spawns all agent windows behind it, and tears down that tmux session when the control panel exits), or run `termlings` + `termlings spawn` in separate terminals.
`--auto-spawn` uses tmux sessions behind the scenes to manage the control panel and agent terminals.
Browser defaults are optimized for human-in-the-loop operations (headed + workspace profile + shared tabs).
For scraping/CI workloads, run headless with `termlings browser start --headless` (still CDP-controlled, just no visible window).

Every agent gets access to these tools (via termlings CLI):

- **Requests** — ask a human for decisions, credentials, or env vars
- **Messaging** — DMs to teammates and the human operator
- **Tasks** — claim, update status, add notes, set dependencies
- **Calendar** — view events, scheduling, and recurring meetings
- **Org chart** — see who's online, titles, and reporting lines
- **Brief** — full workspace snapshot on session start
- **Brand** — shared brand profile (colors, voice, logos, domains)
- **Browser** — shared browser for web interaction and automation (powered by [agent-browser.dev](https://agent-browser.dev) + Chrome CDP)
- **Skills** — installable skill packs for extended capabilities (powered by skills.sh)

## Install

```bash
npm install -g termlings@latest
# or
bun add -g termlings@latest
```

## Quick Start (Operator)

Prerequisite: install and log in to at least one runtime CLI (`claude` or `codex`).

```bash
# 1) Initialize workspace files
termlings init

# Optional: choose a specific local template
termlings init --template default
termlings init --template executeive-team
termlings init --template personal-assistant

# 2A) One-terminal startup (requires tmux)
termlings --auto-spawn

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
   - `termlings --auto-spawn` batch-spawns all agents, then opens the control panel as the front tmux window in the same session
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
| `termlings --auto-spawn` | Open tmux control panel + scheduler daemon + spawn all agents | [docs/INIT.md](docs/INIT.md) |
| `termlings spawn` | Pick an agent + launch preset | [docs/SOUL.md](docs/SOUL.md) |
| `termlings create` | Create a new agent in .termlings/agents | [docs/SOUL.md](docs/SOUL.md) |
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
| `termlings brief` | Session startup snapshot | [docs/SOUL.md](docs/SOUL.md) |
| `termlings org-chart` | Show org + online status | [docs/SOUL.md](docs/SOUL.md) |
| `termlings skills <cmd>` | List/install/update agent skills (skills.sh wrapper) | [docs/SOUL.md](docs/SOUL.md) |
| `termlings brand <cmd>` | Manage brand profiles | [docs/BRAND.md](docs/BRAND.md) |
| `termlings message <target> <text>` | Send DM to session/agent/human | [docs/MESSAGING.md](docs/MESSAGING.md) |
| `termlings conversation <target>` | Read recent channel/DM history | [docs/MESSAGING.md](docs/MESSAGING.md) |
| `termlings task <cmd>` | Task workflow commands | [docs/TASK.md](docs/TASK.md) |
| `termlings email <cmd>` | Email workflow wrapper (Himalaya) | [docs/EMAIL.md](docs/EMAIL.md) |
| `termlings calendar <cmd>` | Calendar/event workflow | [docs/CALENDAR.md](docs/CALENDAR.md) |
| `termlings request <type>` | Ask operator for decisions/credentials | [docs/HUMANS.md](docs/HUMANS.md) |
| `termlings browser <cmd>` | Browser automation commands | [docs/browser.md](docs/browser.md) |

## `.termlings` Structure

```text
.termlings/
  VISION.md
  .env
  emails.json
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
- `.termlings/emails.json` - email account mapping for `termlings email`.
- `.termlings/sessions/tl-*.json` - live session presence and metadata.
- `.termlings/agents/<slug>/SOUL.md` - saved agent identity, title, role, DNA, and optional `sort_order` for TUI ordering.
- `.termlings/brand/brand.json` - default brand profile.
- `.termlings/brand/profiles/<id>.json` - additional named brand profiles.
- `.termlings/store/messages/` - append-only channel/DM/system history.
- `.termlings/store/presence/` - session typing/activity state.
- `.termlings/store/tasks/tasks.json` - task list and task state.
- `.termlings/store/calendar/calendar.json` - events and recurrence.
- `.termlings/store/requests/requests.jsonl` - operator request log.
- `.termlings/browser/config.json` - browser runtime settings (CDP port, binary, profile path).
- `.termlings/browser/process.json` - active browser process/CDP state.
- `.termlings/browser/profile.json` - workspace profile metadata.
- `.termlings/browser/history/all.jsonl` - global browser action stream.
- `.termlings/browser/history/agent/*.jsonl` - per-agent browser action streams.

## Lifecycle & Internals

For runtime internals (env vars, context injection, session lifecycle), see:

- [docs/LIFECYCLE.md](docs/LIFECYCLE.md)

This is intentionally separated so operator docs stay short.

## Documentation Index

- [docs/TERMLINGS.md](docs/TERMLINGS.md) - termling identity and concepts
- [docs/SOUL.md](docs/SOUL.md) - SOUL frontmatter and identity conventions
- [docs/INIT.md](docs/INIT.md) - workspace initialization
- [docs/TEMPLATES.md](docs/TEMPLATES.md) - local and git template references
- [docs/MESSAGING.md](docs/MESSAGING.md) - messaging model
- [docs/SKILLS.md](docs/SKILLS.md) - skills.sh wrapper behavior and agent workflow
- [docs/TASK.md](docs/TASK.md) - task system
- [docs/EMAIL.md](docs/EMAIL.md) - email wrapper and account mapping
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
