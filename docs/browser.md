# Browser Service

The browser service provides agents and operators with a shared persistent web browser for automation and human-in-loop workflows.

## Overview

- **Per-project isolation**: Each project has its own dedicated browser instance with isolated profile
- **Agent tracking**: Agents automatically claim tabs with their names, visible in PinchTab dashboard
- **Persistent state**: Cookies, login state, and history persist across restarts
- **Tab locking**: Prevents conflicts between concurrent agents working on the same browser
- **Activity logging**: All interactions recorded with agent identity in audit trail
- **Human-in-loop**: Agents can request operator help for tasks like login

## Setup

### Initialize

```bash
termlings browser init
```

Creates `.termlings/browser/` directory and configuration.

### Install PinchTab

PinchTab is required to run the browser service:

```bash
npm install -g pinchtab
```

See: https://pinchtab.com/docs/headless-vs-headed/

### Start Browser

```bash
termlings browser start
```

Starts PinchTab server in **headed mode** (visible UI) by default for human-in-loop workflows.

```
✓ Browser started (PID 6866, port 9867)
Profile: .termlings/browser/profile/
```

Use headed mode explicitly:
```bash
termlings browser start --headed
```

You can force headless mode explicitly:
```bash
termlings browser start --headless
```

Legacy env-var control still works:
```bash
BRIDGE_HEADLESS=true termlings browser start
```

**Recommendation:** Use headed mode for operator oversight and intervention. Switch to headless for CI/background jobs:
- Running on a Linux system or CI environment
- Using a remote/containerized setup
- Running on a separate machine

### Stop Browser

```bash
termlings browser stop
```

Gracefully shuts down the browser server.

### Check Status

```bash
termlings browser status
```

Shows running status, port, PID, and uptime:

```
Browser: running
  Port: 9867
  PID: 6866
  Uptime: 5s
```

## Agent Commands

### Navigate

```bash
termlings browser navigate "https://example.com"
termlings browser navigate "https://example.com" --tab <tab-id>
```

Navigate to a URL in the active tab (or explicit `--tab`).

### Screenshot

```bash
termlings browser screenshot
termlings browser screenshot --tab <tab-id> --out /tmp/page.png
```

Takes a screenshot of the active tab (or explicit `--tab`) and returns base64 by default.

```
/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABt...
```

### Snapshot

```bash
termlings browser snapshot
termlings browser snapshot --tab <tab-id>
termlings browser snapshot --compact --interactive --depth 2
```

`snapshot` calls PinchTab's root `/snapshot` endpoint and passes `tabId` when you use `--tab`.
Use `--tab <tab-id>` for deterministic multi-agent runs.

### Extract Text

```bash
termlings browser extract
termlings browser extract --tab <tab-id>
```

Gets all visible text from the active tab (or explicit `--tab`):

```
Example Domain
This domain is for use in documentation examples...
```

### Type

```bash
termlings browser type "hello world"
termlings browser type "hello world" --tab <tab-id>
```

Types text into the focused element (input field, textarea, etc.).

### Click

```bash
termlings browser click "button.submit"
termlings browser click "button.submit" --tab <tab-id>
```

Clicks an element by CSS selector.

### List Cookies

```bash
termlings browser cookies list
termlings browser cookies list --tab <tab-id>
```

Returns all cookies as JSON:

```json
[
  {
    "name": "session_id",
    "value": "abc123...",
    "domain": "example.com",
    "path": "/",
    "secure": true,
    "httpOnly": true
  }
]
```

## Agent Integration & Tab Locking

### Automatic Agent Tracking

When an agent runs browser commands, it automatically:

1. **Claims a dedicated tab** - Each agent gets its own tab locked to their name
2. **Shows in dashboard** - Agent name appears in PinchTab's activity feed and agents list
3. **Prevents conflicts** - Tab locking ensures concurrent agents don't interfere

Access the PinchTab dashboard to see agent activity:

```bash
# After starting the browser, open dashboard in your browser
http://127.0.0.1:{port}/dashboard
```

### Multi-Agent Concurrent Access

Multiple agents can work on the same browser instance safely:

```bash
# Agent Alice starts work
export TERMLINGS_AGENT_NAME="Alice"
export TERMLINGS_AGENT_DNA="0a3f201"
termlings browser navigate "https://example.com"
termlings browser extract --tab <tab-id>

# Meanwhile, Agent Bob works concurrently on different tab
export TERMLINGS_AGENT_NAME="Bob"
export TERMLINGS_AGENT_DNA="1b4e312"
termlings browser navigate "https://other-site.com"
termlings browser screenshot --tab <tab-id>
```

Each agent's commands are tracked separately in the dashboard and activity log with their identity preserved.

### Tab Locking Details

- **Automatic**: Agents don't need to manually lock tabs
- **Per-command**: Each browser command runs in the agent's tab context
- **TTL**: Tab locks auto-expire after 1 hour of agent inactivity
- **Owner**: PinchTab tracks which agent owns each tab via the owner field

## Human-in-Loop Workflows

### Check Login Status

```bash
termlings browser check-login
termlings browser check-login --tab <tab-id>
```

Detects if the current page requires login by looking for common login indicators (login forms, auth fields, etc.).

**Exit codes:**
- `0` - No login required
- `1` - Login required

**Usage in shell scripts:**

```bash
TAB_ID=$(termlings browser tabs list | awk '/^   id:/{print $2; exit}')
if termlings browser check-login --tab "$TAB_ID"; then
  echo "Login required"
  termlings browser request-help "Please log in to example.com"
  exit 0
fi

echo "Already logged in, continuing..."
termlings browser extract --tab "$TAB_ID"
```

### Request Operator Help

```bash
termlings browser request-help "Please log in to example.com"
```

Sends a notification to the operator via `termlings message`. The operator receives a DM with the request:

```
🔔 **Browser needs your help** (AgentName)

Please log in to example.com

Run: `termlings browser` commands to interact
```

**The operator can then:**

```bash
termlings browser screenshot              # See current page
termlings browser navigate "https://..."  # Navigate if needed
termlings browser type "credentials"      # Type credentials
termlings browser click "button.login"    # Click login button
termlings browser screenshot              # Verify success
```

**The agent continues:** After the operator completes the task, the agent can continue using the shared profile:

```bash
termlings browser extract --tab <tab-id>  # Now sees authenticated content
```

## Activity Logging

All browser interactions are logged to `.termlings/browser/history.jsonl` with:

- **Timestamp**: When the action occurred
- **Session ID**: Agent session identifier
- **Agent name**: Display name of the agent
- **Command**: The action performed
- **Arguments**: Parameters passed
- **Result**: success, error, or timeout
- **Error message**: If applicable

Example log entries showing agent identity:

```json
{"ts":1772393205403,"sessionId":"tl-abc123","agentName":"Alice","agentDna":"0a3f201","command":"navigate","args":["https://example.com"],"result":"success"}
{"ts":1772393208276,"sessionId":"tl-def456","agentName":"Bob","agentDna":"1b4e312","command":"screenshot","args":[],"result":"success"}
{"ts":1772393208300,"sessionId":"tl-abc123","agentName":"Alice","agentDna":"0a3f201","command":"extract","args":[],"result":"success"}
```

Combined with PinchTab's dashboard activity feed, you get complete visibility into which agent performed each action.

## Configuration

Browser configuration is stored in `.termlings/browser/config.json`:

```json
{
  "port": 8222,
  "binaryPath": "pinchtab",
  "autoStart": false,
  "profilePath": "/path/to/.termlings/browser/profile",
  "timeout": 30000
}
```

- **port**: Preferred port (PinchTab auto-detects if unavailable)
- **binaryPath**: Path to PinchTab binary
- **autoStart**: Auto-start on first use (not currently used)
- **profilePath**: Chrome profile directory
- **timeout**: Request timeout in milliseconds

## Shared Profile

All agents and operators share the same Chrome profile at `~/.pinchtab/profiles/termlings/Default/` (managed automatically by PinchTab). This enables:

- **Persistent authentication**: Log in once, all agents can access authenticated content
- **Shared cookies**: Session cookies and tracking persist across agent transitions and restarts
- **Browsing history**: History and bookmarks shared across the team
- **Human-in-loop**: Operators can take over mid-task with full context
- **Profile preservation**: Cookies and data are never destroyed between runs

## Headed Mode

The browser always runs in **headed mode** (visible UI). This allows:

- **Operator visibility**: Operators can see exactly what's happening
- **Quick intervention**: Operators can take over when needed
- **Debugging**: Visual inspection helps troubleshoot issues
- **Security**: Less chance of unexpected behavior going unnoticed

See: https://pinchtab.com/docs/headless-vs-headed/

## Example Workflow

```bash
#!/bin/bash
# agent-web-scraper.sh

export TERMLINGS_AGENT_NAME="DataScraper"
export TERMLINGS_SESSION_ID="tl-$(date +%s)"

# Start browser
termlings browser start

# Navigate to target site
termlings browser navigate "https://data-portal.example.com"
TAB_ID=$(termlings browser tabs list | awk '/^   id:/{print $2; exit}')

# Check if login is needed
if termlings browser check-login --tab "$TAB_ID"; then
  # Notify operator
  termlings browser request-help \
    "Data portal requires authentication. Please log in."
  exit 0
fi

# Extract data from authenticated page
data=$(termlings browser extract --tab "$TAB_ID")
echo "Extracted data:"
echo "$data"

# Stop browser
termlings browser stop
```

## Troubleshooting

### "Browser not running"

Start the browser:

```bash
termlings browser start
```

### PinchTab not found

Install PinchTab:

```bash
npm install -g pinchtab
```

### Port conflicts

PinchTab auto-detects an available port if the preferred port is in use. Check actual port:

```bash
termlings browser status
```

### No screenshot returned

Some websites block screenshots. The command may return empty. Try extracting text instead:

```bash
termlings browser extract
termlings browser extract --tab <tab-id>
```

## API Reference

| Command | Usage | Requires Server |
|---------|-------|-----------------|
| `init` | Setup directories | No |
| `start` | Start server | No |
| `stop` | Stop server | No |
| `status` | Show status | No |
| `navigate` | Go to URL (active tab or `--tab`) | Yes |
| `screenshot` | Capture page (active tab or `--tab`) | Yes |
| `type` | Input text (active tab or `--tab`) | Yes |
| `click` | Click element (active tab or `--tab`) | Yes |
| `extract` | Get page text (active tab or `--tab`) | Yes |
| `cookies` | List cookies (active tab or `--tab`) | Yes |
| `check-login` | Detect login (active tab or `--tab`) | Yes |
| `request-help` | Notify operator | No |
