import type { ResolvedWorkspaceApps } from "./engine/apps.js"

export function renderTopLevelHelp(apps: ResolvedWorkspaceApps): string {
  const agentSystemLines = [
    apps.brief ? "  termlings brief          Full workspace snapshot (run at session start)" : null,
    apps["org-chart"] ? "  termlings org-chart      Show org chart (list-agents alias)" : null,
    apps["org-chart"] ? "  termlings list-agents    Legacy alias for org-chart" : null,
    apps.skills ? "  termlings skills <cmd>   List/install/update skills (skills.sh wrapper)" : null,
    "  termlings agents <cmd>   Browse/install predefined teams and termlings",
    apps.messaging ? "  termlings message <target> <text>  Send DM" : null,
    apps.messaging ? "  termlings conversation <target>     Read message history" : null,
    apps.requests ? "  termlings request <type> Request decision/env var from operator" : null,
    apps.task ? "  termlings task <cmd>     Task management" : null,
    apps.workflows ? "  termlings workflow <cmd> Workflow checklists" : null,
    apps.calendar ? "  termlings calendar <cmd> Calendar management" : null,
    apps.brand ? "  termlings brand <cmd>    Brand profiles (colors/logo/voice/domain/email)" : null,
    apps.crm ? "  termlings crm <cmd>      File-based CRM records and timelines" : null,
  ].filter((line): line is string => Boolean(line))

  const browserSection = apps.browser
    ? `Browser Automation:
  termlings browser --help Show browser commands

`
    : ""

  return `Usage: termlings [options]
       termlings avatar [dna|name] [options]
       termlings <agent> [options]

Workspace:
  termlings                Start the terminal workspace UI (auto-starts scheduler daemon)
  termlings --spawn        Open workspace immediately, then spawn all agents in background
  termlings init           Initialize .termlings in this project
  termlings --server       Run secure HTTP server mode

Agent System:
${agentSystemLines.join("\n")}

${browserSection}Server:
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
