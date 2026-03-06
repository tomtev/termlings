# Spawn

`termlings spawn` launches agent runtime sessions from `.termlings/spawn.json`.

Use it to launch one agent, all agents, or restart running sessions after SOUL/config changes.

## Quick Start

```bash
# Interactive menu (choose one agent or "spawn all")
termlings spawn

# Spawn all agents using configured routes
termlings spawn --all

# Spawn one agent on a specific runtime route
termlings spawn --agent=developer claude default
```

## Common Commands

```bash
# Spawn all
termlings spawn --all

# Spawn all and restart existing sessions first
termlings spawn --all --respawn

# Spawn one specific agent
termlings spawn --agent=pm

# Spawn one specific agent and restart if already running
termlings spawn --agent=pm --respawn

# Run one agent in current terminal (not detached)
termlings spawn --agent=pm --inline
```

## Route Selection

Routes are resolved from:

- `.termlings/spawn.json` `agents.<slug>` if present
- otherwise `.termlings/spawn.json` `default`

If runtime/preset is passed directly, that route is used.

## `spawn.json` shape

```json
{
  "default": { "runtime": "claude", "preset": "default" },
  "agents": {
    "pm": { "runtime": "claude", "preset": "default" },
    "developer": { "runtime": "claude", "preset": "default" }
  },
  "runtimes": {
    "claude": {
      "default": {
        "description": "Launch with full autonomy",
        "command": "termlings claude --dangerously-skip-permissions"
      }
    },
    "codex": {
      "default": {
        "description": "Launch with full autonomy",
        "command": "termlings codex --dangerously-bypass-approvals-and-sandbox"
      }
    }
  }
}
```

## Flags

- `--all` launch all discovered agents
- `--agent=<slug>` launch one specific agent
- `--inline` run selected agent in current terminal
- `--respawn` restart already-running managed sessions before relaunch
- `--quiet` suppress most launch logs

## Notes

- Batch launches are detached background processes.
- `--respawn` requires `--all` or `--agent=<slug>`.
- `--respawn` is not supported with `--inline`.
- For Codex routes, `--respawn` auto-adds `resume --last` unless explicit resume args are passed.
- Run from another terminal while `termlings` UI is open.
- Inside agent sessions, this command requires `manage_agents: true` in frontmatter.

## Related

- [HOWITWORKS.md](HOWITWORKS.md)
- [INIT.md](INIT.md)
- [AGENTS.md](AGENTS.md)
- [ORGANIZATIONS.md](ORGANIZATIONS.md)
- [SCHEDULER.md](SCHEDULER.md)
