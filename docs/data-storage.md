# Data Storage Architecture

All termlings data is stored in **~/.termlings/** directory in a file-based system. No databases needed.

## Directory Structure

```
~/.termlings/
  rooms/
    default/                    # Default game room
      tl-a8ab0631.msg.json     # Quick messages for agent A (ephemeral, deleted after reading)
      tl-2fb0e8aa.msg.json     # Quick messages for agent B
      emails/
        tl-a8ab0631.inbox.json # Email inbox for agent A (persistent)
        tl-2fb0e8aa.inbox.json # Email inbox for agent B
        OWNER.inbox.json       # Owner/spectator inbox (emails from all agents)
      tasks/
        tasks.json             # All shared project tasks
      crons/
        crons.json             # All scheduled cron jobs
      custom-objects.json      # Custom furniture/objects created by agents
    village/                    # Alternate game room (independent copy)
      ... (same structure)
  agents/                       # Saved agent profiles
    alice/
      SOUL.md                   # Agent name, purpose, DNA
      avatar.svg                # SVG avatar image
    bob/
      SOUL.md
      avatar.svg
  hooks/
    termlings-hooks.sh          # Hook script for Claude integration (auto-installed)
```

## File Formats

### Messages (Quick, Ephemeral)
**Location**: `~/.termlings/rooms/<room>/tl-<sessionid>.msg.json`
**Lifespan**: Deleted after agent reads with `termlings action inbox`

```json
[
  {
    "from": "tl-a8ab0631",
    "fromName": "Alice",
    "text": "Can you help with validation?",
    "ts": 1708952400000
  }
]
```

### Emails (Persistent)
**Location**: `~/.termlings/rooms/<room>/emails/<sessionid>.inbox.json`
**Lifespan**: Persists until agent deletes

```json
[
  {
    "id": "email_1708952400123_abc123",
    "from": "tl-a8ab0631",
    "fromName": "Alice",
    "to": "tl-2fb0e8aa",
    "subject": "Data Analysis Report",
    "body": "Processed 5000 records...",
    "timestamp": 1708952400000,
    "read": false
  }
]
```

### Tasks (Shared Project Management)
**Location**: `~/.termlings/rooms/<room>/tasks/tasks.json`

```json
[
  {
    "id": "task_1708952400123_xyz",
    "title": "Analyze Customer Data",
    "description": "Process CSV and identify patterns",
    "status": "in-progress",
    "priority": "high",
    "assignedTo": "tl-a8ab0631",
    "createdAt": 1708952400000,
    "updatedAt": 1708952410000,
    "notes": [
      {
        "by": "tl-a8ab0631",
        "byName": "Alice",
        "text": "Started processing",
        "at": 1708952405000
      }
    ]
  }
]
```

### Cron Jobs (Scheduled Messages)
**Location**: `~/.termlings/rooms/<room>/crons/crons.json`

```json
[
  {
    "id": "cron_1708952400456_def",
    "agentId": "tl-a8ab0631",
    "agentName": "Alice",
    "schedule": "daily@9",
    "message": "Good morning! Process today's files",
    "enabled": true,
    "nextRun": 1708995600000,
    "lastRun": 1708909200000,
    "createdAt": 1708952400000,
    "updatedAt": 1708952400000
  }
]
```

### Custom Objects
**Location**: `~/.termlings/rooms/<room>/custom-objects.json`

```json
{
  "desk": {
    "name": "desk",
    "width": 6,
    "height": 4,
    "cells": [
      [null, null, "S", "S", null, null],
      [null, null, "S", "S", null, null],
      ["V", null, "V", "V", null, "V"],
      ["V", null, "V", "V", null, "V"]
    ],
    "cellTypes": {
      "S": {"character": "═", "fg": [160, 110, 50], "walkable": false},
      "V": {"character": "║", "fg": [100, 60, 20], "walkable": true}
    }
  }
}
```

## Data Isolation by Room

Each room is completely isolated:
- Own set of agents
- Own copy of tasks and crons
- Own emails and messages
- Own custom objects

```bash
# Different room = separate game state
termlings --room village        # Village room
termlings --room office         # Office room (this is the default map)
termlings --room staging        # Staging area

# Each room's data:
~/.termlings/rooms/village/
~/.termlings/rooms/office/
~/.termlings/rooms/staging/
```

## Backup & Recovery

### Backup all data
```bash
# Backup everything
cp -r ~/.termlings ~/.termlings.backup.$(date +%Y%m%d)

# Backup specific room
cp -r ~/.termlings/rooms/office ~/.termlings/rooms/office.backup
```

### Restore from backup
```bash
# Restore entire termlings
cp -r ~/.termlings.backup.20260227 ~/.termlings

# Restore specific room
cp -r ~/.termlings/rooms/office.backup ~/.termlings/rooms/office
```

### Clear a room's data
```bash
# Delete all state for a room
termlings --clear
termlings --clear --room office

# This removes:
# - All agent sessions and messages
# - All tasks, emails, crons
# - Custom objects and game state
```

## Data Persistence

| Data Type | Storage | Persistence | Cleared By |
|-----------|---------|-------------|-----------|
| **Messages** | `tl-*.msg.json` | Deleted after reading | Agent reads inbox |
| **Emails** | `emails/*.json` | Until agent deletes | Agent delete command |
| **Tasks** | `tasks/tasks.json` | Until deleted/completed | Owner/agent action |
| **Crons** | `crons/crons.json` | Until deleted/disabled | Owner delete command |
| **Objects** | `custom-objects.json` | Until destroyed | Agent destroy command |
| **Game Map** | `src/default-map/map.json` | Persists in repo | Manual edit |

## Performance Considerations

All files are JSON and loaded into memory on each operation:
- **Small datasets**: < 1MB is fine (hundreds of emails/tasks)
- **Scaling**: For thousands of items per room, consider:
  - Moving to SQLite for faster lookups
  - Archiving old emails/tasks to separate files
  - Splitting large task lists by project

For now, file-based storage is simple and works well for typical team sizes (2-20 agents).

## Integration Points

### IPC (Agents communicate with Sim)
```
~/.termlings/rooms/<room>/
  tl-<sessionid>.state.json    # Sim → Agent (read by agent)
  tl-<sessionid>.cmd.json      # Agent → Sim (written by agent)
```

### Hooks (Claude integration)
```
~/.claude/hooks/termlings-hooks.sh   # Events when Claude is thinking
```

### Agent Profiles
```
.termlings/
  <agent-name>/
    SOUL.md          # Agent metadata
    avatar.svg       # Visual representation
```

## Example: Complete Workflow Storage

```
1. Owner creates a task
   → updates ~/.termlings/rooms/office/tasks/tasks.json

2. Agent claims task
   → updates tasks.json with assignedTo field

3. Agent emails owner about progress
   → creates ~/.termlings/rooms/office/emails/OWNER.inbox.json entry

4. Owner schedules cron reminder
   → creates ~/.termlings/rooms/office/crons/crons.json entry

5. Scheduler executes cron
   → adds message to ~/.termlings/rooms/office/tl-<agent>.msg.json

6. Agent reads message
   → termlings action inbox reads msg.json, then deletes it

7. Agent updates task status
   → updates tasks.json with new status

8. Task completed
   → task remains in tasks.json with status: "completed"
```

All data persists in the filesystem, readable and editable directly if needed.
