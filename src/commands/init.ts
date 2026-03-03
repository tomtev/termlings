/**
 * Workspace initialization command
 */

export async function handleInit(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  if (flags.has("help")) {
    console.log(`
🚀 Init - Initialize Termlings workspace

Set up a new Termlings project with agents, tasks, calendar, and storage.

USAGE:
  termlings init              Initialize new workspace (interactive)
  termlings init --force      Re-run setup and template selection

CREATES:
  .termlings/
  ├── agents/                Saved agents (avatar + metadata)
  ├── sessions/              Active agent sessions
  ├── store/                 Persistent data
  ├── browser/               Browser automation profile
  └── VISION.md              Project vision injected into agent context (template-provided)

TEMPLATES:
  Currently available:
  • office - Corporate setting with 5 default agents
  (More templates coming)

EXAMPLES:
  $ termlings init
  🚀 Initializing Termlings workspace
  Select a template: office
  ✓ Workspace created

  $ termlings init --force
  🚀 Re-initializing Termlings workspace
  (Keeps existing data, re-runs setup)

NEXT STEPS:
  1. termlings             Start the workspace web UI
  2. termlings claude      Launch Claude Code as an agent
  3. termlings org-chart   See team hierarchy
  4. termlings task list   Check available tasks
`);
    return;
  }

  const forceSetup = flags.has("force");
  if (!forceSetup) {
    const { existsSync } = await import("fs");
    const { join } = await import("path");
    if (existsSync(join(process.cwd(), ".termlings"))) {
      console.log("Workspace already exists at .termlings");
      console.log("Run `termlings init --force` to re-run setup and template selection.");
      process.exit(0);
    }
  }

  // Show logo banner before init prompts
  const { printInitBanner, printPostInitBanner } = await import("../banner.js");
  printInitBanner();

  const { ensureWorkspaceInitializedForLaunch } = await import("../workspace/web-launch.js");
  const ready = await ensureWorkspaceInitializedForLaunch(forceSetup);
  if (ready) {
    // Count agents for post-init banner
    const { discoverLocalAgents } = await import("../agents/discover.js");
    const agents = discoverLocalAgents();
    printPostInitBanner(agents.length);
  }
  process.exit(0);
}
