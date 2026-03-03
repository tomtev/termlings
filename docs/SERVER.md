# Server Mode (`termlings --server`)

Status as of **March 3, 2026**:
- `termlings web` launcher is removed.
- `termlings --server` is available.
- Core API routes run directly from CLI runtime (no SvelteKit dependency).

## Why This Exists

`--server` provides a stable HTTP layer so hosted apps can talk to a local Termlings workspace securely without embedding the old web runtime.

## Current Security Baseline

### Network defaults
- Default bind: `127.0.0.1:4173`.
- Non-loopback bind is blocked unless `TERMLINGS_API_TOKEN` is set.

### Auth
- Token auth via:
  - `Authorization: Bearer <token>`
  - `x-termlings-token: <token>`

### Controls
- Request body size limit (default: 64KB)
- In-memory rate limiting (default: 120 req/min per client key)
- SSE stream cap per client key (default: 5)
- Optional project allowlist (`TERMLINGS_ALLOWED_PROJECT_IDS`)
- Audit log at `.termlings/store/server/audit.jsonl`

### CORS
- CORS disabled unless origins are explicitly configured.
- Configure with `--cors-origin` or `TERMLINGS_CORS_ORIGINS`.
- `*` is rejected when token auth is enabled.

## Run

```bash
# local testing
termlings --server

# secure baseline for remote app connectivity
TERMLINGS_API_TOKEN=your-secret-token termlings --server --host 127.0.0.1 --port 4173
```

Optional flags:
- `--host`
- `--port`
- `--token`
- `--cors-origin`
- `--max-body-kb`
- `--rate-limit`
- `--sse-max`

## Tunnel Options (Yes: ngrok or Cloudflare Tunnel)

Both work. Recommended order:

1. **Cloudflare Tunnel**
- Better for persistent production-like setup.
- Good DNS + Access policy integration.
- Works well if your app is already on Cloudflare.

2. **ngrok**
- Faster for local prototyping and short-lived links.
- Very simple setup for quick external testing.

For either tunnel:
- Keep Termlings bound to `127.0.0.1`.
- Keep token auth enabled.
- Restrict allowed origins.
- Treat tunnel URL as public attack surface.

## Architecture Notes

The current server routes are implemented in core runtime:

```text
src/server/index.ts
```

Backed by workspace files:

```text
.termlings/
  sessions/
  store/messages/
  store/tasks/tasks.json
  store/calendar/calendar.json
```

## Why “Coupled to SvelteKit Runtime” Was a Problem

Previously, HTTP endpoints lived in `web/src/routes/api/*`.
That meant API behavior depended on SvelteKit route/server runtime and web project build/runtime conventions, not the CLI core.

Practical issues:
- API lifecycle tied to web app process and tooling.
- Harder to ship a minimal server-only binary/path.
- Higher risk of drift between CLI behavior and web API behavior.

`--server` fixes this by moving API handling into `src/server/*` under the same core workspace logic used by CLI/TUI.

## Next Hardening Steps

- JWT/JWKS auth mode for hosted backends.
- Scope-based authorization (`workspace:read`, `workspace:write`, `workspace:admin`).
- Persistent rate-limit store for multi-process environments.
- Optional mTLS behind reverse proxy.
