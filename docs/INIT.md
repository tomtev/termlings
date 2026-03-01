# Workspace Initialization

Initialize a Termlings workspace in your project.

## Quick Start

```bash
termlings init
```

This creates `.termlings/` directory with all necessary files and folders.

## What Gets Created

```
.termlings/
├── map.json                      # World definition (if using templates)
├── sessions/                     # Active agent sessions
├── store/
│   ├── messages.jsonl           # Message history
│   ├── tasks/
│   │   └── tasks.json           # Task definitions
│   ├── calendar/
│   │   └── calendar.json        # Calendar events
│   └── browser/
│       ├── config.json
│       ├── process.json
│       └── history.jsonl
├── agents/                       # Saved agent definitions
│   └── [your agents here]
└── browser/                      # Browser automation files
    └── [profile and config]
```

## Running Initialization

### Default (interactive)
```bash
termlings init
```

You'll be prompted to:
1. Confirm project setup
2. Choose optional settings

### Force re-run
```bash
termlings init --force
```

Re-runs initialization even if `.termlings/` already exists. Useful for:
- Resetting workspace state
- Updating to new Termlings version
- Adding missing directories

## First Time Setup

When you first run `termlings` in a project:

1. It checks for `.termlings/`
2. If missing, runs `termlings init` automatically
3. Creates workspace and registers project
4. Launches web UI at `http://localhost:4173`

## Project Registration

Your project is automatically registered in:
```
~/.termlings/hub/projects.json
```

This allows the web UI to:
- Find all your projects
- Switch between them via tabs
- Share a single web server across projects

## Reset Workspace

Clear all runtime state but keep project structure:

```bash
termlings --clear
```

This removes:
- Active sessions
- IPC queue files
- Message queue
- Typing state

But preserves:
- Agents (`.termlings/agents/`)
- Tasks
- Calendar
- Settings

## Troubleshooting

**".termlings already exists"**
```bash
termlings init --force    # Re-initialize
```

**"Missing directories"**
```bash
termlings init --force    # Recreate all directories
```

**"Can't find workspace"**
```bash
# From project directory
termlings init
```

Make sure you're in the project root where you want the workspace.

## File Structure Reference

```
.termlings/
├── map.json               # World/map definition
├── .gitignore            # Git ignore rules (generated)
├── sessions/
│   └── [sessionId].json  # Per-agent session state
├── store/
│   ├── messages.jsonl    # Chat history (JSONL)
│   ├── tasks/
│   │   └── tasks.json    # All tasks
│   ├── calendar/
│   │   └── calendar.json # Calendar events
│   └── browser/
│       ├── config.json   # Browser settings
│       ├── process.json  # Running process info
│       └── history.jsonl # Browser automation log
├── agents/
│   ├── [agent-name]/
│   │   ├── SOUL.md       # Personality/role
│   │   └── avatar.svg    # Visual identity
│   └── [other agents]
└── browser/
    ├── config.json       # Browser config
    └── profile.json      # Profile reference
```

## Customization

After initialization, you can customize:

1. **Agents** - Create agents with `termlings create`
2. **Calendar** - Set up events with `termlings calendar create`
3. **Tasks** - Add tasks via web UI or programmatically

## Best Practices

✅ **DO:**
- Run `termlings init` once per project
- Commit `.termlings/` to git (except node_modules-like files)
- Use `--force` if you need a clean slate
- Create agents after initialization

❌ **DON'T:**
- Manually edit `.termlings/` files (use CLI commands)
- Delete `.termlings/` without backing up first
- Run `termlings init` in multiple directories (one per project)

## Related

- [WEB.md](WEB.md) - How web workspace UI works
- [CREATE.md](CREATE.md) - Creating agents
- [CLAUDE.md](CLAUDE.md) - Getting started with Claude
