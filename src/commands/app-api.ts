export interface AppApiActionSchema {
  summary: string
  params?: Record<string, unknown>
  stdinJson?: Record<string, unknown> | unknown[] | string | number | boolean | null
  notes?: string[]
}

export interface AppApiContract {
  app: string
  title: string
  summary: string
  actions: Record<string, AppApiActionSchema>
  env?: string[]
  notes?: string[]
}

function sortedActionNames(contract: AppApiContract): string[] {
  return Object.keys(contract.actions).sort((a, b) => a.localeCompare(b))
}

function formatActionInput(schema: AppApiActionSchema): string {
  const modes: string[] = []
  if (schema.params) modes.push("--params")
  if (schema.stdinJson !== undefined) modes.push("--stdin-json")
  return modes.length > 0 ? modes.join(" + ") : "no input"
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

export function parseLimit(input: unknown, fallback: number): number {
  if (input === undefined || input === null || input === "") return fallback
  const raw = typeof input === "number" ? String(input) : String(input).trim()
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid limit: ${input}`)
  }
  return value
}

export function parseParamsJson<T extends Record<string, unknown> = Record<string, unknown>>(opts: Record<string, string>): T {
  const raw = opts.params
  if (!raw) return {} as T
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid --params JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--params must be a JSON object")
  }
  return parsed as T
}

export async function readStdinJson<T = unknown>(flags: Set<string>): Promise<T> {
  if (!flags.has("stdin-json")) {
    throw new Error("This action requires --stdin-json")
  }
  if (process.stdin.isTTY) {
    throw new Error("Expected JSON on stdin. Pipe a JSON body into the command when using --stdin-json.")
  }

  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim()
  if (!raw) {
    throw new Error("Expected JSON on stdin. Received an empty body.")
  }

  try {
    return JSON.parse(raw) as T
  } catch (error) {
    throw new Error(`Invalid stdin JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function readString(value: unknown, label: string): string {
  const normalized = readOptionalString(value)
  if (!normalized) {
    throw new Error(`Missing required string field: ${label}`)
  }
  return normalized
}

export function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings`)
  }
  return value.map((entry, index) => readString(entry, `${label}[${index}]`))
}

export function assertNoExtraPositionalArgs(positional: string[], expectedCount: number, app: string, action: string): void {
  if (positional.length > expectedCount) {
    throw new Error(`Unexpected positional arguments for ${app} ${action}. Use --params and --stdin-json instead.`)
  }
}

export function renderAppApiHelp(contract: AppApiContract): string {
  const actionNames = sortedActionNames(contract)
  const actionWidth = Math.max(...actionNames.map((name) => name.length), "schema".length) + 2
  const actionLines = actionNames
    .map((name) => {
      const schema = contract.actions[name]!
      return `  ${name.padEnd(actionWidth)}${schema.summary} (${formatActionInput(schema)})`
    })
    .join("\n")

  const envLines = contract.env && contract.env.length > 0
    ? `\nENV (.termlings/.env):\n${contract.env.map((name) => `  ${name}`).join("\n")}\n`
    : ""

  const notesLines = contract.notes && contract.notes.length > 0
    ? `\nNOTES:\n${contract.notes.map((line) => `  - ${line}`).join("\n")}\n`
    : ""

  return `
${contract.title} - ${contract.summary}

Canonical API:
  termlings ${contract.app} schema [<action>] [--json]
  termlings ${contract.app} <action> [--params '{"..."}'] [--json]
  printf '%s\\n' '<json>' | termlings ${contract.app} <action> --stdin-json [--params '{"..."}'] [--json]

Actions:
${actionLines}
${envLines}${notesLines}`.trim()
}

export function renderAppApiSchema(contract: AppApiContract, actionName?: string): Record<string, unknown> {
  if (!actionName) {
    return {
      app: contract.app,
      title: contract.title,
      summary: contract.summary,
      actions: sortedActionNames(contract).map((name) => ({
        name,
        summary: contract.actions[name]!.summary,
        params: contract.actions[name]!.params || null,
        stdinJson: contract.actions[name]!.stdinJson ?? null,
      })),
      env: contract.env || [],
      notes: contract.notes || [],
    }
  }

  const schema = contract.actions[actionName]
  if (!schema) {
    throw new Error(`Unknown ${contract.app} action schema: ${actionName}`)
  }

  return {
    app: contract.app,
    action: actionName,
    summary: schema.summary,
    params: schema.params || null,
    stdinJson: schema.stdinJson ?? null,
    notes: schema.notes || [],
  }
}

export function maybeHandleAppHelpOrSchema(
  contract: AppApiContract,
  flags: Set<string>,
  positional: string[],
): boolean {
  const action = positional[1]
  if (flags.has("help") || action === "help") {
    console.log(renderAppApiHelp(contract))
    return true
  }
  if (action === "schema") {
    printJson(renderAppApiSchema(contract, positional[2]))
    return true
  }
  return false
}
