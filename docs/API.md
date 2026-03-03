# HTTP API (`termlings --server`)

Status as of **March 3, 2026**:
- Start API server with `termlings --server`.
- API is file-backed (`.termlings/`) and shares state with CLI/TUI/agents.
- For internet exposure, use a tunnel or reverse proxy with token auth.

## Start Server

```bash
# local-only (no token required)
termlings --server

# recommended for external access
TERMLINGS_API_TOKEN=your-secret-token termlings --server --host 127.0.0.1 --port 4173
```

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

## Authentication

If `TERMLINGS_API_TOKEN` is set, every `/api/*` request must include one of:

```text
Authorization: Bearer <token>
x-termlings-token: <token>
```

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
  sessions/*.json
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

See [SERVER.md](SERVER.md) for architecture and security details.
