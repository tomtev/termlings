# Scheduler

The scheduler automatically executes:
- due calendar notifications
- one-time and recurring direct messages
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
2. **Checks scheduled messages** - Reads `.termlings/store/message-schedules/schedules.json`
3. **Checks task due dates** - Reads `.termlings/store/tasks/tasks.json` and tracks reminder state in `.termlings/store/tasks/scheduler-state.json`
4. **Executes due items** - Sends event notifications, scheduled DMs, and task reminders
5. **Marks completed work** - Calendar and one-time message schedules mark notifications

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

## Scheduled Message Delivery

Scheduled messages are useful for delayed DMs, recurring check-ins, and lightweight team automation.

In the TUI, type:

```text
/schedule
```

You can also prefill it directly:

```text
/schedule @Jordan Check in on blockers
```

The `/schedule` form supports:
- `To` target selection
- `Message`
- `Recurrence`: one-time (`none` in the UI), `hourly`, `daily`, `weekly`
- `Date` for one-time schedules
- `Weekday` for weekly schedules
- segmented `Time` editing
- searchable `Timezone` selection

When due, the scheduler sends the DM from `Scheduler` to the target thread. Offline agent targets are queued and delivered when that agent comes back online.

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
   - Sends scheduled DMs when their run time arrives

3. **Agents receive notifications**
   - See in workspace TUI
   - Can check calendar for details
   ```bash
   termlings calendar show <event-id>
   ```

4. **Scheduled messages are checked**
   - Scheduled DMs can target `agent:<slug>`, `human:default`, or `@everyone` from the TUI
   - Hourly, daily, and weekly schedules are re-queued automatically after delivery
   - One-time schedules disable themselves after delivery

5. **Task reminders are checked**
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
- Use `/schedule` for one-time follow-ups and recurring operator-driven check-ins
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

3. Verify scheduled DMs exist:
   ```bash
   cat .termlings/store/message-schedules/schedules.json
   ```

4. Check event times are in the future:
   ```bash
   termlings calendar show <event-id>
   ```

5. Manually trigger check:
   ```bash
   termlings scheduler  # Runs once
   ```

6. Verify due task metadata:
   - Task must include a valid `dueDate` timestamp
   - Task status must not be `completed`

**"Getting duplicate notifications"**

This shouldn't happen - notifications are tracked. If it does, check that `.termlings/store/calendar/calendar.json` hasn't been corrupted.

## Related

- [CALENDAR.md](CALENDAR.md) - Calendar event management
- [MESSAGING.md](MESSAGING.md) - How notifications are sent
