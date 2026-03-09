# Finance

`finance` is a file-based Termlings app for revenue, subscription, invoice, refund, and local finance reporting.

V1 is Stripe first and read-only.

It syncs normalized snapshots into:

```text
.termlings/store/finance/
  providers.json
  customers/*.json
  subscriptions/*.json
  invoices/*.json
  refunds/*.json
  metrics/daily.jsonl
  metrics/mrr.jsonl
  reports/*.json
  sync-state.json
```

## Canonical API

Inspect the contract first:

```bash
termlings finance schema
termlings finance schema sync
```

Read actions use `--params` and `--json`:

```bash
termlings finance accounts --json
termlings finance sync --params '{"last":"30d"}' --json
termlings finance metrics --params '{"last":"30d"}' --json
termlings finance revenue --params '{"last":"12m"}' --json
termlings finance customers --params '{"limit":25}' --json
termlings finance subscriptions --params '{"status":"active","limit":25}' --json
termlings finance invoices --params '{"status":"paid","limit":25}' --json
termlings finance refunds --params '{"limit":25}' --json
termlings finance report --params '{"last":"30d"}' --json
```

Recurring sync schedules use JSON too:

```bash
printf '%s\n' '{"action":"sync","recurrence":"daily","time":"08:00","last":"30d"}' \
  | termlings finance schedule create --stdin-json --json

termlings finance schedule list --json
termlings finance schedule remove --params '{"id":"finance_schedule_abc123"}' --json
```

## Config

Add these to `.termlings/.env`:

```bash
STRIPE_API_KEY=sk_live_or_test_key
STRIPE_ACCOUNT_NAME="Main Stripe Account"
STRIPE_SITE=termlings.com
```

Agents should request these through `requests`:

```bash
termlings request env STRIPE_API_KEY "Needed for finance sync" --scope termlings
termlings request env STRIPE_ACCOUNT_NAME "Optional finance account label" --scope termlings
termlings request env STRIPE_SITE "Optional finance site label" --scope termlings
```

## Notes

- `sync` fetches Stripe customers, subscriptions, invoices, refunds, and writes normalized local snapshots.
- `metrics` reads the latest local metrics snapshot for the requested window.
- `revenue` shows revenue, refunds, and net revenue for the requested window.
- `report` reads the latest generated finance report for the requested window.
- `schedule create` registers recurring finance syncs in the shared scheduler.
- Finance emits shared app activity like `finance.sync.completed` and `finance.sync.failed`.

## Disable This App

Disable it for the whole workspace in `.termlings/workspace.json`:

```json
{
  "apps": {
    "defaults": {
      "finance": false
    }
  }
}
```

Per-agent access is narrowed in `.termlings/agents/<slug>/SOUL.md` with the `apps:` allowlist. See [APPS.md](APPS.md).
