# Task Management

Manage shared project tasks with the `task` command.

## Quick Start

```bash
termlings task list              # See all tasks
termlings task claim <id>        # Claim a task
termlings task status <id> in-progress  # Mark as started
termlings task note <id> "done"  # Add progress note
termlings task status <id> completed    # Mark as complete
```

## Viewing Tasks

### List all tasks
```bash
termlings task list
```

Output:
```
ID          Title                           Status      Assigned
task-001    Fix API rate limiting          open        -
task-002    Update database schema         claimed     Alice
task-003    Write documentation            in-progress Bob (50% done)
```

Status values: `open`, `claimed`, `in-progress`, `blocked`, `completed`

### Task details
```bash
termlings task show task-123
```

Shows:
- Full title and description
- Current status
- Assigned agent (if any)
- All progress notes
- Creation date and updates

## Claiming Work

```bash
# Claim a task
termlings task claim task-123

# Start working on it
termlings task status task-123 in-progress

# Notify teammates (optional)
termlings message agent:developer "Starting task-123, will finish in 2 hours"
```

## Tracking Progress

### Add notes frequently
```bash
termlings task note task-123 "Completed data parsing, 30% of analysis done"
termlings task note task-123 "Hit issue with API rate limiting - investigating"
termlings task note task-123 "Resolved rate limiting, resuming analysis"
```

Add notes every 15-30 minutes on longer tasks so teammates know status.

### Update status
```bash
# When blocked
termlings task status task-123 blocked "Waiting for AWS credentials from operator"

# When progressing
termlings task status task-123 in-progress "Making good progress, 70% complete"

# When done
termlings task status task-123 completed "Results saved to /tmp/analysis.json"
```

## Handoff Pattern

When handing off work to a teammate:

```bash
# Agent A (finishing)
termlings task note task-42 "Complete, ready for Bob's review. Key files: /src/api.ts, /tests/"
termlings task status task-42 in-progress "Ready for review"
termlings message agent:bob "task-42 ready for review"

# Agent B (taking over)
termlings task claim task-42
termlings task status task-42 in-progress "Starting review"
termlings task note task-42 "Review in progress. Found 2 issues in error handling"
termlings message agent:alice "Found issues, proposing fixes in PR#123"

# Complete
termlings task status task-42 completed "Reviewed and approved. Merged to main"
```

## Parallel Work

Multiple agents can work on independent tasks:

```bash
# Agent A
termlings task claim task-1
termlings task status task-1 in-progress

# Agent B
termlings task claim task-2
termlings task status task-2 in-progress

# Agent C
termlings task claim task-3
termlings task status task-3 in-progress
```

They coordinate via messages, not task dependencies.

## Best Practices

✅ **DO:**
- Claim tasks before starting
- Add notes every 15-30 minutes
- Update status to reflect reality
- Ask for help when blocked
- Complete tasks when truly done

❌ **DON'T:**
- Claim tasks you won't start immediately
- Leave tasks in `in-progress` without recent notes
- Forget to mark completed tasks as `completed`
- Create long dependency chains (A→B→C→D)

## Task Storage

Tasks are stored in `.termlings/store/tasks/tasks.json` (JSON format).

Each task includes:
- ID, title, description
- Status and assigned agent
- All progress notes (with timestamps)
- Created/updated dates

## Related

- [MESSAGING.md](MESSAGING.md) - Notify teammates about task progress
- [AGENTS.md](AGENTS.md) - Agent identity and reporting lines

## Disable This Feature

Disable `task` for all agents in `.termlings/workspace.json`:

```json
{
  "features": {
    "defaults": {
      "task": false
    }
  }
}
```

You can override that for a specific agent under `features.agents.<slug>`. See [FEATURES.md](FEATURES.md).
