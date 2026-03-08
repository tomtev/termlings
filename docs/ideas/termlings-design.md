# Termlings Design

Status: exploratory idea

Current planned direction now lives in `docs/plans/DESIGN-SYSTEM.md`.

## Goal

Create a native `termlings design` system with:

- a small local `design.json` format that AI can edit quickly
- semantic brand-aware styling
- dynamic props for text and media-driven assets
- deterministic rendering to SVG/PNG
- optional Figma import/export later through adapters, not as the source of truth

## Why

Loopwind is useful as a renderer, but it should not define the Termlings design contract.

The long-term product need is:

- local-first design files
- fast AI patchability
- stable semantic IDs
- simple structure
- reusable asset templates with dynamic content
- Figma compatibility when needed

That points to a Termlings-owned JSON AST instead of wrapping another tool's config format.

## Principles

- JSON first
- auto-layout first
- semantic tokens first
- stable node `id` everywhere
- `tw` allowed as styling sugar
- constrained Tailwind subset only
- no raw CSS object as canonical authoring format

## Proposed Layout

```text
.termlings/
  brand/
    brand.json
  design/
    hero-card.design.json
    pricing-card.design.json
    components/
      marketing-card.design.json
```

## File Shape

```json
{
  "version": 1,
  "brand": "default",
  "tokens": {
    "primary": "$brand.primary",
    "secondary": "$brand.secondary",
    "accent": "$brand.accent",
    "background": "$brand.background",
    "foreground": "$brand.foreground",
    "card": "#ffffff",
    "border": "#e5e7eb",
    "muted": "#f4f4f5",
    "muted-foreground": "#71717a"
  },
  "screens": [
    {
      "id": "hero",
      "type": "box",
      "width": 1200,
      "height": 630,
      "tw": "bg-background text-foreground p-12",
      "children": [
        {
          "id": "panel",
          "type": "box",
          "tw": "bg-card border border-border rounded-3xl p-10 flex flex-col gap-6",
          "children": [
            {
              "id": "eyebrow",
              "type": "text",
              "text": "TERMLINGS",
              "tw": "text-sm font-semibold tracking-wide text-primary"
            },
            {
              "id": "headline",
              "type": "text",
              "text": "Build autonomous teams in the terminal",
              "tw": "text-6xl font-bold text-foreground"
            },
            {
              "id": "subhead",
              "type": "text",
              "text": "Messaging, tasks, browser workflows, and shared workspace state.",
              "tw": "text-2xl text-muted-foreground"
            },
            {
              "id": "cta",
              "type": "box",
              "tw": "bg-primary rounded-xl px-6 py-4 flex flex-row items-center justify-center",
              "children": [
                {
                  "id": "cta-label",
                  "type": "text",
                  "text": "Get Started",
                  "tw": "text-lg font-semibold text-background"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Node Types

Keep v1 very small:

- `box`
- `text`
- `image`
- `svg`
- `instance`

## Layout Rules

- `box` defaults to vertical flow unless `tw` says otherwise
- supported layout classes should be a small subset:
  - `flex`
  - `flex-row`
  - `flex-col`
  - `items-*`
  - `justify-*`
  - `gap-*`
  - `p-*`, `px-*`, `py-*`
  - `w-full`, `h-full`
  - `rounded-*`
  - semantic color classes
- no responsive variants in v1
- no hover, dark, or pseudo selectors
- no arbitrary values in v1

## Styling Model

`tw` is authoring sugar, not the core model.

Internally the renderer should normalize `tw` into concrete style props before rendering.

That gives AI a fast surface area:

- edit text
- change `tw`
- move nodes by changing tree structure
- patch nodes by `id`

## Dynamic Props

`design.json` should support typed props so the same asset can be rendered with different content.

Example:

```json
{
  "version": 1,
  "brand": "default",
  "props": {
    "title": {
      "type": "string",
      "default": "Build autonomous teams in the terminal"
    },
    "subtitle": {
      "type": "string",
      "default": "Messaging, tasks, browser workflows, and shared workspace state."
    },
    "ctaLabel": {
      "type": "string",
      "default": "Get Started"
    }
  },
  "screens": [
    {
      "id": "hero",
      "type": "box",
      "width": 1200,
      "height": 630,
      "tw": "bg-background text-foreground p-12",
      "children": [
        {
          "id": "headline",
          "type": "text",
          "text": { "prop": "title" },
          "tw": "text-6xl font-bold text-foreground",
          "fitText": {
            "mode": "shrink",
            "min": 28,
            "max": 72,
            "maxLines": 3
          }
        },
        {
          "id": "subhead",
          "type": "text",
          "text": { "prop": "subtitle" },
          "tw": "text-2xl text-muted-foreground",
          "fitText": {
            "mode": "height",
            "maxLines": 4
          }
        },
        {
          "id": "cta-label",
          "type": "text",
          "text": { "prop": "ctaLabel" },
          "tw": "text-lg font-semibold text-background",
          "fitText": {
            "mode": "shrink",
            "min": 14,
            "max": 22,
            "maxLines": 1
          }
        }
      ]
    }
  ]
}
```

Recommended prop types for v1:

- `string`
- `image`
- `color`
- `boolean`
- `enum`

## fitText Rules

Dynamic asset generation needs better text fitting than static design tools usually provide.

Recommended `fitText.mode` values:

- `none`: use the declared font size as-is
- `height`: fixed width, grow vertically
- `truncate`: fixed box with ellipsis and optional `maxLines`
- `shrink`: reduce font size until the content fits inside the target bounds

For `shrink`, the renderer should:

1. start at `fitText.max` or the font size implied by `tw`
2. measure the text
3. step down until it fits or reaches `fitText.min`
4. if still too large, optionally truncate

This is especially important for reusable social cards, sales assets, and other "design assets++" output where copy length varies.

## Brand Integration

`$brand.*` values should resolve from `.termlings/brand/brand.json`.

Recommended semantic token mapping:

- `$brand.primary` -> `primary`
- `$brand.secondary` -> `secondary`
- `$brand.accent` -> `accent`
- `$brand.background` -> `background`
- `$brand.foreground` -> `foreground`

Additional design tokens can live inside `tokens`.

## CLI Shape

```bash
termlings design init hero-card
termlings design render .termlings/design/hero-card.design.json --out /tmp/hero.png
termlings design render .termlings/design/hero-card.design.json --screen hero --out /tmp/hero.svg
termlings design validate .termlings/design/hero-card.design.json
termlings design fmt .termlings/design/hero-card.design.json
```

## Rendering Stack

- structure parser: Termlings
- `tw` compiler: Termlings
- scene renderer: Satori
- rasterization: Resvg

## Figma Strategy

Do not treat `.fig` as the canonical format.

Preferred direction:

- Termlings JSON is the source of truth
- Figma plugin/API imports Termlings JSON into Figma
- Figma plugin/API exports a compatible subset back to Termlings JSON

This keeps AI workflows local and deterministic while still allowing handoff to Figma.

See also: `docs/ideas/termlings-design-figma.md`

## Non-Goals For V1

- full Tailwind support
- full Figma feature parity
- arbitrary CSS
- animations
- constraints-based layout
- interactive states
- video rendering

## Next Step

Implement the smallest viable path:

1. define schema types
2. support `box` + `text`
3. support semantic `tw` subset
4. render to SVG
5. rasterize to PNG
