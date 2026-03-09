# Org Chart

View team hierarchy, reporting lines, and online status from `SOUL.md` + active sessions.

## Quick Start

```bash
termlings org-chart
termlings org-chart --json
```

## What It Shows

- Humans from `.termlings/humans/*/SOUL.md`
- Agents from `.termlings/agents/*/SOUL.md`
- Online/offline status from `.termlings/store/sessions/*.json`
- Reporting relationships from `reports_to`
- Direct report counts (`Leads` column)

## Frontmatter Fields Used

Common fields read from `SOUL.md`:

- `name`
- `title`
- `title_short`
- `role`
- `team`
- `reports_to`
- `dna` (agents)

`reports_to` supports:

- `agent:<slug>`
- `human:default`
- common aliases (for example `owner`, `operator`, slug/name/title matches)

## JSON Output

`--json` returns:

- `generatedAt`
- `nodes[]` with `depth`, `directReports`, `isCurrentSession`
- `edges[]` (`from` -> `to`)

Useful for scripting:

```bash
termlings org-chart --json | jq '.nodes[] | {id, reportsTo, online}'
```

## Related

- `AGENTS.md` (repo root)
- [BRIEF.md](BRIEF.md)
- [PRESENCE.md](PRESENCE.md)

## Disable This App

Disable `org-chart` for all agents in `.termlings/workspace.json`:

```json
{
  "apps": {
    "defaults": {
      "org-chart": false
    }
  }
}
```

Per-agent access is narrowed in `.termlings/agents/<slug>/SOUL.md` with the `apps:` allowlist. See [APPS.md](APPS.md).
