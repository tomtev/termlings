import { createReadStream, createWriteStream, existsSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from "fs"
import { createInterface } from "readline/promises"
import { join } from "path"
import { spawnSync } from "child_process"
import { userInfo } from "os"
import type { Readable, Writable } from "stream"

import { generateRandomDNA } from "../index.js"
import { generateFunNames } from "../name-generator.js"
import { ensureWorkspaceDirs } from "./state.js"
import { initializeWorkspaceFromTemplate, listWorkspaceTemplates } from "./setup.js"

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

/**
 * Prompt user for their name and update default human.
 */
async function setupDefaultHuman(
  input: Readable,
  output: Writable,
  projectRoot: string,
): Promise<void> {
  const humanPath = join(projectRoot, ".termlings", "humans", "default", "SOUL.md")
  const rl = createInterface({
    input,
    output,
  })

  try {
    const defaultName = getDefaultHumanName()

    console.log("")
    const answer = await rl.question(
      `What's your name? [${defaultName}] `,
    )
    const name = answer.trim() || defaultName

    if (existsSync(humanPath)) {
      const content = readFileSync(humanPath, "utf8")
      const updated = content.replace(/^name:\s*.+$/m, `name: ${name}`)
      writeFileSync(humanPath, updated, "utf8")
      console.log(`✓ Your name: ${name}`)
    }
  } catch {}
  finally {
    rl.close()
  }
}

type GitIgnoreMode = "all" | "messages" | "none"

function parseGitIgnoreMode(input: string): GitIgnoreMode {
  const value = input.trim().toLowerCase()
  if (!value || value === "2" || value === "messages" || value === "ignore messages") return "messages"
  if (value === "1" || value === "all" || value === "ignore all") return "all"
  if (value === "3" || value === "none" || value === "no" || value === "no ignore") return "none"
  return "messages"
}

async function setupGitIgnore(
  input: Readable,
  output: Writable,
  projectRoot: string,
): Promise<void> {
  const rl = createInterface({
    input,
    output,
  })

  try {
    console.log("")
    console.log("Git ignore for .termlings:")
    console.log("  1. Ignore all")
    console.log("     Ignore all .termlings files (except .termlings/.gitignore)")
    console.log("  2. Ignore messages (recommended)")
    console.log("     Ignore only message history under .termlings/store/messages/")
    console.log("  3. No ignore")
    console.log("     Keep .termlings files fully visible to git")

    const mode = parseGitIgnoreMode(await rl.question("Git ignore option [2]: "))
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
  finally {
    rl.close()
  }
}

function templateDescription(template: string): string {
  if (template === "default") {
    return "PM-led startup team: PM, Designer, Developer, Growth, Support."
  }
  return "Local workspace template."
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

export async function ensureWorkspaceInitialized(
  forceSetup = false,
  projectRoot = process.cwd(),
  preferredTemplate?: string,
): Promise<boolean> {
  const termlingsDir = join(projectRoot, ".termlings")
  const workspaceExists = existsSync(termlingsDir)
  const agentsDir = join(termlingsDir, "agents")
  const hadAgentsBefore = existsSync(agentsDir)
    && readdirSync(agentsDir, { withFileTypes: true })
      .some((entry) => entry.isDirectory() && existsSync(join(agentsDir, entry.name, "SOUL.md")))

  if (!forceSetup && workspaceExists) {
    ensureWorkspaceDirs(projectRoot)
    return true
  }

  const templates = listWorkspaceTemplates()
  const templateOptions = templates.length > 0 ? templates : ["default"]
  const defaultTemplate = templateOptions[0] || "default"
  const templateFromOption = preferredTemplate?.trim() || ""
  const selectedTemplate = templateFromOption || defaultTemplate

  // Initialize automatically in non-interactive shells.
  if (!process.stdout.isTTY) {
    const result = initializeWorkspaceFromTemplate(selectedTemplate, projectRoot)
    if (!hadAgentsBefore && result.templateName === "default") {
      const randomized = randomizeDefaultTeamIdentities(projectRoot)
      if (randomized > 0) {
        console.log(`Randomized ${randomized} team identities (name + dna).`)
      }
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
      if (!hadAgentsBefore && result.templateName === "default") {
        const randomized = randomizeDefaultTeamIdentities(projectRoot)
        if (randomized > 0) {
          console.log(`Randomized ${randomized} team identities (name + dna).`)
        }
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

  try {
    const setupPrompt = workspaceExists
      ? "Start setup wizard for this existing workspace? [Y/n] "
      : "Create a new Termlings workspace in this folder? [Y/n] "

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
      const muted = "\x1b[38;5;245m"
      const reset = "\x1b[0m"
      console.log("")
      console.log("Select a workspace template:")
      templateOptions.forEach((localTemplate, index) => {
        const label = localTemplate === defaultTemplate
          ? `${localTemplate} (recommended)`
          : localTemplate
        console.log(`  ${index + 1}. ${label}`)
        console.log(`     ${muted}${templateDescription(localTemplate)}${reset}`)
      })

      const templateAnswer = (await rl.question("Template [1]: ")).trim()
      template = defaultTemplate

      if (templateAnswer.length > 0) {
        const idx = Number.parseInt(templateAnswer, 10)
        if (!Number.isNaN(idx) && idx >= 1 && idx <= templateOptions.length) {
          template = templateOptions[idx - 1]!
        } else if (templateOptions.includes(templateAnswer)) {
          template = templateAnswer
        } else {
          console.log(`Unknown template "${templateAnswer}". Using "${defaultTemplate}".`)
        }
      }
    }

    const result = initializeWorkspaceFromTemplate(template, projectRoot)
    if (!hadAgentsBefore && result.templateName === "default") {
      const randomized = randomizeDefaultTeamIdentities(projectRoot)
      if (randomized > 0) {
        console.log(`✓ Randomized ${randomized} team identities`)
      }
    }
    console.log(`✓ Initialized .termlings using template: ${result.templateName}`)

    rl.close()
    await setupDefaultHuman(rlInput, rlOutput, projectRoot)
    await setupGitIgnore(rlInput, rlOutput, projectRoot)

    return true
  } finally {
    try {
      rl.close()
    } catch {}
    if (ttyFd !== null) {
      try {
        closeSync(ttyFd)
      } catch {}
    }
  }
}
