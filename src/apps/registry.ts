import { readFileSync } from "fs"

import type { MainView } from "../tui/types.js"
import {
  REQUIRED_WORKSPACE_APP_KEYS,
  WORKSPACE_APP_KEYS,
  type WorkspaceAppKey,
} from "../workspace/state.js"

export type AppCommandOptionType = "boolean" | "number" | "string"

export interface AppCommandOptionDefinition {
  name: string
  type: AppCommandOptionType
  description?: string
}

export interface AppCommandDefinition {
  name: string
  usage: string
  summary: string
  options: AppCommandOptionDefinition[]
}

export interface AppSlashCommandDefinition {
  name: string
  description: string
}

export interface AppTabDefinition {
  view: MainView
  label: string
  order: number
}

export interface CoreAppDefinition {
  id: WorkspaceAppKey
  title: string
  required: boolean
  helpOrder: number
  commands: AppCommandDefinition[]
  slashCommands: AppSlashCommandDefinition[]
  tui?: {
    tab?: AppTabDefinition
  }
}

type AppAvailabilityMap = Record<WorkspaceAppKey, boolean>

const CORE_APP_MANIFEST_PATH = new URL("./core-apps.json", import.meta.url)
const VALID_APP_KEYS = new Set<string>(WORKSPACE_APP_KEYS)
const VALID_MAIN_VIEWS = new Set<MainView>(["messages", "requests", "tasks", "calendar"])
const VALID_OPTION_TYPES = new Set<AppCommandOptionType>(["boolean", "number", "string"])
const REQUIRED_APP_KEYS = new Set<string>(REQUIRED_WORKSPACE_APP_KEYS)

function parseString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length <= 0) {
    throw new Error(`Invalid ${label} in ${CORE_APP_MANIFEST_PATH.pathname}`)
  }
  return value.trim()
}

function parseBoolean(value: unknown): boolean {
  return value === true
}

function parseNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function parseCommandOptions(raw: unknown, appId: WorkspaceAppKey, commandName: string): AppCommandOptionDefinition[] {
  if (!Array.isArray(raw)) return []
  const parsed: AppCommandOptionDefinition[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid option on ${appId}.${commandName}`)
    }
    const option = entry as Record<string, unknown>
    const name = parseString(option.name, `${appId}.${commandName}.option.name`)
    const type = parseString(option.type, `${appId}.${commandName}.option.type`) as AppCommandOptionType
    if (!VALID_OPTION_TYPES.has(type)) {
      throw new Error(`Unsupported option type "${type}" on ${appId}.${commandName}`)
    }
    const description = typeof option.description === "string" && option.description.trim().length > 0
      ? option.description.trim()
      : undefined
    parsed.push({ name, type, ...(description ? { description } : {}) })
  }
  return parsed
}

function parseCommands(raw: unknown, appId: WorkspaceAppKey): AppCommandDefinition[] {
  if (!Array.isArray(raw) || raw.length <= 0) {
    throw new Error(`App "${appId}" must declare at least one command`)
  }

  const commands: AppCommandDefinition[] = []
  const seenNames = new Set<string>()
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid command definition on "${appId}"`)
    }
    const command = entry as Record<string, unknown>
    const name = parseString(command.name, `${appId}.command.name`)
    if (seenNames.has(name)) {
      throw new Error(`Duplicate command "${name}" on "${appId}"`)
    }
    seenNames.add(name)

    commands.push({
      name,
      usage: parseString(command.usage, `${appId}.${name}.usage`),
      summary: parseString(command.summary, `${appId}.${name}.summary`),
      options: parseCommandOptions(command.options, appId, name),
    })
  }

  return commands
}

function parseSlashCommands(raw: unknown, appId: WorkspaceAppKey): AppSlashCommandDefinition[] {
  if (!Array.isArray(raw)) return []
  const commands: AppSlashCommandDefinition[] = []
  const seenNames = new Set<string>()
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid slash command definition on "${appId}"`)
    }
    const command = entry as Record<string, unknown>
    const name = parseString(command.name, `${appId}.slashCommand.name`)
    if (seenNames.has(name)) {
      throw new Error(`Duplicate slash command "${name}" on "${appId}"`)
    }
    seenNames.add(name)
    commands.push({
      name,
      description: parseString(command.description, `${appId}.${name}.description`),
    })
  }
  return commands
}

function parseTab(raw: unknown, appId: WorkspaceAppKey): AppTabDefinition | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const input = raw as Record<string, unknown>
  if (!input.tab || typeof input.tab !== "object" || Array.isArray(input.tab)) return undefined
  const tab = input.tab as Record<string, unknown>
  const view = parseString(tab.view, `${appId}.tui.tab.view`) as MainView
  if (!VALID_MAIN_VIEWS.has(view)) {
    throw new Error(`Unsupported TUI view "${view}" on "${appId}"`)
  }
  return {
    view,
    label: parseString(tab.label, `${appId}.tui.tab.label`),
    order: parseNumber(tab.order, Number.MAX_SAFE_INTEGER),
  }
}

function loadCoreApps(): CoreAppDefinition[] {
  const raw = JSON.parse(readFileSync(CORE_APP_MANIFEST_PATH, "utf8")) as unknown
  if (!Array.isArray(raw) || raw.length <= 0) {
    throw new Error(`Expected an array in ${CORE_APP_MANIFEST_PATH.pathname}`)
  }

  const seenIds = new Set<string>()
  const seenCommandNames = new Set<string>()
  const seenSlashCommandNames = new Set<string>()
  const definitions: CoreAppDefinition[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid app definition in ${CORE_APP_MANIFEST_PATH.pathname}`)
    }
    const app = entry as Record<string, unknown>
    const id = parseString(app.id, "app.id") as WorkspaceAppKey
    if (!VALID_APP_KEYS.has(id)) {
      throw new Error(`Unknown app id "${id}" in ${CORE_APP_MANIFEST_PATH.pathname}`)
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate app id "${id}" in ${CORE_APP_MANIFEST_PATH.pathname}`)
    }
    seenIds.add(id)

    const commands = parseCommands(app.commands, id)
    for (const command of commands) {
      if (seenCommandNames.has(command.name)) {
        throw new Error(`Duplicate command "${command.name}" across core app manifests`)
      }
      seenCommandNames.add(command.name)
    }

    const slashCommands = parseSlashCommands(app.slashCommands, id)
    for (const command of slashCommands) {
      if (seenSlashCommandNames.has(command.name)) {
        throw new Error(`Duplicate slash command "${command.name}" across core app manifests`)
      }
      seenSlashCommandNames.add(command.name)
    }

    const tab = parseTab(app.tui, id)

    definitions.push({
      id,
      title: parseString(app.title, `${id}.title`),
      required: parseBoolean(app.required) || REQUIRED_APP_KEYS.has(id),
      helpOrder: parseNumber(app.helpOrder, Number.MAX_SAFE_INTEGER),
      commands,
      slashCommands,
      ...(tab ? { tui: { tab } } : {}),
    })
  }

  for (const appId of WORKSPACE_APP_KEYS) {
    if (!seenIds.has(appId)) {
      throw new Error(`Missing app "${appId}" in ${CORE_APP_MANIFEST_PATH.pathname}`)
    }
  }

  return definitions.sort((a, b) => a.helpOrder - b.helpOrder || a.title.localeCompare(b.title))
}

export const CORE_APP_DEFINITIONS = loadCoreApps()
export const CORE_APP_BY_ID = new Map(CORE_APP_DEFINITIONS.map((app) => [app.id, app]))

export function getCoreAppDefinition(appId: WorkspaceAppKey): CoreAppDefinition {
  const definition = CORE_APP_BY_ID.get(appId)
  if (!definition) {
    throw new Error(`Unknown app id "${appId}"`)
  }
  return definition
}

export function getCoreAppTitle(appId: WorkspaceAppKey): string {
  return getCoreAppDefinition(appId).title
}

export function listEnabledAppCommands(apps: AppAvailabilityMap): AppCommandDefinition[] {
  const commands: AppCommandDefinition[] = []
  for (const app of CORE_APP_DEFINITIONS) {
    if (!apps[app.id]) continue
    commands.push(...app.commands)
  }
  return commands
}

export function findCommandOwnerApp(commandName: string): WorkspaceAppKey | null {
  const name = (commandName || "").trim()
  if (!name) return null
  for (const app of CORE_APP_DEFINITIONS) {
    if (app.commands.some((command) => command.name === name)) {
      return app.id
    }
  }
  return null
}

export function listEnabledAppTabs(apps: AppAvailabilityMap): Array<{ appId: WorkspaceAppKey; tab: AppTabDefinition }> {
  const tabs: Array<{ appId: WorkspaceAppKey; tab: AppTabDefinition }> = []
  for (const app of CORE_APP_DEFINITIONS) {
    if (!apps[app.id] || !app.tui?.tab) continue
    tabs.push({ appId: app.id, tab: app.tui.tab })
  }
  return tabs.sort((a, b) => a.tab.order - b.tab.order || a.tab.label.localeCompare(b.tab.label))
}

export function listEnabledSlashCommands(apps: AppAvailabilityMap): Array<AppSlashCommandDefinition & { appId: WorkspaceAppKey }> {
  const commands: Array<AppSlashCommandDefinition & { appId: WorkspaceAppKey }> = []
  for (const app of CORE_APP_DEFINITIONS) {
    if (!apps[app.id]) continue
    for (const command of app.slashCommands) {
      commands.push({ ...command, appId: app.id })
    }
  }
  return commands
}
