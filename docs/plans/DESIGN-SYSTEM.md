# Design System Plan

This plan describes a native Termlings design system for AI-authored visual assets.

## Goal

Create a fast local design workflow with:

- one canonical source format on disk: `design.tsx`
- semantic classes derived from the current brand profile
- deterministic rendering through Satori and Resvg
- dynamic props for reusable asset templates
- a plugin-first Figma bridge for import/export

## Canonical Direction

The current direction is:

- `design.tsx` is the only source file format
- `design.json` is not stored on disk
- Termlings builds a normalized in-memory design tree after loading TSX
- all tooling operates on that normalized tree

This keeps the authoring surface familiar for AI agents while avoiding a second checked-in artifact.

## Why TSX

AI agents are generally better at writing constrained design code than a bespoke JSON AST.

TSX gives:

- natural composition
- prop-driven templates
- readable structure
- easy reuse of `className`
- simpler dynamic text and conditional branches

The important constraint is that this must be a Termlings-owned TSX runtime, not arbitrary React app code.

## Source File Shape

Recommended file layout:

```text
.termlings/
  design/
    hero-card.design.tsx
    pricing-card.design.tsx
    components/
      card.design.tsx
```

Recommended module shape:

```tsx
/** @jsxImportSource termlings/design */

export const meta = {
  id: "hero-card",
  intent: "launch social card",
  size: { width: 1200, height: 630 },
  audience: "founders"
}

export const props = {
  title: { type: "string", default: "Build autonomous teams in the terminal" },
  subtitle: { type: "string", default: "Messaging, tasks, browser workflows, and shared state." },
  ctaLabel: { type: "string", default: "Get Started" }
}

export default function Design({ title, subtitle, ctaLabel }) {
  return (
    <Screen id="hero" className="bg-background text-foreground p-12">
      <Frame id="panel" className="bg-card border border-border rounded-3xl p-10 flex flex-col gap-6">
        <Text
          id="headline"
          bind="title"
          fitText={{ mode: "shrink", min: 28, max: 72, maxLines: 3 }}
          className="text-6xl font-bold text-foreground"
        >
          {title}
        </Text>
        <Text
          id="subhead"
          bind="subtitle"
          fitText={{ mode: "height", maxLines: 4 }}
          className="text-2xl text-muted-foreground"
        >
          {subtitle}
        </Text>
        <Frame id="cta" className="bg-primary rounded-xl px-6 py-4 flex items-center justify-center">
          <Text id="cta-label" bind="ctaLabel" className="text-lg font-semibold text-background">
            {ctaLabel}
          </Text>
        </Frame>
      </Frame>
    </Screen>
  )
}
```

## Runtime Model

The TSX runtime should compile into a normalized tree with:

- stable `id`
- node type
- resolved layout props
- resolved text/media bindings
- `fitText` rules
- semantic token references

This tree is an internal runtime representation, not a second source file.

## Semantic Classes

`className` is allowed, but it must be semantic and brand-derived.

Supported color classes should come from the current brand profile plus a small local semantic token layer.

Examples:

- `bg-background`
- `text-foreground`
- `bg-primary`
- `text-primary`
- `bg-card`
- `text-muted-foreground`
- `border-border`

Non-goal for v1:

- raw palette classes like `text-blue-500`
- arbitrary hex classes
- responsive variants
- hover/dark/pseudo classes

## Brand Integration

Brand remains the source of truth for the base semantic palette.

Expected token inputs:

- `primary`
- `secondary`
- `accent`
- `background`
- `foreground`

Expected derived semantic tokens:

- `primary-foreground`
- `secondary-foreground`
- `accent-foreground`
- `card`
- `card-foreground`
- `muted`
- `muted-foreground`
- `border`

The class compiler should resolve these tokens from `.termlings/brand/brand.json`.

## Dynamic Props

Dynamic asset templates are a first-class use case.

Required v1 prop types:

- `string`
- `image`
- `boolean`
- `enum`
- `color`

Required v1 binding features:

- `bind="title"` on text nodes
- prop defaults in the module export
- runtime override via CLI flags or a props file

## fitText

Text fitting needs to be a runtime feature, not a manual design convention.

`fitText` should be a first-class `Text` prop, not a class name.

Recommended shape:

```ts
type FitText =
  | { mode: "none" }
  | { mode: "height"; maxLines?: number }
  | { mode: "truncate"; maxLines?: number; ellipsis?: boolean }
  | { mode: "shrink"; min: number; max: number; maxLines?: number; step?: number; fallback?: "truncate" | "clip" }
```

Required v1 modes:

- `none`
- `height`
- `truncate`
- `shrink`

`shrink` is especially important for reusable design assets where copy length varies.

## Rendering Stack

The intended stack is:

1. Bun loads `design.tsx`
2. Termlings JSX runtime creates the normalized design tree
3. Termlings compiles semantic `className` values into Satori-compatible `style`
4. Satori renders SVG
5. Resvg renders PNG when needed

Satori is the rendering core, not the authoring model.

## CLI Direction

The CLI should optimize for fast context retrieval and fast visual feedback.

Initial commands:

```bash
termlings design list
termlings design brief hero-card
termlings design tree hero-card
termlings design inspect hero-card headline
termlings design props hero-card
termlings design render hero-card --prop title="Launch faster" --out /tmp/hero.png
termlings design validate hero-card
```

Important rule:

- the AI should rarely need to read the whole file

So `brief`, `tree`, and `inspect` should read the compiled design tree and return compressed context:

- design intent
- canvas size
- prop summary
- token summary
- node tree
- bindings
- `fitText` rules
- validation warnings

## Editing Model

Initial editing can stay file-based:

- agents edit `design.tsx`
- CLI focuses on inspect, validate, and render

A future codemod layer may support structured edits, but that is not required for v1.

## Figma Strategy

Do not use `.fig` as the canonical format.

Preferred bridge:

- Termlings owns `design.tsx`
- Figma plugin imports the normalized design tree into the current file
- Figma plugin exports selected frames/components back into a Termlings-compatible representation
- plugin metadata preserves Termlings-specific bindings and `fitText` rules

The REST API should be used for remote reading and sync, not as the primary write surface.

## Phases

### Phase 1

- define Termlings JSX primitives
- implement Bun loader for `design.tsx`
- compile semantic `className`
- support `Screen`, `Frame`, `Text`
- render SVG
- rasterize PNG

### Phase 2

- add props and `fitText`
- add `Image` and `Instance`
- add `brief`, `tree`, and `inspect`
- add validation and formatting guidance

### Phase 3

- build Figma plugin import
- build Figma plugin export
- preserve bindings and `fitText` through plugin metadata

### Phase 4

- variable collection sync
- richer components
- optional Buzz adapter for asset-template workflows

## Non-Goals For V1

- full Tailwind support
- arbitrary JSX and side effects
- browser DOM rendering
- direct `.fig` generation/parsing
- full Figma parity
- video rendering

## Status

This is the current design-system plan and supersedes the earlier `design.json`-as-source exploration.
