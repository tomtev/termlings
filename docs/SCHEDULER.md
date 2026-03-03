# Task Scheduler

The scheduler automatically notifies agents when calendar events start.

## Running the Scheduler

### Manual execution
```bash
termlings scheduler
```

Checks for due events once and exits.

### Daemon mode (background)
```bash
termlings scheduler --daemon
```

Runs continuously in the background, checking every 60 seconds for due events.

## How It Works

1. **Checks calendar events** - Reads `.termlings/store/calendar/calendar.json`
2. **Finds due events** - Identifies events where start time ≤ now
3. **Sends notifications** - Sends DM to each assigned agent
4. **Marks as notified** - Records that notification was sent (no duplicate notifications)

## Agent Notification

When an event is due, agents receive a message:

```
New event: "Daily Standup"
Start: 2026-03-02 09:00 UTC
End: 2026-03-02 09:30 UTC
```

They see this in:
- Web UI message stream
- `termlings list-agents` (recent activity)

## Setup (Recommended)

Add to your shell initialization file (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
# Start scheduler daemon on shell launch
termlings scheduler --daemon &
```

Or run once at project startup:

```bash
# Start scheduler for this session
termlings scheduler --daemon
```

## Typical Workflow

1. **Owner creates calendar events**
   ```bash
   termlings calendar create tl-alice tl-bob "Daily Standup" "2026-03-02T09:00:00Z" "2026-03-02T09:30:00Z" daily
   ```

2. **Scheduler runs (automatically or daemon)**
   - Checks every 60 seconds
   - Sends notifications when events start

3. **Agents receive notifications**
   - See in workspace TUI
   - Can check calendar for details
   ```bash
   termlings calendar show <event-id>
   ```

## Configuration

Currently the scheduler checks every 60 seconds (hard-coded). To change, edit the scheduler code:

```
src/engine/calendar-scheduler.ts
```

## Best Practices

✅ **DO:**
- Run scheduler daemon during work sessions
- Use recurring events for regular meetings
- Test calendar creation before relying on scheduler

❌ **DON'T:**
- Create event times in the past (won't trigger)
- Rely on exact timing (60-second granularity)
- Leave old events enabled if no longer needed

## Troubleshooting

**"Scheduler not sending notifications"**

1. Check scheduler is running:
   ```bash
   ps aux | grep scheduler
   ```

2. Verify calendar events exist:
   ```bash
   termlings calendar list
   ```

3. Check event times are in the future:
   ```bash
   termlings calendar show <event-id>
   ```

4. Manually trigger check:
   ```bash
   termlings scheduler  # Runs once
   ```

**"Getting duplicate notifications"**

This shouldn't happen - notifications are tracked. If it does, check that `.termlings/store/calendar/calendar.json` hasn't been corrupted.

## Related

- [CALENDAR.md](CALENDAR.md) - Calendar event management
- [MESSAGING.md](MESSAGING.md) - How notifications are sent
