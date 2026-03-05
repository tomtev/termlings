import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { spawnSync } from "child_process"
import { homedir } from "os"
import { isAbsolute, join, resolve } from "path"
import { loadTermlingsEnv } from "./env.js"

export interface EmailAccountConfig {
  account: string
  folder?: string
  from?: string
  requiredEnv?: string[]
}

export interface EmailsConfig {
  version: 1
  himalaya?: {
    binary?: string
    configPath?: string
  }
  project?: EmailAccountConfig
  agents?: Record<string, EmailAccountConfig>
}

export interface ResolvedEmailContext {
  scope: "project" | "agent" | "override"
  account: string
  folder: string
  from?: string
  requiredEnv: string[]
  binary: string
  configPath?: string
}

interface HimalayaCommandResult {
  status: number
  stdout: string
  stderr: string
}

const EMAILS_CONFIG_VERSION = 1 as const
const DEFAULT_FOLDER = "INBOX"

function emailsRootDir(root = process.cwd()): string {
  return join(root, ".termlings")
}

export function emailsConfigPath(root = process.cwd()): string {
  return join(emailsRootDir(root), "emails.json")
}

function trimOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeRequiredEnv(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(item))
  return normalized.length > 0 ? normalized : undefined
}

function normalizeAccountConfig(value: unknown): EmailAccountConfig | undefined {
  if (!value || typeof value !== "object") return undefined
  const rec = value as Record<string, unknown>
  const account = trimOrUndefined(rec.account)
  if (!account) return undefined

  return {
    account,
    folder: trimOrUndefined(rec.folder),
    from: trimOrUndefined(rec.from),
    requiredEnv: normalizeRequiredEnv(rec.requiredEnv),
  }
}

function expandPath(input: string): string {
  let expanded = input.trim()
  if (!expanded) return expanded

  if (expanded === "~") {
    expanded = homedir()
  } else if (expanded.startsWith("~/")) {
    expanded = join(homedir(), expanded.slice(2))
  }

  expanded = expanded.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, key: string) => {
    const value = process.env[key]
    return typeof value === "string" && value.length > 0 ? value : `$${key}`
  })

  if (!isAbsolute(expanded)) {
    return resolve(expanded)
  }
  return expanded
}

function normalizeEmailsConfig(raw: unknown): EmailsConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid emails.json: expected top-level object")
  }

  const rec = raw as Record<string, unknown>
  const version = rec.version
  if (version !== EMAILS_CONFIG_VERSION) {
    throw new Error(`Invalid emails.json: expected version ${EMAILS_CONFIG_VERSION}`)
  }

  const himalayaRec = (rec.himalaya && typeof rec.himalaya === "object" && !Array.isArray(rec.himalaya))
    ? rec.himalaya as Record<string, unknown>
    : undefined
  const binary = trimOrUndefined(himalayaRec?.binary)
  const configPath = trimOrUndefined(himalayaRec?.configPath)

  const agentsRaw = rec.agents
  const agents: Record<string, EmailAccountConfig> = {}
  if (agentsRaw && typeof agentsRaw === "object" && !Array.isArray(agentsRaw)) {
    for (const [slug, value] of Object.entries(agentsRaw as Record<string, unknown>)) {
      if (!slug || slug.trim().length === 0) continue
      const normalized = normalizeAccountConfig(value)
      if (normalized) {
        agents[slug] = normalized
      }
    }
  }

  return {
    version: EMAILS_CONFIG_VERSION,
    himalaya: (binary || configPath)
      ? {
        ...(binary ? { binary } : {}),
        ...(configPath ? { configPath } : {}),
      }
      : undefined,
    project: normalizeAccountConfig(rec.project),
    agents: Object.keys(agents).length > 0 ? agents : undefined,
  }
}

export function createEmailsConfigTemplate(): EmailsConfig {
  return {
    version: EMAILS_CONFIG_VERSION,
    himalaya: {
      binary: "himalaya",
      configPath: "~/.config/himalaya/config.toml",
    },
    project: {
      account: "team",
      folder: DEFAULT_FOLDER,
      from: "Team <team@example.com>",
      requiredEnv: ["TEAM_EMAIL_PASSWORD"],
    },
    agents: {
      developer: {
        account: "developer",
        folder: DEFAULT_FOLDER,
        from: "Developer <developer@example.com>",
        requiredEnv: ["DEV_EMAIL_PASSWORD"],
      },
    },
  }
}

export function initEmailsConfig(force = false, root = process.cwd()): { path: string; created: boolean } {
  const path = emailsConfigPath(root)
  if (existsSync(path) && !force) {
    return { path, created: false }
  }

  mkdirSync(emailsRootDir(root), { recursive: true })
  writeFileSync(path, JSON.stringify(createEmailsConfigTemplate(), null, 2) + "\n")
  return { path, created: true }
}

export function readEmailsConfig(root = process.cwd()): EmailsConfig | null {
  const path = emailsConfigPath(root)
  if (!existsSync(path)) return null

  try {
    const raw = readFileSync(path, "utf8")
    return normalizeEmailsConfig(JSON.parse(raw))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read ${path}: ${detail}`)
  }
}

function profileForAccount(config: EmailsConfig, account: string, agentSlug?: string): EmailAccountConfig | null {
  if (agentSlug) {
    const agentConfig = config.agents?.[agentSlug]
    if (agentConfig?.account === account) return agentConfig
  }

  if (config.project?.account === account) return config.project

  if (config.agents) {
    for (const profile of Object.values(config.agents)) {
      if (profile.account === account) return profile
    }
  }

  return null
}

function resolveHimalayaBinary(config: EmailsConfig): string {
  return config.himalaya?.binary?.trim() || "himalaya"
}

function resolveHimalayaConfigPath(config: EmailsConfig): string | undefined {
  const raw = config.himalaya?.configPath?.trim()
  if (!raw) return undefined
  return expandPath(raw)
}

export function resolveEmailContext(
  config: EmailsConfig,
  agentSlug?: string,
  accountOverride?: string,
): ResolvedEmailContext {
  const binary = resolveHimalayaBinary(config)
  const configPath = resolveHimalayaConfigPath(config)

  const override = accountOverride?.trim()
  if (override) {
    const matched = profileForAccount(config, override, agentSlug)
    return {
      scope: "override",
      account: override,
      folder: matched?.folder || DEFAULT_FOLDER,
      from: matched?.from,
      requiredEnv: matched?.requiredEnv || [],
      binary,
      configPath,
    }
  }

  if (agentSlug) {
    const agentConfig = config.agents?.[agentSlug]
    if (agentConfig) {
      return {
        scope: "agent",
        account: agentConfig.account,
        folder: agentConfig.folder || DEFAULT_FOLDER,
        from: agentConfig.from,
        requiredEnv: agentConfig.requiredEnv || [],
        binary,
        configPath,
      }
    }
  }

  if (config.project) {
    return {
      scope: "project",
      account: config.project.account,
      folder: config.project.folder || DEFAULT_FOLDER,
      from: config.project.from,
      requiredEnv: config.project.requiredEnv || [],
      binary,
      configPath,
    }
  }

  throw new Error(
    "No email account mapping found. Add `project` or `agents.<slug>` to .termlings/emails.json.",
  )
}

export function missingRequiredEnvVars(ctx: ResolvedEmailContext): string[] {
  loadTermlingsEnv()
  return ctx.requiredEnv.filter((key) => {
    const value = process.env[key]
    return !(typeof value === "string" && value.trim().length > 0)
  })
}

function runHimalaya(binary: string, args: string[], input?: string): HimalayaCommandResult {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    input,
    env: process.env,
  })

  if (result.error) {
    throw new Error(`Failed to run ${binary}: ${result.error.message}`)
  }

  const status = typeof result.status === "number" ? result.status : 1
  const stdout = typeof result.stdout === "string" ? result.stdout : ""
  const stderr = typeof result.stderr === "string" ? result.stderr : ""
  return { status, stdout, stderr }
}

function assertSuccessful(result: HimalayaCommandResult): void {
  const combined = `${result.stdout}\n${result.stderr}`
  const wizardFailure = /cannot find configuration at/i.test(combined)
    || /cannot prompt boolean/i.test(combined)

  if (result.status !== 0 || wizardFailure) {
    const detail = (result.stderr || result.stdout).trim()
    throw new Error(detail || "himalaya command failed")
  }
}

function withGlobalArgs(ctx: ResolvedEmailContext, args: string[]): string[] {
  const all: string[] = []
  if (ctx.configPath) {
    all.push("--config", ctx.configPath)
  }
  all.push(...args)
  return all
}

function assertConfigPathExists(ctx: ResolvedEmailContext): void {
  if (!ctx.configPath) return
  if (!existsSync(ctx.configPath)) {
    throw new Error(`Himalaya config not found at ${ctx.configPath}`)
  }
}

function headerValue(input: string): string {
  return input.replace(/\r?\n/g, " ").trim()
}

export function composeRawEmailMessage(input: {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  from?: string
}): string {
  const lines: string[] = []
  if (input.from && input.from.trim().length > 0) {
    lines.push(`From: ${headerValue(input.from)}`)
  }
  lines.push(`To: ${headerValue(input.to)}`)
  if (input.cc && input.cc.trim().length > 0) {
    lines.push(`Cc: ${headerValue(input.cc)}`)
  }
  if (input.bcc && input.bcc.trim().length > 0) {
    lines.push(`Bcc: ${headerValue(input.bcc)}`)
  }
  lines.push(`Subject: ${headerValue(input.subject)}`)
  lines.push("")
  lines.push(input.body)
  return lines.join("\n")
}

export function listConfiguredAccounts(config: EmailsConfig): string[] {
  const names = new Set<string>()
  if (config.project?.account) names.add(config.project.account)
  for (const profile of Object.values(config.agents || {})) {
    names.add(profile.account)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

export function runAccountList(ctx: ResolvedEmailContext): string {
  assertConfigPathExists(ctx)
  const result = runHimalaya(ctx.binary, withGlobalArgs(ctx, ["account", "list"]))
  assertSuccessful(result)
  return result.stdout.trimEnd()
}

export function runAccountDoctor(ctx: ResolvedEmailContext, account: string): string {
  assertConfigPathExists(ctx)
  const args = ["account", "doctor", account]
  const result = runHimalaya(ctx.binary, withGlobalArgs(ctx, args))
  assertSuccessful(result)
  return result.stdout.trimEnd()
}

export function runAccountConfigureInteractive(ctx: ResolvedEmailContext, account: string): number {
  const args = withGlobalArgs(ctx, ["account", "configure", account])
  const result = spawnSync(ctx.binary, args, {
    stdio: "inherit",
    env: process.env,
  })

  if (result.error) {
    throw new Error(`Failed to run ${ctx.binary}: ${result.error.message}`)
  }

  return typeof result.status === "number" ? result.status : 1
}

export function runInboxList(
  ctx: ResolvedEmailContext,
  options: { folder?: string; limit?: number; query?: string[] } = {},
): string {
  assertConfigPathExists(ctx)
  const folder = options.folder?.trim() || ctx.folder
  const args = [
    "envelope",
    "list",
    "--account",
    ctx.account,
    "--folder",
    folder,
  ]

  if (typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    args.push("--page-size", String(Math.floor(options.limit)))
  }

  if (options.query && options.query.length > 0) {
    args.push(...options.query)
  }

  const result = runHimalaya(ctx.binary, withGlobalArgs(ctx, args))
  assertSuccessful(result)
  return result.stdout.trimEnd()
}

export function runMessageRead(ctx: ResolvedEmailContext, id: string, folder?: string): string {
  assertConfigPathExists(ctx)
  const resolvedFolder = folder?.trim() || ctx.folder
  const args = [
    "message",
    "read",
    "--account",
    ctx.account,
    "--folder",
    resolvedFolder,
    id,
  ]
  const result = runHimalaya(ctx.binary, withGlobalArgs(ctx, args))
  assertSuccessful(result)
  return result.stdout.trimEnd()
}

export function runMessageSend(
  ctx: ResolvedEmailContext,
  input: { to: string; cc?: string; bcc?: string; subject: string; body: string; from?: string },
): string {
  assertConfigPathExists(ctx)
  const raw = composeRawEmailMessage(input)
  const args = [
    "message",
    "send",
    "--account",
    ctx.account,
    raw,
  ]
  const result = runHimalaya(ctx.binary, withGlobalArgs(ctx, args))
  assertSuccessful(result)
  const output = `${result.stdout}\n${result.stderr}`.trim()
  return output
}
