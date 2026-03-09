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

## Canonical API

Inspect the contract first:

```bash
termlings crm schema
termlings crm schema create
```

Read actions use `--params` and `--json`:

```bash
termlings crm list --params '{"type":"org","stage":"lead","dueOnly":true,"limit":25}' --json
termlings crm show --params '{"ref":"org/acme"}' --json
termlings crm timeline --params '{"ref":"org/acme","limit":25}' --json
termlings crm archive --params '{"ref":"org/acme"}' --json
termlings crm restore --params '{"ref":"org/acme"}' --json
```

Write actions use `--stdin-json`:

```bash
printf '%s\n' '{"type":"org","name":"Acme","owner":"agent:growth","stage":"lead","tags":["warm","b2b"]}' \
  | termlings crm create --stdin-json --json

printf '%s\n' '{"ref":"org/acme","path":"attrs.domain","value":"acme.com"}' \
  | termlings crm set --stdin-json --json

printf '%s\n' '{"ref":"org/acme","text":"Warm intro from Nora"}' \
  | termlings crm note --stdin-json --json

printf '%s\n' '{"fromRef":"person/jane-doe","rel":"works_at","toRef":"org/acme"}' \
  | termlings crm link --stdin-json --json

printf '%s\n' '{"ref":"org/acme","at":"2026-03-10T09:00:00+01:00","text":"Send pricing","owner":"agent:growth"}' \
  | termlings crm followup --stdin-json --json
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

## Disable This App

Disable `crm` for all agents in `.termlings/workspace.json`:

```json
{
  "apps": {
    "defaults": {
      "crm": false
    }
  }
}
```

Per-agent access is narrowed in `.termlings/agents/<slug>/SOUL.md` with the `apps:` allowlist. See [APPS.md](APPS.md).
