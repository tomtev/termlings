# Browser Service

Termlings browser automation now uses **agent-browser** in **native mode** over a shared **Chrome CDP** session.

## Defaults (Human-in-the-loop)

Default values are optimized for human-in-the-loop operations:

- Headed browser window by default (`termlings browser start`)
- Workspace-scoped persistent profile (one profile per project)
- Shared browser instance for all agents (coordination via tabs)
- Operator takeover is always possible in the visible browser
- Owned tabs get an agent favicon and title prefix automatically

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
termlings browser focus "input[name='email']" [--tab <index>]
termlings browser cursor [--tab <index>]
termlings browser cookies list [--tab <index>]
termlings browser check-login [--tab <index>]
termlings browser request-help "Need manual login"
```

Owned tabs automatically reflect the connected agent session (`TERMLINGS_AGENT_SLUG`) by stamping the tab favicon and title.
Use `termlings browser cursor` only when you want a manual in-page avatar preview while debugging a page.

## Tabs and Shared Access

All agents share one browser process per workspace.

- `termlings browser tabs list` returns tab indexes
- By default, when `--tab` is omitted, Termlings auto-assigns a stable tab per agent session, reuses it, and reapplies that agent's tab identity
- Explicit `--tab <index>` overrides auto-assignment and updates that agent's tab ownership
- Ownership state is stored in `.termlings/browser/tab-owners.json`
- Use `--tab <index>` when you need strict/manual control

## Human-in-loop Login Flow

1. Agent navigates to target site.
2. Agent detects auth gate (`termlings browser check-login`).
3. Agent requests intervention (`termlings browser request-help "..."`).
   When the agent has a known assigned tab, the operator message includes the tab index.
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
  "timeout": 30000,
  "startupTimeoutMs": 30000,
  "startupAttempts": 3,
  "startupPollMs": 250
}
```

Notes:

- `port`: preferred CDP port (auto-increments if occupied)
- `binaryPath`: Chrome/Chromium binary (override if auto-detect fails)
- `profilePath`: workspace profile path (persisted auth/cookies)
- `timeout`: command timeout for wrapped browser operations
- `startupTimeoutMs`: max wait per launch attempt for CDP readiness
- `startupAttempts`: how many launch attempts before giving up
- `startupPollMs`: polling interval while waiting for CDP readiness

Environment toggles:

- `TERMLINGS_BROWSER_INPAGE_CURSOR=true|false`: enable/disable the optional manual in-page avatar cursor preview (default: `true`)
- `TERMLINGS_BROWSER_PRESERVE_FOCUS=true|false`: on macOS, keep terminal/app focus while agent sessions run browser commands (default: enabled for agent sessions)

TUI integration:

- `All activity` includes browser visit events (e.g. `<agent> visited <url>`).
- Use `.termlings/workspace.json` `settings.showBrowserActivity` to hide/show those events.

## Workspace Files

```text
.termlings/browser/
  config.json
  process.json
  profile.json
  tab-owners.json
  history/
    all.jsonl
    agent/*.jsonl
  agents/*.json
```

- `history/all.jsonl`: global browser audit log
- `history/agent/*.jsonl`: per-agent browser action logs
- `history/*.jsonl`: also includes lifecycle events like `presence-opened`, `presence-idle`, and `presence-closed`
- `agents/*.json`: explicit per-session browser presence with `status`, `active`, `startedAt`, `lastSeenAt`, `endedAt`, and the latest browser action

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

If startup still fails, check diagnostics:

```bash
tail -n 50 .termlings/browser/startup-errors.jsonl
```

Each failed attempt logs pid/port/profile/error details to help identify profile lock issues and slow startup timing.

### Port already in use

Termlings auto-selects the next available port near the configured one.
Check actual port with:

```bash
termlings browser status
```

### Login blocked on strict providers

Use headed mode (default) and complete login manually in the visible browser, then continue automation.

## Disable This App

Disable `browser` for all agents in `.termlings/workspace.json`:

```json
{
  "apps": {
    "defaults": {
      "browser": false
    }
  }
}
```

You can override that for a specific agent under `apps.agents.<slug>`. See [APPS.md](APPS.md).
