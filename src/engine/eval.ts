import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { join, resolve } from "path"
import { spawn } from "child_process"

import { appendAppActivity } from "./activity.js"

export type EvalTaskKind =
  | "smoke"
  | "research"
  | "browser"
  | "coordination"
  | "crm"
  | "social"
  | "analytics"
  | "finance"
  | "ads"
  | "cms"

export type EvalVerificationType = "script" | "file" | "json" | "manual"
export type EvalTaskEntryType = "command" | "manual"
export type EvalRunStatus = "running" | "completed" | "failed" | "manual-review"

export interface EvalTaskBudget {
  maxTotalTokens?: number
  maxMinutes?: number
}

export interface EvalTaskEntry {
  type: EvalTaskEntryType
  agent?: string
  message?: string
  command?: string
}

export interface EvalVerificationSpec {
  type: EvalVerificationType
  command?: string
  path?: string
  requiredPaths?: string[]
  contains?: string
}

export interface EvalTask {
  id: string
  title: string
  kind: EvalTaskKind
  description: string
  runnable: boolean
  entry: EvalTaskEntry
  apps: string[]
  fixtures?: {
    workspace?: string
  }
  verification: EvalVerificationSpec
  budgets?: EvalTaskBudget
  tags: string[]
}

export interface EvalStrategySettings {
  brief: "full" | "scoped" | "minimal"
  activityLevel: "summary" | "detail"
  systemContext: "full" | "app-scoped" | "minimal"
  delegation: "single-agent" | "pm-with-delegate" | "multi-agent"
  memoryMode: "off" | "targeted" | "broad"
}

export interface EvalStrategy {
  id: string
  description: string
  settings: EvalStrategySettings
}

export interface EvalRunMetrics {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs: number
  commands: number
  filesRead: number
  filesWritten: number
  browserActions: number
  operatorInterventions: number
}

export interface EvalVerificationResult {
  verified: boolean
  type: EvalVerificationType
  score?: number
  summary?: string
  details?: Record<string, unknown>
}

export interface EvalRun {
  id: string
  taskId: string
  strategyId: string
  status: EvalRunStatus
  startedAt: number
  endedAt?: number
  entryAgent?: string
  result: EvalVerificationResult
  metrics: EvalRunMetrics
  appsUsed: string[]
  artifacts: {
    stdout?: string
    stderr?: string
    metrics?: string
    verification?: string
  }
  command?: string
}

export interface EvalEvent {
  ts: number
  runId: string
  kind: string
  app: "eval"
  agent?: string
  data?: Record<string, unknown>
}

export interface EvalCompareResult {
  taskId?: string
  strategyA: EvalStrategyComparison
  strategyB: EvalStrategyComparison
}

export interface EvalStrategyComparison {
  strategyId: string
  runs: number
  verifiedRuns: number
  passRate: number
  averageTokens: number
  averageDurationMs: number
  verifiedOutcomePer1kTokens: number
}

function summarizeStrategyRuns(runs: EvalRun[], strategyId: string): EvalStrategyComparison {
  const items = runs.filter((run) => run.strategyId === strategyId)
  const verifiedRuns = items.filter((run) => run.result.verified).length
  const totalTokens = items.reduce((sum, run) => sum + (run.metrics.totalTokens || 0), 0)
  const totalDuration = items.reduce((sum, run) => sum + (run.metrics.durationMs || 0), 0)
  return {
    strategyId,
    runs: items.length,
    verifiedRuns,
    passRate: items.length > 0 ? verifiedRuns / items.length : 0,
    averageTokens: items.length > 0 ? totalTokens / items.length : 0,
    averageDurationMs: items.length > 0 ? totalDuration / items.length : 0,
    verifiedOutcomePer1kTokens: totalTokens > 0 ? (verifiedRuns / totalTokens) * 1000 : 0,
  }
}

export interface EvalReport {
  generatedAt: number
  totalRuns: number
  verifiedRuns: number
  averageTokens: number
  averageDurationMs: number
  bestStrategies: Array<{
    strategyId: string
    runs: number
    verifiedOutcomePer1kTokens: number
    passRate: number
  }>
  byTask: Array<{
    taskId: string
    runs: number
    verifiedRuns: number
    averageTokens: number
    averageDurationMs: number
  }>
  recentRuns: EvalRun[]
}

interface SpawnResult {
  exitCode: number
  stdout: string
  stderr: string
}

const DEFAULT_STRATEGIES: EvalStrategy[] = [
  {
    id: "full-brief",
    description: "Full brief and full system context for baseline comparison.",
    settings: {
      brief: "full",
      activityLevel: "detail",
      systemContext: "full",
      delegation: "single-agent",
      memoryMode: "broad",
    },
  },
  {
    id: "concise-app-scoped",
    description: "App-scoped brief and concise system context.",
    settings: {
      brief: "scoped",
      activityLevel: "summary",
      systemContext: "app-scoped",
      delegation: "single-agent",
      memoryMode: "targeted",
    },
  },
  {
    id: "pm-with-delegate",
    description: "PM-led strategy with selective delegation for bounded tasks.",
    settings: {
      brief: "scoped",
      activityLevel: "summary",
      systemContext: "app-scoped",
      delegation: "pm-with-delegate",
      memoryMode: "targeted",
    },
  },
]

const DEFAULT_TASKS: EvalTask[] = [
  {
    id: "brief-json-smoke",
    title: "Brief JSON smoke",
    kind: "smoke",
    description: "Smoke test the eval harness with a real Termlings command and JSON verification.",
    runnable: true,
    entry: {
      type: "command",
      agent: "pm",
      command: "\"$TERMLINGS_EVAL_NODE_BIN\" \"$TERMLINGS_EVAL_TERMLINGS_SCRIPT\" brief --json > \"$TERMLINGS_EVAL_ARTIFACTS_DIR/brief.json\"",
    },
    apps: ["brief", "org-chart", "task", "calendar", "messaging"],
    verification: {
      type: "json",
      path: "artifacts/brief.json",
      requiredPaths: ["generatedAt", "workspace.root", "workspace.project", "session.agentSlug", "apps.messaging"],
    },
    budgets: {
      maxTotalTokens: 5000,
      maxMinutes: 2,
    },
    tags: ["smoke", "brief", "harness"],
  },
  {
    id: "research-brief-smoke",
    title: "Research brief smoke",
    kind: "research",
    description: "Investigate a market question and return a short verified summary.",
    runnable: false,
    entry: {
      type: "manual",
      agent: "pm",
      message: "Research the top 3 alternatives and summarize risks.",
    },
    apps: ["messaging", "brief", "browser", "memory"],
    verification: {
      type: "manual",
    },
    budgets: {
      maxTotalTokens: 40000,
      maxMinutes: 20,
    },
    tags: ["token-efficiency", "research", "browser"],
  },
  {
    id: "browser-login-help",
    title: "Browser login help",
    kind: "browser",
    description: "Trigger a human-in-the-loop login step and resume cleanly.",
    runnable: false,
    entry: { type: "manual", agent: "developer", message: "Open the target site and request manual login help when blocked." },
    apps: ["browser", "requests", "messaging"],
    verification: { type: "manual" },
    tags: ["browser", "human-in-loop"],
  },
  {
    id: "docs-edit-small",
    title: "Small docs edit",
    kind: "smoke",
    description: "Make a small docs change and verify the expected edit landed.",
    runnable: false,
    entry: { type: "manual", agent: "developer", message: "Update the requested doc copy with minimal edits." },
    apps: ["brief", "memory"],
    verification: { type: "manual" },
    tags: ["editing", "docs"],
  },
  {
    id: "task-handoff",
    title: "Task handoff",
    kind: "coordination",
    description: "One agent starts the task and another completes it cleanly.",
    runnable: false,
    entry: { type: "manual", agent: "pm", message: "Coordinate a bounded handoff and finish the task." },
    apps: ["task", "messaging", "brief"],
    verification: { type: "manual" },
    tags: ["coordination", "multi-agent"],
  },
  {
    id: "crm-followup-summary",
    title: "CRM follow-up summary",
    kind: "crm",
    description: "Read CRM state and produce a follow-up recommendation.",
    runnable: false,
    entry: { type: "manual", agent: "growth", message: "Review the CRM timeline and recommend the next follow-up." },
    apps: ["crm", "brief", "messaging"],
    verification: { type: "manual" },
    tags: ["crm", "growth"],
  },
  {
    id: "social-draft-schedule",
    title: "Social draft schedule",
    kind: "social",
    description: "Create a social draft and schedule it correctly.",
    runnable: false,
    entry: { type: "manual", agent: "growth", message: "Draft and schedule one launch post." },
    apps: ["social", "calendar", "brand", "media"],
    verification: { type: "manual" },
    tags: ["social", "scheduling"],
  },
  {
    id: "analytics-report-30d",
    title: "Analytics 30d report",
    kind: "analytics",
    description: "Generate a short analytics summary from synced data.",
    runnable: false,
    entry: { type: "manual", agent: "growth", message: "Summarize the last 30 days of analytics." },
    apps: ["analytics", "brief", "memory"],
    verification: { type: "manual" },
    tags: ["analytics", "reporting"],
  },
  {
    id: "finance-report-mrr",
    title: "Finance MRR report",
    kind: "finance",
    description: "Generate a basic revenue summary from synced finance data.",
    runnable: false,
    entry: { type: "manual", agent: "pm", message: "Summarize MRR and notable changes." },
    apps: ["finance", "brief", "memory"],
    verification: { type: "manual" },
    tags: ["finance", "reporting"],
  },
  {
    id: "ads-performance-review",
    title: "Ads performance review",
    kind: "ads",
    description: "Summarize campaign performance and suggest one action.",
    runnable: false,
    entry: { type: "manual", agent: "growth", message: "Review the last 30 days of ads performance and suggest one action." },
    apps: ["ads", "analytics", "brief"],
    verification: { type: "manual" },
    tags: ["ads", "performance"],
  },
  {
    id: "cms-create-publish",
    title: "CMS create publish",
    kind: "cms",
    description: "Create, schedule, and publish a CMS entry.",
    runnable: false,
    entry: { type: "manual", agent: "pm", message: "Create and publish a short CMS entry." },
    apps: ["cms", "calendar", "media", "memory"],
    verification: { type: "manual" },
    tags: ["cms", "publishing"],
  },
]

function evalRoot(root = process.cwd()): string {
  return join(root, ".termlings", "store", "evals")
}

function evalTasksDir(root = process.cwd()): string {
  return join(evalRoot(root), "tasks")
}

function evalTaskPath(id: string, root = process.cwd()): string {
  return join(evalTasksDir(root), `${id}.json`)
}

function evalStrategiesPath(root = process.cwd()): string {
  return join(evalRoot(root), "strategies.json")
}

function evalRunsDir(root = process.cwd()): string {
  return join(evalRoot(root), "runs")
}

function evalRunDir(id: string, root = process.cwd()): string {
  return join(evalRunsDir(root), id)
}

function evalRunPath(id: string, root = process.cwd()): string {
  return join(evalRunDir(id, root), "run.json")
}

function evalRunEventsPath(id: string, root = process.cwd()): string {
  return join(evalRunDir(id, root), "events.jsonl")
}

function evalArtifactsDir(id: string, root = process.cwd()): string {
  return join(evalRunDir(id, root), "artifacts")
}

function evalVerificationPath(id: string, root = process.cwd()): string {
  return join(evalRunDir(id, root), "verification.json")
}

function evalMetricsPath(id: string, root = process.cwd()): string {
  return join(evalArtifactsDir(id, root), "metrics.json")
}

function evalReportsDir(root = process.cwd()): string {
  return join(evalRoot(root), "reports")
}

function evalReportPath(id: string, root = process.cwd()): string {
  return join(evalReportsDir(root), `${id}.json`)
}

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return fallback
  }
}

function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8")
}

function appendJsonLine(path: string, value: unknown): void {
  const current = existsSync(path) ? readFileSync(path, "utf8") : ""
  writeFileSync(path, current + JSON.stringify(value) + "\n", "utf8")
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function safeNowId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

function defaultMetrics(durationMs = 0): EvalRunMetrics {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    durationMs,
    commands: 0,
    filesRead: 0,
    filesWritten: 0,
    browserActions: 0,
    operatorInterventions: 0,
  }
}

function normalizeMetrics(raw: unknown, durationMs: number): EvalRunMetrics {
  const fallback = defaultMetrics(durationMs)
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback
  const data = raw as Record<string, unknown>
  const readNumber = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0)
  const inputTokens = readNumber(data.inputTokens)
  const outputTokens = readNumber(data.outputTokens)
  const totalTokens = readNumber(data.totalTokens) || inputTokens + outputTokens
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    durationMs,
    commands: Math.max(0, readNumber(data.commands)),
    filesRead: Math.max(0, readNumber(data.filesRead)),
    filesWritten: Math.max(0, readNumber(data.filesWritten)),
    browserActions: Math.max(0, readNumber(data.browserActions)),
    operatorInterventions: Math.max(0, readNumber(data.operatorInterventions)),
  }
}

function getPathValue(input: unknown, path: string): unknown {
  const parts = path.split(".").map((part) => part.trim()).filter(Boolean)
  let current: unknown = input
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function resolveTaskRelativePath(runId: string, relativePath: string, root = process.cwd()): string {
  const trimmed = relativePath.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("artifacts/")) {
    return join(evalRunDir(runId, root), trimmed)
  }
  return join(evalRunDir(runId, root), trimmed)
}

function ensureDefaultStrategies(root = process.cwd()): void {
  const path = evalStrategiesPath(root)
  if (existsSync(path)) return
  writeJsonFile(path, DEFAULT_STRATEGIES)
}

function ensureDefaultTasks(root = process.cwd()): void {
  for (const task of DEFAULT_TASKS) {
    const path = evalTaskPath(task.id, root)
    if (existsSync(path)) continue
    writeJsonFile(path, task)
  }
}

export function ensureEvalDirs(root = process.cwd()): void {
  mkdirSync(evalRoot(root), { recursive: true })
  mkdirSync(evalTasksDir(root), { recursive: true })
  mkdirSync(evalRunsDir(root), { recursive: true })
  mkdirSync(evalReportsDir(root), { recursive: true })
  ensureDefaultStrategies(root)
  ensureDefaultTasks(root)
}

export function listEvalStrategies(root = process.cwd()): EvalStrategy[] {
  ensureEvalDirs(root)
  return readJsonFile<EvalStrategy[]>(evalStrategiesPath(root), DEFAULT_STRATEGIES)
}

export function getEvalStrategy(id: string, root = process.cwd()): EvalStrategy | null {
  const normalized = slugify(id)
  if (!normalized) return null
  return listEvalStrategies(root).find((strategy) => slugify(strategy.id) === normalized) || null
}

export function listEvalTasks(root = process.cwd()): EvalTask[] {
  ensureEvalDirs(root)
  return readdirSync(evalTasksDir(root))
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => readJsonFile<EvalTask | null>(join(evalTasksDir(root), entry), null))
    .filter((task): task is EvalTask => Boolean(task))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function getEvalTask(id: string, root = process.cwd()): EvalTask | null {
  const normalized = slugify(id)
  if (!normalized) return null
  const direct = readJsonFile<EvalTask | null>(evalTaskPath(normalized, root), null)
  if (direct) return direct
  return listEvalTasks(root).find((task) => slugify(task.id) === normalized) || null
}

export function saveEvalTask(task: EvalTask, root = process.cwd()): EvalTask {
  ensureEvalDirs(root)
  const next: EvalTask = {
    ...task,
    id: slugify(task.id),
  }
  if (!next.id) {
    throw new Error("Eval task id is required.")
  }
  writeJsonFile(evalTaskPath(next.id, root), next)
  return next
}

function listEvalRuns(root = process.cwd()): EvalRun[] {
  ensureEvalDirs(root)
  return readdirSync(evalRunsDir(root))
    .filter((entry) => existsSync(evalRunPath(entry, root)))
    .map((entry) => readJsonFile<EvalRun | null>(evalRunPath(entry, root), null))
    .filter((run): run is EvalRun => Boolean(run))
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
}

function updateRun(run: EvalRun, root = process.cwd()): void {
  writeJsonFile(evalRunPath(run.id, root), run)
}

function logRunEvent(runId: string, kind: string, data: Record<string, unknown> | undefined, root = process.cwd()): void {
  const event: EvalEvent = {
    ts: Date.now(),
    runId,
    kind,
    app: "eval",
    data,
  }
  appendJsonLine(evalRunEventsPath(runId, root), event)
}

function shellCommandParts(command: string): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", command],
    }
  }
  return {
    command: process.env.SHELL || "/bin/sh",
    args: ["-lc", command],
  }
}

function runSpawnedCommand(command: string, cwd: string, env: Record<string, string>, root = process.cwd()): Promise<SpawnResult> {
  const shell = shellCommandParts(command)
  return new Promise((resolveResult, reject) => {
    const child = spawn(shell.command, shell.args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      resolveResult({
        exitCode: typeof code === "number" ? code : 1,
        stdout,
        stderr,
      })
    })
  })
}

async function runVerification(
  runId: string,
  task: EvalTask,
  runResult: SpawnResult,
  env: Record<string, string>,
  root = process.cwd(),
): Promise<EvalVerificationResult> {
  const spec = task.verification
  if (spec.type === "manual") {
    return {
      verified: false,
      type: "manual",
      summary: "Manual review required.",
    }
  }

  if (spec.type === "script") {
    if (!spec.command?.trim()) {
      throw new Error(`Eval task "${task.id}" is missing verification.command`)
    }
    const result = await runSpawnedCommand(spec.command, root, env, root)
    const payload = {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    }
    writeJsonFile(evalVerificationPath(runId, root), payload)
    return {
      verified: result.exitCode === 0,
      type: "script",
      score: result.exitCode === 0 ? 1 : 0,
      summary: result.exitCode === 0 ? "Verification script passed." : "Verification script failed.",
      details: payload,
    }
  }

  if (spec.type === "file") {
    const targetPath = resolveTaskRelativePath(runId, spec.path || "", root)
    if (!targetPath) {
      throw new Error(`Eval task "${task.id}" is missing verification.path`)
    }
    const exists = existsSync(targetPath)
    const content = exists ? readFileSync(targetPath, "utf8") : ""
    const contains = spec.contains ? content.includes(spec.contains) : true
    const verified = exists && contains
    const payload = { path: targetPath, exists, contains }
    writeJsonFile(evalVerificationPath(runId, root), payload)
    return {
      verified,
      type: "file",
      score: verified ? 1 : 0,
      summary: verified ? "Verified output file." : "Expected output file verification failed.",
      details: payload,
    }
  }

  const targetPath = spec.path?.trim()
    ? resolveTaskRelativePath(runId, spec.path, root)
    : ""
  let parsed: unknown = null
  let parseError: string | undefined

  try {
    if (targetPath) {
      parsed = JSON.parse(readFileSync(targetPath, "utf8"))
    } else {
      parsed = JSON.parse(runResult.stdout)
    }
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error)
  }

  const requiredPaths = spec.requiredPaths || []
  const missing = requiredPaths.filter((path) => typeof getPathValue(parsed, path) === "undefined")
  const verified = !parseError && missing.length === 0
  const payload = {
    path: targetPath || undefined,
    parseError,
    missingPaths: missing,
  }
  writeJsonFile(evalVerificationPath(runId, root), payload)
  return {
    verified,
    type: "json",
    score: verified ? 1 : 0,
    summary: verified ? "Verified JSON output." : "JSON verification failed.",
    details: payload,
  }
}

function buildRunEnv(task: EvalTask, strategy: EvalStrategy, runId: string, root = process.cwd()): Record<string, string> {
  const artifactsDir = evalArtifactsDir(runId, root)
  const metricsPath = evalMetricsPath(runId, root)
  const verificationPath = evalVerificationPath(runId, root)
  return {
    ...(process.env as Record<string, string | undefined>),
    TERMLINGS_EVAL_RUN_ID: runId,
    TERMLINGS_EVAL_TASK_ID: task.id,
    TERMLINGS_EVAL_STRATEGY_ID: strategy.id,
    TERMLINGS_EVAL_TASK_PATH: evalTaskPath(task.id, root),
    TERMLINGS_EVAL_RUN_DIR: evalRunDir(runId, root),
    TERMLINGS_EVAL_ARTIFACTS_DIR: artifactsDir,
    TERMLINGS_EVAL_METRICS_PATH: metricsPath,
    TERMLINGS_EVAL_VERIFICATION_PATH: verificationPath,
    TERMLINGS_EVAL_BRIEF_MODE: strategy.settings.brief,
    TERMLINGS_EVAL_ACTIVITY_LEVEL: strategy.settings.activityLevel,
    TERMLINGS_EVAL_SYSTEM_CONTEXT: strategy.settings.systemContext,
    TERMLINGS_EVAL_DELEGATION: strategy.settings.delegation,
    TERMLINGS_EVAL_MEMORY_MODE: strategy.settings.memoryMode,
    TERMLINGS_EVAL_APPS: task.apps.join(","),
    TERMLINGS_EVAL_NODE_BIN: process.execPath,
    TERMLINGS_EVAL_TERMLINGS_SCRIPT: resolve(process.argv[1] || ""),
  } as Record<string, string>
}

export async function runEvalTask(
  taskId: string,
  options: { strategyId?: string; root?: string } = {},
): Promise<EvalRun> {
  const root = options.root || process.cwd()
  ensureEvalDirs(root)
  const task = getEvalTask(taskId, root)
  if (!task) {
    throw new Error(`Eval task not found: ${taskId}`)
  }
  const strategy = getEvalStrategy(options.strategyId || "concise-app-scoped", root)
  if (!strategy) {
    throw new Error(`Eval strategy not found: ${options.strategyId || "concise-app-scoped"}`)
  }
  if (!task.runnable || task.entry.type !== "command" || !task.entry.command?.trim()) {
    throw new Error(`Eval task "${task.id}" is a benchmark template. Edit ${evalTaskPath(task.id, root)} to add a runnable command.`)
  }

  const runId = `run_${safeNowId()}_${slugify(task.entry.agent || "agent")}_${slugify(strategy.id)}`
  const startedAt = Date.now()
  mkdirSync(evalRunDir(runId, root), { recursive: true })
  mkdirSync(evalArtifactsDir(runId, root), { recursive: true })
  const run: EvalRun = {
    id: runId,
    taskId: task.id,
    strategyId: strategy.id,
    status: "running",
    startedAt,
    entryAgent: task.entry.agent,
    result: {
      verified: false,
      type: task.verification.type,
      summary: "Run started.",
    },
    metrics: defaultMetrics(0),
    appsUsed: [...task.apps],
    artifacts: {
      stdout: "artifacts/stdout.log",
      stderr: "artifacts/stderr.log",
      metrics: "artifacts/metrics.json",
      verification: "verification.json",
    },
    command: task.entry.command,
  }
  updateRun(run, root)
  logRunEvent(runId, "run.started", { taskId: task.id, strategyId: strategy.id }, root)
  appendAppActivity({
    ts: startedAt,
    app: "eval",
    kind: "eval.run.started",
    text: `Started eval ${task.id} with strategy ${strategy.id}`,
    surface: "feed",
    level: "summary",
    actorSlug: task.entry.agent,
    meta: { runId, taskId: task.id, strategyId: strategy.id },
  }, root)

  const env = buildRunEnv(task, strategy, runId, root)
  const stdoutPath = join(evalArtifactsDir(runId, root), "stdout.log")
  const stderrPath = join(evalArtifactsDir(runId, root), "stderr.log")
  try {
    logRunEvent(runId, "command.started", { command: task.entry.command }, root)
    const result = await runSpawnedCommand(task.entry.command, root, env, root)
    writeFileSync(stdoutPath, result.stdout, "utf8")
    writeFileSync(stderrPath, result.stderr, "utf8")
    logRunEvent(runId, "command.completed", { exitCode: result.exitCode }, root)

    const endedAt = Date.now()
    const metricsPayload = readJsonFile<Record<string, unknown> | null>(evalMetricsPath(runId, root), null)
    const verification = await runVerification(runId, task, result, env, root)
    const durationMs = endedAt - startedAt
    const metrics = normalizeMetrics(metricsPayload, durationMs)
    const status: EvalRunStatus = task.verification.type === "manual"
      ? "manual-review"
      : (result.exitCode === 0 && verification.verified ? "completed" : "failed")

    const finished: EvalRun = {
      ...run,
      endedAt,
      status,
      result: verification,
      metrics,
    }
    updateRun(finished, root)
    logRunEvent(runId, "run.completed", {
      status,
      verified: verification.verified,
      totalTokens: metrics.totalTokens,
      durationMs,
    }, root)
    appendAppActivity({
      ts: endedAt,
      app: "eval",
      kind: verification.verified ? "eval.run.completed" : "eval.run.failed",
      text: `${verification.verified ? "Completed" : "Failed"} eval ${task.id} with strategy ${strategy.id}`,
      surface: "feed",
      level: "summary",
      actorSlug: task.entry.agent,
      result: verification.verified ? "success" : "error",
      meta: {
        runId,
        taskId: task.id,
        strategyId: strategy.id,
        totalTokens: metrics.totalTokens,
        durationMs,
      },
    }, root)
    return finished
  } catch (error) {
    const endedAt = Date.now()
    const message = error instanceof Error ? error.message : String(error)
    logRunEvent(runId, "run.failed", { error: message }, root)
    const failed: EvalRun = {
      ...run,
      endedAt,
      status: "failed",
      result: {
        verified: false,
        type: task.verification.type,
        score: 0,
        summary: message,
      },
      metrics: defaultMetrics(endedAt - startedAt),
    }
    updateRun(failed, root)
    appendAppActivity({
      ts: endedAt,
      app: "eval",
      kind: "eval.run.failed",
      text: `Failed eval ${task.id} with strategy ${strategy.id}`,
      surface: "feed",
      level: "summary",
      actorSlug: task.entry.agent,
      result: "error",
      meta: { runId, taskId: task.id, strategyId: strategy.id, error: message },
    }, root)
    throw error
  }
}

export function compareEvalStrategies(
  strategyAId: string,
  strategyBId: string,
  options: { taskId?: string; root?: string } = {},
): EvalCompareResult {
  const root = options.root || process.cwd()
  const runs = listEvalRuns(root).filter((run) => {
    if (options.taskId && run.taskId !== options.taskId) return false
    return run.strategyId === strategyAId || run.strategyId === strategyBId
  })
  return {
    taskId: options.taskId,
    strategyA: summarizeStrategyRuns(runs, strategyAId),
    strategyB: summarizeStrategyRuns(runs, strategyBId),
  }
}

export function buildEvalReport(options: { last?: number; root?: string } = {}): EvalReport {
  const root = options.root || process.cwd()
  const limit = options.last && options.last > 0 ? options.last : 20
  const runs = listEvalRuns(root)
  const recentRuns = runs.slice(0, limit)
  const totalRuns = recentRuns.length
  const verifiedRuns = recentRuns.filter((run) => run.result.verified).length
  const totalTokens = recentRuns.reduce((sum, run) => sum + (run.metrics.totalTokens || 0), 0)
  const totalDuration = recentRuns.reduce((sum, run) => sum + (run.metrics.durationMs || 0), 0)

  const strategyStats = new Map<string, EvalStrategyComparison>()
  for (const strategy of listEvalStrategies(root)) {
    strategyStats.set(strategy.id, summarizeStrategyRuns(recentRuns, strategy.id))
  }

  const byTaskMap = new Map<string, { runs: number; verifiedRuns: number; totalTokens: number; totalDuration: number }>()
  for (const run of recentRuns) {
    const current = byTaskMap.get(run.taskId) || { runs: 0, verifiedRuns: 0, totalTokens: 0, totalDuration: 0 }
    current.runs += 1
    if (run.result.verified) current.verifiedRuns += 1
    current.totalTokens += run.metrics.totalTokens || 0
    current.totalDuration += run.metrics.durationMs || 0
    byTaskMap.set(run.taskId, current)
  }

  const report: EvalReport = {
    generatedAt: Date.now(),
    totalRuns,
    verifiedRuns,
    averageTokens: totalRuns > 0 ? totalTokens / totalRuns : 0,
    averageDurationMs: totalRuns > 0 ? totalDuration / totalRuns : 0,
    bestStrategies: [...strategyStats.values()]
      .filter((entry) => entry.runs > 0)
      .sort((a, b) => b.verifiedOutcomePer1kTokens - a.verifiedOutcomePer1kTokens)
      .slice(0, 5)
      .map((entry) => ({
        strategyId: entry.strategyId,
        runs: entry.runs,
        verifiedOutcomePer1kTokens: entry.verifiedOutcomePer1kTokens,
        passRate: entry.passRate,
      })),
    byTask: [...byTaskMap.entries()].map(([taskId, value]) => ({
      taskId,
      runs: value.runs,
      verifiedRuns: value.verifiedRuns,
      averageTokens: value.runs > 0 ? value.totalTokens / value.runs : 0,
      averageDurationMs: value.runs > 0 ? value.totalDuration / value.runs : 0,
    })).sort((a, b) => b.runs - a.runs),
    recentRuns,
  }
  const reportId = `report_${safeNowId()}_last-${limit}`
  writeJsonFile(evalReportPath(reportId, root), report)
  appendAppActivity({
    ts: report.generatedAt,
    app: "eval",
    kind: "eval.report.generated",
    text: `Generated eval report for last ${limit} runs`,
    surface: "feed",
    level: "summary",
    result: "success",
    meta: { reportId, totalRuns },
  }, root)
  return report
}

export function formatEvalTasks(tasks: EvalTask[]): string {
  if (tasks.length <= 0) return "No eval tasks configured"
  return tasks.map((task) => {
    const kind = `${task.kind}${task.runnable ? "" : " template"}`
    return `${task.id}\n  ${task.title}\n  ${kind} · apps: ${task.apps.join(", ")}\n  ${task.description}`
  }).join("\n\n")
}

export function formatEvalTask(task: EvalTask): string {
  const lines = [
    task.title,
    `${task.id} · ${task.kind}${task.runnable ? "" : " template"}`,
    "",
    task.description,
    "",
    `Apps: ${task.apps.join(", ") || "none"}`,
    `Entry: ${task.entry.type}${task.entry.command ? ` · ${task.entry.command}` : task.entry.message ? ` · ${task.entry.message}` : ""}`,
    `Verification: ${task.verification.type}${task.verification.path ? ` · ${task.verification.path}` : task.verification.command ? ` · ${task.verification.command}` : ""}`,
    `Tags: ${task.tags.join(", ") || "none"}`,
  ]
  return lines.join("\n")
}

export function formatEvalStrategies(strategies: EvalStrategy[]): string {
  if (strategies.length <= 0) return "No eval strategies configured"
  return strategies.map((strategy) => {
    const settings = strategy.settings
    return `${strategy.id}\n  ${strategy.description}\n  brief=${settings.brief} · context=${settings.systemContext} · activity=${settings.activityLevel} · delegation=${settings.delegation} · memory=${settings.memoryMode}`
  }).join("\n\n")
}

export function formatEvalRun(run: EvalRun): string {
  const tokens = run.metrics.totalTokens || 0
  const seconds = Math.round((run.metrics.durationMs || 0) / 1000)
  return [
    `${run.id}`,
    `  task: ${run.taskId}`,
    `  strategy: ${run.strategyId}`,
    `  status: ${run.status}`,
    `  verified: ${run.result.verified ? "yes" : "no"}`,
    `  tokens: ${tokens}`,
    `  duration: ${seconds}s`,
    `  summary: ${run.result.summary || "-"}`,
  ].join("\n")
}

export function formatEvalCompare(result: EvalCompareResult): string {
  const render = (label: string, entry: EvalStrategyComparison): string => [
    `${label}: ${entry.strategyId}`,
    `  runs: ${entry.runs}`,
    `  pass rate: ${(entry.passRate * 100).toFixed(1)}%`,
    `  avg tokens: ${entry.averageTokens.toFixed(1)}`,
    `  avg duration: ${(entry.averageDurationMs / 1000).toFixed(1)}s`,
    `  verified / 1k tokens: ${entry.verifiedOutcomePer1kTokens.toFixed(4)}`,
  ].join("\n")
  return [
    result.taskId ? `Task: ${result.taskId}` : "Task: all",
    "",
    render("A", result.strategyA),
    "",
    render("B", result.strategyB),
  ].join("\n")
}

export function formatEvalReport(report: EvalReport): string {
  const header = [
    `Eval report`,
    `Generated: ${new Date(report.generatedAt).toISOString()}`,
    `Runs: ${report.totalRuns}`,
    `Verified: ${report.verifiedRuns}`,
    `Average tokens: ${report.averageTokens.toFixed(1)}`,
    `Average duration: ${(report.averageDurationMs / 1000).toFixed(1)}s`,
  ].join("\n")
  const strategies = report.bestStrategies.length > 0
    ? report.bestStrategies.map((entry) => `  ${entry.strategyId} · runs=${entry.runs} · pass=${(entry.passRate * 100).toFixed(1)}% · verified/1k=${entry.verifiedOutcomePer1kTokens.toFixed(4)}`).join("\n")
    : "  none"
  const tasks = report.byTask.length > 0
    ? report.byTask.map((entry) => `  ${entry.taskId} · runs=${entry.runs} · verified=${entry.verifiedRuns} · avgTokens=${entry.averageTokens.toFixed(1)}`).join("\n")
    : "  none"
  return [header, "", "Best strategies:", strategies, "", "By task:", tasks].join("\n")
}
