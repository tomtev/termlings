import { readFileSync } from "fs"
import { basename, join, resolve } from "path"

export function listUnsupportedTopLevelFlags(flags: Set<string>): string[] {
  const allowed = new Set(["help", "h", "server", "spawn"])
  if (flags.has("spawn")) {
    allowed.add("template")
    allowed.add("docker")
    allowed.add("allow-host-yolo")
  }
  return Array.from(flags).filter((flag) => !allowed.has(flag))
}

export function getTopLevelInitOptions(
  flags: Set<string>,
  opts: Record<string, string>,
): Record<string, string> {
  const template = opts.template?.trim()
  if (!flags.has("spawn") || !template) {
    return {}
  }
  return { template }
}

export function buildTopLevelSpawnWorkerInvocation(options: {
  root: string
  argv1?: string
  execPath?: string
  docker?: boolean
  allowHostYolo?: boolean
  env?: NodeJS.ProcessEnv
}): { command: string; args: string[] } {
  const env = options.env || process.env
  const npmExecPath = String(env.npm_execpath || "").trim()
  const npmCommand = String(env.npm_command || "").trim()
  const npmLifecycleEvent = String(env.npm_lifecycle_event || "").trim()
  const npmNodeExecPath = String(env.npm_node_execpath || "").trim()
  if (npmExecPath && (npmCommand === "exec" || npmLifecycleEvent === "npx")) {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: unknown }
    const version = typeof pkg.version === "string" && pkg.version.trim().length > 0
      ? pkg.version.trim()
      : "latest"
    const command = npmNodeExecPath || "node"
    const args = [
      npmExecPath,
      "exec",
      "--yes",
      "--package",
      `termlings@${version}`,
      "--",
      "termlings",
      "spawn",
      "--all",
      "--quiet",
    ]
    if (options.docker) {
      args.push("--docker")
    }
    if (options.allowHostYolo) {
      args.push("--allow-host-yolo")
    }
    return { command, args }
  }

  const cliEntry = (options.argv1 || "").trim().length > 0
    ? resolve(options.argv1!)
    : join(options.root, "bin", "termlings.js")
  const execPath = String(options.execPath || "").trim()
  const command = basename(execPath).toLowerCase().includes("bun")
    ? execPath
    : "bun"
  const args = [cliEntry, "spawn", "--all", "--quiet"]
  if (options.docker) {
    args.push("--docker")
  }
  if (options.allowHostYolo) {
    args.push("--allow-host-yolo")
  }
  return { command, args }
}
