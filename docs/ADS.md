# Ads

`ads` is a file-based Termlings app for ad campaign sync, creative inventory, and local performance reporting.

V1 is Meta first and read-only, covering Facebook and Instagram ads under one provider.

It syncs normalized snapshots into:

```text
.termlings/store/ads/
  providers.json
  campaigns/*.json
  creatives/*.json
  metrics/daily.jsonl
  metrics/<window>-campaigns.json
  reports/*.json
  sync-state.json
```

## Canonical API

Inspect the contract first:

```bash
termlings ads schema
termlings ads schema sync
```

Read actions use `--params` and `--json`:

```bash
termlings ads accounts --json
termlings ads sync --params '{"last":"30d"}' --json
termlings ads campaigns --params '{"status":"active","limit":25}' --json
termlings ads creatives --params '{"status":"all","limit":25}' --json
termlings ads metrics --params '{"last":"30d"}' --json
termlings ads report --params '{"last":"30d"}' --json
```

Recurring sync schedules use JSON too:

```bash
printf '%s\n' '{"action":"sync","recurrence":"weekly","time":"09:00","weekday":"mon","last":"7d"}' \
  | termlings ads schedule create --stdin-json --json

termlings ads schedule list --json
termlings ads schedule remove --params '{"id":"ads_schedule_abc123"}' --json
```

## Config

Add these to `.termlings/.env`:

```bash
META_ADS_ACCESS_TOKEN=your_meta_marketing_api_token
META_AD_ACCOUNT_ID=1234567890
META_ADS_ACCOUNT_NAME="Main Meta Ads Account"
META_ADS_SITE=termlings.com
META_ADS_API_VERSION=v24.0
```

Agents should request these through `requests`:

```bash
termlings request env META_ADS_ACCESS_TOKEN "Needed for ads sync" --scope termlings
termlings request env META_AD_ACCOUNT_ID "Needed for ads sync" --scope termlings
```

## Notes

- `sync` fetches account metadata, campaigns, ad/creative inventory, and campaign-level performance snapshots.
- `campaigns` and `creatives` read from local files.
- `metrics` shows the latest local metrics snapshot for the requested window.
- `report` reads the latest generated ads report for the requested window.
- `schedule create` registers recurring ads syncs in the shared scheduler.
- Ads emits shared app activity like `ads.sync.completed` and `ads.sync.failed`.

## Disable This App

Disable it for the whole workspace in `.termlings/workspace.json`:

```json
{
  "apps": {
    "defaults": {
      "ads": false
    }
  }
}
```

Per-agent access is narrowed in `.termlings/agents/<slug>/SOUL.md` with the `apps:` allowlist. See [APPS.md](APPS.md).
