export interface CommandSchemaAction {
  summary: string
  usage: string
  aliases?: string[]
  options?: Record<string, unknown>
  notes?: string[]
  examples?: string[]
}

export interface CommandSchemaContract {
  command: string
  title: string
  summary: string
  relatedCommands?: string[]
  notes?: string[]
  actions: Record<string, CommandSchemaAction>
}

function sortedActionNames(contract: CommandSchemaContract): string[] {
  return Object.keys(contract.actions).sort((a, b) => a.localeCompare(b))
}

function usageToInvokeTokens(usage: string): string[] {
  const primaryUsage = usage.split("|")[0]?.trim() || usage.trim()
  const tokens = primaryUsage.split(/\s+/).filter(Boolean)
  const startIndex = tokens[0] === "termlings" ? 1 : 0
  const invoke: string[] = []

  for (let i = startIndex; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token.startsWith("<") || token.startsWith("[")) break
    invoke.push(token)
  }

  return invoke
}

export function renderCommandSchema(contract: CommandSchemaContract, actionName?: string): Record<string, unknown> {
  if (!actionName) {
    return {
      command: contract.command,
      title: contract.title,
      summary: contract.summary,
      relatedCommands: contract.relatedCommands || [],
      actions: sortedActionNames(contract).map((name) => ({
        name,
        invoke: usageToInvokeTokens(contract.actions[name]!.usage),
        summary: contract.actions[name]!.summary,
        usage: contract.actions[name]!.usage,
        aliases: contract.actions[name]!.aliases || [],
        options: contract.actions[name]!.options || null,
        notes: contract.actions[name]!.notes || [],
        examples: contract.actions[name]!.examples || [],
      })),
      notes: contract.notes || [],
    }
  }

  const action = contract.actions[actionName]
  if (!action) {
    throw new Error(`Unknown ${contract.command} schema action: ${actionName}`)
  }

  return {
    command: contract.command,
    title: contract.title,
    action: actionName,
    invoke: usageToInvokeTokens(action.usage),
    summary: action.summary,
    usage: action.usage,
    aliases: action.aliases || [],
    options: action.options || null,
    notes: action.notes || [],
    examples: action.examples || [],
  }
}

export function maybeHandleCommandSchema(contract: CommandSchemaContract, positional: string[]): boolean {
  if (positional[1] !== "schema") return false

  try {
    console.log(JSON.stringify(renderCommandSchema(contract, positional[2]), null, 2))
    return true
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
