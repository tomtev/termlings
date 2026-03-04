# Browser Service

Termlings browser automation now uses **agent-browser** in **native mode** over a shared **Chrome CDP** session.

## Defaults (Human-in-the-loop)

Default values are optimized for human-in-the-loop operations:

- Headed browser window by default (`termlings browser start`)
- Workspace-scoped persistent profile (one profile per project)
- Shared browser instance for all agents (coordination via tabs)
- Operator takeover is always possible in the visible browser

This default is ideal for login-heavy workflows, approvals, and assisted browsing.

## Headed vs Headless (Simple Rule)

- Use **headed** (default) for human-in-the-loop work: logins, MFA, approvals, and manual intervention.
- Use **headless** for non-interactive work: CI pipelines, scraping, and repeatable extraction jobs.
- **Both modes still use CDP** for automation/control. Headless only means no visible browser window.

## Runtime Model

Under the hood, Termlings wraps:

```bash
agent-browser --native --cdp <target>
```

`<target>` is the active CDP endpoint (port or websocket URL).  
`termlings browser start` launches Chrome/Chromium with CDP enabled and a project-scoped profile.

## Install

```bash
npm install -g agent-browser
agent-browser install
```

Also ensure Chrome/Chromium is installed on your machine.

## Quick Start

### Initialize browser workspace state

```bash
termlings browser init
```

Creates `.termlings/browser/` metadata and ensures a workspace profile exists.

### Start browser (headed, default)

```bash
termlings browser start
```

Example output:

```text
✓ Browser started (PID 12345, port 9222)
Mode: headed
Profile: ~/.termlings/chrome-profiles/<workspace-profile>
CDP endpoint: http://127.0.0.1:9222
Runtime: agent-browser --native --cdp 9222
```

### Status

```bash
termlings browser status
```

### Stop

```bash
termlings browser stop
```

## Headless / Scraping Mode

For scraping, CI, or non-interactive runs:

```bash
termlings browser start --headless
```

Recommended workflow for batch extraction:

```bash
termlings browser start --headless
termlings browser navigate "https://example.com"
termlings browser snapshot --compact --interactive --depth 3
termlings browser extract
```

Use `--headless` when you prioritize throughput and deterministic automation over live human oversight.

## Core Commands

```bash
termlings browser tabs list
termlings browser navigate "https://example.com" [--tab <index>]
termlings browser snapshot [--tab <index>] [--compact] [--interactive] [--depth <n>]
termlings browser screenshot [--tab <index>] [--out /tmp/page.png]
termlings browser extract [--tab <index>]
termlings browser type "text" [--tab <index>]
termlings browser click "button.submit" [--tab <index>]
termlings browser cookies list [--tab <index>]
termlings browser check-login [--tab <index>]
termlings browser request-help "Need manual login"
```

## Tabs and Shared Access

All agents share one browser process per workspace.

- `termlings browser tabs list` returns tab indexes
- Use `--tab <index>` when you want deterministic behavior
- Coordinate tab ownership in tasks/DMs to avoid collisions

## Human-in-loop Login Flow

1. Agent navigates to target site.
2. Agent detects auth gate (`termlings browser check-login`).
3. Agent requests intervention (`termlings browser request-help "..."`).
4. Operator completes login in the headed browser window.
5. Agent resumes using the same profile/session.

## Configuration

Browser config is stored at `.termlings/browser/config.json`.

Example:

```json
{
  "port": 9222,
  "binaryPath": "google-chrome",
  "autoStart": false,
  "profilePath": "/Users/you/.termlings/chrome-profiles/myproj-abc123def0",
  "timeout": 30000
}
```

Notes:

- `port`: preferred CDP port (auto-increments if occupied)
- `binaryPath`: Chrome/Chromium binary (override if auto-detect fails)
- `profilePath`: workspace profile path (persisted auth/cookies)
- `timeout`: command timeout for wrapped browser operations

## Workspace Files

```text
.termlings/browser/
  config.json
  process.json
  profile.json
  history/
    all.jsonl
    agent/*.jsonl
  agents/*.json
```

- `history/all.jsonl`: global browser audit log
- `history/agent/*.jsonl`: per-agent browser action logs
- `agents/*.json`: last browser action per active agent

## Troubleshooting

### `agent-browser` not found

```bash
npm install -g agent-browser
agent-browser install
```

### Browser start fails

Set explicit Chrome path in `.termlings/browser/config.json`:

```json
{ "binaryPath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" }
```

### Port already in use

Termlings auto-selects the next available port near the configured one.
Check actual port with:

```bash
termlings browser status
```

### Login blocked on strict providers

Use headed mode (default) and complete login manually in the visible browser, then continue automation.
