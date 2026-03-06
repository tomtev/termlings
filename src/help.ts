import { listEnabledAppCommands } from "./apps/registry.js"
import type { ResolvedWorkspaceApps } from "./engine/apps.js"

export function renderTopLevelHelp(apps: ResolvedWorkspaceApps): string {
  const appCommands = listEnabledAppCommands(apps)
  const width = Math.max(
    "termlings agents <cmd>".length,
    ...appCommands.map((command) => command.usage.length),
  ) + 2
  const agentAppLines = [
    ...appCommands.map((command) => `  ${command.usage.padEnd(width)}${command.summary}`),
    `  ${"termlings agents <cmd>".padEnd(width)}Browse/install predefined teams and termlings`,
  ]

  return `Usage: termlings [options]
       termlings avatar [dna|name] [options]
       termlings <agent> [options]

Workspace:
  termlings                Start the terminal workspace UI (auto-starts scheduler daemon)
  termlings --spawn        Open workspace immediately, then spawn all agents in background
  termlings init           Initialize .termlings in this project
  termlings --server       Run secure HTTP server mode

Agent Apps:
${agentAppLines.join("\n")}

Server:
  termlings --server [--host <host>] [--port <port>]
  --token <token>           API token (or TERMLINGS_API_TOKEN)
  --cors-origin <origin>    Allow browser origin (repeat via CSV)

Scheduler:
  termlings scheduler      Run scheduled work checks (calendar/tasks)
  termlings scheduler --daemon  Run as background daemon

Avatar & Creation:
  termlings avatar <dna>   Visualize avatar
  termlings create         Create new agent

Spawn:
  termlings spawn                      Interactive spawn picker (run in another terminal)
  termlings spawn --all                Spawn all agents
  termlings spawn --agent=<slug> ...   Spawn one agent
  termlings spawn ... --inline         Run one agent in current terminal

Upgrade:
  npm install -g termlings@latest
  bun add -g termlings@latest
`
}
