# Media App PRD

Status: planned

`media` should be one Termlings app for AI image and video generation.

It should power:

- image generation
- video generation
- async provider-backed jobs
- file-based outputs
- brand-aware prompt defaults
- shared activity feed entries

The first provider target is Google-backed generation, for example:

- image models like Nano Banana 2
- video models like Veo 3

## Why One App

This should start as one app, not two.

Reasons:

- image and video generation share the same provider/auth layer
- both need the same job lifecycle
- both want the same storage model
- both should show up in the same activity and history surfaces
- future media capabilities like upscaling, editing, storyboards, thumbnails, and voiceovers fit naturally here

So the app is `media`, while the user-facing commands stay concrete:

- `termlings image ...`
- `termlings video ...`

## Product Goals

Termlings should let agents and operators:

1. generate brand-aware image assets quickly
2. generate short video assets from prompts or still images
3. track generation jobs and outputs in local files
4. reuse outputs across workflows, ads, landing pages, and future design tools
5. see media work in `All activity` without custom TUI plumbing

## Non-Goals

V1 should not try to be:

- a full creative suite
- a timeline editor
- a Figma replacement
- a cloud asset DAM
- a broad provider abstraction layer before one provider works well

## Core Model

Everything should be a job.

Images may support `--wait`, but internally they should still be stored as jobs so image and video use one consistent system.

Canonical job envelope:

```json
{
  "id": "vid_abc123",
  "type": "video",
  "status": "queued",
  "provider": "google",
  "model": "veo-3",
  "prompt": "8 second launch teaser",
  "negativePrompt": "",
  "inputs": [
    { "kind": "image", "path": "./hero.png" }
  ],
  "options": {
    "aspect": "16:9",
    "duration": 8,
    "brand": "default"
  },
  "output": {
    "path": ".termlings/store/media/outputs/vid_abc123.mp4",
    "mime": "video/mp4"
  },
  "actorSlug": "designer",
  "createdAt": 1770000000000,
  "updatedAt": 1770000000000,
  "error": null
}
```

## Storage Layout

```text
.termlings/
  store/
    media/
      jobs/
        img_abc123.json
        vid_abc123.json
      outputs/
        img_abc123.png
        vid_abc123.mp4
      cache/
      providers.json
```

Keep outputs file-based and stable so:

- agents can reuse them later
- the desktop app and future web UI can show history
- future automation can feed one output into the next job

## CLI Shape

```bash
termlings image generate <prompt...>
termlings image list
termlings image show <job-id>
termlings image open <job-id>

termlings video generate <prompt...>
termlings video list
termlings video show <job-id>
termlings video open <job-id>
termlings video cancel <job-id>
```

## Examples

```bash
termlings image schema generate
printf '%s\n' '{"prompt":"pixel-art founder dashboard hero","provider":"google","model":"nano-banana-2"}' \
  | termlings image generate --stdin-json --json
printf '%s\n' '{"prompt":"landing page hero","brand":"default","image":"./public/logo.png"}' \
  | termlings image generate --stdin-json --json

printf '%s\n' '{"prompt":"8 second launch teaser","provider":"google","model":"veo-3","image":"./hero.png","aspect":"16:9","duration":"8"}' \
  | termlings video generate --stdin-json --json
termlings video show vid_abc123
termlings video open vid_abc123
```

## Brand Integration

`media` should integrate with `.termlings/brand/brand.json`.

Possible behavior:

- `--brand default` injects style hints into the prompt
- logo/mark references can be attached automatically when explicitly requested
- brand colors, voice, and domain can influence creative direction

This should stay optional. Brand data should enrich prompts, not become a hard dependency.

## Activity Feed

`media` should emit shared app activity like:

- `media.image.queued`
- `media.image.completed`
- `media.image.failed`
- `media.video.queued`
- `media.video.completed`
- `media.video.failed`

These should use the shared activity system under `.termlings/store/activity/`.

## Provider API

Keep provider logic behind a small adapter boundary:

```ts
type MediaProvider = {
  generateImage(input: ImageJobInput): Promise<MediaJobResult>
  generateVideo(input: VideoJobInput): Promise<MediaJobResult | MediaPendingJob>
  pollJob?(job: MediaJobRecord): Promise<MediaJobRecord>
  cancelJob?(job: MediaJobRecord): Promise<void>
}
```

This keeps the CLI and storage model provider-agnostic without overbuilding provider abstraction too early.

## UX Requirements

- image jobs should feel fast and scriptable
- video jobs should be explicitly async and cancellable
- prompts and outputs should be inspectable from local files
- the app should be useful from CLI first, before any dedicated UI
- future desktop/web views should be able to read the same job files without extra translation

## Integration Points

`media` should connect naturally to:

- `brand`
  for prompt enrichment
- `ads`
  for creative generation and reuse
- future design/rendering work
  for hero assets, OG images, motion graphics, and campaign visuals
- shared app activity
  for progress visibility

## V1 Boundary

Keep v1 narrow:

- one app: `media`
- image + video generation only
- Google provider first
- file-based jobs and outputs
- brand-aware prompt enrichment
- activity events

Do not add in v1:

- editing timelines
- collaboration comments
- version trees
- cloud-only storage
- remote render workers

## Success Criteria

V1 is successful if:

- an agent can generate a useful image from one command
- an agent can generate a useful short video from one command
- outputs are stored locally and reusable
- activity shows progress clearly
- the app becomes a clean dependency for future `ads` and design tooling
