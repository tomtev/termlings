import { listEnabledSlashCommands } from "../apps/registry.js"
import type { ResolvedWorkspaceApps } from "../engine/apps.js"

export interface SlashCommandContext {
  selectedThreadId: string
}

export interface ScheduleSlashCommandOpen {
  kind: "open-form"
  form: "schedule"
  target?: string
  targetLocked: boolean
  message?: string
}

export interface SlashCommandError {
  kind: "error"
  message: string
}

export type SlashCommandResult = ScheduleSlashCommandOpen | SlashCommandError

interface SlashCommandDefinition {
  name: string
  description: string
  run: (args: string[], context: SlashCommandContext) => SlashCommandResult
}

function tokenizeSlashCommand(input: string): string[] {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

const scheduleCommand: SlashCommandDefinition = {
  name: "schedule",
  description: "Open the scheduled message form.",
  run: (args, context) => {
    const selectedThreadTarget = context.selectedThreadId.startsWith("agent:")
      ? context.selectedThreadId
      : undefined
    const firstArg = args[0]?.trim() || ""
    const looksLikeTarget = (
      firstArg.startsWith("@")
      || firstArg.startsWith("agent:")
      || firstArg.startsWith("human:")
      || ["everyone", "@everyone", "owner", "operator", "human"].includes(firstArg.toLowerCase())
    )

    if (!selectedThreadTarget && args.length > 0 && !looksLikeTarget) {
      return {
        kind: "error",
        message: "Use /schedule @agent ... in All activity, or open a DM thread first.",
      }
    }

    const target = looksLikeTarget ? firstArg : selectedThreadTarget
    const targetLocked = !looksLikeTarget && Boolean(selectedThreadTarget)
    const message = (looksLikeTarget ? args.slice(1) : args).join(" ").trim()

    return {
      kind: "open-form",
      form: "schedule",
      target,
      targetLocked,
      message: message.length > 0 ? message : undefined,
    }
  },
}

const slashCommandHandlers = new Map<string, SlashCommandDefinition>([
  [scheduleCommand.name, scheduleCommand],
])

function resolveSlashCommands(apps: ResolvedWorkspaceApps): SlashCommandDefinition[] {
  return listEnabledSlashCommands(apps)
    .map((command) => slashCommandHandlers.get(command.name))
    .filter((command): command is SlashCommandDefinition => Boolean(command))
}

export function executeSlashCommand(
  input: string,
  context: SlashCommandContext,
  apps: ResolvedWorkspaceApps,
): SlashCommandResult {
  const slashCommands = resolveSlashCommands(apps)
  const tokens = tokenizeSlashCommand(input)
  if (tokens.length === 0) {
    return { kind: "error", message: "Enter a slash command." }
  }

  const rawName = tokens[0] || ""
  if (!rawName.startsWith("/")) {
    return { kind: "error", message: "Slash commands must start with /." }
  }

  const name = rawName.slice(1).toLowerCase()
  if (!name) {
    return { kind: "error", message: `Available slash commands: ${slashCommands.map(command => `/${command.name}`).join(", ")}` }
  }

  const command = slashCommands.find((entry) => entry.name === name)
  if (!command) {
    return {
      kind: "error",
      message: `Unknown slash command "/${name}". Available: ${slashCommands.map(entry => `/${entry.name}`).join(", ")}`,
    }
  }

  return command.run(tokens.slice(1), context)
}

export function listSlashCommands(apps: ResolvedWorkspaceApps): Array<{ name: string; description: string }> {
  return resolveSlashCommands(apps).map((command) => ({
    name: command.name,
    description: command.description,
  }))
}
