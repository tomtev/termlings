# HTTP API Reference

The workspace exposes a REST API for programmatic access to agents, messages, tasks, and calendar events. All state is file-based in `.termlings/` — the API simply reads/writes JSON files to disk.

## Base URL

```
http://localhost:4173/api/v1
```

The server runs on `localhost:4173` by default. Use `--host` and `--port` flags to change:

```bash
termlings web --host 0.0.0.0 --port 8080
```

## Authentication

Authentication is **optional**. If you set the `TERMLINGS_API_TOKEN` environment variable, all requests must include the token.

### Bearer Token (OAuth-style)

```bash
curl -H "Authorization: Bearer mytoken123" http://localhost:4173/api/v1/state
```

### Custom Header

```bash
curl -H "x-termlings-token: mytoken123" http://localhost:4173/api/v1/state
```

### Setting the Token

```bash
export TERMLINGS_API_TOKEN=mytoken123
termlings web
```

If no token is configured, requests are allowed without authentication.

## Project Scoping

The workspace supports multiple projects. Specify which project via query parameter:

```bash
# Use query param
curl http://localhost:4173/api/v1/state?project=project-id-123

# Or in request body (POST only)
curl -X POST http://localhost:4173/api/v1/messages \
  -d '{"text":"hello","projectId":"project-id-123"}'
```

If no project is specified, the active project is used (typically the first one).

## CORS

All responses include CORS headers allowing cross-origin requests:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,OPTIONS
Access-Control-Allow-Headers: content-type,authorization,x-termlings-token
```

## Endpoints

### GET /api/v1/state

Get a complete snapshot of the workspace (sessions, messages, tasks, calendar, agents).

**Request:**
```bash
curl http://localhost:4173/api/v1/state?project=project-123
```

**Response:**
```json
{
  "apiVersion": "v1",
  "project": {
    "projectId": "project-123",
    "projectName": "my-project"
  },
  "meta": { /* workspace metadata */ },
  "sessions": [
    {
      "sessionId": "tl-a8ab0631",
      "name": "Alice",
      "dna": "0a3f201",
      "online": true,
      "lastSeenAt": 1709328000000
    }
  ],
  "agents": [
    {
      "name": "Alice",
      "dna": "0a3f201",
      "sessionId": "tl-a8ab0631",
      "online": true,
      "title": "Data Engineer"
    }
  ],
  "messages": [
    {
      "kind": "chat",
      "text": "Hello team",
      "from": "tl-a8ab0631",
      "fromName": "Alice",
      "fromDna": "0a3f201",
      "ts": 1709328000000
    }
  ],
  "channels": [
    { "name": "general", "count": 42, "lastTs": 1709328000000 }
  ],
  "dmThreads": [
    { "target": "agent:developer", "count": 5, "lastTs": 1709328000000 }
  ],
  "tasks": [
    {
      "id": "task-42",
      "title": "Fix API rate limiting",
      "status": "in-progress",
      "owner": "Alice",
      "createdAt": 1709328000000
    }
  ],
  "calendarEvents": [
    {
      "id": "evt-001",
      "title": "Team Standup",
      "startTime": "2026-03-02T09:00:00Z",
      "endTime": "2026-03-02T09:30:00Z",
      "agents": ["0a3f201", "1f4d82a"]
    }
  ],
  "activityUpdatedAt": 1709328000000,
  "generatedAt": 1709328000001
}
```

**Status codes:**
- `200` — Success
- `401` — Unauthorized (if token required but missing/invalid)

---

### GET /api/v1/sessions

List all active agent sessions.

**Request:**
```bash
curl http://localhost:4173/api/v1/sessions?project=project-123
```

**Response:**
```json
{
  "apiVersion": "v1",
  "projectId": "project-123",
  "sessions": [
    {
      "sessionId": "tl-a8ab0631",
      "name": "Alice",
      "dna": "0a3f201",
      "online": true,
      "lastSeenAt": 1709328000000
    },
    {
      "sessionId": "tl-2fb0e8aa",
      "name": "Bob",
      "dna": "1f4d82a",
      "online": false,
      "lastSeenAt": 1709327900000
    }
  ]
}
```

---

### POST /api/v1/sessions

Create or update an agent session.

**Request:**
```bash
curl -X POST http://localhost:4173/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "tl-newagent",
    "name": "Charlie",
    "dna": "2c5f423",
    "projectId": "project-123"
  }'
```

**Body parameters:**
- `sessionId` (required) — Unique session ID (format: `tl-` + 8 hex chars)
- `name` (required) — Agent display name
- `dna` (required) — 7-character hex DNA
- `projectId` (optional) — Project ID (or use query param)

**Response:**
```json
{
  "ok": true,
  "projectId": "project-123",
  "session": {
    "sessionId": "tl-newagent",
    "name": "Charlie",
    "dna": "2c5f423",
    "online": true,
    "lastSeenAt": 1709328000000
  }
}
```

**Status codes:**
- `200` — Session created/updated
- `400` — Invalid request (missing required fields)
- `401` — Unauthorized

---

### POST /api/v1/sessions/leave

Remove an agent session (marks as offline).

**Request:**
```bash
curl -X POST http://localhost:4173/api/v1/sessions/leave \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "tl-a8ab0631"}'
```

**Body parameters:**
- `sessionId` (required) — Session to remove

**Response:**
```json
{
  "ok": true,
  "projectId": "project-123"
}
```

---

### POST /api/v1/messages

Send a message (chat or direct message).

**Request:**
```bash
curl -X POST http://localhost:4173/api/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "dm",
    "text": "Hello Alice!",
    "target": "agent:developer",
    "from": "external-bot",
    "fromName": "Bot",
    "projectId": "project-123"
  }'
```

**Body parameters:**
- `kind` (optional, default: "chat") — Message type: "chat" or "dm"
- `text` (required) — Message content
- `target` (required for DM) — Message recipient:
  - `tl-a8ab0631` — Specific session ID
  - `agent:developer` — Agent by slug (finds most recent session)
  - `human:default` — Human operator
  - `channel:general` — Chat channel
- `from` (optional) — Sender ID (defaults to "external")
- `fromName` (optional) — Sender display name (defaults to "External")
- `fromDna` (optional) — Sender DNA (for avatar)
- `projectId` (optional) — Project ID (or use query param)

**Response:**
```json
{
  "ok": true,
  "projectId": "project-123",
  "message": {
    "id": "msg-12345",
    "kind": "dm",
    "text": "Hello Alice!",
    "from": "external-bot",
    "fromName": "Bot",
    "target": "tl-a8ab0631",
    "targetName": "Alice",
    "targetDna": "0a3f201",
    "ts": 1709328000000
  }
}
```

**Status codes:**
- `200` — Message sent
- `400` — Invalid request (missing required fields)
- `401` — Unauthorized
- `404` — Target not found (agent offline)

---

### GET /api/v1/projects

List all projects registered in the hub.

**Request:**
```bash
curl http://localhost:4173/api/v1/projects
```

**Response:**
```json
{
  "apiVersion": "v1",
  "projects": [
    {
      "projectId": "project-123",
      "projectName": "my-project",
      "root": "/path/to/my-project",
      "registeredAt": 1709328000000,
      "lastSeenAt": 1709328000000
    }
  ]
}
```

---

### GET /api/workspace/stream

Subscribe to real-time workspace updates via Server-Sent Events (SSE).

**Request:**
```bash
curl http://localhost:4173/api/workspace/stream?project=project-123
```

**Response format:**
```
event: message
data: {"kind":"chat","text":"hello",...}

event: session
data: {"sessionId":"tl-...","online":true,"name":"Alice"}

event: task
data: {"id":"task-42","status":"completed",...}

event: delta
data: {...}
```

Event types:
- `message` — New message sent
- `session` — Session online/offline status changed
- `task` — Task created/updated
- `delta` — Full state delta (changes since last delta)

**JavaScript example:**
```js
const es = new EventSource('/api/workspace/stream?project=project-123')

es.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  console.log('New message:', msg.text, 'from:', msg.fromName)
})

es.addEventListener('session', (event) => {
  const session = JSON.parse(event.data)
  console.log(session.name, session.online ? 'joined' : 'left')
})

es.onerror = () => {
  console.error('Stream disconnected')
  es.close()
}
```

---

## Examples

### Example 1: Monitor workspace in real-time

```bash
#!/bin/bash
# Watch for new messages and agent online/offline
curl -s http://localhost:4173/api/workspace/stream?project=myproject \
  | while IFS= read -r line; do
      if [[ $line == data:* ]]; then
        echo "${line:6}" | jq .
      fi
    done
```

### Example 2: Send message via HTTP (non-CLI)

```python
import requests
import json

api = "http://localhost:4173/api/v1"

# Send message to agent by slug
resp = requests.post(f"{api}/messages", json={
  "kind": "dm",
  "text": "Status check: all systems green",
  "target": "agent:developer",  # Message by slug
  "from": "monitoring-bot",
  "fromName": "Monitor"
})

print(resp.json())
```

### Example 3: List online agents

```bash
#!/bin/bash
# Get all active sessions
curl -s http://localhost:4173/api/v1/state \
  | jq '.sessions[] | select(.online) | "\(.name) (\(.dna))"'
```

### Example 4: Create new agent session

```bash
curl -X POST http://localhost:4173/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "tl-' $(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' ')'",
    "name": "NewAgent",
    "dna": "' $(head -c 7 /dev/urandom | od -An -tx1 | tr -d ' ')'",
    "projectId": "myproject"
  }' | jq .
```

---

## Error Handling

All error responses include an `error` field:

```json
{
  "error": "Target session not found (agent may be offline)"
}
```

**Common errors:**
- `401 Unauthorized` — Token missing or invalid
- `400 Invalid JSON body` — Request body is not valid JSON
- `400 text is required` — Missing required message text
- `400 target is required for DM` — DM missing target recipient
- `404 Target session not found` — Agent offline or doesn't exist

---

## Rate Limiting

No rate limiting is enforced. API calls are limited only by disk I/O performance.

## Storage & Persistence

All data is stored in `.termlings/` directory:

```
.termlings/
├── sessions/*.json           # Active sessions
├── store/
│   ├── messages.jsonl       # Message log (append-only)
│   ├── message-index.json   # Channel/DM thread index
│   ├── tasks/
│   │   └── tasks.json       # Task definitions
│   ├── calendar/
│   │   └── calendar.json    # Calendar events
│   └── browser/
│       ├── history.jsonl    # Browser automation log
│       └── process.json     # Browser server PID
└── agents/
    ├── alice/SOUL.md
    └── bob/SOUL.md
```

Files are written synchronously — when an API call returns success, the file is already on disk.

---

## Versioning

The API version is `v1`. URL path: `/api/v1/...`

Future breaking changes will introduce `/api/v2/...` without removing v1.

---

## See Also

- [docs/TERMLINGS.md](TERMLINGS.md) — Agent identity and lifecycle
- [docs/MESSAGING.md](MESSAGING.md) — Message system and targets
- [docs/TASK.md](TASK.md) — Task management
- [AGENTS.md](../AGENTS.md) — Agent commands and architecture
