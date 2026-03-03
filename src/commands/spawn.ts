/**
 * Spawn command: run runtime presets from .termlings/spawn.json.
 * Supports batch launch into tmux windows for control-plane workflows.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { discoverLocalAgents } from "../agents/discover.js"
import {
  ensureControlSession,
  focusTmuxWindow,
  isInsideTmux,
  isTmuxAvailable,
  openAgentWindow,
  projectTmuxSessionName,
  tmuxHasSession,
} from "../engine/tmux.js"

interface Preset {
  description: string
  command: string
}

type SpawnConfig = Record<string, Record<string, Preset>>

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
}

function loadSpawnConfig(projectRoot = process.cwd()): SpawnConfig | null {
  const configPath = join(projectRoot, ".termlings", "spawn.json")
  if (!existsSync(configPath)) return null
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"))
  } catch {
    return null
  }
}

function commandParts(command: string): string[] {
  return command.split(/\s+/).filter(Boolean)
}

function parsePresetCommand(command: string): {
  runtimeName: string
  passthroughArgs: string[]
  opts: Record<string, string>
} | null {
  const parts = commandParts(command)
  if (parts[0] === "termlings") parts.shift()
  if (parts.length === 0) return null

  const runtimeName = parts[0]!
  const restArgs = parts.slice(1)
  const passthroughArgs: string[] = []
  const opts: Record<string, string> = {}

  for (let i = 0; i < restArgs.length; i++) {
    const arg = restArgs[i]!
    if (arg.startsWith("--name=")) {
      opts.name = arg.slice(7)
    } else if (arg.startsWith("--dna=")) {
      opts.dna = arg.slice(6)
    } else if (arg === "--name" && i + 1 < restArgs.length) {
      opts.name = restArgs[++i]!
    } else if (arg === "--dna" && i + 1 < restArgs.length) {
      opts.dna = restArgs[++i]!
    } else {
      passthroughArgs.push(arg)
    }
  }

  return { runtimeName, passthroughArgs, opts }
}

async function routePresetCommand(command: string, options: { agentSlug?: string } = {}): Promise<void> {
  const parsed = parsePresetCommand(command)
  if (!parsed) return

  const { runtimeName, passthroughArgs, opts } = parsed
  const { agents: agentRegistry } = await import("../agents/index.js")
  const runtimeAdapter = runtimeName ? agentRegistry[runtimeName] : undefined
  if (!runtimeAdapter) {
    console.error(`Unknown runtime in preset command: ${runtimeName}`)
    process.exit(1)
  }

  const { ensureWorkspaceDirs } = await import("../workspace/state.js")
  const { selectLocalAgentWithRoom } = await import("../agents/discover.js")

  ensureWorkspaceDirs()
  const localAgents = discoverLocalAgents()

  if (options.agentSlug) {
    const selected = localAgents.find((agent) => agent.name === options.agentSlug)
    if (!selected) {
      console.error(`Unknown agent slug: ${options.agentSlug}`)
      const available = localAgents.map((agent) => agent.name).join(", ")
      if (available) console.error(`Available: ${available}`)
      process.exit(1)
    }
    process.env.TERMLINGS_AGENT_NAME = opts.name || selected.soul?.name
    process.env.TERMLINGS_AGENT_DNA = opts.dna || selected.soul?.dna
    const { launchLocalAgent } = await import("../agents/launcher.js")
    await launchLocalAgent(selected, passthroughArgs, opts, runtimeAdapter)
    return
  }

  if (localAgents.length > 0) {
    const selected = await selectLocalAgentWithRoom(localAgents)

    if (selected === "create-random") {
      const { generateRandomDNA } = await import("../index.js")
      const { generateFunName } = await import("../name-generator.js")
      opts.name = opts.name || generateFunName()
      opts.dna = opts.dna || generateRandomDNA()
      const { launchAgent } = await import("../agents/launcher.js")
      await launchAgent(runtimeAdapter, passthroughArgs, opts)
      return
    }

    if (selected) {
      process.env.TERMLINGS_AGENT_NAME = opts.name || selected.soul?.name
      process.env.TERMLINGS_AGENT_DNA = opts.dna || selected.soul?.dna
      const { launchLocalAgent } = await import("../agents/launcher.js")
      await launchLocalAgent(selected, passthroughArgs, opts, runtimeAdapter)
      return
    }
  }

  const { launchAgent } = await import("../agents/launcher.js")
  await launchAgent(runtimeAdapter, passthroughArgs, opts)
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

async function spawnAgentWindows(
  runtimeName: string,
  presetName: string,
  agentSlugs: string[],
  extraArgs: string[],
  quiet = false,
): Promise<void> {
  if (!isTmuxAvailable()) {
    console.error("tmux is required for batch spawn.")
    console.error("Install tmux and run `termlings` to start the control workspace.")
    process.exit(1)
  }

  const root = process.cwd()
  const ensured = ensureControlSession(root)
  if (!ensured.ok) {
    console.error(ensured.error || "Failed to create Termlings tmux session.")
    process.exit(1)
  }

  const sessionName = ensured.sessionName
  const created: string[] = []
  const existing: string[] = []
  const failed: Array<{ slug: string; error: string }> = []

  for (const slug of agentSlugs) {
    const result = openAgentWindow(sessionName, root, runtimeName, presetName, slug, extraArgs)
    if (result.ok && result.created) {
      created.push(slug)
    } else if (result.ok) {
      existing.push(slug)
    } else {
      failed.push({ slug, error: result.error || "unknown error" })
    }
  }

  if (!quiet && created.length > 0) {
    console.log(`Launched ${created.length} agent window(s): ${created.join(", ")}`)
  }
  if (!quiet && existing.length > 0) {
    console.log(`Already running (${existing.length}): ${existing.join(", ")}`)
  }
  if (failed.length > 0) {
    for (const item of failed) {
      console.error(`Failed to launch ${item.slug}: ${item.error}`)
    }
    process.exit(1)
  }

  if (!isInsideTmux() && tmuxHasSession(sessionName)) {
    const focus = focusTmuxWindow(sessionName, "control")
    if (!focus.ok) {
      console.error(focus.error || "Failed to attach tmux session.")
      process.exit(1)
    }
  }
}

export async function handleSpawn(
  flags: Set<string>,
  positional: string[],
  opts: Record<string, string>,
): Promise<void> {
  if (flags.has("help")) {
    console.log(`
Spawn - Launch agent runtimes

USAGE:
  termlings spawn                           Pick a preset interactively
  termlings spawn <runtime>                 Run default preset for runtime
  termlings spawn <runtime> <preset>        Run a specific preset
  termlings spawn --all [runtime] [preset]  Launch all agents in tmux windows
  termlings spawn --agent=<slug> [runtime] [preset]  Launch one specific agent
  termlings spawn --inline ...              Run in current terminal (no tmux window)

EXAMPLES:
  termlings spawn --all
  termlings spawn --all claude auto
  termlings spawn --agent=developer codex safe
  termlings spawn claude auto

NOTES:
  - Batch launch uses tmux windows named agent:<slug>.
  - Run \`termlings peek <slug>\` to jump into an agent terminal.
  - Run \`termlings control\` to return to the workspace window.
`)
    return
  }

  const config = loadSpawnConfig() || DEFAULT_CONFIG
  const runtimes = Object.keys(config)
  const spawnAll = flags.has("all")
  const quiet = flags.has("quiet")
  const inline = flags.has("inline")
  const specificAgent = (opts.agent || "").trim()
  const hasBatchTarget = spawnAll || specificAgent.length > 0

  let runtimeName = positional[1]
  let presetName = positional[2]

  if (hasBatchTarget) {
    runtimeName = runtimeName || "claude"
    presetName = presetName || "default"
  }

  if (!runtimeName) {
    const { renderBanner } = await import("../banner.js")
    const { selectMenu } = await import("../interactive-menu.js")
    const menuItems: { value: string; label: string; description: string }[] = []

    for (const [runtime, presets] of Object.entries(config)) {
      for (const [name, preset] of Object.entries(presets)) {
        if (name === "default") continue
        const isDefault = preset.command === presets.default?.command
        const label = isDefault ? `${runtime} ${name} (default)` : `${runtime} ${name}`
        menuItems.push({
          value: preset.command,
          label,
          description: `${preset.description}\n\x1b[90m   ${preset.command}\x1b[0m`,
        })
      }
    }

    const selectedCommand = await selectMenu(menuItems, "Select a spawn preset:", {
      header: renderBanner([]),
      footer: "Tip: use `termlings` for control + peek, or run `termlings spawn --all`.",
    })

    await routePresetCommand(selectedCommand)
    return
  }

  const runtimePresets = config[runtimeName]
  if (!runtimePresets) {
    console.error(`Unknown runtime: "${runtimeName}"`)
    console.log(`Available: ${runtimes.join(", ")}`)
    process.exit(1)
  }

  if (!presetName) {
    const defaultPreset = runtimePresets.default
    if (defaultPreset) {
      await routePresetCommand(defaultPreset.command)
      return
    }

    console.log(`${runtimeName}:\n`)
    for (const [name, preset] of Object.entries(runtimePresets)) {
      console.log(`  ${name.padEnd(16)} ${preset.description}`)
    }
    console.log(`\nRun: termlings spawn ${runtimeName} <preset>`)
    return
  }

  const preset = runtimePresets[presetName]
  if (!preset) {
    console.error(`Unknown preset: "${presetName}"`)
    console.log(`Available for ${runtimeName}:`)
    for (const name of Object.keys(runtimePresets)) {
      console.log(`  ${name}`)
    }
    process.exit(1)
  }

  const extraArgs = positional.slice(3)
  const fullCommand = extraArgs.length > 0 ? `${preset.command} ${extraArgs.join(" ")}` : preset.command

  if (!hasBatchTarget) {
    await routePresetCommand(fullCommand)
    return
  }

  const localAgents = discoverLocalAgents()
  if (localAgents.length === 0) {
    console.error("No agents found in .termlings/agents.")
    console.error("Run `termlings init` first.")
    process.exit(1)
  }

  const agentSlugs = specificAgent
    ? [specificAgent]
    : unique(localAgents.map((agent) => agent.name))

  const knownSlugs = new Set(localAgents.map((agent) => agent.name))
  const unknown = agentSlugs.filter((slug) => !knownSlugs.has(slug))
  if (unknown.length > 0) {
    console.error(`Unknown agent slug(s): ${unknown.join(", ")}`)
    console.error(`Available: ${localAgents.map((agent) => agent.name).join(", ")}`)
    process.exit(1)
  }

  if (inline) {
    if (agentSlugs.length !== 1) {
      console.error("`--inline` requires exactly one agent (use --agent=<slug>).")
      process.exit(1)
    }
    await routePresetCommand(fullCommand, { agentSlug: agentSlugs[0] })
    return
  }

  await spawnAgentWindows(runtimeName, presetName, agentSlugs, extraArgs, quiet)
}
