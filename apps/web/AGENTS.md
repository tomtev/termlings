# termlings.com

## What This Project Does

termlings.com is the website and API for the termlings pixel art avatar system. Users can browse, build, and claim unique avatar DNAs. The avatar rendering library (`termlings` npm package) is open source and lives in the touchgrass monorepo — this repo is the private website and payment layer.

## Runtime

- Runtime: Bun
- Language: TypeScript (strict)
- Framework: SvelteKit (Svelte 5) on Cloudflare Workers
- Payments: Stripe Checkout ($2.50 per DNA claim)
- Storage: Cloudflare KV

## Project Structure

```
src/
  app.css              Global styles (dark theme, emerald accents)
  app.html             HTML shell
  app.d.ts             Cloudflare platform types (KV, Stripe secrets)
  lib/
    CopyButton.svelte  Clipboard copy button
    CodeBlock.svelte   Syntax-highlighted code block
  routes/
    +layout.svelte     Root layout (imports app.css)
    +page.svelte       Homepage (avatar builder, demos, code examples)
    api/
      check/           GET /api/check?dna=<hex> — availability check
      claim/           POST /api/claim {dna, email} — Stripe Checkout
      webhook/         POST /api/webhook — Stripe payment confirmation
      lookup/          GET /api/lookup?email=<email> — user's claimed DNAs
      render/
        [input].svg/   GET /api/render/<dna-or-name>.svg — SVG render API
static/
  og.png               OG image
wrangler.toml          Worker config (KV binding, assets)
svelte.config.js       SvelteKit + Cloudflare adapter
vite.config.ts         Vite config (noExternal: termlings)
```

## Deployment

Deploys as a Cloudflare Worker (not Pages):

```bash
bun run build && bunx wrangler deploy
```

## KV Schema

```
dna:<hex>              → { email, claimedAt }
email:<email>          → ["<dna1>", "<dna2>", ...]
```

## Environment / Secrets

Configured in `wrangler.toml` (KV binding) and via `wrangler secret put`:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`

## Render API

The `/api/render/` endpoint accepts DNA hex or names:

```
/api/render/0a3f201.svg              — static SVG by DNA
/api/render/my-agent.svg             — deterministic SVG by name
/api/render/0a3f201.svg?size=20      — custom pixel size
/api/render/0a3f201.svg?bg=none      — transparent background
/api/render/0a3f201.svg?animated=true&walking=true  — CSS animation
```

## Related Projects

- `termlings` npm package: open source in `touchgrass/packages/termlings/`
- touchgrass.sh: the main touchgrass product at `touchgrass/packages/web/`
- Both sites deploy as Cloudflare Workers (not Pages)
