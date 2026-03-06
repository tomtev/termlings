#!/usr/bin/env node
/**
 * Termlings CLI - Refactored to use modular command handlers
 * This is the new main CLI router that delegates to individual command modules
 */

import { launchWorkspaceTui } from "./tui/tui.js";
import { getUpdateNotice } from "./update-check.js";
import { loadTermlingsEnv } from "./engine/env.js";
import { renderTopLevelHelp } from "./help.js";

async function ensureSchedulerDaemon(root: string): Promise<void> {
  const { ensureManagedRuntimeProcess } = await import("./engine/runtime-processes.js");
  const scheduler = await ensureManagedRuntimeProcess({
    key: "scheduler",
    kind: "scheduler",
    args: ["scheduler", "--daemon"],
    root,
    startupProbeMs: 0,
  });
  if (!scheduler.ok) {
    console.error(`Warning: failed to start scheduler daemon: ${scheduler.error || "unknown error"}`);
    console.error("Run `termlings scheduler --daemon` manually in another terminal if needed.");
  }
}

async function startSpawnAllInBackground(root: string): Promise<{ ok: boolean; pid?: number; error?: string }> {
  const [{ join, resolve }, { spawn }] = await Promise.all([
    import("path"),
    import("child_process"),
  ]);

  const cliEntry = (process.argv[1] || "").trim().length > 0
    ? resolve(process.argv[1]!)
    : join(root, "bin", "termlings.js");
  const command = (process.execPath || "").trim() || "bun";
  const commandArgs = [cliEntry, "spawn", "--all", "--quiet"];
  const sessionEnv = {
    ...(process.env as Record<string, string | undefined>),
  };
  delete sessionEnv.TERMLINGS_SESSION_ID;
  delete sessionEnv.TERMLINGS_AGENT_NAME;
  delete sessionEnv.TERMLINGS_AGENT_DNA;
  delete sessionEnv.TERMLINGS_AGENT_SLUG;
  delete sessionEnv.TERMLINGS_CONTEXT;
  delete sessionEnv.TERMLINGS_IPC_DIR;

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(sessionEnv)) {
    if (typeof value !== "string") continue;
    env[key] = value;
  }

  try {
    const child = spawn(command, commandArgs, {
      cwd: root,
      detached: true,
      stdio: "ignore",
      env,
    });
    child.unref();

    const pid = child.pid;
    if (!Number.isFinite(pid) || (pid ?? 0) <= 0) {
      return { ok: false, error: "failed to launch spawn worker" };
    }

    return { ok: true, pid: pid as number };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

const args = process.argv.slice(2);
loadTermlingsEnv();
const flags = new Set<string>();
const opts: Record<string, string> = {};
let input: string | undefined;
const positional: string[] = [];
let agentPassthrough: string[] = [];

// Known flags that take a space-separated value
const VALUE_FLAGS = new Set([
  "name", "dna", "owner", "purpose",
  "slug", "title", "title-short", "title_short", "role", "team", "reports-to", "reports_to",
  "port", "host", "color", "size", "padding", "bg", "fps", "duration", "out",
  "headed", "headless", "depth", "max-tokens", "maxTokens", "tab", "tab-id", "tabId", "limit",
  "from", "primary", "logo", "domain", "email", "website", "profile", "template",
  "to", "cc", "bcc", "subject", "send-at", "send_at",
  "token", "cors-origin", "cors_origin", "allowed-projects", "allowed_projects",
  "max-body-kb", "max_body_kb", "rate-limit", "rate_limit", "sse-max", "sse_max",
  "agent", "account", "folder", "scope", "type", "status", "stage", "tags", "query", "attrs",
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
  const isDefaultTuiLaunch = !command;
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

  const handled = await routeCommand(positional, flags, opts);

  if (!handled) {
    if (flags.has("server") && !flags.has("help") && !flags.has("h")) {
      const { startServer } = await import("./server/index.js");
      await startServer(opts, process.cwd());
      process.exit(0);
    }

    if (flags.has("help") || flags.has("h")) {
      const { resolveWorkspaceAppsForAgent } = await import("./engine/apps.js");
      const visibleApps = resolveWorkspaceAppsForAgent(process.env.TERMLINGS_AGENT_SLUG || undefined);
      console.log(renderTopLevelHelp(visibleApps));
      process.exit(0);
    }

    if (!positional[0]) {
      const allowedTopLevelFlags = new Set(["help", "h", "server", "spawn"]);
      const unsupportedFlags = Array.from(flags).filter((flag) => !allowedTopLevelFlags.has(flag));
      if (unsupportedFlags.length > 0) {
        console.error(`Unknown option(s): ${unsupportedFlags.map((flag) => `--${flag}`).join(", ")}`);
        console.error("Run: termlings --help");
        process.exit(1);
      }
      const spawnStartup = flags.has("spawn");

      // Show init banner if no workspace exists yet
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      if (!existsSync(join(process.cwd(), ".termlings"))) {
        const { handleInit } = await import("./commands/init.js");
        const initExit = await handleInit(new Set(), ["init"], {}, { exitOnComplete: !spawnStartup });
        if (!spawnStartup) {
          process.exit(0);
        }
        if (typeof initExit === "number" && initExit !== 0) {
          process.exit(initExit);
        }
        if (!existsSync(join(process.cwd(), ".termlings"))) {
          console.error("Workspace setup was not completed; --spawn startup cancelled.");
          process.exit(1);
        }
      }

      const { discoverLocalAgents } = await import("./agents/discover.js");
      let agents = discoverLocalAgents();
      if (agents.length === 0) {
        const { handleInit } = await import("./commands/init.js");
        const initExit = await handleInit(new Set(["force"]), ["init"], {}, { exitOnComplete: !spawnStartup });
        if (!spawnStartup) {
          process.exit(0);
        }
        if (typeof initExit === "number" && initExit !== 0) {
          process.exit(initExit);
        }
        agents = discoverLocalAgents();
      }

      if (spawnStartup) {
        if (agents.length === 0) {
          console.error("No agents found in .termlings/agents after setup.");
          console.error("Add at least one agent, then run `termlings --spawn` again.");
          process.exit(1);
        }
        const root = process.cwd();
        await ensureSchedulerDaemon(root);
        const { appendWorkspaceMessage } = await import("./workspace/state.js");
        const startupSpawn = await startSpawnAllInBackground(root);
        if (startupSpawn.ok) {
          appendWorkspaceMessage({
            kind: "system",
            from: "system",
            fromName: "Workspace",
            text: "Spawning agents in background...",
          }, root);
        } else {
          const detail = startupSpawn.error || "unknown error";
          appendWorkspaceMessage({
            kind: "system",
            from: "system",
            fromName: "Workspace",
            text: `Background spawn failed: ${detail}`,
          }, root);
          console.error(`Warning: failed to start background spawn worker: ${detail}`);
        }

        process.env.TERMLINGS_SPAWN_DETACHED = "1";
        await launchWorkspaceTui(root);
        process.exit(0);
      }

      const root = process.cwd();
      await ensureSchedulerDaemon(root);
      await launchWorkspaceTui(root);
      process.exit(0);
    }

    // Agent launch
    if (positional[0] && _agentRegistry[positional[0]]) {
      const runtimeName = positional[0]
      const runtimeAdapter = _agentRegistry[runtimeName]!
      const { ensureWorkspaceDirs } = await import("./workspace/state.js");
      const { discoverLocalAgents, selectLocalAgentWithRoom } = await import("./agents/discover.js");

      ensureWorkspaceDirs();
      const localAgents = discoverLocalAgents();

      if (localAgents.length > 0) {
        const selected = await selectLocalAgentWithRoom(localAgents);

        if (selected === "create-random") {
          // Generate random agent
          const { generateRandomDNA } = await import("./index.js");
          const { generateFunName } = await import("./name-generator.js")
          const randomDna = generateRandomDNA();
          const randomName = generateFunName()

          opts.name = opts.name || randomName;
          opts.dna = opts.dna || randomDna;

          const { launchAgent } = await import("./agents/launcher.js");
          await launchAgent(runtimeAdapter, agentPassthrough, opts);
        } else if (selected) {
          process.env.TERMLINGS_AGENT_NAME = opts.name || selected.soul?.name;
          process.env.TERMLINGS_AGENT_DNA = opts.dna || selected.soul?.dna;
          const { launchLocalAgent } = await import("./agents/launcher.js");
          await launchLocalAgent(selected, agentPassthrough, opts, runtimeAdapter);
        }
      } else {
        // No agents, just launch the CLI directly
        const { launchAgent } = await import("./agents/launcher.js");
        await launchAgent(runtimeAdapter, agentPassthrough, opts);
      }
      process.exit(0);
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
