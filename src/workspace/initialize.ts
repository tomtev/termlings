import { createReadStream, createWriteStream, existsSync, openSync, closeSync, writeFileSync, readFileSync } from "fs"
import { createInterface } from "readline/promises"
import { join } from "path"
import { spawnSync } from "child_process"
import { userInfo } from "os"

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
  rl: any,
  projectRoot: string,
): Promise<void> {
  const humanPath = join(projectRoot, ".termlings", "humans", "default", "SOUL.md")

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
}

export async function ensureWorkspaceInitialized(
  forceSetup = false,
  projectRoot = process.cwd(),
  preferredTemplate?: string,
): Promise<boolean> {
  const termlingsDir = join(projectRoot, ".termlings")
  const workspaceExists = existsSync(termlingsDir)

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
      console.log(`Initialized .termlings with template: ${result.templateName}`)
      if (!templateFromOption) {
        console.log("No interactive TTY detected. Run 'termlings init' later to choose a template manually.")
      }
      return true
    }
  }

  const rl = createInterface({
    input: rlInput,
    output: rlOutput,
  })

  try {
    const setupPrompt = workspaceExists
      ? ".termlings already exists. Re-run setup and template selection? [Y/n] "
      : "No .termlings folder found. Set up Termlings in this project? [Y/n] "

    const setupAnswer = (await rl.question(setupPrompt)).trim().toLowerCase()
    if (setupAnswer === "n" || setupAnswer === "no") {
      console.log("Setup cancelled.")
      return false
    }

    let template = selectedTemplate
    if (templateFromOption) {
      console.log("")
      console.log(`Using template from --template: ${template}`)
    } else {
      console.log("")
      console.log("Available templates:")
      templateOptions.forEach((localTemplate, index) => {
        console.log(`  ${index + 1}. ${localTemplate}`)
      })

      const templateAnswer = (await rl.question("Select template [1]: ")).trim()
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
    console.log(`✓ Initialized .termlings using template: ${result.templateName}`)

    await setupDefaultHuman(rl, projectRoot)

    return true
  } finally {
    rl.close()
    if (ttyFd !== null) {
      try {
        closeSync(ttyFd)
      } catch {}
    }
  }
}
