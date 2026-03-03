# 👾 termlings

**Your personal autonomous AI workforce.**

Termlings helps you build and manage anything — companies, projects, household tasks, or life goals — with teams of autonomous AI agents that collaborate, communicate, and work together independently or in coordination. Agents run in parallel, discover each other, send messages, claim tasks, check calendars, and use a shared browser for human-in-loop workflows — all coordinated through simple CLI commands and a web UI.

## Three products

Termlings is three connected products:

1. **Agent Orchestration TUI**  
   Default `termlings` workspace for team coordination (org chart, messaging, tasks, calendar, browser).
2. **Agent SIM TUI**  
   `termlings sim` world runtime for movement and world interaction (`walk`, `gesture`, `map`).
3. **Avatar Platform**  
   Shared DNA/avatar rendering system used across both experiences, plus standalone avatar tooling.

## Features

- 🤖 **Multi-agent teams** — Launch multiple Claude Code agents that work independently or together
- 💬 **Presistent agent** — Create and manage agents with a peronality.
- 📋 **Task management** — Claim work, update status, track progress with shared task lists
- 📅 **Calendar & scheduling** — Events with recurrence, notifications, team scheduling
- 🌐 **Browser automation** — Shared browser via PinchTab for web interaction and human-in-loop
- 👤 **Persistent identity** — Each agent gets a unique avatar DNA that survives across restarts
- 💾 **Local-first storage** — All state in `.termlings/` — no databases, no cloud
- ⚡ **Lightweight context** — Minimal token overhead — agents understand the system with ~3KB of context
- 🔌 **HTTP API** — Programmatic access to workspace state and operations

## What is termlings?

Termlings is a **workspace + simulation + avatar platform** for autonomous agents.

- **Agents** — Claude Code sessions with persistent identity (name, DNA, visual avatar)
- **Communication** — Direct messaging, agent discovery, chat-based coordination
- **Task management** — Claim work, update status, add progress notes, track blockers
- **Scheduling** — Calendar events with recurrence, automated notifications
- **Browser automation** — Agents can browse the web via PinchTab (shared browser, persistent session)
- **Simulation world** — Optional SIM runtime via `termlings sim` for world interaction
- **Human-in-loop** — Operator can intervene, take over agent tasks, or get help from agents

All state is **file-based** in `.termlings/` — no databases, no external services. Perfect for local teams and research.

## Why termlings?

AI agents today are isolated processes. They run code, but they don't **cooperate** with other agents or integrate with human workflows.

Termlings solves this with:

- **Lightweight coordination** — CLI commands (not screenshots/vision). Minimal token overhead.
- **Persistent identities** — Each agent keeps the same name, avatar, and DNA across sessions
- **Shared workspace** — One `.termlings/` directory, multiple agents reading/writing state
- **Local-first** — Everything stays on your machine. No API calls, no auth keys, no vendor lock-in
- **Agent-agnostic** — Works with Claude Code today, extensible for other agent runtimes in the future
- **Human collaboration** — Operators can join the workspace, message agents, take over tasks, see what's happening in real-time

## Quick start

**Terminal 1: Start the workspace TUI (default)**
```bash
termlings
```

This launches a terminal workspace UI for the current directory.

To open the web UI instead:
```bash
termlings web
```

**Terminal 2+: Launch agents**
```bash
termlings claude              # Launch Claude Code with agent context
termlings create alice        # Create a new agent named "alice"
termlings alice               # Launch the "alice" agent
```

**Optional: Start SIM runtime**
```bash
termlings sim
termlings sim map
termlings sim walk 10,5
termlings sim gesture wave
```

On first run, termlings initializes `.termlings/` with config files and directories.

See [docs/TERMLINGS.md](docs/TERMLINGS.md) for complete guide to agent identity, context injection, and lifecycle.

## Upgrade

```bash
npm install -g termlings@latest
# or
bun add -g termlings@latest
```

## CLI commands

Agents coordinate via simple CLI commands:

### Messaging & Discovery
- **`termlings brief`** — Full workspace snapshot (recommended at session start)
- **`termlings org-chart`** — See hierarchy, reporting lines, and who's online
- **`termlings list-agents`** — Legacy alias for `org-chart`
- **`termlings message <target> <text>`** — Send a message
  - `<session-id>` — Direct message a specific session
  - `agent:<slug>` — Message by slug (works across restarts)
  - `human:default` — Message the operator/human

### Task Management
- **`termlings task list`** — See all tasks
- **`termlings task show <id>`** — View task details
- **`termlings task claim <id>`** — Claim a task to work on
- **`termlings task status <id> <status>`** — Update status (open, claimed, in-progress, blocked, completed)
- **`termlings task note <id> <note>`** — Add progress notes

### Calendar & Scheduling
- **`termlings calendar list`** — See your events
- **`termlings calendar show <id>`** — View event details
- **`termlings calendar create`** — Create a new event
- **`termlings scheduler`** — Run calendar scheduler daemon (checks every 60s)
- **`termlings scheduler --daemon`** — Keep running in background

### Browser Automation
- **`termlings browser start`** — Launch PinchTab server
- **`termlings browser tabs list`** — List open tabs + IDs
- **`termlings browser navigate <url> [--tab <id>]`** — Go to a URL
- **`termlings browser screenshot [--tab <id>]`** — Get current page (base64)
- **`termlings browser type <text> [--tab <id>]`** — Type into focused element
- **`termlings browser click <selector> [--tab <id>]`** — Click element by CSS selector
- **`termlings browser extract [--tab <id>]`** — Get visible page text

### SIM Mode
- **`termlings sim`** — Start SIM runtime
- **`termlings sim map`** — View map/room/agent summary
- **`termlings sim map --agents`** — List active sessions + positions
- **`termlings sim walk <x>,<y>`** — Move to coordinates
- **`termlings sim gesture [wave|talk]`** — Send gesture animation

### Example workflow

```bash
# 1. See who's online
termlings org-chart

# 2. Check your tasks
termlings task list

# 3. Claim work
termlings task claim task-42
termlings task status task-42 in-progress

# 4. Coordinate with teammates
termlings message agent:developer "Starting task-42, will finish in 30min"

# 5. Update progress
termlings task note task-42 "50% complete, hit issue with rate limits"

# 6. Ask for help if blocked
termlings message human:default "Need API key to proceed"

# 7. Complete work
termlings task status task-42 completed "Results in /tmp/analysis.json"
termlings message agent:developer "task-42 done, ready for review"

# 8. Browser automation
termlings browser start
termlings browser navigate "https://example.com"
termlings browser screenshot
termlings browser extract
```

## Workspace management

```bash
# Start the default terminal workspace UI
termlings

# Start the web UI on default localhost
termlings web

# Expose web UI to network
termlings web --host 0.0.0.0 --port 4173

# Clear runtime state (sessions, messages in IPC)
termlings --clear

# Initialize workspace (creates .termlings/ structure)
termlings init

# Initialize with a template
termlings init --template office
```

## File structure

```
.termlings/
├── agents/                    # Saved agent definitions
│   ├── alice/
│   │   ├── SOUL.md           # Personality & role
│   │   └── avatar.svg        # Visual identity
│   └── bob/
│       ├── SOUL.md
│       └── avatar.svg
├── store/
│   ├── messages.jsonl        # Message history (append-only)
│   ├── tasks/
│   │   └── tasks.json        # Task definitions
│   ├── calendar/
│   │   └── calendar.json     # Events & recurrence
│   └── browser/
│       ├── config.json       # PinchTab settings
│       ├── process.json      # Server PID & port
│       ├── history.jsonl     # Browser automation log
│       └── profile/          # Chrome profile (persistent)
├── sessions/                 # Active agent sessions
│   └── tl-*.json            # Session state per agent
└── VISION.md               # Project vision injected into agent context
```

## HTTP API

The workspace exposes APIs for programmatic access:

**Core API** (v1):
- `GET /api/v1/projects` — List registered projects
- `GET /api/v1/state` — Full workspace snapshot (sessions, messages, tasks, calendar)
- `GET /api/v1/sessions` — List active sessions
- `POST /api/v1/sessions` — Create/update session
- `POST /api/v1/sessions/leave` — Remove session
- `POST /api/v1/messages` — Send message

**Workspace API** (real-time streaming):
- `GET /api/workspace/stream` — Server-sent events (SSE) for live updates
- `POST /api/workspace/join` — Join workspace
- `POST /api/workspace/message` — Send message
- `POST /api/workspace/leave` — Leave workspace

**Health & status**:
- `GET /api/hub/health` — Health check

Authentication (optional):
- Set `TERMLINGS_API_TOKEN` environment variable to require auth
- Clients include `Authorization: Bearer <token>` header

## Agent context & identity

When an agent launches, termlings injects context automatically:

**Environment variables** (passed via `termlings claude`):
```bash
TERMLINGS_SESSION_ID=tl-a8ab0631      # Unique session ID (16 hex chars)
TERMLINGS_AGENT_NAME=Rusty             # Display name
TERMLINGS_AGENT_DNA=0a3f201            # Stable identity (7-char hex)
TERMLINGS_IPC_DIR=.termlings/          # Workspace directory
TERMLINGS_CONTEXT=...                  # Final injected system context
```

**Base context file** (`src/termlings-system-message.md`):
- How to use CLI commands
- Communication patterns
- Task workflow examples
- Human-in-loop integration
- Browser automation guide

**Project vision file** (`.termlings/VISION.md`):
- If present, appended to system context for every launched agent.
- Wrapped in tags for explicit delimiting:
```text
<TERMLINGS-VISION>
...contents of .termlings/VISION.md...
</TERMLINGS-VISION>
```

The context is **lightweight** (~3KB) — agents understand the system with minimal token overhead.

**Persistent identity:**
- Slug stays the same across sessions (agent recognizable by teammates)
- Can be messaged by slug even after restart: `termlings message agent:developer "msg"`
- SOUL.md file stores personality, role, and preferences

## Agent DNA & avatars

Each agent has a **7-character hex DNA string** that:
- Encodes facial features, body type, hair, colors (~32M combinations)
- Remains stable across sessions (agent stays recognizable)
- Can be visualized as pixel art (terminal, SVG, MP4)

**View an avatar:**
```bash
termlings avatar 0a3f201              # Terminal ANSI rendering
termlings avatar alice                # By agent name
termlings avatar 0a3f201 --svg        # SVG output
termlings avatar 0a3f201 --random     # Generate random DNA
```

See [docs/AVATARS.md](docs/AVATARS.md) for full documentation on DNA encoding, rendering formats, and animation.

## Create an agent

Create a new agent interactively:

```bash
termlings create                      # Guided creation
termlings create alice                # Create agent "alice"
termlings create alice --dna 0a3f201  # With specific DNA
```

This creates `.termlings/alice/` with:
- `SOUL.md` — Personality, role, preferences (edit to customize)
- `avatar.svg` — Generated visual identity

**Store multiple agents** in the same workspace:
```
.termlings/agents/
  alice/SOUL.md
  bob/SOUL.md
  charlie/SOUL.md
```

## Running teams of agents

**Step 1: Start the workspace**
```bash
termlings
```

Starts the terminal workspace view. If you want browser-based monitoring, run:

```bash
termlings web
```

**Step 2: Launch agents** (in separate terminals)
```bash
termlings claude           # New agent with random identity
termlings alice            # Launch saved agent "alice"
```

Each agent:
- Gets a unique session ID (`tl-...`)
- Can message other agents by slug
- Can claim tasks and check calendar
- Can use browser automation if needed
- Can message the human operator for help

**Step 3: Agents collaborate**
- See each other with `termlings org-chart`
- Send messages with `termlings message agent:<slug>`
- Claim and work on shared tasks
- Check calendar for meetings
- Use browser to interact with external services

## Browser Automation with PinchTab

Agents can automate web interaction through **PinchTab**, a headless browser CLI tool that provides agents with a persistent, shared browser instance.

### What is PinchTab?

PinchTab is a lightweight **headless browser automation tool** that runs Chrome in the background. It's perfect for:

- **Web automation** — Navigate pages, fill forms, click buttons, extract data
- **Headless operation** — Runs without UI (no graphics conflicts, minimal system overhead)
- **API-driven** — Control via HTTP requests from termlings CLI
- **Profile persistence** — Shared Chrome profile maintains cookies, login state, and history across all agents
- **Agent tracking** — Each agent action is logged with identity for audit trails

### Setup

**1. Install PinchTab** (one-time setup, optional):

PinchTab is an external tool not bundled with termlings. Install via:

```bash
npm install -g pinchtab
```

Or via your system package manager (if available).

**2. Initialize browser in your workspace:**
```bash
termlings browser init
```

Creates `.termlings/browser/` directory with configuration and profile directory.

**3. Start the browser service:**
```bash
termlings browser start
```

Launches PinchTab server in headed mode by default for human-in-loop visibility. Use `termlings browser start --headless` for background runs.

**Note:** Browser automation is optional. If PinchTab is not installed, agents can skip browser commands and work with other features (messaging, tasks, calendar).
Browser automation uses PinchTab root endpoints and can target a specific tab via `--tab <tab-id>`.

### Agent Commands

Once running, agents use the CLI to control the shared browser:

```bash
# Resolve a tab first for deterministic automation
TAB_ID=$(termlings browser tabs list | awk '/^   id:/{print $2; exit}')

# Navigate to a website
termlings browser navigate "https://example.com" --tab "$TAB_ID"

# Wait for page load (automatic with most commands)
termlings browser screenshot --tab "$TAB_ID"          # Get current page as base64

# Extract visible text content
termlings browser extract --tab "$TAB_ID"             # Useful for checking what happened

# Interact with the page
termlings browser type "search query" --tab "$TAB_ID"        # Type into focused element
termlings browser click "button.search" --tab "$TAB_ID"      # Click by CSS selector

# Check authentication
termlings browser check-login --tab "$TAB_ID"                # Exit 1 if login required

# Get full cookie list
termlings browser cookies list
```

### Shared Profile & Persistence

All agents share **one Chrome profile** in `.termlings/browser/profile/`. This means:

- **Single login** — Agent A logs in, Agent B uses the same authenticated session
- **Persistent state** — Cookies, local storage, browsing history survives across restarts
- **Human-in-loop** — Operator can take over from an agent (same browser state)
- **Project isolation** — Each termlings project has its own separate profile

Example workflow:
```bash
# Agent Alice authenticates
termlings browser navigate "https://api.github.com/user"
termlings browser type "alice@example.com"
termlings browser click "button.login"

# Agent Bob uses the same authenticated state
termlings browser extract                    # Can see Alice's GitHub data

# Operator monitors or intervenes
termlings browser screenshot                 # See what agents are doing
```

### Activity Logging

Every browser command is logged to `.termlings/browser/history.jsonl` with:
- Timestamp
- Agent identity (name, DNA, session ID)
- Command executed
- Success/error status

Useful for auditing agent actions or debugging automation issues.

### Performance & Token Efficiency

PinchTab with termlings provides **token efficiency** for agents:

- **No screenshots/vision** — Use text extraction instead (much cheaper than Claude vision)
- **Reusable patterns** — Agents can save and reuse automation patterns
- **Headless operation** — No overhead from rendering UI

### Troubleshooting

**"PinchTab not found"** error:
```bash
npm install -g pinchtab
```

**Port already in use:**
PinchTab auto-detects the next available port. Check actual port with:
```bash
termlings browser status
```

**Profile issues:**
To reset profile (clears cookies/auth):
```bash
termlings browser init --reset
```

See [docs/BROWSER.md](docs/BROWSER.md) for advanced features (patterns, human-in-loop requests, dashboard access).

## Documentation

**Getting started & agent guides:**
- [docs/TERMLINGS.md](docs/TERMLINGS.md) — What termlings are, how identity works, lifecycle
- [docs/CLAUDE.md](docs/CLAUDE.md) — Using termlings with Claude Code
- [docs/HUMANS.md](docs/HUMANS.md) — Human operators, credentials, access control (future RBAC)
- [docs/AGENTS.md](AGENTS.md) — Agent system architecture and commands
- [src/termlings-system-message.md](src/termlings-system-message.md) — Context injected into agent sessions

**Workspace features:**
- [docs/MESSAGING.md](docs/MESSAGING.md) — Messaging and agent discovery
- [docs/TASK.md](docs/TASK.md) — Task management and workflows
- [docs/CALENDAR.md](docs/CALENDAR.md) — Calendar events and scheduling
- [docs/SCHEDULER.md](docs/SCHEDULER.md) — Calendar scheduler daemon
- [docs/BROWSER.md](docs/BROWSER.md) — Browser automation and human-in-loop
- [docs/AVATARS.md](docs/AVATARS.md) — Avatar DNA system and rendering

**Web interface & infrastructure:**
- [docs/WEB.md](docs/WEB.md) — Web workspace UI and features
- [docs/API.md](docs/API.md) — HTTP API reference (all endpoints with examples)
- [docs/PRESENCE.md](docs/PRESENCE.md) — Presence model (online + typing/working)
- [docs/INIT.md](docs/INIT.md) — Workspace initialization and reset
- [docs/HOOKS.md](docs/HOOKS.md) — Legacy Claude hook cleanup

## Component library

Render agent avatars in your own UI:

```bash
npm install termlings
```

**Core functions:**
```ts
import {
  generateRandomDNA,
  decodeDNA,
  encodeDNA,
  renderSVG,
  renderTerminal,
  renderTerminalSmall,
} from 'termlings';
```

**Framework components:**
```tsx
// React
import { Avatar } from 'termlings/react';
<Avatar dna="0a3f201" walking />

// Vue
import { Avatar } from 'termlings/vue';
<Avatar dna="0a3f201" walking />

// Svelte
import { Avatar } from 'termlings/svelte';
<Avatar {dna} walking />
```

See [docs/AVATARS.md](docs/AVATARS.md) for rendering options (terminal, SVG, MP4, animations).

## License

MIT
