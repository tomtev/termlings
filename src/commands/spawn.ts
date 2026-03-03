/**
 * Spawn command: run named command presets from .termlings/spawn.json
 * Presets are grouped by runtime (claude, codex, pi, etc.)
 * Routes internally — no subprocess, same speed as typing the command directly.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

interface Preset {
  description: string;
  command: string;
}

type SpawnConfig = Record<string, Record<string, Preset>>;

const DEFAULT_CONFIG: SpawnConfig = {
  claude: {
    default: {
      description: "Launch with full autonomy",
      command: "termlings claude --dangerously-skip-permissions",
    },
    auto: {
      description: "Launch with full autonomy (skip all permission prompts)",
      command: "termlings claude --dangerously-skip-permissions",
    },
    safe: {
      description: "Launch in safe mode (default permissions)",
      command: "termlings claude",
    },
  },
  codex: {
    default: {
      description: "Launch with full autonomy",
      command: "termlings codex --dangerously-bypass-approvals-and-sandbox",
    },
    auto: {
      description: "Launch with full autonomy (bypass approvals and sandbox)",
      command: "termlings codex --dangerously-bypass-approvals-and-sandbox",
    },
    safe: {
      description: "Launch in safe mode (default permissions)",
      command: "termlings codex",
    },
  },
};

function loadSpawnConfig(projectRoot = process.cwd()): SpawnConfig | null {
  const configPath = join(projectRoot, ".termlings", "spawn.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Parse a preset command string into positional args and flags,
 * then route through the existing CLI logic — no subprocess.
 */
async function routePresetCommand(command: string): Promise<void> {
  const parts = command.split(/\s+/).filter(Boolean);

  // Strip leading "termlings" if present
  if (parts[0] === "termlings") parts.shift();
  if (parts.length === 0) return;

  const subcommand = parts[0];
  const restArgs = parts.slice(1);

  // Parse flags from the rest
  const passthroughArgs: string[] = [];
  const opts: Record<string, string> = {};

  for (let i = 0; i < restArgs.length; i++) {
    const a = restArgs[i]!;
    if (a.startsWith("--name=")) {
      opts.name = a.slice(7);
    } else if (a.startsWith("--dna=")) {
      opts.dna = a.slice(6);
    } else if (a === "--name" && i + 1 < restArgs.length) {
      opts.name = restArgs[++i]!;
    } else if (a === "--dna" && i + 1 < restArgs.length) {
      opts.dna = restArgs[++i]!;
    } else {
      passthroughArgs.push(a);
    }
  }

  // Route to the agent launcher directly
  const { agents: agentRegistry } = await import("../agents/index.js");
  const runtimeAdapter = subcommand ? agentRegistry[subcommand] : undefined;

  if (runtimeAdapter) {
    const { ensureWorkspaceDirs } = await import("../workspace/state.js");
    const { discoverLocalAgents, selectLocalAgentWithRoom } = await import("../agents/discover.js");

    ensureWorkspaceDirs();
    const localAgents = discoverLocalAgents();

    if (localAgents.length > 0) {
      const selected = await selectLocalAgentWithRoom(localAgents);

      if (selected === "create-random") {
        const { generateRandomDNA } = await import("../index.js");
        const { generateFunName } = await import("../name-generator.js")
        opts.name = opts.name || generateFunName();
        opts.dna = opts.dna || generateRandomDNA();
        const { launchAgent } = await import("../agents/launcher.js");
        await launchAgent(runtimeAdapter, passthroughArgs, opts);
      } else if (selected) {
        process.env.TERMLINGS_AGENT_NAME = opts.name || selected.soul?.name;
        process.env.TERMLINGS_AGENT_DNA = opts.dna || selected.soul?.dna;
        const { launchLocalAgent } = await import("../agents/launcher.js");
        await launchLocalAgent(selected, passthroughArgs, opts, runtimeAdapter);
      }
    } else {
      const { launchAgent } = await import("../agents/launcher.js");
      await launchAgent(runtimeAdapter, passthroughArgs, opts);
    }
  }
}

export async function handleSpawn(
  flags: Set<string>,
  positional: string[]
) {
  if (flags.has("help")) {
    console.log(`
Spawn - Run command presets

Launch agents with saved command presets, grouped by runtime.
Presets are defined in .termlings/spawn.json.

USAGE:
  termlings spawn                    Pick a preset interactively
  termlings spawn <runtime>          Run default preset for runtime
  termlings spawn <runtime> <preset> Run a specific preset
  termlings spawn --help             Show this help

EXAMPLES:
  termlings spawn claude auto        Launch claude with full autonomy
  termlings spawn claude safe        Launch claude in safe mode
  termlings spawn codex auto         Launch codex with full autonomy
  termlings spawn codex safe         Launch codex in safe mode

PRESET FILE (.termlings/spawn.json):
  {
    "claude": {
      "auto": {
        "description": "Launch with full autonomy",
        "command": "termlings claude --dangerously-skip-permissions"
      },
      "safe": {
        "description": "Launch in safe mode",
        "command": "termlings claude"
      }
    },
    "codex": {
      "auto": {
        "description": "Launch with full autonomy",
        "command": "termlings codex --dangerously-bypass-approvals-and-sandbox"
      },
      "safe": {
        "description": "Launch in safe mode",
        "command": "termlings codex"
      }
    }
  }
`);
    return;
  }

  // Render logo banner for the menu header
  const { renderBanner } = await import("../banner.js");

  const config = loadSpawnConfig() || DEFAULT_CONFIG;
  const runtimes = Object.keys(config);

  const runtimeName = positional[1];
  const presetName = positional[2];

  // No args: show picker with all presets
  if (!runtimeName) {
    const { selectMenu } = await import("../interactive-menu.js");
    const menuItems: { value: string; label: string; description: string }[] = [];

    for (const [runtime, presets] of Object.entries(config)) {
      for (const [name, preset] of Object.entries(presets)) {
        if (name === "default") continue;
        const isDefault = preset.command === presets["default"]?.command;
        const label = isDefault ? `${runtime} ${name} (default)` : `${runtime} ${name}`;
        menuItems.push({
          value: preset.command,
          label,
          description: `${preset.description}\n\x1b[90m   ${preset.command}\x1b[0m`,
        });
      }
    }

    const selectedCommand = await selectMenu(menuItems, "Select a spawn preset:", {
      header: renderBanner([]),
      footer: "Edit presets in .termlings/spawn.json",
    });

    await routePresetCommand(selectedCommand);
    return;
  }

  const runtimePresets = config[runtimeName];
  if (!runtimePresets) {
    console.error(`Unknown runtime: "${runtimeName}"`);
    console.log(`Available: ${runtimes.join(", ")}`);
    process.exit(1);
  }

  // Runtime only: run default preset if it exists, otherwise list
  if (!presetName) {
    const defaultPreset = runtimePresets["default"];
    if (defaultPreset) {
      await routePresetCommand(defaultPreset.command);
      return;
    }

    console.log(`${runtimeName}:\n`);
    for (const [name, preset] of Object.entries(runtimePresets)) {
      console.log(`  ${name.padEnd(16)} ${preset.description}`);
    }
    console.log(`\nRun: termlings spawn ${runtimeName} <preset>`);
    return;
  }

  const preset = runtimePresets[presetName];
  if (!preset) {
    console.error(`Unknown preset: "${presetName}"`);
    console.log(`Available for ${runtimeName}:`);
    for (const name of Object.keys(runtimePresets)) {
      console.log(`  ${name}`);
    }
    process.exit(1);
  }

  // Append any extra args
  const extraArgs = positional.slice(3).join(" ");
  const fullCommand = extraArgs ? `${preset.command} ${extraArgs}` : preset.command;

  await routePresetCommand(fullCommand);
}
