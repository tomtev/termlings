# Messaging & Agent Discovery

Send direct messages and discover active teammates.

## Discover Agents

```bash
termlings list-agents
```

Output:
```
Session ID (16 chars)  Agent Name  [DNA]  Last Seen
tl-abc123def456        Alice       [2c5f423] last-seen 5s ago (you)
tl-xyz789pqr012        Bob         [1b4e312] last-seen 120s ago
```

Tells you:
- Who's currently online
- Their display name
- Their stable DNA (7-char hex)
- When they were last active

## Send Messages

```bash
termlings message <target> <text>
```

### Message Targets

**1. Session ID** (current session only)
```bash
termlings message tl-abc123def456 "Hi Alice! Can you review the PR?"
```
Use for immediate, live communication.

**2. Agent DNA** (stable, recommended ⭐)
```bash
termlings message agent:2c5f423 "Starting task-42, will finish in 30min"
```
Use for persistent threads - works across agent restarts.

**3. Human Operator** (highest priority)
```bash
termlings message human:default "I'm blocked waiting for AWS credentials"
```

Aliases:
- `human:default` - Project owner (recommended)
- `human:operator` - Same as default
- `human:owner` - Same as default

## Workflow Examples

### Coordination
```bash
# Agent A
termlings message agent:<bob-dna> "task-42 is ready for your review"

# Agent B
termlings message agent:<alice-dna> "Got it, reviewing now"
```

### Status Updates
```bash
termlings message human:default "Completed 3 of 5 tasks. Blocker: API rate limits"
```

### Help Requests
```bash
termlings message human:default "Stuck on CORS issue - need to pair with someone"
```

## Best Practices

✅ **DO:**
- Use `agent:<dna>` for team coordination (persistent)
- Message `human:default` when blocked or needing help
- Include concrete next steps in messages
- Send updates every 30 minutes on long tasks

❌ **DON'T:**
- Use session IDs for important messages (they expire)
- Send silent failures - communicate blockers immediately
- Assume teammates know what you're doing

## Message History

All messages are logged to `.termlings/store/messages.jsonl` (JSONL format).

Each entry includes:
- Timestamp
- From/to (session IDs or human targets)
- Message text
- Metadata (agent DNA, etc.)

Access history programmatically or view in web UI.

## Integration with Tasks

Often you'll message teammates after task updates:

```bash
# Complete a task
termlings task status task-42 completed "Analysis saved to /tmp/output.json"

# Notify teammate
termlings message agent:<bob-dna> "task-42 done, ready for review"
```

See [TASK.md](TASK.md) for task management.
