# Termlings Agents

Termlings agents are autonomous Claude Code sessions that collaborate through a shared local workspace.

## Current model

- No sim engine.
- No map/walk/place/chat actions.
- No Codex/Pi adapters.
- Claude-only agent runtime.
- File-backed JSON state in `.termlings/`.

## Implementation policy (current phase)

- Do not add backward-compatibility layers unless explicitly requested.
- Do not add fallback paths/aliases for old file names, commands, or data formats.
- Prefer one canonical path/format and update templates/docs/code together.

## Architecture

```text
termlings (CLI)
  ├─ termlings brief          # complete workspace snapshot
  ├─ termlings claude         # launch agent session
  ├─ termlings org-chart      # discover org structure + active status
  ├─ termlings message ...    # direct messaging
  ├─ termlings conversation   # read conversation history
  ├─ termlings task ...       # task management
  ├─ termlings email ...      # email workflow wrapper (Himalaya)
  ├─ termlings calendar ...   # calendar viewing
  ├─ termlings --server       # secure local HTTP API server
  └─ termlings                # terminal workspace UI (default)

Workspace state: <project>/.termlings/
  .env
  emails.json
  sessions/*.json
  store/messages/*
  store/tasks/tasks.json
  store/calendar/calendar.json
  agents/<agent-id>/SOUL.md
```

## Default Team Structure

The template includes a 5-person bootstrapped team structure:

```
Founder (Human Owner - You)
└── PM (Vision & Prioritization, day-to-day lead)
    ├── Designer (UX & Visual Design)
    ├── Developer (Build & Ship)
    ├── Growth (Customer & Adoption)
    └── Support (Operations)
```

Each agent role has specific responsibilities and reports to the PM, who reports to you (`human:default`).

## Agent identity

Each agent has:

- Name
- DNA (stable identity)
- Title (full job title, e.g., Product Manager, Developer)
- Title Short (optional abbreviation for TUI display, e.g., PM, Dev)
- Sort Order (optional integer for TUI ordering; lower appears first, default `0`)
- Role (brief description of responsibilities)
- Session ID (per running process)

Saved agents live in:

```text
.termlings/agents/<agent-id>/
  SOUL.md
  avatar.svg
```

## Launching

```bash
termlings claude
termlings create <agent-id>
termlings <agent-id>
```

`--with`, `termlings codex`, and `termlings pi` are removed.

## Agent commands

### Messaging & discovery
```bash
termlings brief                    # Session startup snapshot
termlings org-chart                # See org structure + who's online
termlings skills list              # List available SKILL.md skills
termlings message <target> <text>  # Send a direct message
termlings conversation <target>    # Read recent DM/channel history
```

### Skills
```bash
termlings skills --help                                # Full skills usage
termlings skills list                                  # Local skill visibility (.agents/.claude)
termlings skills install <source> [options...]         # Wraps: npx skills add
termlings skills check                                 # Wraps: npx skills check
termlings skills update                                # Wraps: npx skills update
```

### Task management
```bash
termlings task list                           # View all tasks
termlings task show <id>                      # Task details
termlings task claim <id>                     # Claim a task
termlings task status <id> <status> [note]    # Update status
termlings task note <id> <note>               # Add progress note
termlings task depends <id> <dep-id>          # Add dependency
termlings task depends <id> --remove <dep-id> # Remove dependency
```

### Email
```bash
termlings email accounts                        # Show active + configured email accounts
termlings email inbox [--limit <n>]             # List inbox envelopes
termlings email read <id>                       # Read message
termlings email send <to> <subject> <body...>  # Send message
termlings email setup <account>                 # Run Himalaya account setup wizard
termlings email doctor                          # Diagnose email account
termlings email config init                     # Create .termlings/emails.json
termlings email draft new <title> ...           # Create markdown draft
termlings email draft send <id>                 # Send draft now
```

### Calendar
```bash
termlings calendar list [--agent <id>]   # View events
termlings calendar show <event-id>       # Event details
termlings calendar create ...            # Create event (owner)
termlings calendar edit <event-id> ...   # Edit event (owner)
```

### Browser automation
```bash
termlings browser start                  # Launch browser
termlings browser tabs list              # List tabs + IDs
termlings browser navigate <url> [--tab <id>]   # Go to URL
termlings browser screenshot [--tab <id>]       # Capture screen
termlings browser extract [--tab <id>]          # Get page text
termlings browser type <text> [--tab <id>]      # Type into element
termlings browser click <selector> [--tab <id>] # Click element
termlings browser patterns list          # View saved patterns
termlings browser --help                 # All browser commands
```

### Agent creation
```bash
termlings create                    # Interactive agent builder
termlings create --name "Alice"     # Create with name
termlings create --dna <hex>        # Create with DNA
```

### Avatar visualization
```bash
termlings avatar [dna|name]         # Visualize avatar
termlings avatar --svg              # SVG output
termlings avatar --mp4 --walk       # Animated MP4
```

### Message targets

**Session ID** — `termlings message tl-a8ab0631 "message"`
- Sends to a specific agent session (current session only)
- Use when you need immediate acknowledgment from a live agent
- Example: asking for real-time help

**Agent Slug** — `termlings message agent:developer "message"` ⭐ **Recommended**
- Sends to agent by folder slug (works across restarts)
- Preferred for persistent threads with specific agents
- Example: "agent:alice", "agent:developer"
- Best practice: use slug for team collaboration

**Human operator** — `termlings message human:default "message"`
- Sends to human operator/owner
- Use `human:default` for the project owner
- Use when you need human intervention (blockers, decisions, manual tasks)
- Example: "I'm blocked on task-42, need AWS credentials"

## Human/operator messaging contract

When an operator/human messages an agent, the agent should:

1. Reply via `termlings message human:<id> "..."` using the incoming human ID.
2. Acknowledge quickly.
3. Include concrete next step and ETA when relevant.
4. If blocked, state blocker and required input.

## Typing presence

Typing presence is terminal-first.

- Source of truth: launcher PTY activity + terminal busy detection.
- State file: `.termlings/store/presence/<sessionId>.typing.json` with `source: "terminal"`.
- Auto-clear on inactivity is handled by the launcher.
- Freshness and message-based stale clearing are enforced by local runtime + TUI.
- Legacy Claude hooks are no longer used; startup cleans old hook registration if present.

## CLI architecture

The termlings CLI is organized as modular command handlers for clarity and maintainability:

```text
bin/termlings.js              # Entry point
└── src/cli.ts                # Minimal router (150 lines)
    └── src/commands/         # Modular handlers
        ├── index.ts          # Route dispatcher
        ├── brief.ts          # Project snapshot summary
        ├── messaging.ts      # list-agents alias + message
        ├── org-chart.ts      # org structure + reporting lines
        ├── tasks.ts          # task commands
        ├── email.ts          # email commands
        ├── calendar.ts       # calendar commands
        ├── browser.ts        # browser automation
        ├── scheduler.ts      # calendar scheduler
        ├── init.ts           # workspace init
        ├── create.ts         # agent creation
        └── avatar.ts         # avatar visualization
```

Each command has comprehensive `--help` documentation:
```bash
termlings calendar --help      # Full calendar docs + examples
termlings task --help          # Task management guide
termlings email --help         # Email wrapper guide
termlings browser --help       # Browser automation guide
```

## Persistence and realtime

- CLI writes JSON files into `.termlings/`.
- TUI and automation processes read snapshots from filesystem-backed state.
- Session online/offline comes from `.termlings/sessions/*.json`.

## Usage examples

### Discovering teammates
```bash
termlings org-chart
# Output:
# tl-a8ab0631   Alice          [0a3f201] last-seen 2s ago
# tl-2fb0e8aa   Bob            [1f4d82a] last-seen 5s ago (you)
```

### Sending a message
```bash
# Send to a specific session ID (current session only)
termlings message tl-a8ab0631 "Hi Alice! Can you review the report?"

# Send to agent by slug (recommended — works across restarts)
termlings message agent:developer "Update: task is 50% complete"

# Send to human operator (always use human:default for owner)
termlings message human:default "I'm blocked waiting for input"
```

### Managing tasks
```bash
# View all tasks
termlings task list

# See task details
termlings task show task-123

# Claim a task to work on
termlings task claim task-456

# Mark task as in-progress
termlings task status task-456 in-progress

# Add progress notes (do this frequently!)
termlings task note task-456 "Completed data validation, starting analysis"

# Complete task with summary
termlings task status task-456 completed "Results: 95% accuracy, saved to /tmp/output.json"
```

### Checking calendar
```bash
# See your assigned events
termlings calendar list

# View event details
termlings calendar show event-789
```

## Collaboration patterns

### Sequential handoff (A → B)
```
Agent A: termlings task claim task-1 && termlings task status task-1 in-progress
  ... work ...
Agent A: termlings task note task-1 "Complete, ready for Bob's review"
Agent A: termlings message agent:bob "task-1 ready for you"

Agent B: termlings task show task-1  # read notes from Alice
Agent B: termlings task claim task-1 && termlings task status task-1 in-progress
  ... review/extend work ...
Agent B: termlings task status task-1 completed "Reviewed and validated"
```

### Parallel work (independent tasks)
```
Agent A: termlings task claim task-1
Agent B: termlings task claim task-2
Agent C: termlings task claim task-3

# All work in parallel, communicate via notes/messages
Agent A: termlings task note task-1 "At checkpoint, awaiting input"
Agent B: termlings message human:default "Need database access for task-2"
Agent C: termlings task note task-3 "Blocked on task-1, waiting for Alice"
```

### Asking for help
```bash
# If blocked
termlings task note task-42 "Blocked: API key not configured"
termlings message human:default "Need AWS_KEY env var to proceed with task-42"

# Once unblocked, continue
termlings task status task-42 in-progress
termlings message human:default "Thanks! Resuming task-42"
```

## Browser automation

Agents can share a persistent browser for web interaction and human-in-loop workflows:

```bash
# Initialize browser (one-time per project)
termlings browser init
npm install -g agent-browser
agent-browser install

# Start shared browser
termlings browser start

# Navigate and interact
termlings browser tabs list
TAB_ID=$(termlings browser tabs list | awk '/^   id:/{print $2; exit}')
termlings browser navigate "https://example.com" --tab "$TAB_ID"
termlings browser type "search query" --tab "$TAB_ID"
termlings browser click "button.search" --tab "$TAB_ID"
termlings browser screenshot --tab "$TAB_ID"   # Get current page
termlings browser extract --tab "$TAB_ID"      # Get visible text

# Human-in-loop: operator can intervene
termlings browser request-help "I need to log in manually"
```

**Features:**
- Shared project-specific browser profile (per-project isolation)
- Persistent cookies/auth across all agent interactions
- Activity logging to `.termlings/browser/history/all.jsonl` and `.termlings/browser/history/agent/*.jsonl`
- Reusable automation patterns for token efficiency
- Human operator can interact with same browser

See `termlings browser --help` for all commands and examples.

## Calendar management

Owners can create recurring events and assign to agents:

```bash
# Create event (owner only)
termlings calendar create tl-alice "Daily Standup" "2026-03-02T09:00:00Z" "2026-03-02T09:30:00Z" daily

# Agents view their events
termlings calendar list
termlings calendar show evt-001

# Owner manages events
termlings calendar edit evt-001 --title "Team Standup"
termlings calendar enable evt-001
```

## Docs

- [docs/SKILLS.md](docs/SKILLS.md)
- [src/termlings-system-message.md](src/termlings-system-message.md)
- [docs/team-coordination.md](docs/team-coordination.md)
- [docs/browser.md](docs/browser.md)
- [docs/calendar-system.md](docs/calendar-system.md)
