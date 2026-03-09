# Design

`design` is a local-first Termlings app for authored visual assets and deterministic image rendering.

Source files live under:

```text
.termlings/design/*.design.tsx
```

Rendered outputs, cache, and history live under:

```text
.termlings/store/design/
  renders/
  cache/
  history.jsonl
```

## Canonical API

Inspect the machine contract first:

```bash
termlings design schema
termlings design schema render
termlings design schema templates.show
```

Create, inspect, and render with the JSON-first surface:

```bash
termlings design templates list --json
termlings design templates show --params '{"id":"og-standard"}' --json

printf '%s\n' '{"id":"hero-card","template":"og-standard"}' \
  | termlings design init --stdin-json --json

termlings design list --json
termlings design brief --params '{"id":"hero-card"}' --json
termlings design tree --params '{"id":"hero-card"}' --json
termlings design props --params '{"id":"hero-card"}' --json
termlings design validate --params '{"id":"hero-card"}' --json

printf '%s\n' '{"id":"hero-card","format":"png"}' \
  | termlings design render --stdin-json --json
```

## Built-in Templates

Current built-ins:

- `starter`
- `og-standard`
- `og-article`
- `og-feature`
- `og-pricing`
- `og-testimonial`
- `linkedin-announcement`
- `quote-card`
- `metrics-board`

`init` accepts one of those ids through `template`.

## Design Source Format

Design files use the custom JSX runtime exported from `termlings/design`:

```tsx
/** @jsxImportSource termlings/design */
import { Screen, Frame, Text, Image } from "termlings/design"

export const meta = {
  id: "hero-card",
  title: "Hero Card",
  size: { width: 1200, height: 630 }
}

export default function Design() {
  return (
    <Screen id="hero" className="flex flex-col bg-background p-12">
      <Frame id="panel" className="flex flex-col gap-6 bg-card border border-border rounded-3xl p-12">
        <Text id="headline" className="text-6xl font-bold text-foreground">
          Build autonomous teams in the terminal
        </Text>
      </Frame>
    </Screen>
  )
}
```

Rules:

- root node must be `<Screen>`
- each node must declare `id`
- v1 is single-file only; relative component imports are not supported yet
- rendering is Satori-based, so classes must compile to the supported CSS subset

## Semantic Brand Classes

Templates and authored designs should use semantic color classes, not hardcoded palette values.

Supported semantic color classes:

- `bg-background`
- `bg-card`
- `bg-primary`
- `border-border`
- `text-foreground`
- `text-muted-foreground`
- `text-primary`
- `text-primary-foreground`

These resolve from the active brand profile in `.termlings/brand/brand.json` via `termlings brand`.

## Image Sources

`<Image src="...">` supports:

- local file paths
- workspace paths like `.termlings/store/media/outputs/foo.png`
- completed media image job ids like `img_abc123`
- external `http(s)` image URLs
- `data:` URLs

This means a design can consume media outputs directly:

```tsx
<Image id="hero-image" src="img_abc123" className="w-full h-full rounded-2xl overflow-hidden object-cover" />
```

Or by path:

```tsx
<Image id="hero-image" src=".termlings/store/media/outputs/img_abc123.png" className="w-full h-full rounded-2xl overflow-hidden object-cover" />
```

## Notes

- local and remote images are inlined before render
- colors are brand-integrated today; logo/brand asset defaults are not wired into templates yet
- rendered PNG and SVG files are stable local artifacts intended for reuse by other apps

## Related Docs

- [MEDIA.md](MEDIA.md)
- [BRAND.md](BRAND.md)
- [APPS.md](APPS.md)
