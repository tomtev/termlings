#!/usr/bin/env node
/**
 * Termlings CLI - Refactored to use modular command handlers
 * This is the new main CLI router that delegates to individual command modules
 */

import { launchWorkspaceWeb } from "./workspace/web-launch.js";
import { launchWorkspaceTui } from "./tui/tui.js";
import { getUpdateNotice } from "./update-check.js";
import { runSimCommand } from "./sim/index.js";

const args = process.argv.slice(2);
const flags = new Set<string>();
const opts: Record<string, string> = {};
let input: string | undefined;
const positional: string[] = [];
let agentPassthrough: string[] = [];

// Known flags that take a space-separated value
const VALUE_FLAGS = new Set([
  "name", "dna", "owner", "purpose", "dangerous-skip-confirmation",
  "slug", "title", "title-short", "title_short", "role", "team", "reports-to", "reports_to",
  "port", "host", "color", "size", "padding", "bg", "fps", "duration", "out",
  "headed", "headless", "depth", "max-tokens", "maxTokens", "tab", "tab-id", "tabId",
  "from", "primary", "logo", "domain", "email", "website", "profile",
]);

// Check if first arg is an agent name
const { agents: _agentRegistry } = await import("./agents/index.js");
if (args[0] && _agentRegistry[args[0]]) {
  positional.push(args[0]);
  agentPassthrough = args.slice(1);

  // Parse --name, --dna for the launcher
  const filtered: string[] = [];
  for (let i = 0; i < agentPassthrough.length; i++) {
    const a = agentPassthrough[i]!;
    if (a.startsWith("--name=")) {
      opts.name = a.slice(7);
    } else if (a.startsWith("--dna=")) {
      opts.dna = a.slice(6);
    } else if (a === "--name" && i + 1 < agentPassthrough.length) {
      opts.name = agentPassthrough[++i]!;
    } else if (a === "--dna" && i + 1 < agentPassthrough.length) {
      opts.dna = agentPassthrough[++i]!;
    } else {
      filtered.push(a);
    }
  }
  agentPassthrough = filtered;
} else {
  // Parse arguments normally
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        opts[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
        flags.add(arg.slice(2, eqIdx));
      } else {
        const key = arg.slice(2);
        if (VALUE_FLAGS.has(key) && i + 1 < args.length && !args[i + 1]!.startsWith("-")) {
          opts[key] = args[++i]!;
          flags.add(key);
        } else {
          flags.add(key);
        }
      }
    } else if (arg === "-h") {
      flags.add("help");
    } else {
      positional.push(arg);
      if (!input) input = arg;
    }
  }
}

// Import and use the command router
import { routeCommand } from "./commands/index.js";

try {
  const command = positional[0];
  const isDefaultTuiLaunch = !command && !flags.has("clear");
  const isSpawnPicker = command === "spawn" && positional.length <= 1 && !flags.has("help");
  const updateNotice = await getUpdateNotice({ command, flags });

  if (updateNotice) {
    if (process.stdout.isTTY) {
      const { showUpdateMenu } = await import("./banner.js");
      await showUpdateMenu(updateNotice);
    } else {
      const { printUpdateNotice } = await import("./update-check.js");
      printUpdateNotice(updateNotice);
    }
  }

  if (flags.has("sim") || command === "sim") {
    await runSimCommand(positional, flags);
    process.exit(0);
  }

  const handled = await routeCommand(positional, flags, opts);

  if (!handled) {
    // Handle workspace/default commands
    if (flags.has("clear")) {
      const { clearWorkspaceIPC } = await import("./workspace/state.js");
      clearWorkspaceIPC();
      console.log("Cleared workspace runtime state");
      process.exit(0);
    }

    if (flags.has("help") || flags.has("h")) {
      console.log(`Usage: termlings [options]
       termlings avatar [dna|name] [options]
       termlings <agent> [options]

Workspace:
  termlings                Start the terminal workspace UI
  termlings web            Start the web workspace
  termlings init           Initialize .termlings in this project
  termlings --clear        Clear runtime IPC/session state

Agent System:
  termlings brief          Full workspace snapshot (run at session start)
  termlings org-chart      Show org chart (list-agents alias)
  termlings list-agents    Legacy alias for org-chart
  termlings message <target> <text>  Send DM
  termlings request <type> Request decision/env var from operator
  termlings task <cmd>     Task management
  termlings calendar <cmd> Calendar management
  termlings brand <cmd>    Brand profiles (colors/logo/voice/domain/email)

Browser Automation:
  termlings browser --help Show browser commands

Scheduler:
  termlings scheduler      Run calendar scheduler
  termlings scheduler --daemon  Run as background daemon

Avatar & Creation:
  termlings avatar <dna>   Visualize avatar
  termlings avatar object <type>  Render object
  termlings create         Create new agent

Spawn:
  termlings spawn              Pick agent + preset, then launch
  termlings spawn <preset>     Pick agent, launch with preset

Upgrade:
  npm install -g termlings@latest
  bun add -g termlings@latest

Sim (optional):
  termlings --sim                     Start sim runtime
  termlings sim                       Start sim runtime
  termlings sim walk <x>,<y>
  termlings sim gesture [wave|talk]
  termlings sim map [--agents|--ascii]
  termlings sim --help                Show sim command details
`);
      process.exit(0);
    }

    if (positional[0] === "web") {
      await launchWorkspaceWeb(opts);
      process.exit(0);
    }

    if (!positional[0] && !flags.has("clear")) {
      // Show init banner if no workspace exists yet
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      if (!existsSync(join(process.cwd(), ".termlings"))) {
        const { printInitBanner } = await import("./banner.js");
        printInitBanner();
      }

      await launchWorkspaceTui(process.cwd(), {});
      process.exit(0);
    }

    // Agent launch
    if (positional[0] === "claude") {
      const { ensureWorkspaceDirs } = await import("./workspace/state.js");
      const { discoverLocalAgents, selectLocalAgentWithRoom } = await import("./agents/discover.js");

      ensureWorkspaceDirs();
      const localAgents = discoverLocalAgents();

      if (localAgents.length > 0) {
        const selected = await selectLocalAgentWithRoom(localAgents);

        if (selected === "create-random") {
          // Generate random agent
          const { generateRandomDNA } = await import("./index.js");
          const randomDna = generateRandomDNA();
          const randomNames = ["Pixel", "Sprout", "Ember", "Nimbus", "Glitch", "Ziggy", "Quill", "Cosmo", "Maple", "Flint", "Wren", "Dusk", "Byte", "Fern", "Spark", "Nova", "Haze", "Basil", "Reef", "Orbit", "Sage", "Rusty", "Coral", "Luna", "Cinder", "Pip", "Storm", "Ivy", "Blaze", "Mochi"];
          const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];

          opts.name = opts.name || randomName;
          opts.dna = opts.dna || randomDna;

          const { launchAgent } = await import("./agents/launcher.js");
          await launchAgent(_agentRegistry.claude, agentPassthrough, opts);
        } else if (selected) {
          process.env.TERMLINGS_AGENT_NAME = opts.name || selected.soul?.name;
          process.env.TERMLINGS_AGENT_DNA = opts.dna || selected.soul?.dna;
          const { launchLocalAgent } = await import("./agents/launcher.js");
          await launchLocalAgent(selected, agentPassthrough, opts);
        }
      } else {
        // No agents, just launch the CLI directly
        const { launchAgent } = await import("./agents/launcher.js");
        await launchAgent(_agentRegistry.claude, agentPassthrough, opts);
      }
      process.exit(0);
    }

    if (positional[0] && _agentRegistry[positional[0]]) {
      const { launchAgent } = await import("./agents/launcher.js");
      await launchAgent(_agentRegistry[positional[0]], agentPassthrough, opts);
      process.exit(0);
    }

    if (positional[0] === "action") {
      console.error("`action` commands are sim-specific.")
      console.error("Run: termlings sim <walk|gesture|map> ...")
      process.exit(1)
    }

    console.error(`Unknown command: ${positional[0] || "(default)"}`);
    console.error("Run: termlings --help");
    process.exit(1);
  }
} catch (e) {
  if (e instanceof Error && e.stack) {
    console.error(e.stack);
  } else {
    console.error(`Error: ${e}`);
  }
  process.exit(1);
}
