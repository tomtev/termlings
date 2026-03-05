# Organizations

Termlings models your workspace as a file-backed organization chart of humans and agents.

## What an organization is

An organization in Termlings is:

- A set of humans (`.termlings/humans/*/SOUL.md`)
- A set of agents (`.termlings/agents/*/SOUL.md`)
- Reporting links between them
- Live online/offline state from `.termlings/sessions/*.json`

The model is local-first and deterministic: edit files, then inspect with CLI.

## How connections are defined

### Canonical field: `reports_to`

Reporting relationships are defined in SOUL frontmatter with `reports_to`.

Supported targets:

- `human:default`
- `agent:<slug>`

Example:

```yaml
---
name: Clover
title: Developer
reports_to: agent:pm
---
```

### About "responds_to"

If you think in terms of `responds_to`, that is the **behavioral meaning** of the reporting chain (who receives your updates and blockers).

In files and CLI, use **`reports_to`** as the canonical key.

## Example team structure

```text
Founder (human:default)
└── PM (agent:pm)
    ├── Designer (agent:designer)
    ├── Developer (agent:developer)
    ├── Growth (agent:growth)
    └── Support (agent:support)
```

## CLI commands

### Inspect the organization

```bash
termlings org-chart
termlings org-chart --json
termlings brief
```

### Create agents in the right reporting chain

```bash
termlings create qa --name "QA" --title "QA Engineer" --reports-to agent:pm
```

### Update reporting lines

```bash
termlings agents edit developer --reports-to agent:pm
termlings agents edit pm --reports-to human:default
```

For humans, edit `.termlings/humans/<id>/SOUL.md` directly.

## Reporting behavior (responds-to chain)

Agents should route operational updates through their manager from `termlings org-chart`.

Typical flow:

```bash
termlings message agent:pm "Starting task-42"
termlings message agent:pm "50% complete; blocker on API auth"
termlings message human:default "Need credentials to unblock task-42"
```

This keeps status updates structured and visible across the chain of command.

## Verification checklist

After edits:

```bash
termlings org-chart
termlings org-chart --json | jq '.edges'
```

Confirm:

- Every agent points to the intended manager (`reports_to`)
- Roots are intentional (usually `human:default`)
- Manager spans look correct (direct reports)

## Related docs

- [AGENTS.md](AGENTS.md)
- [ORG-CHART.md](ORG-CHART.md)
- [HUMANS.md](HUMANS.md)
- [AGENTS.md](AGENTS.md)
