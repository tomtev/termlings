import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { spawnSync } from "child_process"
import { basename, join } from "path"

export interface RemoteMachine {
  name: string
  host: string
  user?: string
  port?: number
  identityFile?: string
  remoteDir: string
  runtimeMode: "host" | "docker-workspace"
  dockerShell?: string
  containerDir?: string
  description?: string
  createdAt: number
  updatedAt: number
}

interface RemoteMachineRegistry {
  version: number
  machines: Record<string, RemoteMachine>
}

const REMOTE_MACHINE_REGISTRY_VERSION = 1

function resolveTermlingsDir(root = process.cwd()): string {
  const explicit = process.env.TERMLINGS_IPC_DIR?.trim()
  if (explicit) return explicit
  return join(root, ".termlings")
}

function remoteMachinesPath(root = process.cwd()): string {
  return join(resolveTermlingsDir(root), "machines.json")
}

function emptyRegistry(): RemoteMachineRegistry {
  return {
    version: REMOTE_MACHINE_REGISTRY_VERSION,
    machines: {},
  }
}

function sanitizeMachineName(input: string): string {
  const value = String(input || "").trim().toLowerCase()
  if (!value) return ""
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(value)) return ""
  return value
}

function defaultContainerDir(root = process.cwd()): string {
  const project = basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "workspace"
  return `/workspaces/${project}`
}

function sanitizeRuntimeMode(input: unknown): RemoteMachine["runtimeMode"] {
  return input === "docker-workspace" ? "docker-workspace" : "host"
}

function normalizeMachineRecord(name: string, input: Partial<RemoteMachine>, root = process.cwd()): RemoteMachine {
  const normalizedName = sanitizeMachineName(name)
  if (!normalizedName) {
    throw new Error(`Invalid machine name "${name}". Use lowercase letters, numbers, dots, dashes, or underscores.`)
  }

  const host = String(input.host || "").trim()
  if (!host) {
    throw new Error("Machine host is required.")
  }

  const remoteDir = String(input.remoteDir || "").trim()
  if (!remoteDir) {
    throw new Error("Machine remoteDir is required. Use --dir <remote-path>.")
  }

  const portRaw = input.port
  const port = typeof portRaw === "number" && Number.isFinite(portRaw)
    ? Math.trunc(portRaw)
    : undefined
  if (port !== undefined && (port <= 0 || port > 65535)) {
    throw new Error(`Invalid machine port "${port}".`)
  }

  const runtimeMode = sanitizeRuntimeMode(input.runtimeMode)
  const dockerShell = runtimeMode === "docker-workspace"
    ? (typeof input.dockerShell === "string" && input.dockerShell.trim() ? input.dockerShell.trim() : "./docker-shell")
    : undefined
  const containerDir = runtimeMode === "docker-workspace"
    ? (typeof input.containerDir === "string" && input.containerDir.trim() ? input.containerDir.trim() : defaultContainerDir(root))
    : undefined

  const now = Date.now()
  return {
    name: normalizedName,
    host,
    user: typeof input.user === "string" && input.user.trim() ? input.user.trim() : undefined,
    port,
    identityFile: typeof input.identityFile === "string" && input.identityFile.trim() ? input.identityFile.trim() : undefined,
    remoteDir,
    runtimeMode,
    dockerShell,
    containerDir,
    description: typeof input.description === "string" && input.description.trim() ? input.description.trim() : undefined,
    createdAt: typeof input.createdAt === "number" && Number.isFinite(input.createdAt) ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : now,
  }
}

export function readRemoteMachineRegistry(root = process.cwd()): RemoteMachineRegistry {
  const path = remoteMachinesPath(root)
  if (!existsSync(path)) return emptyRegistry()
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<RemoteMachineRegistry>
    const machines: Record<string, RemoteMachine> = {}
    for (const [name, raw] of Object.entries(parsed.machines || {})) {
      try {
        machines[sanitizeMachineName(name)] = normalizeMachineRecord(name, raw || {}, root)
      } catch {
        // ignore invalid machine entries
      }
    }
    return {
      version: typeof parsed.version === "number" ? parsed.version : REMOTE_MACHINE_REGISTRY_VERSION,
      machines,
    }
  } catch {
    return emptyRegistry()
  }
}

function writeRemoteMachineRegistry(registry: RemoteMachineRegistry, root = process.cwd()): void {
  mkdirSync(resolveTermlingsDir(root), { recursive: true })
  writeFileSync(remoteMachinesPath(root), JSON.stringify(registry, null, 2) + "\n", "utf8")
}

export function listRemoteMachines(root = process.cwd()): RemoteMachine[] {
  return Object.values(readRemoteMachineRegistry(root).machines)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getRemoteMachine(name: string, root = process.cwd()): RemoteMachine | null {
  const normalizedName = sanitizeMachineName(name)
  if (!normalizedName) return null
  return readRemoteMachineRegistry(root).machines[normalizedName] || null
}

export function saveRemoteMachine(
  name: string,
  input: Partial<RemoteMachine>,
  root = process.cwd(),
): RemoteMachine {
  const registry = readRemoteMachineRegistry(root)
  const normalizedName = sanitizeMachineName(name)
  if (!normalizedName) {
    throw new Error(`Invalid machine name "${name}".`)
  }
  const existing = registry.machines[normalizedName]
  const next = normalizeMachineRecord(normalizedName, {
    ...existing,
    ...input,
    name: normalizedName,
    createdAt: existing?.createdAt,
    updatedAt: Date.now(),
  }, root)
  registry.machines[normalizedName] = next
  writeRemoteMachineRegistry(registry, root)
  return next
}

export function removeRemoteMachine(name: string, root = process.cwd()): boolean {
  const registry = readRemoteMachineRegistry(root)
  const normalizedName = sanitizeMachineName(name)
  if (!normalizedName || !registry.machines[normalizedName]) return false
  delete registry.machines[normalizedName]
  writeRemoteMachineRegistry(registry, root)
  return true
}

function shellSingleQuote(value: string): string {
  return `'${String(value || "").replace(/'/g, `'\"'\"'`)}'`
}

function shellDoubleQuote(value: string): string {
  return `"${String(value || "").replace(/["\\$`]/g, "\\$&")}"`
}

function remoteDirExpr(remoteDir: string): string {
  const trimmed = String(remoteDir || "").trim()
  if (!trimmed || trimmed === "~") {
    return '"${HOME}"'
  }
  if (trimmed.startsWith("~/")) {
    return '"${HOME}/' + trimmed.slice(2).replace(/["\\$`]/g, "\\$&") + '"'
  }
  return shellDoubleQuote(trimmed)
}

export function buildRemoteMachineShellCommand(
  machine: RemoteMachine,
): string {
  const dirExpr = remoteDirExpr(machine.remoteDir)
  if (machine.runtimeMode === "docker-workspace") {
    const dockerShell = machine.dockerShell || "./docker-shell"
    const containerDir = machine.containerDir || defaultContainerDir()
    const requireDocker = 'command -v docker >/dev/null 2>&1 || { echo "docker is required on the remote machine"; exit 1; }'
    const requireDockerShell = `cd ${dirExpr} && [ -x ${shellSingleQuote(dockerShell)} ] || { echo "docker shell helper is required in the remote control directory"; exit 1; }`
    return `${requireDocker}; ${requireDockerShell}; cd ${dirExpr} && ${shellSingleQuote(dockerShell)} -lc ${shellSingleQuote(`cd ${containerDir} && termlings`)}`
  }

  const requireTermlings = 'command -v termlings >/dev/null 2>&1 || { echo "termlings is required on the remote machine"; exit 1; }'
  return `${requireTermlings}; cd ${dirExpr} && termlings`
}

export function buildRemoteMachineSshArgs(
  machine: RemoteMachine,
): string[] {
  const args: string[] = []
  if (machine.port) {
    args.push("-p", String(machine.port))
  }
  if (machine.identityFile) {
    args.push("-i", machine.identityFile)
  }
  args.push("-t")
  const target = machine.user ? `${machine.user}@${machine.host}` : machine.host
  args.push(target, buildRemoteMachineShellCommand(machine))
  return args
}

export function formatShellCommand(command: string, args: string[]): string {
  return [command, ...args.map((arg) => shellSingleQuote(arg))].join(" ")
}

export function runRemoteMachineSession(
  machine: RemoteMachine,
): number {
  const proc = spawnSync("ssh", buildRemoteMachineSshArgs(machine), {
    stdio: "inherit",
  })
  if (typeof proc.status === "number") {
    return proc.status
  }
  if (proc.error) {
    throw proc.error
  }
  return 1
}
