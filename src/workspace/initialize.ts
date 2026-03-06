import { createReadStream, createWriteStream, existsSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from "fs"
import { createInterface } from "readline/promises"
import { basename, join } from "path"
import { spawnSync } from "child_process"
import { userInfo } from "os"
import type { Readable, Writable } from "stream"

import { generateRandomDNA, renderSVG } from "../index.js"
import { generateFunNames } from "../name-generator.js"
import { ensureWorkspaceDirs } from "./state.js"
import { initializeWorkspaceFromTemplate, listWorkspaceTemplates } from "./setup.js"

const ANSI_MUTED = "\x1b[38;5;245m"
const ANSI_RESET = "\x1b[0m"

function supportsAnsi(output: Writable): boolean {
  const stream = output as NodeJS.WriteStream
  return stream.isTTY === true
}

type RawPromptInput = Readable & {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => void
  setEncoding?: (encoding: BufferEncoding) => void
  resume?: () => void
  pause?: () => void
}

function supportsRawPrompt(input: Readable, output: Writable): input is RawPromptInput {
  const stream = input as RawPromptInput
  return supportsAnsi(output) && stream.isTTY === true && typeof stream.setRawMode === "function"
}

function filterPromptText(input: string): string {
  let out = ""
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x20 && code !== 0x7f) out += ch
  }
  return out
}

function askWithDefaultRaw(
  input: RawPromptInput,
  output: Writable,
  label: string,
  defaultValue: string,
): Promise<string> {
  return new Promise((resolve) => {
    let value = ""
    const prefix = `${label}: `

    const render = () => {
      output.write(`\r\x1b[2K${prefix}`)
      if (value.length === 0) {
        // Show muted placeholder while empty; keep cursor after placeholder
        // so the first character is not hidden by inverse-cursor rendering.
        output.write(`${ANSI_MUTED}${defaultValue}${ANSI_RESET}`)
        return
      }
      output.write(value)
    }

    const cleanup = () => {
      input.off("data", onData)
      try {
        input.setRawMode?.(false)
      } catch {}
    }

    const submit = () => {
      const finalValue = value.trim().length > 0 ? value.trim() : defaultValue
      cleanup()
      output.write("\n")
      resolve(finalValue)
    }

    const onData = (chunk: string | Buffer) => {
      const raw = typeof chunk === "string" ? chunk : chunk.toString("utf8")

      if (raw === "\u0003") {
        cleanup()
        output.write("\n")
        process.exit(130)
      }

      if (raw === "\r" || raw === "\n") {
        submit()
        return
      }

      if (raw === "\u007f" || raw === "\b" || raw === "\x08") {
        if (value.length > 0) value = value.slice(0, -1)
        render()
        return
      }

      if (raw.startsWith("\u001b[")) {
        // Ignore escape sequences (arrows, function keys) for init prompts.
        return
      }

      const newlineIndex = raw.search(/[\r\n]/)
      const textPart = newlineIndex >= 0 ? raw.slice(0, newlineIndex) : raw
      const filtered = filterPromptText(textPart)
      if (filtered.length > 0) {
        value += filtered
        render()
      }
      if (newlineIndex >= 0) {
        submit()
      }
    }

    try {
      input.setEncoding?.("utf8")
    } catch {}
    input.resume?.()
    try {
      input.setRawMode?.(true)
    } catch {}
    input.on("data", onData)
    render()
  })
}

async function askWithDefault(
  input: Readable,
  output: Writable,
  label: string,
  defaultValue: string,
): Promise<string> {
  if (supportsRawPrompt(input, output)) {
    return askWithDefaultRaw(input, output, label, defaultValue)
  }

  const rl = createInterface({
    input,
    output,
  })
  const answer = (await rl.question(`${label} [${defaultValue}] `)).trim()
  rl.close()
  return answer.length > 0 ? answer : defaultValue
}

/**
 * Get default human name from system and git.
 */
function getDefaultHumanName(): string {
  try {
    const result = spawnSync("git", ["config", "user.name"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    })
    if (result.stdout && result.status === 0) {
      return result.stdout.trim()
    }
  } catch {}

  try {
    const info = userInfo()
    return info.username || "User"
  } catch {}

  return "User"
}

type RuntimeSlug = "claude" | "codex"

interface RuntimeChoice {
  slug: RuntimeSlug
  label: string
  bin: string
  installed: boolean
}

const RUNTIME_CHOICES: Array<Omit<RuntimeChoice, "installed">> = [
  { slug: "claude", label: "Claude", bin: "claude" },
  { slug: "codex", label: "Codex", bin: "codex" },
]

function commandExists(bin: string): boolean {
  const proc = spawnSync(bin, ["--version"], { stdio: "ignore" })
  return (proc.status ?? 1) === 0
}

function detectRuntimeChoices(): RuntimeChoice[] {
  return RUNTIME_CHOICES.map((choice) => ({
    ...choice,
    installed: commandExists(choice.bin),
  }))
}

function recommendedRuntime(choices: RuntimeChoice[]): RuntimeSlug {
  const installed = choices.find((choice) => choice.installed)
  return installed?.slug || "claude"
}

/**
 * Prompt user for their name and update default human.
 */
async function setupDefaultHuman(
  input: Readable,
  output: Writable,
  projectRoot: string,
): Promise<void> {
  const humanPath = join(projectRoot, ".termlings", "humans", "default", "SOUL.md")

  try {
    const defaultName = getDefaultHumanName()

    console.log("")
    const name = await askWithDefault(input, output, "What's your name?", defaultName)

    if (existsSync(humanPath)) {
      const content = readFileSync(humanPath, "utf8")
      const updated = content.replace(/^name:\s*.+$/m, `name: ${name}`)
      writeFileSync(humanPath, updated, "utf8")
      console.log(`✓ Your name: ${name}`)
    }
  } catch {}
}

type GitIgnoreMode = "all" | "messages" | "none"

function parseGitIgnoreMode(input: string): GitIgnoreMode {
  const value = input.trim().toLowerCase()
  if (!value || value === "1" || value === "all" || value === "ignore all") return "all"
  if (value === "2" || value === "messages" || value === "ignore messages") return "messages"
  if (value === "3" || value === "none" || value === "no" || value === "no ignore") return "none"
  return "all"
}

async function setupGitIgnore(
  input: Readable,
  output: Writable,
  projectRoot: string,
): Promise<void> {
  try {
    console.log("")
    console.log("Git ignore for .termlings:")
    console.log(`${ANSI_MUTED}Choose how much workspace data git should ignore.${ANSI_RESET}`)
    console.log("  1. Ignore all (recommended)")
    console.log(`     ${ANSI_MUTED}Ignore all .termlings files (except .termlings/.gitignore)${ANSI_RESET}`)
    console.log("  2. Ignore messages")
    console.log(`     ${ANSI_MUTED}Ignore only message history under .termlings/store/messages/${ANSI_RESET}`)
    console.log("  3. No ignore")
    console.log(`     ${ANSI_MUTED}Keep .termlings files fully visible to git${ANSI_RESET}`)

    const mode = parseGitIgnoreMode(await askWithDefault(input, output, "Git ignore option", "1"))
    const gitignorePath = join(projectRoot, ".termlings", ".gitignore")

    if (mode === "all") {
      writeFileSync(
        gitignorePath,
        [
          "# Managed by termlings init",
          "*",
          "!.gitignore",
          "",
        ].join("\n"),
        "utf8",
      )
      console.log("✓ Git ignore mode: all .termlings files")
      return
    }

    if (mode === "messages") {
      writeFileSync(
        gitignorePath,
        [
          "# Managed by termlings init",
          "store/messages/",
          "",
        ].join("\n"),
        "utf8",
      )
      console.log("✓ Git ignore mode: messages only")
      return
    }

    if (existsSync(gitignorePath)) {
      try {
        unlinkSync(gitignorePath)
      } catch {}
    }
    console.log("✓ Git ignore mode: no ignore rules")
  } catch {}
}

function templateDescription(template: string): string {
  if (template === "startup-team") {
    return "PM-led startup team: PM, Designer, Developer, Growth, Support."
  }
  if (template === "executive-team") {
    return "C-suite executive team: CEO, CTO, CPO, CMO, CFO."
  }
  if (template === "personal-assistant") {
    return "Single Personal Assistant focused on execution and agent operations."
  }
  return "Local workspace template."
}

function parseRuntimeChoice(input: string, choices: RuntimeChoice[], defaultSlug: RuntimeSlug): RuntimeSlug {
  const value = input.trim().toLowerCase()
  if (!value) return defaultSlug

  const index = Number.parseInt(value, 10)
  if (!Number.isNaN(index) && index >= 1 && index <= choices.length) {
    return choices[index - 1]!.slug
  }

  const normalized = value.replace(/[^a-z]/g, "")
  const bySlug = choices.find((choice) => choice.slug === normalized)
  if (bySlug) return bySlug.slug

  if (normalized === "claudecode") return "claude"
  return defaultSlug
}

function discoverAgentSlugs(projectRoot: string): string[] {
  const agentsRoot = join(projectRoot, ".termlings", "agents")
  if (!existsSync(agentsRoot)) return []
  return readdirSync(agentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(agentsRoot, entry.name, "SOUL.md")))
    .map((entry) => entry.name)
}

function updateSpawnDefaults(projectRoot: string, runtime: RuntimeSlug): boolean {
  const spawnPath = join(projectRoot, ".termlings", "spawn.json")
  if (!existsSync(spawnPath)) return false

  try {
    const parsed = JSON.parse(readFileSync(spawnPath, "utf8"))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false
    const data = parsed as Record<string, unknown>

    if (!data.runtimes || typeof data.runtimes !== "object" || Array.isArray(data.runtimes)) return false
    const runtimes = data.runtimes as Record<string, unknown>
    if (!runtimes[runtime]) {
      return false
    }

    data.default = { runtime, preset: "default" }

    const agents = (data.agents && typeof data.agents === "object" && !Array.isArray(data.agents))
      ? data.agents as Record<string, unknown>
      : {}

    for (const slug of discoverAgentSlugs(projectRoot)) {
      agents[slug] = { runtime, preset: "default" }
    }

    data.agents = agents
    writeFileSync(spawnPath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
    return true
  } catch {
    return false
  }
}

async function setupDefaultRuntime(
  input: Readable,
  output: Writable,
  projectRoot: string,
): Promise<void> {
  try {
    const choices = detectRuntimeChoices()
    const defaultRuntime = recommendedRuntime(choices)
    const defaultIndex = Math.max(0, choices.findIndex((choice) => choice.slug === defaultRuntime))

    console.log("")
    console.log("Default model runtime for this workspace:")
    console.log(`${ANSI_MUTED}This sets the default runtime for agent spawns in .termlings/spawn.json.${ANSI_RESET}`)
    choices.forEach((choice, index) => {
      const status = choice.installed ? "installed" : "not found"
      const recommended = choice.slug === defaultRuntime ? " (recommended)" : ""
      console.log(`  ${index + 1}. ${choice.label}${recommended}`)
      console.log(`     ${ANSI_MUTED}${status}${ANSI_RESET}`)
    })

    const answer = await askWithDefault(input, output, "Default model", String(defaultIndex + 1))
    const selected = parseRuntimeChoice(answer, choices, defaultRuntime)
    const selectedChoice = choices.find((choice) => choice.slug === selected)

    if (selectedChoice && !selectedChoice.installed) {
      console.log(`! ${selectedChoice.label} CLI not found in PATH (you can install it later).`)
    }

    const updated = updateSpawnDefaults(projectRoot, selected)
    if (updated) {
      console.log(`✓ Default runtime: ${selectedChoice?.label || selected}`)
      console.log("  Launches use dangerous mode presets by default.")
    } else {
      console.log("! Could not update .termlings/spawn.json with default runtime.")
    }
  } catch {}
}

function updateFrontmatterField(content: string, field: string, value: string): string {
  const line = `${field}: ${value}`
  const pattern = new RegExp(`^${field}:\\s*.*$`, "m")
  if (pattern.test(content)) {
    return content.replace(pattern, line)
  }
  const firstDivider = content.indexOf("---\n")
  if (firstDivider === -1) return content
  return `${content.slice(0, firstDivider + 4)}${line}\n${content.slice(firstDivider + 4)}`
}

function randomizeDefaultTeamIdentities(projectRoot: string): number {
  const agentsRoot = join(projectRoot, ".termlings", "agents")
  if (!existsSync(agentsRoot)) return 0

  const orderedSlugs = ["pm", "developer", "growth", "support", "designer"]
  const availableSlugs = new Set(
    readdirSync(agentsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )
  const teamSlugs = orderedSlugs.filter((slug) => availableSlugs.has(slug))
  if (teamSlugs.length === 0) return 0

  const names = generateFunNames(teamSlugs.length)
  const usedDna = new Set<string>()
  let updated = 0

  teamSlugs.forEach((slug, index) => {
    const soulPath = join(agentsRoot, slug, "SOUL.md")
    if (!existsSync(soulPath)) return

    let dna = generateRandomDNA()
    while (usedDna.has(dna)) {
      dna = generateRandomDNA()
    }
    usedDna.add(dna)

    const name = names[index] || `Agent${index + 1}`
    const content = readFileSync(soulPath, "utf8")
    const withName = updateFrontmatterField(content, "name", name)
    const withDna = updateFrontmatterField(withName, "dna", dna)
    writeFileSync(soulPath, withDna, "utf8")
    updated += 1
  })

  return updated
}

function parseDnaFromSoul(content: string): string | null {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch) return null
  const rawDna = frontmatterMatch[1].match(/^dna:\s*(.+)$/m)?.[1]
  if (!rawDna) return null
  const dna = rawDna.trim().replace(/^['"]|['"]$/g, "").toLowerCase()
  return /^[0-9a-f]{7}$/.test(dna) ? dna : null
}

function ensureAgentAvatarSvgs(projectRoot: string, overwrite = false): number {
  const agentsRoot = join(projectRoot, ".termlings", "agents")
  if (!existsSync(agentsRoot)) return 0

  let written = 0
  const entries = readdirSync(agentsRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".")) continue

    const soulPath = join(agentsRoot, entry.name, "SOUL.md")
    const avatarPath = join(agentsRoot, entry.name, "avatar.svg")
    if (!existsSync(soulPath)) continue
    if (!overwrite && existsSync(avatarPath)) continue

    try {
      const content = readFileSync(soulPath, "utf8")
      const dna = parseDnaFromSoul(content)
      if (!dna) continue
      writeFileSync(avatarPath, renderSVG(dna, 10, 0, null), "utf8")
      written += 1
    } catch {}
  }

  return written
}

export async function ensureWorkspaceInitialized(
  forceSetup = false,
  projectRoot = process.cwd(),
  preferredTemplate?: string,
): Promise<boolean> {
  const termlingsDir = join(projectRoot, ".termlings")
  const workspaceExists = existsSync(termlingsDir)
  const firstInit = !workspaceExists
  const agentsDir = join(termlingsDir, "agents")
  const hadAgentsBefore = existsSync(agentsDir)
    && readdirSync(agentsDir, { withFileTypes: true })
      .some((entry) => entry.isDirectory() && existsSync(join(agentsDir, entry.name, "SOUL.md")))

  if (!forceSetup && workspaceExists) {
    ensureWorkspaceDirs(projectRoot)
    return true
  }

  const templates = listWorkspaceTemplates()
  const RECOMMENDED = "startup-team"
  const sorted = templates.includes(RECOMMENDED)
    ? [RECOMMENDED, ...templates.filter((t) => t !== RECOMMENDED)]
    : templates
  const templateOptions = sorted.length > 0 ? sorted : [RECOMMENDED]
  const defaultTemplate = templateOptions[0] || RECOMMENDED
  const templateFromOption = preferredTemplate?.trim() || ""
  const selectedTemplate = templateFromOption || defaultTemplate

  // Initialize automatically in non-interactive shells.
  if (!process.stdout.isTTY) {
    const result = initializeWorkspaceFromTemplate(selectedTemplate, projectRoot)
    if (firstInit) {
      const selectedRuntime = recommendedRuntime(detectRuntimeChoices())
      updateSpawnDefaults(projectRoot, selectedRuntime)
    }
    let randomized = 0
    if (!hadAgentsBefore && result.templateName === "startup-team") {
      randomized = randomizeDefaultTeamIdentities(projectRoot)
      if (randomized > 0) {
        console.log(`Randomized ${randomized} team identities (name + dna).`)
      }
    }
    const avatarsWritten = ensureAgentAvatarSvgs(projectRoot, randomized > 0)
    if (avatarsWritten > 0) {
      console.log(`Generated ${avatarsWritten} avatar.svg files.`)
    }
    console.log(`Initialized .termlings with template: ${result.templateName}`)
    if (!templateFromOption) {
      console.log("Run 'termlings init' in an interactive terminal to choose a different template.")
    }
    return true
  }

  let rlInput: NodeJS.ReadableStream = process.stdin
  let rlOutput: NodeJS.WritableStream = process.stdout
  let ttyFd: number | null = null

  // Some launchers expose a TTY on /dev/tty even when stdin is not TTY.
  if (!process.stdin.isTTY) {
    try {
      ttyFd = openSync("/dev/tty", "r+")
      rlInput = createReadStream("/dev/tty", { fd: ttyFd, autoClose: false })
      rlOutput = createWriteStream("/dev/tty", { fd: ttyFd, autoClose: false })
    } catch {
      const result = initializeWorkspaceFromTemplate(selectedTemplate, projectRoot)
      if (firstInit) {
        const selectedRuntime = recommendedRuntime(detectRuntimeChoices())
        updateSpawnDefaults(projectRoot, selectedRuntime)
      }
      let randomized = 0
      if (!hadAgentsBefore && result.templateName === "startup-team") {
        randomized = randomizeDefaultTeamIdentities(projectRoot)
        if (randomized > 0) {
          console.log(`Randomized ${randomized} team identities (name + dna).`)
        }
      }
      const avatarsWritten = ensureAgentAvatarSvgs(projectRoot, randomized > 0)
      if (avatarsWritten > 0) {
        console.log(`Generated ${avatarsWritten} avatar.svg files.`)
      }
      console.log(`Initialized .termlings with template: ${result.templateName}`)
      if (!templateFromOption) {
        console.log("No interactive TTY detected. Run 'termlings init' later to choose a template manually.")
      }
      return true
    }
  }

  let rl = createInterface({
    input: rlInput,
    output: rlOutput,
  })
  let rlClosed = false

  try {
    const mutedYes = supportsAnsi(rlOutput) ? `${ANSI_MUTED}Y${ANSI_RESET}` : "Y"
    const setupPrompt = workspaceExists
      ? `Start setup wizard for this existing workspace? [${mutedYes}/n] `
      : `Create a new Termlings workspace in this folder? [${mutedYes}/n] `
    const projectLabel = basename(projectRoot) || projectRoot

    console.log(`${ANSI_MUTED}It will create a ${projectLabel}/.termlings folder.${ANSI_RESET}`)

    const setupAnswer = (await rl.question(setupPrompt)).trim().toLowerCase()
    if (setupAnswer === "n" || setupAnswer === "no") {
      console.log("Setup cancelled. No files were changed.")
      return false
    }

    let template = selectedTemplate
    if (templateFromOption) {
      console.log("")
      console.log(`Using template from --template: ${template}`)
    } else {
      console.log("")
      console.log("Select a workspace template:")
      templateOptions.forEach((localTemplate, index) => {
        const label = localTemplate === defaultTemplate
          ? `${localTemplate} (recommended)`
          : localTemplate
        console.log(`  ${index + 1}. ${label}`)
        console.log(`     ${ANSI_MUTED}${templateDescription(localTemplate)}${ANSI_RESET}`)
      })

      rl.close()
      rlClosed = true
      const templateAnswer = await askWithDefault(rlInput, rlOutput, "Template", "1")
      const idx = Number.parseInt(templateAnswer, 10)
      if (!Number.isNaN(idx) && idx >= 1 && idx <= templateOptions.length) {
        template = templateOptions[idx - 1]!
      } else if (templateOptions.includes(templateAnswer)) {
        template = templateAnswer
      } else {
        template = defaultTemplate
        console.log(`Unknown template "${templateAnswer}". Using "${defaultTemplate}".`)
      }
    }

    const result = initializeWorkspaceFromTemplate(template, projectRoot)
    let randomized = 0
    if (!hadAgentsBefore && result.templateName === "startup-team") {
      randomized = randomizeDefaultTeamIdentities(projectRoot)
      if (randomized > 0) {
        console.log(`✓ Randomized ${randomized} team identities`)
      }
    }
    const avatarsWritten = ensureAgentAvatarSvgs(projectRoot, randomized > 0)
    if (avatarsWritten > 0) {
      console.log(`✓ Generated ${avatarsWritten} avatar.svg files`)
    }
    console.log(`✓ Initialized .termlings using template: ${result.templateName}`)

    if (!rlClosed) {
      rl.close()
      rlClosed = true
    }
    await setupDefaultHuman(rlInput, rlOutput, projectRoot)
    await setupGitIgnore(rlInput, rlOutput, projectRoot)
    if (firstInit) {
      await setupDefaultRuntime(rlInput, rlOutput, projectRoot)
    }

    return true
  } finally {
    try {
      if (!rlClosed) rl.close()
    } catch {}
    if (ttyFd !== null) {
      try {
        closeSync(ttyFd)
      } catch {}
    }
  }
}
