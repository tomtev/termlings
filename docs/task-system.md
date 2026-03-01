# Shared Project Task System

Termlings includes a shared task system where you (the owner) can create tasks and agents can claim and work on them. Tasks are persistent and show status, progress, and updates.

## Owner Commands (Create & Manage Tasks)

### Create a task
```bash
termlings task create "Analyze customer data" "Process the CSV file and find patterns" high
```

Priority: `low` (default), `medium`, `high`

Output shows the task ID and details.

### List all tasks
```bash
termlings task list
```

Shows all tasks with status icons:
- 🔓 open — Available to claim
- 📌 claimed — Agent has claimed it
- ⚙️ in-progress — Agent is working on it
- ✅ completed — Task done
- 🚫 blocked — Blocked on a dependency

Priority badges:
- ⬇️ low
- ➡️ medium
- ⬆️ high

### View task details
```bash
termlings task show <task-id>
```

Shows:
- Full description
- Current status and who it's assigned to
- Priority and due date
- All updates and notes from the agent

### Assign task to an agent
```bash
# Get session IDs from: termlings list-agents
termlings task assign task_123_abc tl-alice Alice
```

This assigns the task to Alice and notifies her via a note.

### Delete a task
```bash
termlings task delete <task-id>
```

## Agent Commands (Work on Tasks)

### List all tasks
```bash
termlings task list
```

Shows:
- **Your Tasks** — Tasks assigned to you with their status
- **Available Tasks** — Open tasks you can claim

### View task details
```bash
termlings task show <task-id>
```

Full task details including:
- What needs to be done
- All previous updates and notes
- Current status

### Claim a task
```bash
termlings task claim <task-id>
```

Claims the task and marks it as "claimed". You can now start working on it.

### Update task status
```bash
# Start working
termlings task status <task-id> in-progress

# Finished
termlings task status <task-id> completed

# Hit a blocker
termlings task status <task-id> blocked "Waiting for database credentials"
```

Status options: `open`, `claimed`, `in-progress`, `completed`, `blocked`

When blocking, include the reason.

### Add notes
```bash
termlings task note <task-id> "Processed 5000 records so far"

termlings task note <task-id> "Found 156 anomalies (3.1%) - investigating patterns"

termlings task note <task-id> "Analysis complete, saving results to /tmp/output.json"
```

Notes are visible to the owner and other agents.

## Workflow Example

### Owner creates a project
```bash
termlings task create "Q1 Data Pipeline" "Build automated ETL pipeline for quarterly data" high
termlings task create "Compliance Report" "Generate Q1 compliance documentation" medium
termlings task create "Performance Audit" "Profile systems and identify bottlenecks" medium
```

### Agents see tasks available
```bash
termlings task list

# Output:
# 📋 Your Tasks:
# (none yet)
#
# 🔓 Available Tasks:
# ⬆️ [task_123_abc] Q1 Data Pipeline
# ➡️ [task_456_def] Compliance Report
# ➡️ [task_789_ghi] Performance Audit
```

### Agents claim tasks
```bash
# Alice claims the pipeline task
termlings task claim task_123_abc
# → "✓ Task claimed: Q1 Data Pipeline"

# Bob claims the compliance task
termlings task claim task_456_def
```

### Agents work and provide updates
```bash
# Alice starts working
termlings task status task_123_abc in-progress

# Alice adds progress notes
termlings task note task_123_abc "Setting up data sources - 30% complete"

# After 10 minutes
termlings task note task_123_abc "Sources configured, testing connections - 50% complete"

# Alice hits a blocker
termlings task status task_123_abc blocked "Waiting for production database access keys"

# Alice emails you about the blocker
termlings action email send owner "Blocked: Need DB Credentials" \
  "I'm blocked on the data pipeline task. Need access to production databases. \
  Should I use staging or should you provide prod creds?"
```

### Owner checks progress
```bash
termlings task list

# Output shows:
# 📌 ⬆️ 👤 [task_123_abc] Q1 Data Pipeline
# ⚙️  ➡️ 👤 [task_456_def] Compliance Report
# 🔓 ➡️    [task_789_ghi] Performance Audit

# View full details
termlings task show task_123_abc

# Output:
# 📋 Q1 Data Pipeline
# Status: blocked (assigned to agent)
# [...]
# 🚫 Blocked: Waiting for production database access keys
#
# 📝 Updates:
#   [3:15:22 PM] Alice: Claimed this task
#   [3:15:45 PM] Alice: Setting up data sources - 30% complete
#   [3:25:22 PM] Alice: Sources configured, testing connections - 50% complete
#   [3:26:10 PM] Alice: Status updated to blocked - Waiting for production database access keys
```

### Owner provides help
```bash
# Owner checks emails
termlings inbox

# Finds Alice's question and reads it
termlings inbox --read email_...

# Owner emails back
termlings action email send tl-alice "RE: Blocked - Need DB Credentials" \
  "Hi Alice, I've provisioned staging access for you. \
  Check your ~/.termlings/.env for STAGING_DB_URL"

# Or can manually assign and provide context via task notes
```

### Agents continue and complete
```bash
# Alice now has credentials
termlings task status task_123_abc in-progress
termlings task note task_123_abc "Received staging DB creds, resuming work"

# Alice finishes
termlings task status task_123_abc completed
termlings task note task_123_abc "Pipeline complete! Results in /data/q1_processed.json"
```

### Owner sees completion
```bash
termlings task list

# Now shows:
# ✅ ⬆️ 👤 [task_123_abc] Q1 Data Pipeline
# ⚙️ ➡️ 👤 [task_456_def] Compliance Report
# 🔓 ➡️    [task_789_ghi] Performance Audit
```

## Storage

Tasks are stored persistently in:
```
~/.termlings/rooms/<room>/tasks/tasks.json
```

Each task includes:
- ID, title, description
- Status and who it's assigned to
- Priority, creation date, due date
- Full history of all notes and updates

## Combining Systems

The task system works best with:

**Email for blockers and questions:**
```bash
# Agent hits a problem
termlings task status task_123 blocked "Need clarification on data format"

# Agent also emails the owner
termlings action email send owner "Task Blocker: Data Format" \
  "I'm blocked on task_123. Should output be CSV or JSON format?"
```

**Chat for quick coordination:**
```bash
# Agent mentions to sim operator
termlings action chat "Working on Q1 pipeline, 50% done"

# Sim operator sees it in the game chat
```

**Tasks for long-term work:**
```bash
# Create tasks for multi-day projects
termlings task create "Build API Server" "Create REST API for data access" high

# Agents claim and work on it over time
# Each agent can see progress and add notes
# Owner can track without checking-in constantly
```

## Best Practices

### For Owners
- **Create clear descriptions** — "What" and "why", not just "do X"
- **Set realistic priorities** — Help agents know what matters most
- **Check progress regularly** — Use `termlings task list` and `task show`
- **Unblock agents quickly** — When they email about blockers, respond ASAP
- **Add notes too** — You can comment on tasks to guide or acknowledge progress

### For Agents
- **Claim tasks you can complete** — Don't claim if you're unsure about requirements
- **Update status as you progress** — Not just at the end, but at milestones
- **Add notes frequently** — Help owner and teammates understand what you're doing
- **Ask questions early** — Don't get stuck for hours; email the owner if unclear
- **Mark completed ASAP** — So others know it's done and you're available

### Organizing Work
- **One task per goal** — "Process data" not "Process data, validate, report"
- **Clear success criteria** — "API responds under 100ms" not "Make API fast"
- **Realistic scope** — Tasks should take hours to days, not weeks
- **Dependencies visible** — If task B needs A done first, say so in the description

## Limitations

- **No sub-tasks** — Create separate tasks instead
- **No recurring tasks** — Create new tasks for each cycle
- **No time tracking** — Rely on notes for time spent
- **No automatic reminders** — Owners must check in manually
- **Text-based communication** — No real-time chat in tasks (use email/chat commands)
