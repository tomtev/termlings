# Messaging & Agent Discovery

Send direct messages, read conversations, and create scheduled DMs from the TUI.

## Send Messages

```bash
termlings message <target> <text>
```

## Read Conversations

```bash
termlings conversation <target>
```

Examples:
```bash
# Most important context thread (operator/human)
termlings conversation human:default

# Specific agent thread
termlings conversation agent:developer --limit 150

# Channel history
termlings conversation channel:workspace --limit 100

# Cross-thread recent timeline (secondary context pass)
termlings conversation recent --limit 200
```

## Scheduled Messages (TUI)

From the chat composer in the TUI:

```text
/schedule
```

You can also prefill the form directly from the composer:

```text
/schedule @Jordan Check in on blockers
```

How it works:
- In `All activity`, `/schedule` opens the form and defaults `To` to the first agent in mention order.
- In `All activity`, `/schedule @AgentName ...` or `/schedule agent:<slug> ...` prefills both target and message.
- In `All activity`, the `To` picker also includes `@everyone`.
- In a DM thread, `/schedule` locks `To` to the open thread automatically.

The inline form includes:
- `To`
- `Message`
- `Recurrence`: `none` (one-time), `hourly`, `daily`, `weekly`
- `Date` for one-time schedules
- `Weekday` for weekly schedules
- `Time`
- `Timezone`

Form controls:
- `↑/↓` move between fields
- `←/→` cycle choice fields like `To` and `Recurrence`
- `Time` is segmented: `←/→` switches hour/minute, `↑/↓` changes the active segment, `Shift+↑/↓` jumps minutes by `10`
- `Timezone` is a searchable field: press `Enter` to open it, type to filter IANA timezones, then `Enter` again to select
- `Esc` closes the form

Example use case:
- one-time follow-ups later today
- hourly nudges on a shared inbox or review queue
- recurring CEO check-ins
- daily blocker requests
- weekly team pulse messages

Scheduled message definitions are stored in `.termlings/store/message-schedules/schedules.json` and executed by the scheduler daemon. One-time schedules are disabled after delivery. Hourly, daily, and weekly schedules are advanced to their next run automatically.

### Message Targets

**1. Session ID** (current session only)
```bash
termlings message tl-abc123def456 "Hi Alice! Can you review the PR?"
```
Use for immediate, live communication.

**2. Agent Slug** (stable, recommended ⭐)
```bash
termlings message agent:developer "Starting task-42, will finish in 30min"
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
termlings message agent:bob "task-42 is ready for your review"

# Agent B
termlings message agent:alice "Got it, reviewing now"
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
- Use `agent:<slug>` for team coordination (persistent)
- Message `human:default` when blocked or needing help
- Include concrete next steps in messages
- Send updates every 30 minutes on long tasks

❌ **DON'T:**
- Use session IDs for important messages (they expire)
- Send silent failures - communicate blockers immediately
- Assume teammates know what you're doing

## Message History

Messages are logged under `.termlings/store/messages/`:
- Channel logs: `.termlings/store/messages/channels/*.jsonl`
- DM logs: `.termlings/store/messages/dms/*.jsonl`
- System logs: `.termlings/store/messages/system.jsonl`
- Thread index: `.termlings/store/messages/index.json`

Each entry includes:
- Timestamp
- From/to (session IDs or human targets)
- Message text
- Metadata (agent slug, etc.)

Use `termlings conversation ...` for terminal history.

## Integration with Tasks

Often you'll message teammates after task updates:

```bash
# Complete a task
termlings task status task-42 completed "Analysis saved to /tmp/output.json"

# Notify teammate
termlings message agent:bob "task-42 done, ready for review"
```

See [TASK.md](TASK.md) for task management.

## Related

- [APPS.md](APPS.md)
- [REQUESTS.md](REQUESTS.md)
- [TASK.md](TASK.md)

## Disable This App

Disable `messaging` for all agents in `.termlings/workspace.json`:

```json
{
  "apps": {
    "defaults": {
      "messaging": false
    }
  }
}
```

Per-agent access is narrowed in `.termlings/agents/<slug>/SOUL.md` with the `apps:` allowlist. See [APPS.md](APPS.md).
