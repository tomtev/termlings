# CMS

`termlings cms` is a file-based content app for collections, entries, draft workflows, scheduled publishes, and local output files.

Everything stays inside the workspace:

```text
.termlings/store/cms/
  collections.json
  entries/
    blog/
    pages/
    docs/
    changelog/
  publish/
    <collection>/<slug>.md
    <collection>/<slug>.json
  history.jsonl
```

## Canonical API

Inspect the contract first:

```bash
termlings cms schema
termlings cms schema create
```

Read actions use `--params` and `--json`:

```bash
termlings cms collections --json
termlings cms list --params '{"collection":"blog","status":"draft","limit":25}' --json
termlings cms show --params '{"id":"entry_abc123"}' --json
termlings cms publish --params '{"id":"entry_abc123"}' --json
termlings cms archive --params '{"id":"entry_abc123"}' --json
termlings cms history --params '{"limit":25}' --json
```

Write actions use `--stdin-json`:

```bash
printf '%s\n' '{"id":"resources","title":"Resources"}' \
  | termlings cms collection-create --stdin-json --json

printf '%s\n' '{"collection":"blog","title":"Launch Week Recap","slug":"launch-week-recap"}' \
  | termlings cms create --stdin-json --json

printf '%s\n' '{"id":"entry_abc123","body":"# Launch Week Recap"}' \
  | termlings cms body --stdin-json --json

printf '%s\n' '{"id":"entry_abc123","key":"seo_title","value":"Launch Week Recap | Termlings"}' \
  | termlings cms field --stdin-json --json

printf '%s\n' '{"id":"entry_abc123","at":"2026-03-10T09:00:00+01:00"}' \
  | termlings cms schedule --stdin-json --json
```

## Built-in Collections

- `blog`
- `pages`
- `docs`
- `changelog`

Add custom collections with `collection-create --stdin-json`.

## Entry Lifecycle

- `draft`
- `scheduled`
- `published`
- `archived`
- `failed`

Scheduled publishes are executed by the shared scheduler:

```bash
termlings scheduler --daemon
```

Or run due publishes once with `termlings cms run-due --json`.

## Published Output

Publishing writes:

- `.termlings/store/cms/publish/<collection>/<slug>.md`
- `.termlings/store/cms/publish/<collection>/<slug>.json`

The markdown file includes a small frontmatter block plus the body content, so it can feed static-site or export workflows later.

## Notes

- `cms` is local-first and provider-free. It does not depend on an external CMS.
- `social` can promote published CMS entries.
- `media` can generate attached assets separately and you can reference them through CMS fields.
- `cms` uses the shared app activity feed for create/update/schedule/publish events.

## Disable This App

Disable CMS globally for the workspace:

```json
{
  "apps": {
    "defaults": {
      "cms": false
    }
  }
}
```

See [docs/APPS.md](APPS.md) for app availability rules.
