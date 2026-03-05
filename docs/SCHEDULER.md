# Scheduler

The scheduler automatically executes:
- due calendar notifications
- due/overdue task reminders (for tasks with `dueDate`)

## Running the Scheduler

### Manual execution
```bash
termlings scheduler
```

Checks for due work once and exits.

### Daemon mode (background)
```bash
termlings scheduler --daemon
```

Runs continuously in the background, checking every 60 seconds for due work.

## How It Works

1. **Checks calendar events** - Reads `.termlings/store/calendar/calendar.json`
2. **Checks task due dates** - Reads `.termlings/store/tasks/tasks.json` and tracks reminder state in `.termlings/store/tasks/scheduler-state.json`
3. **Executes due items** - Sends event notifications and task reminders
4. **Marks completed work** - Calendar marks notifications

## Calendar Agent Notification

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

If you launch the workspace with `termlings`, the scheduler daemon is auto-started for you.

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

4. **Task reminders are checked**
   - For tasks with `dueDate`, scheduler sends:
   - One upcoming reminder in the 24h pre-due window
   - One due-now reminder when due time is reached
   - Overdue reminders every 24h while task remains incomplete
   - Target is task assignee (`agent:<slug>`) when assigned, otherwise task creator

## Configuration

Currently the scheduler checks every 60 seconds (hard-coded). To change, edit the scheduler code:

```
src/commands/scheduler.ts
```

## Best Practices

✅ **DO:**
- Run scheduler daemon during work sessions
- Use recurring events for regular meetings
- Test calendar creation before relying on scheduler
- Use `dueDate` on tasks that need time-based reminders

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

5. Verify due task metadata:
   - Task must include a valid `dueDate` timestamp
   - Task status must not be `completed`

**"Getting duplicate notifications"**

This shouldn't happen - notifications are tracked. If it does, check that `.termlings/store/calendar/calendar.json` hasn't been corrupted.

## Related

- [CALENDAR.md](CALENDAR.md) - Calendar event management
- [MESSAGING.md](MESSAGING.md) - How notifications are sent
