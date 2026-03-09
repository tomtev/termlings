# Social

`social` is a file-based Termlings app for social drafts, queued posts, scheduling, and publishing.

V1 is local-first and webhook-driven.

It is important to read that literally:

- Termlings does not currently log into Instagram, X, LinkedIn, Facebook, or TikTok for you.
- There is no built-in OAuth flow, token store, or native provider SDK integration in the `social` app.
- `social publish` works by POSTing JSON to a platform-specific webhook URL that you provide.
- The webhook receiver is responsible for actually talking to the real platform API or automation tool.

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

## How Platform Connection Works

Today, "connecting Instagram" or any other network means wiring a publish webhook for that platform.

Example architecture:

```text
Termlings social post
  -> SOCIAL_INSTAGRAM_WEBHOOK_URL
  -> your bridge / automation
  -> Instagram API / Meta tooling / scheduler / approval flow
```

Typical bridge options:

- your own small service or Cloudflare Worker
- an n8n / Make / Zapier webhook flow
- an internal backend that already owns social API credentials

The bridge can do whatever your workflow needs:

- map the Termlings payload to the provider API
- enforce review or approval before posting
- upload media
- reject unsupported posts with a non-2xx response

## What `accounts` Actually Means

`termlings social accounts` does not verify a live login with the social platform.

It only reports whether these local env vars exist:

- `SOCIAL_<PLATFORM>_WEBHOOK_URL`
- `SOCIAL_<PLATFORM>_HANDLE`

So `configured` means "Termlings knows where to send publish requests", not "Instagram is authenticated".

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

Then reload the shell session or re-source the env file before running `termlings social`.

Verify config:

```bash
termlings social accounts --json
```

## Webhook Contract

When you run `termlings social publish` or when the scheduler publishes a due post, Termlings sends a `POST` request to the configured webhook URL for that platform.

Headers:

```text
content-type: application/json
x-termlings-app: social
x-termlings-platform: <platform>
```

JSON body:

```json
{
  "id": "post_instagram_1741600000000_ab12cd",
  "platform": "instagram",
  "title": "Launch note",
  "text": "Shipping this week.",
  "link": "https://termlings.com/blog",
  "media": ["./hero.png"],
  "scheduledAt": "2026-03-10T08:00:00.000Z",
  "createdAt": "2026-03-09T11:00:00.000Z"
}
```

Notes:

- `media` contains the original `media` path strings from the draft. Termlings does not upload the files for you.
- If your webhook runs remotely, local paths like `./hero.png` are not directly usable unless your bridge can access the same filesystem.
- For remote automation, prefer public asset URLs or a bridge that can upload/read local files before posting.
- Any `2xx` response is treated as a successful publish.
- Any non-`2xx` response marks the post as failed and records the error in history.

## Connecting Instagram, LinkedIn, X, and Others

The built-in platform names are:

- `x`
- `linkedin`
- `instagram`
- `facebook`
- `tiktok`

But the integration is still the same for all of them: Termlings sends a webhook, your bridge does the real publish.

So for Instagram specifically:

1. Build or choose an Instagram-capable bridge.
2. Point `SOCIAL_INSTAGRAM_WEBHOOK_URL` at that bridge.
3. Create a post with `"platform":"instagram"`.
4. Publish immediately or schedule it.

Example:

```bash
printf '%s\n' '{"platform":"instagram","text":"Launch update","media":["https://example.com/hero.png"]}' \
  | termlings social create --stdin-json --json
```

If you want direct first-party platform connections inside Termlings itself, that does not exist yet in the current implementation.

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
