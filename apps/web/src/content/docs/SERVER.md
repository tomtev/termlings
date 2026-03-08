# Server Mode (`termlings --server`)

Status as of **March 3, 2026**:
- `termlings web` launcher is removed.
- `termlings --server` is available.
- Core API routes run directly from CLI runtime (no SvelteKit dependency).
- API is file-backed (`.termlings/`) and shares state with CLI, TUI, and agents.

## Why This Exists

`--server` provides a stable HTTP layer so hosted apps can talk to a local Termlings workspace securely without embedding the old web runtime.

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

Security guardrail:
- Non-loopback bind (for example `--host 0.0.0.0`) is rejected unless `TERMLINGS_API_TOKEN` is set.

## Base URL

```text
http://127.0.0.1:4173
```

API prefix:

```text
/api/v1
```

## Current Security Baseline

### Network defaults
- Default bind: `127.0.0.1:4173`.
- Non-loopback bind is blocked unless `TERMLINGS_API_TOKEN` is set.

### Auth
If `TERMLINGS_API_TOKEN` is set, every `/api/*` request must include one of:

```text
Authorization: Bearer <token>
x-termlings-token: <token>
```

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

## Project Scoping

Use either:
- query param: `?project=<projectId>`
- request body field: `projectId` (POST routes)

## Endpoints

### GET `/api/hub/health`
Health check.

### GET `/api/v1/projects`
List visible projects.

### GET `/api/v1/state`
Return full workspace snapshot (sessions, agents, messages, channels, DM threads, tasks, calendar).
Agent objects include optional `sort_order` (from `SOUL.md`) for stable UI ordering.

### GET `/api/v1/sessions`
List active sessions.

### POST `/api/v1/sessions`
Create/update session.

Body:
- `sessionId` (required)
- `name` (required)
- `dna` (required)
- `projectId` (optional)

### POST `/api/v1/sessions/leave`
Remove a session.

Body:
- `sessionId` (required)
- `projectId` (optional)

### POST `/api/v1/messages`
Create message.

Body:
- `kind` (`chat` or `dm`, optional, default `chat`)
- `text` (required)
- `target` (required for `dm`)
- `from` / `fromName` / `fromDna` (optional)
- `projectId` (optional)

### GET `/api/workspace/stream`
SSE stream of workspace payload updates.

### Legacy-compatible workspace routes
- `GET /api/workspace`
- `POST /api/workspace/join`
- `POST /api/workspace/leave`
- `POST /api/workspace/message`

## Canonical Targets

- Session ID: `tl-a8ab0631`
- Agent slug: `agent:developer`
- Human: `human:default`
- Channel: `channel:general`

## Error Format

```json
{
  "error": "text description"
}
```

Common status codes:
- `200` success
- `400` invalid input
- `401` unauthorized
- `404` target not found
- `413` request too large
- `429` rate limit or stream limit exceeded

## Storage Model

All operations map directly to files under `.termlings/`:

```text
.termlings/
  store/sessions/*.json
  store/messages/*
  store/tasks/tasks.json
  store/calendar/calendar.json
  store/server/audit.jsonl
  agents/*/SOUL.md
```

## Secure Exposure

Recommended deployment pattern:
1. Run `termlings --server` on loopback (`127.0.0.1`).
2. Set `TERMLINGS_API_TOKEN`.
3. Expose through Cloudflare Tunnel or ngrok.

Tunnel options:

1. **Cloudflare Tunnel**
- Better for persistent production-like setup.
- Good DNS and Access policy integration.
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
  store/sessions/
  store/messages/
  store/tasks/tasks.json
  store/calendar/calendar.json
```

## Why “Coupled to SvelteKit Runtime” Was a Problem

Previously, HTTP endpoints lived in `web/src/routes/api/*`.
That meant API behavior depended on SvelteKit route and server runtime conventions, not the CLI core.

Practical issues:
- API lifecycle tied to web app process and tooling.
- Harder to ship a minimal server-only binary or path.
- Higher risk of drift between CLI behavior and web API behavior.

`--server` fixes this by moving API handling into `src/server/*` under the same core workspace logic used by CLI and TUI.

## Next Hardening Steps

- JWT/JWKS auth mode for hosted backends.
- Scope-based authorization (`workspace:read`, `workspace:write`, `workspace:admin`).
- Persistent rate-limit store for multi-process environments.
- Optional mTLS behind reverse proxy.
