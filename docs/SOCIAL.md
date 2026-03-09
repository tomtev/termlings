# Social

`social` is a file-based Termlings app for social drafts, queued posts, scheduling, and publishing.

V1 is local-first and webhook-driven.

It stores local records under:

```text
.termlings/store/social/
  posts/*.json
  history.jsonl
```

## Canonical API

Inspect the contract first:

```bash
termlings social schema
termlings social schema create
```

Read actions use `--params` and `--json`:

```bash
termlings social accounts --json
termlings social list --params '{"status":"draft","limit":25}' --json
termlings social show --params '{"id":"post_x_abc123"}' --json
termlings social queue --json
termlings social publish --params '{"id":"post_x_abc123"}' --json
termlings social history --params '{"limit":25}' --json
```

Write actions use `--stdin-json`:

```bash
printf '%s\n' '{"platform":"x","text":"Shipping analytics sync this week."}' \
  | termlings social create --stdin-json --json

printf '%s\n' '{"platform":"linkedin","text":"New blog post is live","link":"https://termlings.com/blog"}' \
  | termlings social create --stdin-json --json

printf '%s\n' '{"id":"post_x_abc123","at":"2026-03-10T09:00:00+01:00","agent":"growth"}' \
  | termlings social schedule --stdin-json --json
```

## Config

Add any platform webhook you want to automate to `.termlings/.env`:

```bash
SOCIAL_X_WEBHOOK_URL=https://example.com/social/x
SOCIAL_LINKEDIN_WEBHOOK_URL=https://example.com/social/linkedin
SOCIAL_INSTAGRAM_WEBHOOK_URL=https://example.com/social/instagram
SOCIAL_FACEBOOK_WEBHOOK_URL=https://example.com/social/facebook
SOCIAL_TIKTOK_WEBHOOK_URL=https://example.com/social/tiktok
```

Optional handles:

```bash
SOCIAL_X_HANDLE=@termlings
SOCIAL_LINKEDIN_HANDLE=company/termlings
SOCIAL_INSTAGRAM_HANDLE=@termlings
SOCIAL_FACEBOOK_HANDLE=termlings
SOCIAL_TIKTOK_HANDLE=@termlings
```

Agents should request them through `requests`:

```bash
termlings request env SOCIAL_X_WEBHOOK_URL "Needed for social publishing" --scope termlings
```

## Notes

- `create` makes a local draft post.
- `schedule` creates a one-time scheduled publish. If you include `agent` in the JSON body, it also creates a matching calendar event for that owner.
- `queue` shows posts waiting to be published by the scheduler.
- `publish` sends the post to the platform webhook immediately.
- `history` reads the append-only publish attempt log.
- `termlings scheduler` executes due scheduled social posts automatically.
- Social emits shared app activity like `social.post.created`, `social.post.scheduled`, `social.post.published`, and `social.post.failed`.

## Disable This App

Disable it for the whole workspace in `.termlings/workspace.json`:

```json
{
  "apps": {
    "defaults": {
      "social": false
    }
  }
}
```

Per-agent access is narrowed in `.termlings/agents/<slug>/SOUL.md` with the `apps:` allowlist. See [APPS.md](APPS.md).
