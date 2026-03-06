# CRM

`termlings crm` is a simple file-based CRM for external relationship memory.

It stores:
- one JSON file per record
- one JSONL timeline per record
- directional links between records
- one optional next action on each record

The command is intentionally narrow so it can expand later without changing the storage model.

## Storage Layout

```text
.termlings/
  store/
    crm/
      records/
        org/
          acme.json
        person/
          jane-doe.json
      activity/
        org/
          acme.jsonl
        person/
          jane-doe.jsonl
```

Records use a strict envelope plus flexible `attrs`:

```json
{
  "ref": "org/acme",
  "type": "org",
  "slug": "acme",
  "name": "Acme",
  "owner": "agent:growth",
  "status": "active",
  "stage": "lead",
  "tags": ["warm", "b2b"],
  "attrs": {
    "domain": "acme.com"
  },
  "links": [
    { "rel": "has-contact", "to": "person/jane-doe" }
  ],
  "next": {
    "at": 1773100800000,
    "text": "Send pricing",
    "owner": "agent:growth"
  },
  "createdAt": 1772780000000,
  "updatedAt": 1772800000000,
  "lastActivityAt": 1772800000000,
  "version": 3
}
```

## Commands

```bash
termlings crm create <type> <name>
termlings crm list
termlings crm show <ref>
termlings crm set <ref> <path> <value>
termlings crm unset <ref> <path>
termlings crm note <ref> <text...>
termlings crm link <from> <rel> <to>
termlings crm followup <ref> <when|clear> [text...]
termlings crm timeline <ref>
termlings crm archive <ref>
termlings crm restore <ref>
```

Useful flags:

```bash
--type <type>
--owner <target>
--status <status>
--stage <stage>
--tags a,b,c
--query <text>
--attrs '{"domain":"acme.com"}'
--due
--archived
--all
--limit <n>
--json
```

## Examples

```bash
termlings crm create org "Acme" --owner agent:growth --stage lead --tags warm,b2b
termlings crm set org/acme attrs.domain acme.com
termlings crm note org/acme "Warm intro from Nora"
termlings crm link person/jane-doe works_at org/acme
termlings crm followup org/acme 2026-03-10 "Send pricing"
termlings crm list --type org --stage lead --due
```

## Mutable Paths

Supported `set` / `unset` paths:

```text
name
owner
status
stage
tags
attrs
attrs.*
next
next.at
next.text
next.owner
```

Immutable fields:
- `ref`
- `type`
- `slug`
- `links`
- `createdAt`
- `createdBy`
- `updatedAt`
- `lastActivityAt`
- `version`

## Design Rules

- Do not create separate storage systems for leads, contacts, and accounts.
- Use `type` as an open field and keep custom fields in `attrs`.
- Treat the activity timeline as append-only.
- Use existing `task`, `calendar`, and `message` commands for execution workflows instead of rebuilding them inside CRM.

## Disable This Feature

Disable `crm` for all agents in `.termlings/workspace.json`:

```json
{
  "features": {
    "defaults": {
      "crm": false
    }
  }
}
```

You can override that for a specific agent under `features.agents.<slug>`. See [FEATURES.md](FEATURES.md).
