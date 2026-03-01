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
- `TERMLINGS_AGENT_DNA` - Your stable identity (7-char hex)
- `TERMLINGS_IPC_DIR` - Path to workspace IPC directory

These enable you to communicate with teammates.

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
termlings message agent:<teammate-dna> "msg"   # Send update
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
- Message teammates using `agent:<dna>` for persistent threads
- Ask human operators for help early when blocked

❌ **DON'T:**
- Leave tasks in `in-progress` without notes
- Message silently - keep team updated
- Create circular dependencies (A waits for B, B waits for A)
- Forget to mark tasks as `completed` when done

## Typing Presence

Typing presence is automatically captured via Claude hooks (no extra setup needed).

## Session Management

Sessions are created automatically when you launch:
```bash
termlings claude --name "Alice" --dna 2c5f423    # Custom identity
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

See [HOOKS.md](HOOKS.md) for typing presence setup and [../AGENTS.md](../AGENTS.md) for detailed agent documentation.
