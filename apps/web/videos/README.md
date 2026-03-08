# Remotion Videos

This folder contains Remotion compositions for termlings demos.

## Setup

```bash
cd videos
bun install
bun run assets:fetch
```

## Run Studio

```bash
bun run dev
```

## Render MP4

```bash
bun run render
```

Output:

- `videos/out/fake-terminal-demo.mp4`

## Notes

- The composition is based on `src/lib/FakeTerminalChat.svelte`.
- Avatar/logo assets are fetched into `videos/public/` via `scripts/fetch-assets.mjs`.
