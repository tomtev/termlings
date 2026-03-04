# Workspace Initialization

Initialize a Termlings workspace in your project.

## Quick Start

```bash
termlings init
```

This creates `.termlings/` directory with all necessary files and folders.

## Prerequisites

Before running `termlings init`, have at least one coding runtime installed and logged in:

- Claude Code CLI (`claude`)
- Codex CLI (`codex`)

`init` now checks this and exits early if neither runtime is authenticated.

## Start the Workspace

After init, you have two launch patterns:

### Single terminal (auto-spawn all, requires tmux)
```bash
termlings --auto-spawn
```

This starts the control panel inside tmux and spawns all agent windows in the same tmux session. When the control panel exits, that tmux session is torn down.

### Two terminals (manual spawn flow)
```bash
# terminal 1
termlings

# terminal 2
termlings spawn
```

## What Gets Created

```
.termlings/
├── VISION.md                     # Project vision (template-provided)
├── sessions/                     # Active agent sessions
├── store/
│   ├── messages/                # Message history (channels/dms/system + index)
│   ├── presence/                # Terminal typing/activity state
│   ├── tasks/
│   │   └── tasks.json           # Task definitions
│   ├── calendar/
│   │   └── calendar.json        # Calendar events
├── agents/                       # Saved agent definitions
│   └── [your agents here]
└── browser/                      # Browser automation runtime state
    ├── config.json              # Browser settings (created on browser init/start)
    ├── process.json             # Running process info (when browser is started)
    ├── history/
    │   ├── all.jsonl            # Browser action log (global stream)
    │   └── agent/
    │       └── [agent].jsonl    # Browser action log (per agent)
    └── profile.json             # Profile reference for this project
```

## Running Initialization

### Default (interactive)
```bash
termlings init
```

You'll be prompted to:
1. Confirm project setup
2. Pick a workspace template
3. Set your operator name
4. Choose `.termlings/.gitignore` mode:
   - Ignore all
   - Ignore messages (recommended)
   - No ignore
5. Pick default model runtime (Claude/Codex/Pi)

### Force re-run
```bash
termlings init --force
```

Re-runs initialization even if `.termlings/` already exists. Useful for:
- Resetting workspace state
- Updating to new Termlings version
- Adding missing directories

### Choose explicit template
```bash
termlings init --template default
termlings init --template executeive-team
termlings init --template personal-assistant
termlings init --template https://github.com/your-org/termlings-template.git#main
```

For template formats and layout requirements, see [TEMPLATES.md](TEMPLATES.md).

## First Time Setup

When you first run `termlings` in a project:

1. It checks for `.termlings/`
2. If missing, it shows the init banner and creates minimal workspace directories
3. Launches the terminal workspace UI

For full template setup, run `termlings init --template <template-name>`.

Available local templates:
- `default` - PM-led startup team (PM has `manage_agents: true`; others do not)
- `executeive-team` - Executive leadership team (all executive agents have `manage_agents: true`)
- `personal-assistant` - Single personal assistant (`agent:personal-assistant`) with `manage_agents: true`

## Reset Runtime Files

To clear stale runtime presence without touching tasks/calendar/agents:

```bash
rm -f .termlings/sessions/*.json
rm -f .termlings/store/presence/*.typing.json
```

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

**"No authenticated coding runtime found"**
```bash
# Option 1
claude auth login

# Option 2
codex login
```

You only need one of Claude or Codex installed and logged in.

## File Structure Reference

```
.termlings/
├── VISION.md             # Project vision for agent context
├── .gitignore            # Git ignore rules (generated)
├── sessions/
│   └── [sessionId].json  # Per-agent session state
├── store/
│   ├── messages/         # Chat/DM/system history
│   ├── presence/         # Session typing/activity state
│   ├── tasks/
│   │   └── tasks.json    # All tasks
│   ├── calendar/
│   │   └── calendar.json # Calendar events
├── agents/
│   ├── [agent-name]/
│   │   ├── SOUL.md       # Personality/role
│   │   └── avatar.svg    # Visual identity
│   └── [other agents]
└── browser/
    ├── config.json       # Browser config
    ├── process.json      # Running process state
    ├── history/
    │   ├── all.jsonl     # Browser automation log (global)
    │   └── agent/*.jsonl # Browser automation log (per agent)
    └── profile.json      # Profile reference
```

## Customization

After initialization, you can customize:

1. **Agents** - Create agents with `termlings create`
2. **Calendar** - Set up events with `termlings calendar create`
3. **Tasks** - Add tasks via CLI or programmatically

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

- [CREATE.md](CREATE.md) - Creating agents
- [CLAUDE.md](CLAUDE.md) - Getting started with Claude
