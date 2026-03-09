# Analytics

`analytics` is a file-based Termlings app for website analytics sync and local reporting.

V1 is Google Analytics first and read-only.

It syncs normalized snapshots into:

```text
.termlings/store/analytics/
  properties.json
  traffic/daily.jsonl
  channels/daily.jsonl
  pages/daily.jsonl
  conversions/daily.jsonl
  reports/*.json
  sync-state.json
```

## Canonical API

Inspect the contract first:

```bash
termlings analytics schema
termlings analytics schema sync
```

Read actions use `--params` and `--json`:

```bash
termlings analytics properties --json
termlings analytics sync --params '{"last":"30d"}' --json
termlings analytics traffic --params '{"last":"7d"}' --json
termlings analytics channels --params '{"last":"30d","limit":10}' --json
termlings analytics pages --params '{"last":"30d","limit":10}' --json
termlings analytics conversions --params '{"last":"30d"}' --json
termlings analytics report --params '{"last":"30d"}' --json
```

Recurring sync schedules use JSON too:

```bash
printf '%s\n' '{"action":"sync","recurrence":"daily","time":"07:00","last":"30d"}' \
  | termlings analytics schedule create --stdin-json --json

termlings analytics schedule list --json
termlings analytics schedule remove --params '{"id":"analytics_schedule_abc123"}' --json
```

## Config

Add these to `.termlings/.env`:

```bash
GOOGLE_ANALYTICS_PROPERTY_ID=123456789
GOOGLE_ANALYTICS_CLIENT_EMAIL=analytics-bot@project.iam.gserviceaccount.com
GOOGLE_ANALYTICS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_ANALYTICS_PROPERTY_NAME="Main Website"
GOOGLE_ANALYTICS_SITE=termlings.com
```

The service account must have viewer access to the GA4 property.

Agents should request these through `requests`:

```bash
termlings request env GOOGLE_ANALYTICS_PROPERTY_ID "Needed for analytics sync" --scope termlings
termlings request env GOOGLE_ANALYTICS_CLIENT_EMAIL "Needed for analytics sync" --scope termlings
termlings request env GOOGLE_ANALYTICS_PRIVATE_KEY "Needed for analytics sync" --scope termlings
```

## Notes

- `sync` fetches the selected window and writes normalized local snapshots.
- `traffic`, `channels`, `pages`, and `conversions` read from local files.
- `report` reads the latest generated report for the requested window.
- `schedule create` registers recurring analytics syncs in the shared scheduler.
- Analytics emits shared app activity like `analytics.sync.completed` and `analytics.sync.failed`.

## Disable This App

Disable it for the whole workspace in `.termlings/workspace.json`:

```json
{
  "apps": {
    "defaults": {
      "analytics": false
    }
  }
}
```

Per-agent access is narrowed in `.termlings/agents/<slug>/SOUL.md` with the `apps:` allowlist. See [APPS.md](APPS.md).
