# Media

`media` is a file-based Termlings app for image and video generation.

It exposes two concrete command surfaces:

- `termlings image ...`
- `termlings video ...`

V1 is Google first and stores local jobs under:

```text
.termlings/store/media/
  jobs/*.json
  outputs/*
```

## Canonical API

Inspect the contracts first:

```bash
termlings image schema
termlings video schema
```

Image generation uses `--stdin-json`:

```bash
printf '%s\n' '{"prompt":"pixel-art founder dashboard hero"}' \
  | termlings image generate --stdin-json --json

printf '%s\n' '{"prompt":"restyle this image","image":"./input.png","out":"./hero.png"}' \
  | termlings image generate --stdin-json --json

termlings image list --json
termlings image show --params '{"id":"img_abc123"}' --json
```

Video generation uses `--stdin-json` and `poll` uses `--params`:

```bash
printf '%s\n' '{"prompt":"8 second launch teaser","image":"./hero.png"}' \
  | termlings video generate --stdin-json --json

printf '%s\n' '{"prompt":"vertical product teaser","aspect":"9:16","duration":"6","wait":false}' \
  | termlings video generate --stdin-json --json

termlings video poll --params '{"id":"vid_abc123"}' --json
termlings video list --json
termlings video show --params '{"id":"vid_abc123"}' --json
```

## Config

Add this to `.termlings/.env`:

```bash
GEMINI_API_KEY=your_google_gemini_api_key
```

Optional fallback:

```bash
GOOGLE_API_KEY=your_google_gemini_api_key
```

Agents should request it through `requests`:

```bash
termlings request env GEMINI_API_KEY "Needed for media generation" --scope termlings
```

## Notes

- `image generate` is synchronous and writes a completed local job plus the output file.
- `video generate` creates a local job, starts a provider operation, and either waits or returns early with `"wait": false`.
- `video poll` refreshes an in-flight video job and downloads the final MP4 when it completes.
- `image` accepts either a local file path or a completed image job id.
- `design` can consume completed media images through `<Image src="img_abc123" />` or direct `.termlings/store/media/outputs/...` paths.
- Media emits shared app activity like `media.image.completed`, `media.video.started`, and `media.video.failed`.

## Disable This App

Disable it for the whole workspace in `.termlings/workspace.json`:

```json
{
  "apps": {
    "defaults": {
      "media": false
    }
  }
}
```

Per-agent access is narrowed in `.termlings/agents/<slug>/SOUL.md` with the `apps:` allowlist. See [APPS.md](APPS.md).
