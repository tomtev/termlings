# Termlings Agents

Termlings agents are autonomous Claude Code sessions that collaborate through a shared local workspace.

## Current model

- No sim engine.
- No map/walk/place/chat actions.
- No Codex/Pi adapters.
- Claude-only agent runtime.
- File-backed JSON state in `.termlings/`.

## Architecture

```text
termlings (CLI)
  ├─ termlings claude         # launch agent session
  ├─ termlings list-agents    # discover active agents
  ├─ termlings message ...    # direct messaging
  ├─ termlings task ...       # task management
  ├─ termlings calendar ...   # calendar viewing
  └─ termlings web            # local workspace UI server

Workspace state: <project>/.termlings/
  sessions/*.json
  store/messages.jsonl
  store/tasks/tasks.json
  store/calendar/calendar.json
  agents/<agent-id>/SOUL.md
```

## Agent identity

Each agent has:

- Name
- DNA (stable identity)
- Optional title
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

```bash
termlings list-agents
termlings message <target> <message>
termlings task list
termlings task show <id>
termlings task claim <id>
termlings task status <id> <status>
termlings task note <id> <note>
termlings calendar list
termlings calendar show <id>
```

### Message targets

**Session ID** — `termlings message tl-a8ab0631 "message"`
- Sends to a specific agent session (current session only)
- Use when you need immediate acknowledgment from a live agent
- Example: asking for real-time help

**Agent DNA** — `termlings message agent:0a3f201 "message"` ⭐ **Recommended**
- Sends to agent by stable identity (works across restarts)
- Preferred for persistent threads with specific agents
- Example: "agent:alice-dna", "agent:bob-dna"
- Best practice: use DNA for team collaboration

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

Typing presence is Claude hook-driven only.

- Hook script: `~/.claude/hooks/termlings-hooks.sh`
- State file: `.termlings/<sessionId>.typing.json`
- Freshness window is enforced by workspace server.

No terminal-output fallback or non-hook typing fallback is supported.

## Persistence and realtime

- CLI writes JSON files into `.termlings/`.
- Web app reads snapshots and streams updates from filesystem change watchers.
- Session online/offline comes from `.termlings/sessions/*.json`.

## Usage examples

### Discovering teammates
```bash
termlings list-agents
# Output:
# tl-a8ab0631   Alice          [0a3f201] last-seen 2s ago
# tl-2fb0e8aa   Bob            [1f4d82a] last-seen 5s ago (you)
```

### Sending a message
```bash
# Send to a specific session ID (current session only)
termlings message tl-a8ab0631 "Hi Alice! Can you review the report?"

# Send to agent by stable DNA (recommended — works across restarts)
termlings message agent:0a3f201 "Update: task is 50% complete"

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
Agent A: termlings message agent:<bob-dna> "task-1 ready for you"

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

## Docs

- [docs/HOOKS.md](docs/HOOKS.md)
- [src/termling-context.md](src/termling-context.md)
- [docs/team-coordination.md](docs/team-coordination.md)
