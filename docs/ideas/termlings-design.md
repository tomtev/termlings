# Design

Status: proposed app contract

This document rewrites the earlier `design.json` exploration into the same CLI shape as the other Termlings apps.

The current source-of-truth direction should be:

- author design assets as `.design.tsx`
- inspect them through `termlings design ...`
- use semantic Tailwind-style classes in `className`
- render deterministically through a Termlings-owned runtime

## Goal

Create a native `termlings design` app for AI-authored visual assets:

- local-first source files
- stable node ids for patching and inspection
- Tailwind-like authoring across the CSS surface Satori can actually render
- brand-aware tokens from `termlings brand`
- fast `brief`, `tree`, `inspect`, `render`, and `validate` commands

## Storage

Proposed file layout:

```text
.termlings/
  design/
    hero-card.design.tsx
    pricing-card.design.tsx
    components/
      marketing-card.design.tsx
      stat-row.design.tsx
  store/
    design/
      renders/
      history.jsonl
```

Rules:

- `.termlings/design/` holds checked-in source files
- `.termlings/store/design/` holds generated outputs, cache, and render history
- `design.tsx` is the only canonical source format
- no checked-in `design.json` artifact

## Canonical API

Inspect the contract first:

```bash
termlings design schema
termlings design schema render
```

Read actions should use `--params` and `--json`:

```bash
termlings design list --json
termlings design brief --params '{"id":"hero-card"}' --json
termlings design tree --params '{"id":"hero-card"}' --json
termlings design inspect --params '{"id":"hero-card","node":"headline"}' --json
termlings design props --params '{"id":"hero-card"}' --json
termlings design validate --params '{"id":"hero-card"}' --json
```

Write and render actions should use `--stdin-json` when the payload is structured:

```bash
printf '%s\n' '{"id":"hero-card","template":"social-card"}' \
  | termlings design init --stdin-json --json

printf '%s\n' '{"id":"hero-card","format":"png","out":"/tmp/hero.png","props":{"title":"Launch faster"}}' \
  | termlings design render --stdin-json --json

printf '%s\n' '{"id":"hero-card","write":true}' \
  | termlings design fmt --stdin-json --json
```

The important design rule is the same as the rest of the newer apps:

- `schema` is the AI contract
- `--params` is for ids, selectors, inspection, and filters
- `--stdin-json` is for structured writes, renders, and mutations
- `--json` is the default machine-readable output mode agents should use

## Source File Shape

Use `.design.tsx` with a constrained JSX runtime:

```tsx
/** @jsxImportSource termlings/design */

export const meta = {
  id: "hero-card",
  title: "Hero Card",
  intent: "Launch social card",
  size: { width: 1200, height: 630 }
}

export const props = {
  title: {
    type: "string",
    default: "Build autonomous teams in the terminal"
  },
  subtitle: {
    type: "string",
    default: "Messaging, tasks, browser workflows, and shared state."
  },
  ctaLabel: {
    type: "string",
    default: "Get Started"
  },
  logo: {
    type: "image",
    default: "./assets/logo-mark.png"
  }
}

export default function Design({ title, subtitle, ctaLabel, logo }) {
  return (
    <Screen
      id="hero"
      className="flex flex-col bg-background text-foreground p-12"
    >
      <Frame
        id="panel"
        className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-10 shadow-sm"
      >
        <Frame id="top" className="flex flex-row items-center gap-3">
          <Image
            id="logo"
            bind="logo"
            src={logo}
            className="h-12 w-12 rounded-xl bg-muted object-contain"
          />
          <Text
            id="eyebrow"
            className="text-sm font-semibold uppercase tracking-widest text-primary"
          >
            Termlings
          </Text>
        </Frame>

        <Text
          id="headline"
          bind="title"
          fitText={{ mode: "shrink", min: 28, max: 72, maxLines: 3 }}
          className="max-w-4xl text-6xl font-bold leading-tight text-foreground"
        >
          {title}
        </Text>

        <Text
          id="subhead"
          bind="subtitle"
          fitText={{ mode: "height", maxLines: 4 }}
          className="max-w-3xl text-2xl leading-snug text-muted-foreground"
        >
          {subtitle}
        </Text>

        <Frame id="cta" className="mt-2 flex flex-row items-center gap-3">
          <Frame
            id="cta-pill"
            className="flex flex-row items-center justify-center rounded-2xl bg-primary px-6 py-4"
          >
            <Text
              id="cta-label"
              bind="ctaLabel"
              fitText={{ mode: "shrink", min: 14, max: 20, maxLines: 1 }}
              className="text-lg font-semibold text-primary-foreground"
            >
              {ctaLabel}
            </Text>
          </Frame>
          <Text id="meta" className="text-sm text-muted-foreground">
            termlings.com
          </Text>
        </Frame>
      </Frame>
    </Screen>
  )
}
```

## Shared Component Shape

Shared components should still be plain `.design.tsx` modules with stable ids and normal props:

```tsx
/** @jsxImportSource termlings/design */

export const meta = {
  id: "stat-row",
  title: "Stat Row"
}

export const props = {
  label: { type: "string", default: "Time saved" },
  value: { type: "string", default: "12h / week" }
}

export default function StatRow({ label, value }) {
  return (
    <Frame
      id="root"
      className="flex flex-row items-center justify-between rounded-2xl border border-border bg-muted px-4 py-3"
    >
      <Text id="label" bind="label" className="text-sm font-medium text-muted-foreground">
        {label}
      </Text>
      <Text id="value" bind="value" className="text-base font-semibold text-foreground">
        {value}
      </Text>
    </Frame>
  )
}
```

Then a parent asset can compose it:

```tsx
/** @jsxImportSource termlings/design */

import StatRow from "./components/stat-row.design"

export default function Design() {
  return (
    <Screen id="pricing-card" className="flex flex-col gap-4 bg-background p-8">
      <StatRow label="Setup" value="15 min" />
      <StatRow label="Agents" value="5 included" />
    </Screen>
  )
}
```

## Runtime Primitives

Keep v1 small:

- `Screen`
- `Frame`
- `Text`
- `Image`
- `Instance`

Rules:

- every rendered node must have a stable `id`
- layout is auto-layout first
- no arbitrary React hooks or side effects
- no DOM event handlers
- no raw browser rendering model

## Tailwind Class Contract

Use Tailwind-style classes, but make the supported surface track Satori's supported CSS subset rather than an arbitrary tiny allowlist.

The v1 rule should be:

- support any utility class that compiles cleanly into a Satori-supported CSS property and value
- reject any utility that maps to browser-only or unsupported CSS
- keep semantic brand tokens for colors, but do not artificially shrink layout and typography coverage

That means v1 should include Tailwind utilities across these categories when they map to Satori:

- display and flexbox layout
- positioning and inset
- spacing and sizing
- borders and border radius
- typography, text alignment, white-space, and line clamp
- backgrounds and semantic color tokens
- opacity, box shadow, filters, and clip paths
- object fit and object position
- 2D transforms
- overflow where Satori supports it

Examples that should be fine if they compile to supported Satori CSS:

- `flex`, `inline-flex`, `flex-row`, `flex-col`, `items-center`, `justify-between`
- `absolute`, `relative`, `top-0`, `inset-0`
- `p-12`, `px-6`, `gap-4`, `w-full`, `h-12`, `max-w-3xl`
- `rounded-2xl`, `border`, `border-border`
- `text-6xl`, `font-bold`, `leading-tight`, `tracking-widest`, `text-center`, `line-clamp-3`
- `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`
- `shadow-sm`, `opacity-80`, `overflow-hidden`, `object-cover`
- `rotate-3`, `scale-95`, `translate-x-2`

Do not support in v1:

- responsive prefixes like `md:`
- state variants like `hover:`, `focus:`, `dark:`
- utilities that compile to CSS Satori does not support
- browser-only semantics like `z-*`, `calc(...)`, or 3D transforms
- arbitrary CSS objects as the source-of-truth authoring format
- arbitrary class plugins with unknown output

Validation should fail fast with a precise reason when a class cannot be compiled to supported Satori CSS.

The renderer should compile supported `className` values into normalized style props before passing the scene to Satori.

## Brand Integration

`termlings brand` stays the source of truth for semantic palette inputs.

Expected base inputs:

- `primary`
- `secondary`
- `accent`
- `background`
- `foreground`

Expected derived tokens:

- `primary-foreground`
- `secondary-foreground`
- `accent-foreground`
- `card`
- `card-foreground`
- `muted`
- `muted-foreground`
- `border`

That gives design files a stable semantic class vocabulary without hardcoding raw hex values everywhere.

## Props and Bindings

Required v1 prop types:

- `string`
- `image`
- `boolean`
- `enum`
- `color`

Required binding features:

- `bind="title"` on nodes that should show up in `inspect` and `props`
- defaults defined in `export const props`
- render-time overrides via `render --stdin-json`

Example render payload:

```json
{
  "id": "hero-card",
  "format": "png",
  "out": "/tmp/hero.png",
  "props": {
    "title": "Launch faster with autonomous teams",
    "subtitle": "Coordinate product, growth, support, and operations from one terminal workspace.",
    "ctaLabel": "View Demo"
  }
}
```

## fitText

Text fitting should be an explicit node prop, not a class convention.

Recommended shape:

```ts
type FitText =
  | { mode: "none" }
  | { mode: "height"; maxLines?: number }
  | { mode: "truncate"; maxLines?: number; ellipsis?: boolean }
  | { mode: "shrink"; min: number; max: number; maxLines?: number; step?: number; fallback?: "truncate" | "clip" }
```

Required modes:

- `none`
- `height`
- `truncate`
- `shrink`

This matters because social cards, ads, and landing page assets routinely have variable copy length.

## Render and Inspect Model

The CLI should minimize how often an agent has to read the whole file.

`brief` should return:

- asset id
- title and intent
- canvas size
- prop summary
- token summary
- validation summary

`tree` should return:

- node ids
- node types
- bindings
- className
- fitText rules

`inspect` should return:

- one resolved node
- bound prop name
- computed semantic tokens
- fitText behavior
- any validation warnings for that node

## Rendering Stack

Recommended implementation:

1. Bun loads `.design.tsx`
2. the Termlings JSX runtime builds a normalized design tree
3. supported `className` values compile into Satori-compatible style props
4. Satori renders SVG
5. Resvg renders PNG when needed

Satori should be the renderer, not the authoring contract.

## Notes

- This should be a real Termlings app, not a wrapper around another tool's config format.
- Tailwind-style `className` is the right authoring surface for AI speed.
- The class surface should stay constrained so rendering stays deterministic.
- Figma import/export can come later through a plugin bridge, not as the source of truth.

See also: `docs/plans/DESIGN-SYSTEM.md` and `docs/ideas/termlings-design-figma.md`.
