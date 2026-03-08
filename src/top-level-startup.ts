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
}): { command: string; args: string[] } {
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
