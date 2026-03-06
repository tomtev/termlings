export function listUnsupportedTopLevelFlags(flags: Set<string>): string[] {
  const allowed = new Set(["help", "h", "server", "spawn"])
  if (flags.has("spawn")) {
    allowed.add("template")
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
