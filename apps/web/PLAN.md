# Termlings — Claim Your DNA

## What

termlings.com — an API service where users can claim unique 7-char hex DNA strings for $2.50 each. Each DNA maps to a unique pixel art avatar. Claimed DNAs are bound to an email address and stored in Cloudflare KV.

touchgrass is a free, open-source product. Claiming a termling DNA is a way to tip the project and help keep it sustainable — not a paywall. The core CLI, avatar system, and all features remain free forever.

## Stack

- **API**: Cloudflare Worker (Hono or raw fetch handler) — the core product
- **Avatars**: `termlings` npm package (renders SVG server-side in the worker)
- **Payments**: Stripe Checkout ($2.50 per claim)
- **Storage**: Cloudflare KV (two key patterns)
- **Domain**: termlings.com
- **Frontend**: Minimal — touchgrass.sh/termlings already has the avatar builder. termlings.com can serve a thin landing page or redirect to the builder. The API is the product.

## Architecture

```
termlings.com/
  src/
    index.ts          — Worker entrypoint (Hono router)
    routes/
      check.ts        — GET /check?dna=<hex>
      claim.ts        — POST /claim
      webhook.ts      — POST /webhook
      lookup.ts       — GET /lookup?email=<email>
      avatar.ts       — GET /avatar/<dna>.svg
      gallery.ts      — GET /gallery
  wrangler.toml       — Worker config, KV binding
  package.json
```

The worker is purely API-driven. Any frontend (the touchgrass.sh builder, the CLI, a future mobile app) talks to these endpoints. The worker itself can also render SVGs on the fly via the `termlings` package — no need for pre-generated assets.

## API Routes

```
GET  /check?dna=<hex>          → { available: bool, claimedBy?: "j***@example.com" }
POST /claim     { dna, email } → { url: "https://checkout.stripe.com/..." }
POST /webhook                  → Stripe webhook handler (returns 200)
GET  /lookup?email=<email>     → { dnas: ["0a3f201", ...] }
GET  /avatar/<dna>.svg         → SVG image (rendered on the fly, cached)
GET  /gallery?page=1&limit=50  → { claims: [{ dna, claimedAt }], total, hasMore }
```

All responses are JSON except `/avatar/<dna>.svg` which returns `image/svg+xml`.

### GET /check?dna=\<hex\>

- Reads `dna:<hex>` from KV
- If not found: `{ available: true }`
- If found: `{ available: false, claimedBy: "j***@example.com" }` (masked email)

### POST /claim

- Body: `{ dna: string, email: string }`
- Validates DNA format (7 hex chars) and email
- Checks KV — if already claimed, returns 409
- Creates Stripe Checkout session with metadata `{ dna, email }`
- Returns `{ url: "<stripe checkout url>" }`
- Client redirects to the URL (browser) or prints it (CLI)

### POST /webhook

- Verifies Stripe webhook signature
- On `checkout.session.completed`:
  - Reads `dna` and `email` from session metadata
  - Double-checks KV that DNA is still unclaimed (race protection)
  - If claimed by someone else: refund via Stripe API, return 200
  - Writes `dna:<hex>` → `{ email, claimedAt }`
  - Reads `email:<email>`, appends new DNA, writes back
- Returns 200

### GET /lookup?email=\<email\>

- Reads `email:<email>` from KV
- Returns `{ dnas: [...] }` or `{ dnas: [] }`

### GET /avatar/\<dna\>.svg

- Renders SVG using `renderSVG(dna)` from the `termlings` package
- Sets `Cache-Control: public, max-age=31536000, immutable` (DNA→avatar is deterministic)
- Optional query params: `?size=10&bg=000000&frame=0`

### GET /gallery?page=1&limit=50

- Lists recently claimed DNAs (uses a KV list prefix scan on `dna:`)
- Returns `{ claims: [{ dna, claimedAt }], total, hasMore }`
- Sorted by `claimedAt` descending

## KV Schema

```
dna:<hex>              → { email, claimedAt }
email:<email>          → ["<dna1>", "<dna2>", ...]
```

- `dna:` keys are the source of truth for ownership
- `email:` keys hold an array of all DNAs owned by that email
- KV values max 25MB — an array of 7-char strings can hold millions per user
- Eventually consistent (up to 60s) — fine for this use case

## Environment / Secrets (wrangler.toml + `wrangler secret put`)

```toml
[vars]
STRIPE_PRICE_ID = "price_..."

[[kv_namespaces]]
binding = "KV"
id = "..."
```

Secrets (via `wrangler secret put`):
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

## Concurrency / Race Conditions

Two users could try to claim the same DNA simultaneously:
1. Both pass the availability check
2. Both create Stripe sessions
3. Both pay

Protection: The webhook handler does a final KV read before writing. If the DNA was claimed between checkout creation and webhook, refund the second payment via Stripe API and return an error.

This is sufficient — the window is tiny and KV reads are fast. For stricter guarantees, upgrade to a Durable Object, but that's overkill at launch.

## Cost Analysis

| Item | Cost |
|------|------|
| Stripe fee per $2.50 claim | $0.37 (2.9% + $0.30) |
| Net revenue per claim | $2.13 |
| KV reads (10M/mo free) | $0.50 per additional million |
| KV writes (1M/mo free) | $2.50 per additional million |
| Cloudflare Workers (100K req/day free) | $5/mo for paid plan |

At 1,000 claims/month: $2,130 revenue, ~$0 infra cost.
At 100,000 claims/month: $213,000 revenue, ~$5 infra cost.

## CLI Integration (touchgrass)

After `tg agent create`, the CLI generates a random DNA and lets the user approve or reroll:

```
⛳ Creating agent "My Agent"...

  Generated DNA: 0a3f201

  [avatar preview rendered in terminal]

  Checking availability... ✓ Available

  ? Keep this termling? (Y/n/r)
    y = approve, n = cancel, r = randomize new DNA

⛳ Created agent "My Agent"
  dna: 0a3f201
  avatar.svg

  → Claim this termling for $2.50: https://termlings.com/claim?dna=0a3f201
    (touchgrass is free — claiming is a way to tip and keep it sustainable)
```

If the user presses `r`, generate a new random DNA and repeat the preview + availability check. Loop until they approve (`y`) or cancel (`n`).

Implementation:
- During `tg agent create`, after generating the DNA, render the terminal avatar preview
- Hit `GET https://termlings.com/check?dna=<hex>` to check availability
- If taken: show "⚠ This DNA is already claimed" and auto-randomize a new one (retry up to 5 times before giving up)
- If available: prompt the user with `Keep this termling? (Y/n/r)`
  - `y` (default): proceed with agent creation
  - `r`: generate new random DNA, loop back to preview
  - `n`: cancel agent creation
- After approval, write the DNA to AGENTS.md and show the claim URL
- The claim URL opens Stripe Checkout directly (no intermediate page needed)
- No payment handling in the CLI — just a browser URL

## Clients

The API is consumed by multiple clients:

| Client | How it uses the API |
|--------|-------------------|
| `tg agent create` (CLI) | `/check` → `/claim` → prints Stripe URL |
| touchgrass.sh/termlings (web builder) | `/check` → `/claim` → redirects to Stripe |
| termlings.com (landing page) | Optional thin page that redirects to builder or shows gallery |
| Future: mobile app, desktop app | Same API |

## Future Ideas

- **Gallery page**: `/gallery` endpoint already planned — build a simple HTML page at termlings.com that renders claimed termlings using `/avatar/<dna>.svg`
- **Profile pages**: `termlings.com/<dna>` shows the avatar + owner (if public)
- **Merch**: Generate stickers/prints from claimed DNAs
- **Rarity tiers**: Some trait combos are rarer than others
- **Trading**: Transfer ownership between emails
- **API keys**: Authenticate with your DNA for other services

## Phase 1 (MVP)

1. `wrangler init termlings` — set up Worker project
2. Create KV namespace, bind in wrangler.toml
3. Set up Stripe product + price ($2.50)
4. Implement `/check`, `/claim`, `/webhook`, `/lookup`, `/avatar/<dna>.svg` routes
5. Add Stripe secret keys via `wrangler secret put`
6. Deploy to termlings.com (`wrangler deploy`)
7. Wire up touchgrass.sh/termlings builder to hit the API
8. Update `tg agent create` with approve/reroll + availability check
