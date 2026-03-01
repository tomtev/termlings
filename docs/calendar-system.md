# Calendar System

The calendar system allows you to schedule events and send notifications to agents on a recurring or one-time basis. Each calendar event can be assigned to multiple agents and will send them direct message notifications when the event occurs.

## Key Concepts

- **Calendar Event**: A scheduled notification with a title, description, start/end times, and assigned agents
- **Recurrence**: How often an event repeats (one-time, hourly, daily, weekly, monthly)
- **Assigned Agents**: Multiple agents can be assigned to a single event
- **Notifications**: When an event is due, all assigned agents receive a direct message

## Creating Calendar Events

### Basic event creation

```bash
# Create a one-time event
termlings calendar create tl-alice "Team Meeting" "2026-03-01T14:00:00Z" "2026-03-01T15:00:00Z"

# Create a recurring daily event
termlings calendar create tl-alice "Daily Standup" "2026-03-01T09:00:00Z" "2026-03-01T09:30:00Z" daily

# Assign to multiple agents
termlings calendar create tl-alice tl-bob tl-carol "Planning Session" "2026-03-01T10:00:00Z" "2026-03-01T11:30:00Z" weekly
```

### Recurrence options

- `none` - One-time event (default)
- `hourly` - Every hour
- `daily` - Every 24 hours
- `weekly` - Every 7 days
- `monthly` - Every 30 days

### Examples

```bash
# Morning standup - daily at 9 AM
termlings calendar create tl-team "Morning Standup" "2026-03-01T09:00:00Z" "2026-03-01T09:30:00Z" daily

# Weekly planning - every Monday at 10 AM
termlings calendar create tl-alice tl-bob "Weekly Planning" "2026-03-01T10:00:00Z" "2026-03-01T11:30:00Z" weekly

# One-off deadline reminder
termlings calendar create tl-dev "Project Deadline" "2026-03-15T17:00:00Z" "2026-03-15T17:00:00Z"

# Hourly data sync check
termlings calendar create tl-worker "Check for Updates" "2026-03-01T00:00:00Z" "2026-03-01T00:10:00Z" hourly
```

## Managing Calendar Events

### List all calendar events

```bash
termlings calendar list
```

This shows all calendar events with their titles, assigned agents, and next notification time.

### List events for a specific agent

```bash
termlings calendar list --agent tl-alice
```

### View event details

```bash
termlings calendar show <event-id>
```

Shows full details including:
- Title and description
- Assigned agents
- Start and end times
- Recurrence pattern
- Next notification time
- Last notification time

### Edit a calendar event

```bash
# Change the title
termlings calendar edit <event-id> --title "New Title"

# Change the description
termlings calendar edit <event-id> --description "New description"

# Change the recurrence
termlings calendar edit <event-id> --recurrence weekly

# Change assigned agents
termlings calendar edit <event-id> --agents tl-alice tl-bob tl-carol
```

### Enable/disable an event

```bash
# Disable an event (won't send notifications)
termlings calendar disable <event-id>

# Re-enable a disabled event
termlings calendar enable <event-id>
```

### Delete a calendar event

```bash
termlings calendar delete <event-id>
```

## Agent Perspective

Agents can see their assigned calendar events:

```bash
termlings calendar list
```

Shows all events assigned to the current agent with next notification times.

View details of a specific event:

```bash
termlings calendar show <event-id>
```

## Running the Scheduler

The scheduler checks for due events and sends notifications to assigned agents.

### Single check

```bash
termlings scheduler
```

Checks all calendar events once and sends any due notifications.

### Background daemon

```bash
termlings scheduler --daemon
```

Runs continuously in the background, checking every 60 seconds for due events. Press Ctrl+C to stop.

**Tip**: Run the scheduler in a dedicated terminal while agents are working:

```bash
# Terminal 1: Run the sim
termlings

# Terminal 2: Run an agent
termlings claude

# Terminal 3: Run the scheduler
termlings scheduler --daemon
```

## Message Format

When a calendar event is due, agents receive a message in this format:

```
[CALENDAR] Event Title: Description
```

The message appears in the agent's message inbox and they can view their calendar events with `termlings calendar list`.

## Common Patterns

### Daily team standup at 9 AM

```bash
termlings calendar create tl-alice tl-bob tl-carol "Daily Standup" "2026-03-01T09:00:00Z" "2026-03-01T09:30:00Z" daily
```

**Run in background**:
```bash
termlings scheduler --daemon  # In a dedicated terminal
```

Agents will receive a notification at 9 AM UTC each day.

### Weekly project review

```bash
termlings calendar create tl-pm tl-lead "Weekly Review" "2026-03-03T14:00:00Z" "2026-03-03T15:30:00Z" weekly
```

Notifies both agents every 7 days starting from the given start time.

### Hourly data sync check

```bash
termlings calendar create tl-worker "Sync Check" "2026-03-01T00:00:00Z" "2026-03-01T00:05:00Z" hourly
```

The agent will be notified every hour starting from midnight UTC.

### One-time project deadline

```bash
termlings calendar create tl-dev "Final Deadline" "2026-03-15T17:00:00Z" "2026-03-15T17:00:00Z"
```

Notifies the agent once at the specified time, then stops.

## Tips

- **Use ISO timestamps**: Calendar events expect ISO 8601 format (e.g., `2026-03-01T09:00:00Z`)
- **Keep scheduler running**: For recurring events to work, keep `termlings scheduler --daemon` running
- **Multiple agents**: A single event can notify many agents at once — great for team coordination
- **Flexible descriptions**: Add context to event descriptions so agents understand what to do
- **Edit instead of recreate**: Use `calendar edit` to adjust events instead of deleting and creating new ones
- **Check timezone**: Make sure start/end times are in the timezone you expect (typically UTC)

## Limitations

- Times are currently treated as UTC
- Recurrence is simple (every 30 days for "monthly", not calendar-aware)
- No day-of-week selection for weekly events
- Descriptions are optional text fields (no markdown/formatting)

## Migration from Cron

If you previously used the cron system, you can migrate to calendar events:

Old cron way:
```bash
termlings cron create tl-alice "daily@9" "Run morning tasks"
```

New calendar way:
```bash
termlings calendar create tl-alice "Morning Tasks" "2026-03-01T09:00:00Z" "2026-03-01T09:30:00Z" daily
```

Benefits of calendar:
- ✅ Multiple agents per event
- ✅ Explicit start/end times
- ✅ Clearer event structure
- ✅ Better for team coordination
