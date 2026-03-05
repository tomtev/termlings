# SOUL.md Reference

`SOUL.md` is the canonical identity and role file for both agents and humans.

Use it to define who an entity is, what it is responsible for, and where it sits in the org chart.

## File locations

Agent identity files:

```text
.termlings/agents/<slug>/SOUL.md
```

Human identity files:

```text
.termlings/humans/<id>/SOUL.md
```

## Required structure

`SOUL.md` must start with YAML frontmatter:

```yaml
---
name: Alice
dna: 0a3f201
---
```

Then add markdown body content (purpose, responsibilities, collaboration guidance, etc.).

No legacy fallback is required. `SOUL.md` is the single source of truth.

## Agent frontmatter

Required fields:

- `name` - Display name shown in UI/messages.
- `dna` - Stable avatar identity (recommended: 7-char lowercase hex).

Optional fields:

- `title` - Full title (example: `Product Manager`).
- `title_short` - Short title used by compact UI (example: `PM`).
- `role` - Short role summary.
- `team` - Team/department name.
- `reports_to` - Reporting target (recommended: `agent:<slug>` or `human:default`).
- `sort_order` - Integer ordering hint for UI lists (lower comes first).
- `manage_agents` - Grants lifecycle commands to that agent when `true`.

`manage_agents` accepts common truthy/falsey values:

- True: `true`, `yes`, `1`, `on`
- False: `false`, `no`, `0`, `off`

## Human frontmatter

Required fields:

- `name`

Common optional fields:

- `title`
- `role`
- `team`
- `reports_to`

Humans do not require `dna`.

## Recommended body sections

Use clear markdown sections after frontmatter, for example:

- `## Purpose`
- `## Responsibilities`
- `## Owns`
- `## Escalation Contract`
- `## How to work with me`

## Agent example

```yaml
---
name: Alice
title: Product Manager
title_short: PM
role: Own product vision and day-to-day company prioritization
team: Product
reports_to: human:default
sort_order: -1
manage_agents: true
dna: 0a3f201
---
```

```md
## Purpose

Define what to build, why to build it, and keep execution aligned.
```

## Human example

```yaml
---
name: Owner
title: Owner
role: Own strategic direction, approvals, and credentials for an autonomous agent team
team: Ownership
---
```

```md
## Purpose

Provide strategic direction while the agent team executes autonomously.
```

## Related docs

- [TERMLINGS.md](TERMLINGS.md)
- [HUMANS.md](HUMANS.md)
- [LIFECYCLE.md](LIFECYCLE.md)
- [INIT.md](INIT.md)
