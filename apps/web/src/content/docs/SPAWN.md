# Spawn

`termlings --spawn` is the fastest way to start a workspace. It opens the Termlings UI immediately while the scheduler and configured agents start in the background from `.termlings/spawn.json`.

`termlings spawn` is the lower-level command for manual control when you want to launch one agent, all agents, or restart running sessions after SOUL/config changes.

Current behavior stays the same by default. Docker hardening is opt-in via `--docker`.

If the selected routes use dangerous YOLO flags on the host, Termlings will ask for confirmation before launch unless you pass `--allow-host-yolo`.

## Quick Start

```bash
# Open the workspace now and start the scheduler + configured agents in background
termlings --spawn

# Interactive menu (choose one agent or "spawn all")
termlings spawn

# Spawn all agents using configured routes
termlings spawn --all

# Spawn all agents inside Docker-isolated workers
termlings spawn --all --docker

# Skip the host YOLO confirmation prompt explicitly
termlings spawn --all --allow-host-yolo

# Spawn one agent on a specific runtime route
termlings spawn --agent=developer claude default
```

## Common Commands

```bash
# Spawn all
termlings spawn --all

# Spawn all in Docker-isolated workers
termlings spawn --all --docker

# Spawn all and restart existing sessions first
termlings spawn --all --respawn

# Spawn one specific agent
termlings spawn --agent=pm

# Spawn one specific agent and restart if already running
termlings spawn --agent=pm --respawn

# Run one agent in current terminal (not detached)
termlings spawn --agent=pm --inline

# Run one agent in current terminal, but inside Docker
termlings spawn --agent=pm --inline --docker
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
- `--docker` run the selected agent(s) in Docker instead of directly on the host
- `--allow-host-yolo` skip the confirmation prompt for dangerous host-native routes

## Notes

- Batch launches are detached background processes.
- `--docker` is optional. Host spawn behavior is unchanged unless you pass it.
- Host-native YOLO routes require confirmation unless you pass `--allow-host-yolo`.
- `--respawn` requires `--all` or `--agent=<slug>`.
- `--respawn` is not supported with `--inline`.
- For Codex routes, `--respawn` auto-adds `resume --last` unless explicit resume args are passed.
- Run from another terminal while `termlings` UI is open.
- Inside agent sessions, this command requires `manage_agents: true` in frontmatter.
- The first Docker spawn builds a local Termlings runtime image, then reuses it.

## Related

- [APPS.md](APPS.md)
- [TERMLINGS.md](TERMLINGS.md)
- [ORGANIZATIONS.md](ORGANIZATIONS.md)
- [SCHEDULER.md](SCHEDULER.md)
