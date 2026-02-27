# Cron Job System

Schedule automated messages to agents. Perfect for recurring tasks like daily reports, hourly checks, or periodic reminders.

## Owner Commands (Create & Manage Cron Jobs)

### Create a cron job
```bash
# Send message every hour
termlings cron create tl-alice hourly "Check for new data and report status"

# Send daily at 9:00 AM
termlings cron create tl-bob "daily@9" "Good morning! Process today's files"

# Send daily at 2:30 PM
termlings cron create tl-carol "daily@14:30" "Run afternoon validation tests"

# Advanced cron expression (minute, hour, * * *)
termlings cron create tl-dave "0 9 * * *" "Daily standup: What's your status?"
```

**Schedule formats:**
- `hourly` — Every hour
- `daily` — Every 24 hours
- `daily@9` or `daily@14:30` — Specific time each day
- `0 9 * * *` — Cron expression (minute hour * * *)

### List all cron jobs
```bash
termlings cron list

# Filter by agent
termlings cron list --agent tl-alice
```

Output shows:
- Enabled/disabled status
- Agent name
- Next scheduled run time
- First 40 characters of the message

### View cron job details
```bash
termlings cron show <cron-id>
```

Shows:
- Agent and schedule
- Next run time
- Last run time
- Full message

### Edit a cron job
```bash
# Change schedule
termlings cron edit <cron-id> --schedule "daily@10"

# Change message
termlings cron edit <cron-id> --message "New task: Process all pending reports"

# Change both
termlings cron edit <cron-id> --schedule "0 18 * * *" --message "End of day: Archive logs"
```

### Enable/disable cron jobs
```bash
# Disable without deleting
termlings cron disable <cron-id>

# Re-enable later
termlings cron enable <cron-id>
```

### Delete a cron job
```bash
termlings cron delete <cron-id>
```

## Running the Cron Scheduler

The scheduler checks for due cron jobs and sends messages to agents. You need to run it periodically:

### One-time check
```bash
# Check and execute any due jobs right now
termlings scheduler
```

### Background daemon (recommended)
```bash
# Keep scheduler running in background
termlings scheduler --daemon

# In another terminal:
termlings  # Start the sim as normal
termlings claude  # Launch agents
# They'll receive scheduled messages automatically
```

### In a real cron job (OS level)
```bash
# Add to your system crontab (crontab -e)
* * * * * /path/to/termlings scheduler

# This runs the scheduler every minute on your OS
# Messages will be delivered to agents when they poll for inbox
```

## How Agents Receive Messages

When a cron job is due:

1. **Scheduler executes** and sends a message to the agent's inbox
2. **Agent polls inbox** with `termlings action inbox`
3. **Agent sees message**: `[Scheduler] [CRON JOB] Your scheduled message here`
4. **Agent acts** on the message (can ask for clarification, complete task, send report, etc.)

### Agent viewing scheduled jobs
```bash
# See all your scheduled cron jobs
termlings action cron list

# View specific cron details
termlings action cron show <cron-id>
```

## Workflow Example

### Setup: Create recurring tasks
```bash
# Alice processes data daily at 9 AM
termlings cron create tl-alice "daily@9" "Good morning! Process yesterday's data and send me a summary by noon"

# Bob validates all results daily at 5 PM
termlings cron create tl-bob "daily@17" "End of day validation: Check all processed files and report any anomalies"

# Carol sends weekly report every Monday at 10 AM
# (For now, schedule daily but message mentions weekly - you can manually skip)
termlings cron create tl-carol "daily@10" "Weekly report: Summarize this week's work"
```

### Start the scheduler in background
```bash
# Terminal 1: Start sim
termlings

# Terminal 2: Run scheduler daemon
termlings scheduler --daemon

# Terminal 3: Launch agents
termlings claude
termlings pi
termlings codex
```

### Agents receive and respond to cron jobs
```
Alice's agent sees in inbox:
[Scheduler] [CRON JOB] Good morning! Process yesterday's data and send me a summary by noon

Alice processes data...
Then responds:
termlings action email send owner "Morning Report" \
  "Processed 5000 records, found 23 anomalies, summary in /reports/daily.json"
```

### Scheduler continues executing
```bash
# Every minute, scheduler checks for due jobs
09:00 ✓ Executed cron for Alice: "Process yesterday's data..."
17:00 ✓ Executed cron for Bob: "End of day validation..."
10:00 ✓ Executed cron for Carol: "Weekly report..."
```

## Real-World Use Cases

### Daily data processing
```bash
termlings cron create tl-data-agent "daily@6" "Process overnight logs and prepare dashboard data"
```

### Hourly monitoring
```bash
termlings cron create tl-monitor "hourly" "Check system health metrics and alert if issues detected"
```

### Weekly reports
```bash
termlings cron create tl-analyst "0 9 * * 1" "Monday morning: Generate weekly analytics report"
```

### Batch processing
```bash
termlings cron create tl-processor "0 23 * * *" "Nightly: Archive logs and clean temporary files"
```

### Reminder messages
```bash
termlings cron create tl-assistant "0 17 * * *" "Daily standup at 5 PM - share your accomplishments and blockers"
```

## Storage & Persistence

Cron jobs are stored in:
```
~/.termlings/rooms/<room>/crons/crons.json
```

Each cron job includes:
- Unique ID and schedule
- Agent ID and name
- Message to send
- Enable/disable status
- Next run time and last run time
- Creation timestamp

Jobs persist across sessions - they'll continue running even if the sim restarts.

## Combining with Other Systems

**Crons + Tasks:**
```bash
# Schedule task creation (owner does this via cron)
termlings cron create tl-alice "daily@9" "Daily standup: claim the 'daily-checklist' task"

# Agent sees the message and claims the task
termlings action task claim <daily-checklist-id>
```

**Crons + Email:**
```bash
# Cron reminds agent to send daily report
termlings cron create tl-alice "daily@17" "Time to send me your end-of-day report"

# Agent gets message and sends email
termlings action email send owner "Daily Report" "Here's today's work..."
```

**Crons + Chat:**
```bash
# Agent receives cron message, posts to chat
# (owner sees it in the game window)
termlings action chat "Morning checklist complete, ready for the day"
```

## Limitations & Notes

- **Granularity**: Scheduler checks once per minute (or as often as you run it)
  - A job scheduled for 9:05 AM might run anytime between 9:05-9:06 depending on when scheduler runs
- **Persistence**: Jobs are stored but scheduler is not persistent
  - You must run `termlings scheduler` or `termlings scheduler --daemon` for jobs to execute
- **One-way**: Jobs send messages to agents, not the reverse
  - For agent-to-owner communication, use email system
- **No confirmation**: Scheduler doesn't track if agent actually saw/acted on message
  - Agent is responsible for responding via task status, email, or chat

## Scheduling Recommendations

**Run scheduler as OS cron job:**
```bash
# crontab -e
* * * * * cd /path/to/termlings && termlings scheduler --room default
```

This runs the scheduler every minute, ensuring cron jobs are executed reliably.

**Or run as background process:**
```bash
# Terminal dedicated to scheduler
termlings scheduler --daemon

# Runs indefinitely, checks every 60 seconds
```

**Best practice:**
- Keep one terminal running the scheduler (foreground or OS cron)
- Keep one terminal running the sim
- Launch agents in additional terminals as needed
- Messages will be delivered to agents when they poll their inbox
