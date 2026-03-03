# Using Termlings with Claude Code

Termlings is designed to work seamlessly with Claude Code agents.

## Setup

1. **Install termlings** in your project:
   ```bash
   npm install termlings
   ```

2. **Initialize workspace** (first time):
   ```bash
   termlings init
   ```

3. **Launch Claude as an agent**:
   ```bash
   termlings claude
   ```

   This starts Claude Code with full context about the workspace and your teammates.

## Claude Agent Environment

When you launch with `termlings claude`, you get:

- `TERMLINGS_SESSION_ID` - Your unique session ID (16 chars)
- `TERMLINGS_AGENT_NAME` - Your display name
- `TERMLINGS_AGENT_SLUG` - Your stable identity (folder name, source of truth)
- `TERMLINGS_AGENT_DNA` - Your avatar identity (7-char hex, used for rendering)
- `TERMLINGS_AGENT_TITLE` - Your job title (e.g., Product Manager, Developer)
- `TERMLINGS_AGENT_TITLE_SHORT` - Abbreviated title (e.g., PM, Dev)
- `TERMLINGS_AGENT_ROLE` - Your role description (e.g., "Build and ship product")
- `TERMLINGS_IPC_DIR` - Path to workspace IPC directory

These enable you to communicate with teammates and understand your role in the team.

## Common Claude Workflows

### 1. Check Your Tasks
```bash
termlings task list
termlings task claim <id>
termlings task status <id> in-progress
```

### 2. Coordinate with Teammates
```bash
termlings list-agents                          # See who's online
termlings message agent:<slug> "msg"            # Send update
termlings task note <id> "Progress: 50%"       # Share status
```

### 3. Get Help
```bash
termlings message human:default "I'm stuck on the API key issue"
```

### 4. Browser Automation (if needed)
```bash
termlings browser start                 # Launch shared browser
termlings browser navigate "https://..."
termlings browser extract              # Get page content
```

### 5. View Calendar
```bash
termlings calendar list                 # Your assigned events
termlings calendar show <event-id>      # Event details
```

## Best Practices

✅ **DO:**
- Update task status frequently (`termlings task status`)
- Add progress notes every 15-30 minutes (`termlings task note`)
- Message teammates using `agent:<slug>` for persistent threads
- Ask human operators for help early when blocked

❌ **DON'T:**
- Leave tasks in `in-progress` without notes
- Message silently - keep team updated
- Create circular dependencies (A waits for B, B waits for A)
- Forget to mark tasks as `completed` when done

## Typing Presence

Typing presence is terminal-first and derived from launcher PTY activity/busy detection.
No Claude hook setup is required.

## Session Management

Sessions are created automatically when you launch:
```bash
termlings claude                                  # Launch as saved agent
```

Session state is stored in `.termlings/sessions/` and persists across restarts.

## Debugging

If you get connection errors:

```bash
# Clear runtime state
termlings --clear

# Re-initialize if needed
termlings init --force

# Restart your session
termlings claude
```

See [HOOKS.md](HOOKS.md) only for legacy cleanup of old hook installs and [../AGENTS.md](../AGENTS.md) for detailed agent documentation.
