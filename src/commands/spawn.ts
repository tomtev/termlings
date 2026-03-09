/**
 * Spawn command: run runtime presets from .termlings/spawn.json.
 * Supports batch launch into detached background processes.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { discoverLocalAgents } from "../agents/discover.js"
import {
  ensureDockerSpawnImage,
  ensureDockerRuntimeHome,
  runDockerSpawnForeground,
  runDockerSpawnWorker,
} from "../engine/docker-spawn.js"
import { decodeDNA, getTraitColors } from "../index.js"
import { ensureManagedRuntimeProcess } from "../engine/runtime-processes.js"

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

interface HostYoloRiskTarget extends AgentLaunchTarget {
  flags: string[]
}

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
        command: "termlings claude --dangerously-skip-permissions --effort medium",
      },
      auto: {
        description: "Launch with full autonomy (skip all permission prompts)",
        command: "termlings claude --dangerously-skip-permissions --effort medium",
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
  },
}

const DANGEROUS_HOST_FLAG_PATTERNS = [
  "--dangerously-skip-permissions",
  "--dangerously-bypass-approvals-and-sandbox",
  "--sandbox danger-full-access",
  "--ask-for-approval never",
] as const

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

export function loadSpawnConfigOrDefault(projectRoot = process.cwd()): SpawnConfig {
  return loadSpawnConfig(projectRoot) || DEFAULT_CONFIG
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

export function ensureRuntimeSpawnCommandDefaults(runtimeName: string, command: string): string {
  const trimmed = command.trim()
  if (runtimeName === "claude" && trimmed.startsWith("termlings claude")) {
    if (!/(^|\s)--effort(?:=|\s)/.test(trimmed)) {
      return `${trimmed} --effort medium`
    }
  }
  return trimmed
}

function buildPresetCommand(config: SpawnConfig, runtimeName: string, presetName: string, extraArgs: string[]): string | null {
  const preset = resolvePreset(config, runtimeName, presetName)
  if (!preset) return null
  const command = ensureRuntimeSpawnCommandDefaults(runtimeName, preset.command)
  return extraArgs.length > 0 ? `${command} ${extraArgs.join(" ")}` : command
}

function formatCommandPreview(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) return trimmed
  const parts = trimmed.split(/\s+/)
  if (parts[0] !== "termlings") return trimmed
  return parts.slice(1).join(" ")
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

function dangerousFlagsInCommand(command: string): string[] {
  const normalized = command.trim().toLowerCase()
  const matches: string[] = []
  for (const flag of DANGEROUS_HOST_FLAG_PATTERNS) {
    if (normalized.includes(flag.toLowerCase())) {
      matches.push(flag)
    }
  }
  return matches
}

function collectHostYoloRiskTargets(
  config: SpawnConfig,
  targets: AgentLaunchTarget[],
): HostYoloRiskTarget[] {
  const risky: HostYoloRiskTarget[] = []
  for (const target of targets) {
    const preset = resolvePreset(config, target.runtimeName, target.presetName)
    if (!preset) continue
    const flags = dangerousFlagsInCommand(preset.command)
    if (flags.length <= 0) continue
    risky.push({ ...target, flags })
  }
  return risky
}

export function evaluateHostYoloSpawnRisk(
  config: SpawnConfig,
  targets: AgentLaunchTarget[],
  options: { docker?: boolean; allowHostYolo?: boolean } = {},
): {
  requiresConfirmation: boolean
  riskyTargets: HostYoloRiskTarget[]
  dangerousFlags: string[]
} {
  if (options.docker || options.allowHostYolo) {
    return { requiresConfirmation: false, riskyTargets: [], dangerousFlags: [] }
  }

  const riskyTargets = collectHostYoloRiskTargets(config, targets)
  const dangerousFlags = unique(riskyTargets.flatMap((target) => target.flags))
  return {
    requiresConfirmation: riskyTargets.length > 0,
    riskyTargets,
    dangerousFlags,
  }
}

export function renderHostYoloSpawnApproval(
  config: SpawnConfig,
  riskyTargets: HostYoloRiskTarget[],
  dangerousFlags: string[],
  commandLabel: string,
  options: { useAnsi?: boolean } = {},
): string {
  const muted = options.useAnsi ? "\x1b[38;5;245m" : ""
  const warning = options.useAnsi ? "\x1b[38;5;214m" : ""
  const reset = options.useAnsi ? "\x1b[0m" : ""
  const localAgents = discoverLocalAgents()
  const agentMeta = new Map(localAgents.map((agent) => [agent.name, agent]))
  const previewTargets = riskyTargets.slice(0, 6)
  const extraCount = Math.max(0, riskyTargets.length - previewTargets.length)
  const routeLines = previewTargets.flatMap((target) => {
    const agent = agentMeta.get(target.slug)
    const displayName = (agent?.soul?.name || target.slug).trim()
    const title = (agent?.soul?.title_short || agent?.soul?.title || agent?.soul?.role || "").trim()
    const label = title ? `${displayName} - ${title}` : displayName
    const accent = options.useAnsi ? (accentColorFromDna(agent?.soul?.dna) || "") : ""
    const command = buildPresetCommand(config, target.runtimeName, target.presetName, []) || "(invalid command)"
    return [
      `  ${accent}${label}${reset}`,
      `    ${muted}${formatCommandPreview(command)}${reset}`,
    ]
  })
  if (extraCount > 0) {
    routeLines.push(`  ... ${extraCount} more`)
  }
  const agentLabel = riskyTargets.length === 1 ? "agent" : "agents"
  return [
    `Host launch approval required for \`${commandLabel}\`.`,
    "",
    `Termlings is about to launch ${riskyTargets.length} ${agentLabel} on this machine using host-native autonomous routes.`,
    "Resolved routes from `.termlings/spawn.json`:",
    ...routeLines,
    "",
    `${warning}Dangerous flags detected: ${dangerousFlags.join(", ")}${reset}`,
    "Proceed with caution.",
    `${warning}Run in Docker for better safety: \`termlings --spawn --docker\`${reset}`,
    "Change defaults: edit `.termlings/spawn.json`",
  ].join("\n")
}

export async function confirmHostYoloSpawnOrExit(
  config: SpawnConfig,
  targets: AgentLaunchTarget[],
  options: { docker?: boolean; allowHostYolo?: boolean; commandLabel?: string } = {},
): Promise<void> {
  const { requiresConfirmation, riskyTargets, dangerousFlags } = evaluateHostYoloSpawnRisk(config, targets, options)
  if (!requiresConfirmation) return

  const commandLabel = options.commandLabel || "termlings spawn"
  const interactive = process.stdin.isTTY && process.stdout.isTTY
  const approvalText = renderHostYoloSpawnApproval(config, riskyTargets, dangerousFlags, commandLabel, {
    useAnsi: interactive,
  })
  if (interactive) {
    const { getTermlingsVersion, renderBanner } = await import("../banner.js")
    const reset = "\x1b[0m"
    const bold = "\x1b[1m"
    const muted = "\x1b[38;5;245m"
    const purple = "\x1b[38;2;138;43;226m"
    console.log("")
    console.log(renderBanner([
      `${purple}${bold}termlings${reset} ${muted}v${getTermlingsVersion()}${reset}`,
    ]))
    console.log("")
    console.log(approvalText)
    console.log("")
  } else {
    console.error(approvalText)
  }

  if (!interactive) {
    console.error("Refusing host-native YOLO spawn without interactive confirmation.")
    console.error(`Re-run interactively and confirm, pass \`--allow-host-yolo\`, or use \`${commandLabel} --docker\`.`)
    process.exit(1)
  }

  const { confirm } = await import("../interactive-menu.js")
  const accepted = await confirm("Approve host-native launch for these agents?", false)
  if (!accepted) {
    console.error("Host-native spawn cancelled.")
    process.exit(1)
  }
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

async function appendSystemWorkspaceMessage(
  root: string,
  fromName: string,
  text: string,
): Promise<void> {
  const { appendWorkspaceMessage } = await import("../workspace/state.js")
  appendWorkspaceMessage(
    {
      kind: "system",
      from: "system",
      fromName,
      text,
    },
    root,
  )
}

export async function ensureDockerWorkspaceBrowser(
  options: { quiet?: boolean } = {},
): Promise<{ ok: boolean; status?: "started" | "restarted" | "reused"; port?: number; error?: string }> {
  try {
    const { isAgentBrowserAvailable, ensureSharedBrowserForDocker } = await import("../engine/browser.js")
    if (!isAgentBrowserAvailable()) {
      return {
        ok: false,
        error: "agent-browser CLI not installed; Docker agents will not be able to use the shared headed browser.",
      }
    }

    const ensured = await ensureSharedBrowserForDocker()
    if (!options.quiet) {
      if (ensured.status === "started") {
        console.log(`Started shared workspace browser for Docker agents on port ${ensured.port}.`)
      } else if (ensured.status === "restarted") {
        console.log(`Restarted workspace browser in Docker-share mode on port ${ensured.port}.`)
      }
    }
    return { ok: true, status: ensured.status, port: ensured.port }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!options.quiet) {
      console.error(`Warning: failed to prepare shared workspace browser for Docker agents: ${message}`)
    }
    return { ok: false, error: message }
  }
}

async function spawnAgentProcesses(
  targets: AgentLaunchTarget[],
  extraArgs: string[],
  quiet = false,
  respawn = false,
  docker = false,
  allowHostYolo = false,
): Promise<void> {
  const root = process.cwd()
  const created: string[] = []
  const existing: string[] = []
  const respawned: string[] = []
  const failed: Array<{ slug: string; route: string; error: string }> = []

  if (docker) {
    try {
      if (quiet) {
        await appendSystemWorkspaceMessage(root, "Docker", "Preparing Docker runtime image...")
      }
      ensureDockerSpawnImage(Boolean(process.env.TERMLINGS_DOCKER_REBUILD === "1"))
      if (quiet) {
        await appendSystemWorkspaceMessage(root, "Docker", "Docker runtime image ready.")
      }
      ensureDockerRuntimeHome(root)
      await ensureDockerWorkspaceBrowser({ quiet })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (quiet) {
        await appendSystemWorkspaceMessage(root, "Docker", `Docker startup failed: ${message}`)
      }
      throw error
    }
  }

  for (const target of targets) {
    const targetArgs = targetExtraArgs(target.runtimeName, extraArgs, respawn)
    const result = await ensureManagedRuntimeProcess({
      key: `agent:${target.slug}`,
      kind: "agent",
      args: docker
        ? [
            "spawn-docker-worker",
            `--agent=${target.slug}`,
            `--runtime=${target.runtimeName}`,
            `--preset=${target.presetName}`,
            ...targetArgs,
          ]
        : [
            "spawn",
            target.runtimeName,
            target.presetName,
            `--agent=${target.slug}`,
            "--inline",
            ...targetArgs,
            ...(allowHostYolo ? ["--allow-host-yolo"] : []),
          ],
      root,
      respawn,
      agentSlug: target.slug,
      runtimeName: target.runtimeName,
      presetName: target.presetName,
      startupProbeMs: quiet ? 0 : 200,
    })

    if (!result.ok) {
      failed.push({
        slug: target.slug,
        route: formatRoute(target.runtimeName, target.presetName),
        error: result.error || "unknown error",
      })
      continue
    }

    if (!result.created) {
      existing.push(`${target.slug} (${formatRoute(target.runtimeName, target.presetName)})`)
      continue
    }

    if (result.respawned) {
      respawned.push(`${target.slug} (${formatRoute(target.runtimeName, target.presetName)})`)
      continue
    }

    created.push(`${target.slug} (${formatRoute(target.runtimeName, target.presetName)})`)
  }

  if (!quiet && created.length > 0) {
    console.log(`Launched ${created.length} agent process(es): ${created.join(", ")}`)
  }
  if (!quiet && respawned.length > 0) {
    console.log(`Respawned ${respawned.length} agent process(es): ${respawned.join(", ")}`)
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
  termlings spawn                           Interactive: spawn all or pick one agent
  termlings spawn <runtime>                 Run default preset for runtime
  termlings spawn <runtime> <preset>        Run a specific preset
  termlings spawn --all [runtime] [preset]  Spawn all agents
  termlings spawn --all --docker            Spawn all agents in Docker-isolated workers
  termlings spawn --all --respawn           Restart all running agent sessions, then launch
  termlings spawn --agent=<slug> [runtime] [preset]  Launch one specific agent
  termlings spawn --agent=<slug> --respawn  Restart this agent session if running
  termlings spawn --inline ...              Run one agent in current terminal
  termlings spawn --all --allow-host-yolo   Skip interactive confirmation for host-native YOLO routes

EXAMPLES:
  termlings spawn --all
  termlings spawn --all claude auto
  termlings spawn --agent=developer codex default
  termlings spawn claude auto

NOTES:
  - Run this command in another terminal while \`termlings\` is open.
  - Batch launch (\`--all\`) runs detached background agent sessions.
  - Agents run as normal PTY terminal sessions that you can inspect/interact with at any time.
  - \`--docker\` is opt-in. Current host spawn behavior stays unchanged unless you pass it.
  - Host-native YOLO routes now require confirmation unless you pass \`--allow-host-yolo\`.
  - Inside agent sessions, requires \`manage_agents: true\` in your SOUL frontmatter.
  - If runtime/preset is omitted for batch launch, \`.termlings/spawn.json\` \`default\` + \`agents.<slug>\` routing is used.
  - Use \`--respawn\` to restart already-running agent sessions after SOUL/config changes.
  - For Codex routes, \`--respawn\` appends \`resume --last\` unless you pass explicit resume args.
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
  const inline = flags.has("inline")
  const respawn = flags.has("respawn")
  const docker = flags.has("docker")
  const allowHostYolo = flags.has("allow-host-yolo")
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
        label: "Spawn all agents",
        description: "Launch all agents using configured routes (detached background sessions).",
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
      if (docker) {
        ensureDockerSpawnImage(Boolean(process.env.TERMLINGS_DOCKER_REBUILD === "1"))
        ensureDockerRuntimeHome(process.cwd())
        await ensureDockerWorkspaceBrowser()
        await runDockerSpawnForeground({
          root: process.cwd(),
          agentSlug: slug,
          runtimeName: route.runtime,
          presetName: route.preset,
          extraArgs,
        })
        return
      }
      await confirmHostYoloSpawnOrExit(
        config,
        [{ slug, runtimeName: route.runtime, presetName: route.preset }],
        { allowHostYolo, commandLabel: "termlings spawn" },
      )
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
    if (docker) {
      console.error("`--docker` requires `--all` or `--agent=<slug>`.")
      process.exit(1)
    }
    if (!presetName) {
      presetName = "default"
    }
    const command = buildPresetCommand(config, runtimeName, presetName, extraArgs)
    if (!command) {
      console.error(`Unknown preset route: ${formatRoute(runtimeName, presetName)}`)
      console.log(`Available runtimes: ${runtimes.join(", ")}`)
      process.exit(1)
    }
    await confirmHostYoloSpawnOrExit(
      config,
      [{ slug: "current-terminal", runtimeName, presetName }],
      { allowHostYolo, commandLabel: "termlings spawn" },
    )
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
    if (docker) {
      ensureDockerSpawnImage(Boolean(process.env.TERMLINGS_DOCKER_REBUILD === "1"))
      ensureDockerRuntimeHome(process.cwd())
      await ensureDockerWorkspaceBrowser()
      await runDockerSpawnForeground({
        root: process.cwd(),
        agentSlug: target.slug,
        runtimeName: target.runtimeName,
        presetName: target.presetName,
        extraArgs,
      })
      return
    }
    await confirmHostYoloSpawnOrExit(config, launchTargets, {
      allowHostYolo,
      commandLabel: "termlings spawn",
    })
    const command = buildPresetCommand(config, target.runtimeName, target.presetName, extraArgs)
    if (!command) {
      console.error(`Invalid preset route: ${formatRoute(target.runtimeName, target.presetName)}`)
      process.exit(1)
    }
    await routePresetCommand(command, { agentSlug: target.slug })
    return
  }

  await confirmHostYoloSpawnOrExit(config, launchTargets, {
    docker,
    allowHostYolo,
    commandLabel: "termlings spawn",
  })
  await spawnAgentProcesses(launchTargets, extraArgs, quiet, respawn, docker, allowHostYolo)
}

export async function handleSpawnDockerWorker(
  positional: string[],
  opts: Record<string, string>,
): Promise<void> {
  const agentSlug = (opts.agent || "").trim()
  const runtimeName = (opts.runtime || "").trim()
  const presetName = (opts.preset || "").trim()

  if (!agentSlug || !runtimeName || !presetName) {
    console.error("Invalid internal docker spawn worker invocation.")
    process.exit(1)
  }

  await runDockerSpawnWorker({
    root: process.cwd(),
    agentSlug,
    runtimeName,
    presetName,
    extraArgs: positional.slice(1),
  })
}
