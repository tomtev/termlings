#!/usr/bin/env node
/**
 * Termlings CLI - Refactored to use modular command handlers
 * This is the new main CLI router that delegates to individual command modules
 */

import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flags = new Set<string>();
const opts: Record<string, string> = {};
let input: string | undefined;
const positional: string[] = [];
let agentPassthrough: string[] = [];

// Known flags that take a space-separated value
const VALUE_FLAGS = new Set([
  "name", "dna", "owner", "purpose", "dangerous-skip-confirmation",
  "port", "host", "color", "size", "padding", "bg", "fps", "duration", "out"
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
  const handled = await routeCommand(positional, flags, opts);

  if (!handled) {
    // Handle workspace/default commands
    if (flags.has("clear")) {
      const { clearWorkspaceIPC } = await import("./workspace/state.js");
      clearWorkspaceIPC();
      console.log("Cleared workspace runtime state");
      process.exit(0);
    }

    if (positional[0] === "workspace" || (!positional[0] && !flags.has("clear"))) {
      // Start workspace UI - delegate to original cli.ts for now
      const { launchWorkspaceWeb } = await import("./cli.js");
      await launchWorkspaceWeb({});
      process.exit(0);
    }

    // Agent launch
    if (positional[0] === "claude") {
      const { launchAgent } = await import("./agents/launcher.js");
      await launchAgent("claude", agentPassthrough, opts);
      process.exit(0);
    }

    if (positional[0] && _agentRegistry[positional[0]]) {
      const { launchAgent } = await import("./agents/launcher.js");
      await launchAgent(positional[0], agentPassthrough, opts);
      process.exit(0);
    }

    if (flags.has("help") || flags.has("h")) {
      console.log(`Usage: termlings [options]
       termlings render [dna|name] [options]
       termlings <agent> [options]

Workspace (default):
  termlings                Start the web workspace
  termlings init           Initialize .termlings in this project
  termlings --clear        Clear runtime IPC/session state

Agent System:
  termlings list-agents    List active agents
  termlings message <target> <text>  Send DM
  termlings task <cmd>     Task management
  termlings calendar <cmd> Calendar management

Browser Automation:
  termlings browser --help Show browser commands

Scheduler:
  termlings scheduler      Run calendar scheduler
  termlings scheduler --daemon  Run as background daemon

Agent Launcher:
  termlings claude         Start Claude Code as agent
  termlings create         Create new agent
  termlings render <dna>   Render avatar
`);
      process.exit(0);
    }

    console.error(`Unknown command: ${positional[0] || "(default)"}`);
    console.error("Run: termlings --help");
    process.exit(1);
  }
} catch (e) {
  console.error(`Error: ${e}`);
  process.exit(1);
}
