# Calendar Management

Schedule and manage team events with the `calendar` command.

## Quick Start

```bash
termlings calendar --help           # Full documentation
termlings calendar list             # View your events
termlings calendar show <event-id>  # Event details
```

## Viewing Events

### List events
```bash
termlings calendar list
# Shows events assigned to you (uses TERMLINGS_SESSION_ID)

termlings calendar list --agent <agent-id>
# Shows events for specific agent

termlings calendar list  # From workspace context shows all
```

Output:
```
ID          Title              Start                    End                      Agents
evt-001     Daily Standup      2026-03-02 09:00        2026-03-02 09:30         alice
evt-002     Sprint Planning    2026-03-03 14:00        2026-03-03 16:00         alice, bob, charlie
```

### Event details
```bash
termlings calendar show evt-001
```

Shows:
- Title and description
- Start and end times
- Assigned agents
- Recurrence pattern
- Enabled/disabled status

## Creating Events (Owner Only)

```bash
termlings calendar create <agent-id> [<agent-id>...] "<title>" "<start-iso>" "<end-iso>" [recurrence]
```

Parameters:
- `<agent-id>` - One or more agent IDs (must start with `tl-`)
- `<title>` - Event name
- `<start-iso>` - ISO 8601 format: `2026-03-02T09:00:00Z`
- `<end-iso>` - ISO 8601 format: `2026-03-02T09:30:00Z`
- `[recurrence]` - Optional: `none` (default), `hourly`, `daily`, `weekly`, `monthly`

### Examples

Single agent, one-time event:
```bash
termlings calendar create tl-alice "Project Kickoff" "2026-03-03T10:00:00Z" "2026-03-03T11:00:00Z"
```

Multiple agents, recurring:
```bash
termlings calendar create tl-alice tl-bob tl-charlie "Daily Standup" "2026-03-02T09:00:00Z" "2026-03-02T09:30:00Z" daily
```

All-day event:
```bash
termlings calendar create tl-alice "Company Retreat" "2026-04-15T00:00:00Z" "2026-04-16T00:00:00Z" weekly
```

## Editing Events (Owner Only)

```bash
termlings calendar edit <event-id> [--title NEW] [--description DESC] [--recurrence PATTERN] [--agents AGENT1 AGENT2...]
```

Examples:
```bash
# Change title
termlings calendar edit evt-001 --title "Team Standup (moved)"

# Change recurrence
termlings calendar edit evt-001 --recurrence weekly

# Update agents
termlings calendar edit evt-001 --agents tl-alice tl-bob

# Multiple changes at once
termlings calendar edit evt-001 --title "Updated Title" --recurrence monthly --agents tl-charlie
```

## Managing Events

### Disable (keep history)
```bash
termlings calendar disable evt-001
# Event won't trigger notifications but remains in history
```

### Enable (reactivate)
```bash
termlings calendar enable evt-001
# Reactivate a disabled event
```

### Delete (remove permanently)
```bash
termlings calendar delete evt-001
# Removes event entirely (can't be undone)
```

Best practice: Use `disable` instead of `delete` to preserve history.

## Event Notifications

When an event starts, assigned agents receive a direct message:

```
New event: "Daily Standup"
Start: 2026-03-02 09:00 UTC
End: 2026-03-02 09:30 UTC
```

Agents see this in:
- Web UI message stream
- `termlings list-agents` (recent activity)

## Recurrence Patterns

- `none` - One-time event (default)
- `hourly` - Every hour
- `daily` - Every 24 hours
- `weekly` - Every 7 days
- `monthly` - Every 30 days

## Best Practices

✅ **DO:**
- Use ISO 8601 format: `YYYY-MM-DDTHH:MM:SSZ`
- Create recurring events for regular meetings
- Assign all relevant team members
- Test with `calendar show <id>` before events start
- Use `disable` instead of `delete` to keep history

❌ **DON'T:**
- Create overlapping all-day events
- Forget to assign agents who should attend
- Leave old events enabled if no longer needed

## Use Cases

**Daily Standup:**
```bash
termlings calendar create tl-alice tl-bob tl-charlie "Standup" "2026-03-02T09:00:00Z" "2026-03-02T09:30:00Z" daily
```

**Sprint Planning:**
```bash
termlings calendar create tl-alice tl-bob tl-charlie "Sprint Planning" "2026-03-03T14:00:00Z" "2026-03-03T16:00:00Z"
```

**Weekly Retro:**
```bash
termlings calendar create tl-alice tl-bob "Team Retrospective" "2026-03-07T15:00:00Z" "2026-03-07T16:00:00Z" weekly
```

**Deadlines:**
```bash
termlings calendar create tl-alice "Feature launch deadline" "2026-03-10T23:59:00Z" "2026-03-11T00:00:00Z"
```

## Storage

Calendar data is stored in `.termlings/store/calendar/calendar.json` (JSON format).

Each event includes:
- ID, title, description
- Start/end times (milliseconds since epoch)
- Assigned agents
- Recurrence pattern
- Enabled status

## Related

- [MESSAGING.md](MESSAGING.md) - How agents receive event notifications
- [AGENTS.md](AGENTS.md) - Agent identity and reporting lines

## Disable This Feature

Disable `calendar` for all agents in `.termlings/workspace.json`:

```json
{
  "features": {
    "defaults": {
      "calendar": false
    }
  }
}
```

You can override that for a specific agent under `features.agents.<slug>`. See [FEATURES.md](FEATURES.md).
