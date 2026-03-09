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
- In Docker or other runtimes without a display server, Termlings automatically falls back to **headless** even if `--headed` was requested.
- In those runtimes, agents should continue with headless mode by default instead of treating headed mode as a blocker.

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
termlings browser overview --json
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
Agent-driven focus, click, and targeted typing actions also render an in-page SVG avatar cursor so you can see what the agent is about to do.
Use `termlings browser cursor` when you want to force that avatar preview manually while debugging a page.

`termlings browser overview --json` returns the canonical browser workspace snapshot used for future remote/browser-control surfaces.

## Browser Tab Invites

Agents can explicitly invite another agent into a browser tab.

```bash
termlings browser invite agent:designer "Check this layout" [--tab <index>]
termlings browser invites
termlings browser accept <invite-id>
termlings browser leave [invite-id]
```

How it works:

- `invite` creates a browser invite record under `.termlings/browser/invites/`
- it also sends a DM to the invited agent with the accept command
- `accept` joins that shared tab for the invited agent
- while the invite is active, browser commands without `--tab` default to that shared tab for the invited agent
- `leave` restores the invited agent's normal per-agent tab default

This keeps isolated per-agent tabs as the default, while still allowing explicit collaboration when needed.

## Tabs and Shared Access

All agents share one browser process per workspace.

- `termlings browser tabs list` returns tab indexes
- By default, when `--tab` is omitted, Termlings auto-assigns a stable tab per agent session, reuses it, and reapplies that agent's tab identity
- If an agent accepts a browser invite, that accepted shared tab becomes the default target until the agent leaves it
- Explicit `--tab <index>` overrides auto-assignment and updates that agent's tab ownership
- Ownership state is stored in `.termlings/browser/tab-owners.json`
- Invite records are stored in `.termlings/browser/invites/`
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

- `TERMLINGS_BROWSER_INPAGE_CURSOR=true|false`: enable/disable the agent-only in-page avatar cursor preview used before focus/click/targeted typing actions (default: `true`)
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
  workspace-state.json
  tab-owners.json
  invites/*.json
  history/
    all.jsonl
    agent/*.jsonl
  agents/*.json
```

- `history/all.jsonl`: global browser audit log
- `history/agent/*.jsonl`: per-agent browser action logs
- `history/*.jsonl`: also includes lifecycle events like `presence-opened`, `presence-idle`, and `presence-closed`
- `agents/*.json`: explicit per-session browser presence with `status`, `active`, `startedAt`, `lastSeenAt`, `endedAt`, and the latest browser action
- `workspace-state.json`: canonical read model for browser process state, live tabs, tab ownership, invites, and agent browser presence

## Remote-Ready Read Model

Termlings does not ship a remote browser web app in OSS, but it now maintains a stable browser workspace snapshot for future remote UIs and operator tooling:

- file: `.termlings/browser/workspace-state.json`
- CLI view: `termlings browser overview --json`

The snapshot includes:

- browser process state
- profile reference
- current live tabs
- tab ownership
- invite state
- per-agent browser presence
- `invites/*.json`: pending/accepted shared-tab invitations between agents

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

Per-agent access is narrowed in `.termlings/agents/<slug>/SOUL.md` with the `apps:` allowlist. See [APPS.md](APPS.md).
