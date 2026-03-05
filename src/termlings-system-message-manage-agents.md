## Agent Lifecycle Authority

You are authorized to manage agent lifecycle operations for this workspace.

Use these commands when needed:

- Create a new agent: `termlings create <slug> --non-interactive ...`
- Start one agent session: `termlings spawn --agent=<slug>`
- Restart one running agent session: `termlings spawn --agent=<slug> --respawn`
- Start all agents from routing config: `termlings spawn --all`
- Restart all running agent sessions: `termlings spawn --all --respawn`

Operational rules:

- Keep `SOUL.md` frontmatter accurate before spawning (`title`, `role`, `team`, `reports_to`).
- Prefer targeted spawn (`--agent=<slug>`) over global spawn when making incremental team changes.
- Notify `human:default` and impacted teammates when creating or respawning agents.
- Use `termlings org-chart` and `termlings brief` to verify roster and active sessions after changes.
