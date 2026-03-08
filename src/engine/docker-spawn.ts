import { spawn, spawnSync } from "child_process"
import { createHash } from "crypto"
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "fs"
import { homedir } from "os"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"

export interface DockerSpawnTarget {
  root: string
  agentSlug: string
  runtimeName: string
  presetName: string
  extraArgs: string[]
}

const DOCKER_SPAWN_HOME_DIR = join(homedir(), ".termlings", "docker-spawn")
const HOST_ENV_ALLOWLIST = [
  "TERM",
  "COLORTERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NO_COLOR",
  "FORCE_COLOR",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ANTHROPIC_BASE_URL",
]

interface PackageMeta {
  name?: string
  version?: string
}

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
}

function packageMeta(): PackageMeta {
  try {
    return JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf8")) as PackageMeta
  } catch {
    return {}
  }
}

function sanitizeTagPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dev"
}

export function dockerSpawnImageTag(): string {
  const meta = packageMeta()
  const name = sanitizeTagPart(meta.name || "termlings")
  const version = sanitizeTagPart(meta.version || "dev")
  return `${name}-spawn-runtime:${version}`
}

export function dockerWorkspaceKey(root = process.cwd()): string {
  return createHash("sha1").update(resolve(root)).digest("hex").slice(0, 12)
}

export function dockerRuntimeHome(root = process.cwd()): string {
  return join(DOCKER_SPAWN_HOME_DIR, dockerWorkspaceKey(root), "home")
}

export function dockerContainerName(root: string, agentSlug: string): string {
  const slug = agentSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "agent"
  return `termlings-${dockerWorkspaceKey(root)}-${slug}`
}

export function pickDockerHostEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const key of HOST_ENV_ALLOWLIST) {
    const value = env[key]
    if (typeof value === "string" && value.length > 0) {
      next[key] = value
    }
  }
  return next
}

function hostRuntimeSeeds(): Array<{ source: string; destination: string }> {
  const home = homedir()
  return [
    {
      source: join(home, ".claude.json"),
      destination: ".claude.json",
    },
    {
      source: join(home, ".claude", ".credentials.json"),
      destination: join(".claude", ".credentials.json"),
    },
    {
      source: join(home, ".claude", "settings.json"),
      destination: join(".claude", "settings.json"),
    },
    {
      source: join(home, ".claude", "settings.local.json"),
      destination: join(".claude", "settings.local.json"),
    },
    {
      source: join(home, ".codex", "auth.json"),
      destination: join(".codex", "auth.json"),
    },
  ]
}

export function ensureDockerRuntimeHome(root = process.cwd()): string {
  const runtimeHome = dockerRuntimeHome(root)
  const directories = [
    runtimeHome,
    join(runtimeHome, ".claude"),
    join(runtimeHome, ".codex"),
    join(runtimeHome, ".agent-browser"),
    join(runtimeHome, ".cache"),
    join(runtimeHome, ".config"),
    join(runtimeHome, ".local", "bin"),
    join(runtimeHome, ".npm-global"),
    join(runtimeHome, ".termlings"),
  ]
  for (const dir of directories) {
    mkdirSync(dir, { recursive: true })
  }

  for (const seed of hostRuntimeSeeds()) {
    const dest = join(runtimeHome, seed.destination)
    if (existsSync(dest) || !existsSync(seed.source)) continue
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(seed.source, dest)
    try {
      chmodSync(dest, 0o600)
    } catch {}
  }

  return runtimeHome
}

function runDockerCommand(args: string[], stdio: "ignore" | "inherit" = "ignore"): number {
  const result = spawnSync("docker", args, { stdio })
  return typeof result.status === "number" ? result.status : 1
}

export function ensureDockerAvailable(): void {
  const status = runDockerCommand(["version"], "ignore")
  if (status !== 0) {
    throw new Error("Docker is required for `termlings spawn --docker`. Install Docker and ensure `docker version` works.")
  }
}

function packageDockerBuildFiles(): Array<{ path: string; label: string }> {
  const root = packageRoot()
  return [
    { path: join(root, "Dockerfile"), label: "Dockerfile" },
    { path: join(root, "scripts", "docker-entrypoint.sh"), label: "scripts/docker-entrypoint.sh" },
    { path: join(root, "package.json"), label: "package.json" },
  ]
}

export function ensureDockerSpawnBuildContext(): void {
  for (const file of packageDockerBuildFiles()) {
    if (!existsSync(file.path)) {
      throw new Error(`Missing ${file.label}. Reinstall Termlings with Docker assets included.`)
    }
  }
}

export function ensureDockerSpawnImage(forceRebuild = false): void {
  ensureDockerAvailable()
  ensureDockerSpawnBuildContext()
  const tag = dockerSpawnImageTag()
  const inspectStatus = forceRebuild ? 1 : runDockerCommand(["image", "inspect", tag], "ignore")
  if (inspectStatus === 0) return

  const root = packageRoot()
  const status = runDockerCommand(["build", "-t", tag, root], "inherit")
  if (status !== 0) {
    throw new Error(`Failed to build Docker image ${tag}.`)
  }
}

export function removeDockerContainer(containerName: string): void {
  runDockerCommand(["rm", "-f", containerName], "ignore")
}

export function buildDockerRunArgs(
  target: DockerSpawnTarget,
  options: { interactive?: boolean } = {},
): string[] {
  const root = resolve(target.root)
  const runtimeHome = dockerRuntimeHome(root)
  const args = [
    "run",
    "--rm",
    "--name",
    dockerContainerName(root, target.agentSlug),
    "--init",
    "-w",
    "/workspace",
    "-v",
    `${root}:/workspace`,
    "-v",
    `${join(runtimeHome, ".claude")}:/home/termlings/.claude`,
    "-v",
    `${join(runtimeHome, ".claude.json")}:/home/termlings/.claude.json`,
    "-v",
    `${join(runtimeHome, ".codex")}:/home/termlings/.codex`,
    "-v",
    `${join(runtimeHome, ".agent-browser")}:/home/termlings/.agent-browser`,
    "-v",
    `${join(runtimeHome, ".cache")}:/home/termlings/.cache`,
    "-v",
    `${join(runtimeHome, ".config")}:/home/termlings/.config`,
    "-v",
    `${join(runtimeHome, ".termlings")}:/home/termlings/.termlings`,
  ]

  if (process.platform === "linux") {
    args.push("--add-host", "host.docker.internal:host-gateway")
  }

  if (options.interactive) {
    if (process.stdin.isTTY) args.push("-i")
    if (process.stdout.isTTY) args.push("-t")
  }

  for (const [key, value] of Object.entries(pickDockerHostEnv())) {
    args.push("-e", `${key}=${value}`)
  }

  args.push("-e", "TERMLINGS_DOCKER=1")
  args.push("-e", "TERMLINGS_DOCKER_BROWSER_HOST=host.docker.internal")

  args.push(
    dockerSpawnImageTag(),
    "termlings",
    "spawn",
    target.runtimeName,
    target.presetName,
    `--agent=${target.agentSlug}`,
    "--inline",
    "--allow-host-yolo",
    ...target.extraArgs,
  )

  return args
}

export async function runDockerSpawnWorker(target: DockerSpawnTarget): Promise<never> {
  ensureDockerAvailable()
  ensureDockerSpawnBuildContext()
  ensureDockerRuntimeHome(target.root)

  const containerName = dockerContainerName(target.root, target.agentSlug)
  removeDockerContainer(containerName)

  const args = buildDockerRunArgs(target, { interactive: false })
  const child = spawn("docker", args, {
    stdio: "ignore",
  })

  let cleaningUp = false
  const stopContainer = () => {
    if (cleaningUp) return
    cleaningUp = true
    removeDockerContainer(containerName)
  }

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      stopContainer()
      process.exit(0)
    })
  }

  child.on("exit", (code) => {
    stopContainer()
    process.exit(typeof code === "number" ? code : 1)
  })

  child.on("error", () => {
    stopContainer()
    process.exit(1)
  })

  await new Promise(() => {})
  process.exit(1)
}

export async function runDockerSpawnForeground(target: DockerSpawnTarget): Promise<never> {
  ensureDockerAvailable()
  ensureDockerSpawnImage()
  ensureDockerRuntimeHome(target.root)

  const containerName = dockerContainerName(target.root, target.agentSlug)
  removeDockerContainer(containerName)

  const args = buildDockerRunArgs(target, { interactive: true })
  const child = spawn("docker", args, {
    stdio: "inherit",
  })

  child.on("exit", (code) => {
    removeDockerContainer(containerName)
    process.exit(typeof code === "number" ? code : 1)
  })

  child.on("error", (error) => {
    removeDockerContainer(containerName)
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })

  await new Promise(() => {})
  process.exit(1)
}
