import { createReadStream, createWriteStream, existsSync, openSync, closeSync } from "fs"
import { spawn, spawnSync } from "child_process"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { createInterface } from "readline/promises"

import { ensureWorkspaceDirs } from "./state.js"
import { initializeWorkspaceFromTemplate, listWorkspaceTemplates } from "./setup.js"
import {
  clearHubServer,
  isHubServerRunning,
  readHubServer,
  registerProject,
  workspaceUrl,
  writeHubServer,
} from "./hub.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function ensureWorkspaceInitializedForLaunch(
  forceSetup = false,
  projectRoot = process.cwd(),
): Promise<boolean> {
  const termlingsDir = join(projectRoot, ".termlings")
  const workspaceExists = existsSync(termlingsDir)

  if (!forceSetup && workspaceExists) {
    ensureWorkspaceDirs(projectRoot)
    return true
  }

  const templates = listWorkspaceTemplates()
  const templateOptions = templates.length > 0 ? templates : ["office"]
  const defaultTemplate = templateOptions[0] || "office"

  // Initialize automatically in non-interactive shells.
  if (!process.stdout.isTTY) {
    const result = initializeWorkspaceFromTemplate(defaultTemplate, projectRoot)
    console.log(`Initialized .termlings with template: ${result.templateName}`)
    console.log("Run 'termlings init' in an interactive terminal to choose a different template.")
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
      const result = initializeWorkspaceFromTemplate(defaultTemplate, projectRoot)
      console.log(`Initialized .termlings with template: ${result.templateName}`)
      console.log("No interactive TTY detected. Run 'termlings init' later to choose a template manually.")
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

    console.log("")
    console.log("Available templates:")
    templateOptions.forEach((template, index) => {
      console.log(`  ${index + 1}. ${template}`)
    })

    const templateAnswer = (await rl.question("Select template [1]: ")).trim()
    let template = defaultTemplate

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

    const result = initializeWorkspaceFromTemplate(template, projectRoot)
    console.log(`✓ Initialized .termlings using template: ${result.templateName}`)
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

export async function launchWorkspaceWeb(opts: Record<string, string>, projectRoot = process.cwd()): Promise<never> {
  const workspaceReady = await ensureWorkspaceInitializedForLaunch(false, projectRoot)
  if (!workspaceReady) {
    process.exit(0)
  }

  const webRoot = join(__dirname, "..", "..", "web")
  if (!existsSync(webRoot)) {
    console.error("Web workspace is missing. Expected ./web directory.")
    process.exit(1)
  }

  const requestedHost = opts.host || "127.0.0.1"
  const requestedPort = opts.port ? Number.parseInt(opts.port, 10) : 4173
  if (Number.isNaN(requestedPort) || requestedPort <= 0) {
    console.error("Invalid --port value")
    process.exit(1)
  }

  const project = registerProject(projectRoot)
  const existingServer = readHubServer()
  if (existingServer && await isHubServerRunning(existingServer)) {
    if ((opts.host && requestedHost !== existingServer.host) || (opts.port && requestedPort !== existingServer.port)) {
      console.warn(
        `Workspace server already running at ${existingServer.host}:${existingServer.port}; ignoring requested ${requestedHost}:${requestedPort}.`,
      )
    }

    console.log(`Registered project "${project.projectName}" with running workspace server.`)
    console.log(`Open: ${workspaceUrl(existingServer.host, existingServer.port, project.projectId)}`)
    process.exit(0)
  }

  const nodeModulesPath = join(webRoot, "node_modules")
  if (!existsSync(nodeModulesPath)) {
    console.log("Installing web workspace dependencies...")
    const install = spawnSync("bun", ["install"], {
      cwd: webRoot,
      stdio: "inherit",
      env: process.env,
    })

    if (install.status !== 0) {
      process.exit(install.status ?? 1)
    }
  }

  const startedAt = Date.now()
  writeHubServer({
    host: requestedHost,
    port: requestedPort,
    pid: 0,
    startedAt,
    updatedAt: startedAt,
  })

  console.log(`Starting Termlings web workspace on http://${requestedHost}:${requestedPort}`)
  console.log(`Project tab: ${workspaceUrl(requestedHost, requestedPort, project.projectId)}`)

  const child = spawn("bun", ["run", "dev", "--", "--host", requestedHost, "--port", String(requestedPort)], {
    cwd: webRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      TERMLINGS_PROJECT_ROOT: projectRoot,
    },
  })

  writeHubServer({
    host: requestedHost,
    port: requestedPort,
    pid: child.pid ?? 0,
    startedAt,
    updatedAt: Date.now(),
  })

  child.on("error", (err) => {
    clearHubServer()
    console.error(`Failed to start web workspace: ${err}`)
    process.exit(1)
  })

  child.on("exit", (code) => {
    const registered = readHubServer()
    if (
      registered
      && registered.host === requestedHost
      && registered.port === requestedPort
      && (registered.pid === 0 || registered.pid === child.pid)
    ) {
      clearHubServer()
    }
    process.exit(code ?? 0)
  })

  await new Promise(() => {})
}
