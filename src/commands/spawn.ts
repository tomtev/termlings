/**
 * Spawn command: run runtime presets from .termlings/spawn.json.
 * Supports batch launch into tmux windows for control-plane workflows.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { discoverLocalAgents } from "../agents/discover.js"
import { decodeDNA, getTraitColors } from "../index.js"
import { confirm } from "../interactive-menu.js"
import {
  configureAgentSession,
  focusTmuxWindow,
  isInsideTmux,
  isTmuxAvailable,
  killTmuxWindow,
  listTmuxWindows,
  openAgentWindow,
  tmuxHasSession,
  projectTmuxSessionName,
} from "../engine/tmux.js"

interface Preset {
  description: string
  command: string
}

interface SpawnRoute {
  runtime: string
  preset: string
}

type RuntimePresets = Record<string, Record<string, Preset>>

interface SpawnConfig {
  default: SpawnRoute
  agents: Record<string, SpawnRoute>
  runtimes: RuntimePresets
}

interface AgentLaunchTarget {
  slug: string
  runtimeName: string
  presetName: string
}

const DANGEROUS_LAUNCH_FLAGS = [
  "--dangerously-skip-permissions",
  "--dangerously-bypass-approvals-and-sandbox",
  "--dangerous-skip-confirmation",
]

const DEFAULT_CONFIG: SpawnConfig = {
  default: {
    runtime: "claude",
    preset: "default",
  },
  agents: {
    pm: { runtime: "claude", preset: "default" },
    developer: { runtime: "claude", preset: "default" },
    designer: { runtime: "claude", preset: "default" },
    growth: { runtime: "claude", preset: "default" },
    support: { runtime: "claude", preset: "default" },
  },
  runtimes: {
    claude: {
      default: {
        description: "Launch with full autonomy",
        command: "termlings claude --dangerously-skip-permissions",
      },
      auto: {
        description: "Launch with full autonomy (skip all permission prompts)",
        command: "termlings claude --dangerously-skip-permissions",
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
    },
    pi: {
      default: {
        description: "Launch with Pi default tool mode",
        command: "termlings pi",
      },
      auto: {
        description: "Launch with Pi default tool mode",
        command: "termlings pi",
      },
    },
  },
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseRoute(raw: unknown): SpawnRoute | null {
  if (!isObject(raw)) return null
  const runtime = typeof raw.runtime === "string" ? raw.runtime.trim() : ""
  const preset = typeof raw.preset === "string" ? raw.preset.trim() : ""
  if (!runtime || !preset) return null
  return { runtime, preset }
}

function parseRuntimes(raw: unknown): RuntimePresets | null {
  if (!isObject(raw)) return null
  const runtimes: RuntimePresets = {}
  for (const [runtimeName, rawPresets] of Object.entries(raw)) {
    if (!isObject(rawPresets)) return null
    const presets: Record<string, Preset> = {}
    for (const [presetName, rawPreset] of Object.entries(rawPresets)) {
      if (!isObject(rawPreset)) return null
      const description = typeof rawPreset.description === "string" ? rawPreset.description.trim() : ""
      const command = typeof rawPreset.command === "string" ? rawPreset.command.trim() : ""
      if (!description || !command) return null
      presets[presetName] = { description, command }
    }
    if (Object.keys(presets).length === 0) return null
    runtimes[runtimeName] = presets
  }
  if (Object.keys(runtimes).length === 0) return null
  return runtimes
}

function parseSpawnConfig(raw: unknown): SpawnConfig | null {
  if (!isObject(raw)) return null
  const defaultRoute = parseRoute(raw.default)
  const runtimes = parseRuntimes(raw.runtimes)
  if (!defaultRoute || !runtimes) return null

  const agents: Record<string, SpawnRoute> = {}
  if (raw.agents !== undefined) {
    if (!isObject(raw.agents)) return null
    for (const [slug, rawRoute] of Object.entries(raw.agents)) {
      const route = parseRoute(rawRoute)
      if (!route) return null
      agents[slug] = route
    }
  }

  return {
    default: defaultRoute,
    agents,
    runtimes,
  }
}

function loadSpawnConfig(projectRoot = process.cwd()): SpawnConfig | null {
  const configPath = join(projectRoot, ".termlings", "spawn.json")
  if (!existsSync(configPath)) return null
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8"))
    const config = parseSpawnConfig(parsed)
    if (!config) {
      console.error("Invalid .termlings/spawn.json format.")
      console.error("Expected: { default: {runtime,preset}, agents: {...}, runtimes: {...} }")
      process.exit(1)
    }
    return config
  } catch {
    console.error("Failed to parse .termlings/spawn.json.")
    process.exit(1)
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

function resolvePreset(config: SpawnConfig, runtimeName: string, presetName: string): Preset | null {
  const runtimePresets = config.runtimes[runtimeName]
  if (!runtimePresets) return null
  return runtimePresets[presetName] || null
}

function formatRoute(runtimeName: string, presetName: string): string {
  return `${runtimeName}/${presetName}`
}

function buildPresetCommand(config: SpawnConfig, runtimeName: string, presetName: string, extraArgs: string[]): string | null {
  const preset = resolvePreset(config, runtimeName, presetName)
  if (!preset) return null
  return extraArgs.length > 0 ? `${preset.command} ${extraArgs.join(" ")}` : preset.command
}

function formatCommandPreview(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) return trimmed
  const parts = trimmed.split(/\s+/)
  if (parts[0] !== "termlings") return trimmed
  return parts.slice(1).join(" ")
}

function hasDangerousLaunchFlag(command: string): boolean {
  const parts = commandParts(command)
  return parts.some((part) => DANGEROUS_LAUNCH_FLAGS.some((flag) => part === flag || part.startsWith(`${flag}=`)))
}

function getDangerousLaunchCommands(
  config: SpawnConfig,
  launchTargets: AgentLaunchTarget[],
  extraArgs: string[],
): Array<{ slug: string; command: string }> {
  const dangerous: Array<{ slug: string; command: string }> = []
  for (const target of launchTargets) {
    const command = buildPresetCommand(config, target.runtimeName, target.presetName, extraArgs)
    if (!command) continue
    if (!hasDangerousLaunchFlag(command)) continue
    dangerous.push({ slug: target.slug, command })
  }
  return dangerous
}

function ansiTrueColor(rgb: [number, number, number]): string {
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`
}

function accentColorFromDna(dna?: string): string | undefined {
  if (!dna) return undefined
  try {
    const traits = decodeDNA(dna)
    const { faceRgb } = getTraitColors(traits, false)
    return ansiTrueColor(faceRgb)
  } catch {
    return undefined
  }
}

function resolveAgentRoute(config: SpawnConfig, slug: string): SpawnRoute {
  return config.agents[slug] || config.default
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function hasCodexResumeArgs(args: string[]): boolean {
  return args.some((arg) => arg === "resume" || arg === "--last")
}

function targetExtraArgs(runtimeName: string, baseArgs: string[], respawn: boolean): string[] {
  if (!respawn) return baseArgs
  if (runtimeName !== "codex") return baseArgs
  if (hasCodexResumeArgs(baseArgs)) return baseArgs
  return [...baseArgs, "resume", "--last"]
}

function tmuxInstallHint(): string {
  if (process.platform === "darwin") return "macOS: brew install tmux"
  if (process.platform === "win32") return "Windows (WSL): sudo apt install tmux"
  return "Linux: sudo apt install tmux"
}

async function spawnAgentWindows(
  targets: AgentLaunchTarget[],
  extraArgs: string[],
  quiet = false,
  attach = true,
  cleanupLegacyControlWindow = false,
  respawn = false,
): Promise<void> {
  if (!isTmuxAvailable()) {
    console.error("tmux is required for batch spawn.")
    console.error(`Tip: ${tmuxInstallHint()}`)
    console.error("Install tmux and run `termlings spawn --all`.")
    process.exit(1)
  }

  const root = process.cwd()
  const sessionName = projectTmuxSessionName(root)

  if (tmuxHasSession(sessionName)) {
    configureAgentSession(sessionName, root)
  }

  const created: string[] = []
  const existing: string[] = []
  const respawned: string[] = []
  const failed: Array<{ slug: string; route: string; error: string }> = []

  for (const target of targets) {
    const targetArgs = targetExtraArgs(target.runtimeName, extraArgs, respawn)
    let targetRespawned = false
    if (respawn && tmuxHasSession(sessionName)) {
      const existingWindow = listTmuxWindows(sessionName).find((window) => window.name === `agent:${target.slug}`)
      if (existingWindow) {
        const killed = killTmuxWindow(sessionName, String(existingWindow.index))
        if (!killed.ok) {
          failed.push({
            slug: target.slug,
            route: formatRoute(target.runtimeName, target.presetName),
            error: killed.error || "failed to respawn existing window",
          })
          continue
        }
        targetRespawned = true
        respawned.push(`${target.slug} (${formatRoute(target.runtimeName, target.presetName)})`)
      }
    }

    const result = openAgentWindow(
      sessionName,
      root,
      target.runtimeName,
      target.presetName,
      target.slug,
      targetArgs,
    )
    if (result.ok && result.created) {
      if (!targetRespawned) {
        created.push(`${target.slug} (${formatRoute(target.runtimeName, target.presetName)})`)
      }
    } else if (result.ok) {
      existing.push(`${target.slug} (${formatRoute(target.runtimeName, target.presetName)})`)
    } else {
      failed.push({
        slug: target.slug,
        route: formatRoute(target.runtimeName, target.presetName),
        error: result.error || "unknown error",
      })
    }
  }

  if (!quiet && created.length > 0) {
    console.log(`Launched ${created.length} agent window(s): ${created.join(", ")}`)
  }
  if (!quiet && respawned.length > 0) {
    console.log(`Respawned ${respawned.length} agent window(s): ${respawned.join(", ")}`)
  }
  if (!quiet && existing.length > 0) {
    console.log(`Already running (${existing.length}): ${existing.join(", ")}`)
  }
  if (failed.length > 0) {
    for (const item of failed) {
      console.error(`Failed to launch ${item.slug} (${item.route}): ${item.error}`)
    }
    process.exit(1)
  }

  const windowsAfterLaunch = listTmuxWindows(sessionName)
  const hasAgentWindows = windowsAfterLaunch.some((window) => window.name.startsWith("agent:"))
  const controlWindow = windowsAfterLaunch.find((window) => window.name === "control")
  if (cleanupLegacyControlWindow && hasAgentWindows && controlWindow && windowsAfterLaunch.length > 1) {
    const killed = killTmuxWindow(sessionName, String(controlWindow.index))
    if (!killed.ok && !quiet) {
      console.error(killed.error || "Failed to remove legacy control window.")
    }
  }

  if (tmuxHasSession(sessionName)) {
    configureAgentSession(sessionName, root)
  }

  if (attach && !isInsideTmux() && tmuxHasSession(sessionName)) {
    const windows = listTmuxWindows(sessionName)
    const firstAgentWindow = windows.find((window) => window.name.startsWith("agent:")) || windows[0]
    const focusTarget = firstAgentWindow ? String(firstAgentWindow.index) : "0"
    const focus = focusTmuxWindow(sessionName, focusTarget)
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
  termlings spawn                           Interactive: spawn all (tmux) or pick one agent
  termlings spawn <runtime>                 Run default preset for runtime
  termlings spawn <runtime> <preset>        Run a specific preset
  termlings spawn --all [runtime] [preset]  Spawn all agents (requires tmux)
  termlings spawn --all --detached          Spawn all agents without attaching tmux
  termlings spawn --all --respawn           Restart all running agent windows, then launch
  termlings spawn --agent=<slug> [runtime] [preset]  Launch one specific agent
  termlings spawn --agent=<slug> --respawn  Restart this agent window if running
  termlings spawn --inline ...              Run one agent in current terminal

EXAMPLES:
  termlings spawn --all
  termlings spawn --all --detached
  termlings spawn --all claude auto
  termlings spawn --agent=developer codex default
  termlings spawn claude auto

NOTES:
  - Run this command in another terminal while \`termlings\` is open.
  - Batch launch (\`--all\`) uses tmux windows named agent:<slug>.
  - Agents run as normal PTY terminal sessions that you can inspect/interact with at any time.
  - Inside agent sessions, requires \`manage_agents: true\` in your SOUL frontmatter.
  - If runtime/preset is omitted for batch launch, \`.termlings/spawn.json\` \`default\` + \`agents.<slug>\` routing is used.
  - Use \`--respawn\` to restart already-running tmux agent windows after SOUL/config changes.
  - For Codex routes, \`--respawn\` appends \`resume --last\` unless you pass explicit resume args.
  - \`--all\` prompts for confirmation when dangerous launch flags are detected.
  - Use \`--dangerous-skip-confirmation\` only for trusted automation.
  - Edit \`.termlings/spawn.json\` to change default runtime/preset and agent launch commands.
`)
    return
  }

  const { ensureAgentCanManageAgents } = await import("../agents/permissions.js")
  ensureAgentCanManageAgents("termlings spawn")

  const config = loadSpawnConfig() || DEFAULT_CONFIG
  const runtimes = Object.keys(config.runtimes)
  let spawnAll = flags.has("all")
  const quiet = flags.has("quiet")
  const detached = flags.has("detached")
  const inline = flags.has("inline")
  const respawn = flags.has("respawn")
  const specificAgent = (opts.agent || "").trim()

  let runtimeName = positional[1]?.trim()
  let presetName = positional[2]?.trim()

  const extraArgs = positional.slice(3)
  const localAgents = discoverLocalAgents()

  if (!spawnAll && specificAgent.length === 0 && !runtimeName) {
    if (localAgents.length === 0) {
      console.error("No agents found in .termlings/agents.")
      console.error("Run `termlings init` first.")
      process.exit(1)
    }

    const { getTermlingsVersion, renderBanner } = await import("../banner.js")
    const { selectMenu } = await import("../interactive-menu.js")
    const reset = "\x1b[0m"
    const bold = "\x1b[1m"
    const muted = "\x1b[38;5;245m"
    const purple = "\x1b[38;2;138;43;226m"
    const header = renderBanner([
      `${purple}${bold}termlings${reset} ${muted}v${getTermlingsVersion()}${reset}`,
    ])
    const menuItems: { value: string; label: string; description: string }[] = [
      {
        value: "__spawn_all__",
        label: "Spawn all (requires tmux)",
        description: "Launch all agents in tmux windows using configured routes.",
      },
    ]

    for (const agent of localAgents) {
      const route = resolveAgentRoute(config, agent.name)
      const routePreset = resolvePreset(config, route.runtime, route.preset)
      const displayName = (agent.soul?.name || agent.name).trim()
      const role = (agent.soul?.title_short || agent.soul?.title || agent.soul?.role || "").trim()
      const label = role ? `${displayName} (${role})` : displayName
      const descriptionLead = routePreset?.description || "Launch this agent in current terminal."
      const rawCommandPreview = buildPresetCommand(config, route.runtime, route.preset, []) || "(invalid command)"
      const commandPreview = formatCommandPreview(rawCommandPreview)
      menuItems.push({
        value: `agent:${agent.name}`,
        label,
        description: `${descriptionLead}\n\x1b[90m   cmd: ${commandPreview}\x1b[0m`,
        accentColor: accentColorFromDna(agent.soul?.dna),
      })
    }

    const selected = await selectMenu(menuItems, "Spawn options:", {
      header,
      titleNote:
        "Agents run as normal PTY terminal sessions you can inspect anytime.\n"
        + "Edit `.termlings/spawn.json` to change defaults.",
      footer: "Tip: keep `termlings` open in one terminal, then run spawn from another.",
    })

    if (selected === "__spawn_all__") {
      spawnAll = true
    } else if (selected.startsWith("agent:")) {
      const slug = selected.slice("agent:".length)
      const route = resolveAgentRoute(config, slug)
      const command = buildPresetCommand(config, route.runtime, route.preset, extraArgs)
      if (!command) {
        console.error(`Invalid spawn route for ${slug}: ${formatRoute(route.runtime, route.preset)}`)
        process.exit(1)
      }
      await routePresetCommand(command, { agentSlug: slug })
      return
    }
  }

  const hasBatchTarget = spawnAll || specificAgent.length > 0

  if (respawn && !hasBatchTarget) {
    console.error("`--respawn` requires `--all` or `--agent=<slug>`.")
    process.exit(1)
  }

  if (!hasBatchTarget) {
    if (!presetName) {
      presetName = "default"
    }
    const command = buildPresetCommand(config, runtimeName, presetName, extraArgs)
    if (!command) {
      console.error(`Unknown preset route: ${formatRoute(runtimeName, presetName)}`)
      console.log(`Available runtimes: ${runtimes.join(", ")}`)
      process.exit(1)
    }
    await routePresetCommand(command)
    return
  }

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

  const launchTargets: AgentLaunchTarget[] = []
  for (const slug of agentSlugs) {
    let selectedRuntime = runtimeName
    let selectedPreset = presetName || "default"

    if (!selectedRuntime) {
      const route = resolveAgentRoute(config, slug)
      selectedRuntime = route.runtime
      selectedPreset = route.preset
    }

    if (!resolvePreset(config, selectedRuntime, selectedPreset)) {
      console.error(
        `Invalid spawn route for ${slug}: ${formatRoute(selectedRuntime, selectedPreset)}. ` +
        "Check .termlings/spawn.json runtimes/default/agents.",
      )
      process.exit(1)
    }

    launchTargets.push({
      slug,
      runtimeName: selectedRuntime,
      presetName: selectedPreset,
    })
  }

  if (spawnAll) {
    const dangerousLaunches = getDangerousLaunchCommands(config, launchTargets, extraArgs)
    if (dangerousLaunches.length > 0 && !flags.has("dangerous-skip-confirmation")) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error("Dangerous launch flags detected for `termlings spawn --all`.")
        console.error("Refusing to continue in non-interactive mode.")
        console.error("Use --dangerous-skip-confirmation only for trusted automation.")
        process.exit(1)
      }

      console.log("Warning: --spawn-all will launch agents with dangerous runtime flags:")
      for (const item of dangerousLaunches) {
        console.log(`  - ${item.slug}: ${formatCommandPreview(item.command)}`)
      }
      const proceed = await confirm("Continue with spawn-all?", true)
      if (!proceed) {
        console.log("Cancelled.")
        return
      }
    }
  }

  if (inline) {
    if (respawn) {
      console.error("`--respawn` is not supported with `--inline`.")
      process.exit(1)
    }
    if (launchTargets.length !== 1) {
      console.error("`--inline` requires exactly one agent (use --agent=<slug>).")
      process.exit(1)
    }
    const target = launchTargets[0]!
    const command = buildPresetCommand(config, target.runtimeName, target.presetName, extraArgs)
    if (!command) {
      console.error(`Invalid preset route: ${formatRoute(target.runtimeName, target.presetName)}`)
      process.exit(1)
    }
    await routePresetCommand(command, { agentSlug: target.slug })
    return
  }

  await spawnAgentWindows(launchTargets, extraArgs, quiet, !detached, spawnAll, respawn)
}
