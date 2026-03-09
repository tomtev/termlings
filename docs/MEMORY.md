# Memory

`termlings memory` is a file-based memory app for project notes, shared notes, and per-agent memory collections.

It stores everything locally:

```text
.termlings/store/memory/
  collections.json
  records/
    <collection>/*.json
  history.jsonl
  qmd/
    <collection>/*.md
```

## Built-in Collections

- `project`
- `shared`
- `agent-<slug>` for every saved agent

You can also add custom collections:

```bash
termlings memory collection-create research "Research Notes"
```

## Canonical API

Inspect the contract first:

```bash
termlings memory schema
termlings memory schema add
```

Read actions use `--params` and `--json`:

```bash
termlings memory collections --json
termlings memory list --params '{"collection":"project","limit":25}' --json
termlings memory show --params '{"id":"mem_abc123"}' --json
termlings memory search --params '{"query":"csv export","collection":"project","limit":10}' --json
termlings memory history --params '{"limit":25}' --json
```

Write actions use `--stdin-json`:

```bash
printf '%s\n' '{"collection":"project","text":"Customer keeps asking for CSV export","tags":["feedback","export"]}' \
  | termlings memory add --stdin-json --json

printf '%s\n' '{"collection":"agent-growth","title":"CAC spike","text":"Meta CAC spiked this week"}' \
  | termlings memory add --stdin-json --json
```

## qmd Integration

If `qmd` is installed, Termlings can export memory collections as markdown and query them through qmd:

```bash
termlings memory qmd status --json
termlings memory qmd sync --params '{"embed":true}' --json
termlings memory qmd query --params '{"query":"csv export","collection":"project","limit":10}' --json
```

This is optional. Local memory search still works without qmd.

## Notes

- `memory` is the right future home for richer project/agent memory and semantic lookup.
- `cms` can later use `memory` or qmd-backed memory exports for better content search instead of owning search itself.
- Memory activity is appended into the shared app activity feed.

## Disable This App

Disable Memory globally in `.termlings/workspace.json`:

```json
{
  "apps": {
    "defaults": {
      "memory": false
    }
  }
}
```

See [docs/APPS.md](APPS.md) for app availability rules.
