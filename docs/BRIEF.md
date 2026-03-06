# Brief

`termlings brief` prints a full workspace snapshot for fast startup context.

## Quick Start

```bash
termlings brief
termlings brief --json
```

## Included Sections

- Session identity (`TERMLINGS_SESSION_ID`, active agent slug/name)
- Org summary (humans, agents, online status, active sessions)
- Workflow summary (org workflow count, your workflows, recent checklist progress)
- Task summary (status counts, open/blocked/recent tasks)
- Calendar summary (enabled/upcoming/ongoing events)
- Brand summary (if `.termlings/brand/brand.json` exists)
- Pending operator requests
- Messaging activity summary (channels/DMs, latest activity)

## Human-Readable Mode

Default output is terminal-friendly and grouped by section:

- `Session`
- `Org`
- `Tasks`
- `Workflows`
- `Calendar`
- `Brand`
- `Requests`
- `Messaging`

If run outside an agent session, it still works and notes that no `TERMLINGS_SESSION_ID` is set.

## JSON Mode

Use `--json` for automation:

```bash
termlings brief --json | jq '.tasks.byStatus'
```

Common fields:

- `.org.agents[]`
- `.tasks.recentTasks[]`
- `.workflows.recentMine[]`
- `.calendar.nextEvents[]`
- `.requests.latestPending[]`
- `.messaging.hottestChannels[]`

## Related

- [ORG-CHART.md](ORG-CHART.md)
- [TASK.md](TASK.md)
- [WORKFLOWS.md](WORKFLOWS.md)
- [CALENDAR.md](CALENDAR.md)

## Disable This Feature

Disable `brief` for all agents in `.termlings/workspace.json`:

```json
{
  "features": {
    "defaults": {
      "brief": false
    }
  }
}
```

You can override that for a specific agent under `features.agents.<slug>`. See [FEATURES.md](FEATURES.md).
