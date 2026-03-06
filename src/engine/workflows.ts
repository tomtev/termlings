import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"

export type WorkflowScope = "org" | "agent"
export type WorkflowRunStatus = "active" | "completed"
const WORKFLOW_OCC_MAX_RETRIES = 6

export interface WorkflowStep {
  id: string
  text: string
}

export interface Workflow {
  id: string
  title: string
  scope: WorkflowScope
  owner?: string
  createdAt: number
  createdBy: string
  createdByName?: string
  updatedAt: number
  version?: number
  steps: WorkflowStep[]
}

export interface WorkflowCreateStep {
  text: string
}

export interface WorkflowRunStep extends WorkflowStep {
  done: boolean
  doneAt?: number
  doneBy?: string
  doneByName?: string
}

export interface WorkflowRun {
  workflowRef: string
  workflowId: string
  workflowTitle: string
  workflowScope: WorkflowScope
  workflowOwner?: string
  agent: string
  status: WorkflowRunStatus
  startedAt: number
  updatedAt: number
  completedAt?: number
  completedBy?: string
  completedByName?: string
  version?: number
  steps: WorkflowRunStep[]
}

interface WorkflowReference {
  id: string
  scope: WorkflowScope
  owner?: string
  filePath: string
}

interface WorkflowSnapshot {
  workflow: Workflow
  raw: string
  filePath: string
}

interface WorkflowRunSnapshot {
  run: WorkflowRun
  raw: string
  filePath: string
}

function workflowsRoot(root = process.cwd()): string {
  return join(root, ".termlings", "workflows")
}

function orgWorkflowsDir(root = process.cwd()): string {
  return join(workflowsRoot(root), "org")
}

function agentWorkflowsRoot(root = process.cwd()): string {
  return join(workflowsRoot(root), "agents")
}

function agentWorkflowsDir(agentSlug: string, root = process.cwd()): string {
  return join(agentWorkflowsRoot(root), agentSlug)
}

function workflowRunsRoot(root = process.cwd()): string {
  return join(root, ".termlings", "store", "workflows")
}

function agentWorkflowRunsDir(agentSlug: string, root = process.cwd()): string {
  return join(workflowRunsRoot(root), agentSlug)
}

function workflowFilePath(scope: WorkflowScope, id: string, owner?: string, root = process.cwd()): string {
  if (scope === "org") {
    return join(orgWorkflowsDir(root), `${id}.json`)
  }

  if (!owner) {
    throw new Error("Agent workflows require an owner slug")
  }

  return join(agentWorkflowsDir(owner, root), `${id}.json`)
}

function workflowRunFileName(reference: Pick<WorkflowReference, "scope" | "owner" | "id">): string {
  if (reference.scope === "org") return `org__${reference.id}.json`
  return `agent__${reference.owner || "unknown"}__${reference.id}.json`
}

function workflowRunFilePath(reference: WorkflowReference, agentSlug: string, root = process.cwd()): string {
  return join(agentWorkflowRunsDir(agentSlug, root), workflowRunFileName(reference))
}

function cloneRun(run: WorkflowRun): WorkflowRun {
  return {
    ...run,
    steps: run.steps.map((step) => ({ ...step })),
  }
}

function sanitizeWorkflowStep(step: unknown, index: number): WorkflowStep {
  const input = (step && typeof step === "object" && !Array.isArray(step))
    ? step as Record<string, unknown>
    : {}

  return {
    id: typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : `step_${index + 1}`,
    text: typeof input.text === "string" ? input.text : "",
  }
}

function sanitizeWorkflow(
  raw: unknown,
  fallback: { id: string; scope: WorkflowScope; owner?: string },
): Workflow {
  const input = (raw && typeof raw === "object" && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {}
  const createdAt = typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
    ? input.createdAt
    : 0
  const updatedAt = typeof input.updatedAt === "number" && Number.isFinite(input.updatedAt)
    ? input.updatedAt
    : createdAt

  return {
    id: typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : fallback.id,
    title: typeof input.title === "string" && input.title.trim().length > 0 ? input.title.trim() : fallback.id,
    scope: input.scope === "org" || input.scope === "agent" ? input.scope : fallback.scope,
    owner: fallback.scope === "agent"
      ? (typeof input.owner === "string" && input.owner.trim().length > 0 ? input.owner.trim() : fallback.owner)
      : undefined,
    createdAt,
    createdBy: typeof input.createdBy === "string" && input.createdBy.trim().length > 0
      ? input.createdBy.trim()
      : "human:default",
    createdByName: typeof input.createdByName === "string" && input.createdByName.trim().length > 0
      ? input.createdByName.trim()
      : undefined,
    updatedAt,
    version: typeof input.version === "number" && Number.isFinite(input.version) ? input.version : 1,
    steps: Array.isArray(input.steps) ? input.steps.map((step, index) => sanitizeWorkflowStep(step, index)) : [],
  }
}

function sanitizeWorkflowRunStep(step: unknown, index: number): WorkflowRunStep {
  const input = (step && typeof step === "object" && !Array.isArray(step))
    ? step as Record<string, unknown>
    : {}

  return {
    id: typeof input.id === "string" && input.id.trim().length > 0 ? input.id.trim() : `step_${index + 1}`,
    text: typeof input.text === "string" ? input.text : "",
    done: Boolean(input.done),
    doneAt: typeof input.doneAt === "number" && Number.isFinite(input.doneAt) ? input.doneAt : undefined,
    doneBy: typeof input.doneBy === "string" ? input.doneBy : undefined,
    doneByName: typeof input.doneByName === "string" ? input.doneByName : undefined,
  }
}

function sanitizeWorkflowRun(
  raw: unknown,
  fallback: { workflowRef: string; workflowId: string; workflowTitle: string; workflowScope: WorkflowScope; workflowOwner?: string; agent: string },
): WorkflowRun {
  const input = (raw && typeof raw === "object" && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {}
  const startedAt = typeof input.startedAt === "number" && Number.isFinite(input.startedAt)
    ? input.startedAt
    : 0
  const updatedAt = typeof input.updatedAt === "number" && Number.isFinite(input.updatedAt)
    ? input.updatedAt
    : startedAt
  const steps = Array.isArray(input.steps) ? input.steps.map((step, index) => sanitizeWorkflowRunStep(step, index)) : []
  const inferredStatus: WorkflowRunStatus = steps.length > 0 && steps.every((step) => step.done) ? "completed" : "active"

  return {
    workflowRef: typeof input.workflowRef === "string" && input.workflowRef.trim().length > 0
      ? input.workflowRef.trim()
      : fallback.workflowRef,
    workflowId: typeof input.workflowId === "string" && input.workflowId.trim().length > 0
      ? input.workflowId.trim()
      : fallback.workflowId,
    workflowTitle: typeof input.workflowTitle === "string" && input.workflowTitle.trim().length > 0
      ? input.workflowTitle.trim()
      : fallback.workflowTitle,
    workflowScope: input.workflowScope === "org" || input.workflowScope === "agent"
      ? input.workflowScope
      : fallback.workflowScope,
    workflowOwner: typeof input.workflowOwner === "string" && input.workflowOwner.trim().length > 0
      ? input.workflowOwner.trim()
      : fallback.workflowOwner,
    agent: typeof input.agent === "string" && input.agent.trim().length > 0 ? input.agent.trim() : fallback.agent,
    status: input.status === "completed" || input.status === "active" ? input.status : inferredStatus,
    startedAt,
    updatedAt,
    completedAt: typeof input.completedAt === "number" && Number.isFinite(input.completedAt) ? input.completedAt : undefined,
    completedBy: typeof input.completedBy === "string" ? input.completedBy : undefined,
    completedByName: typeof input.completedByName === "string" ? input.completedByName : undefined,
    version: typeof input.version === "number" && Number.isFinite(input.version) ? input.version : 1,
    steps,
  }
}

function readWorkflowSnapshot(reference: WorkflowReference): WorkflowSnapshot | null {
  if (!existsSync(reference.filePath)) return null

  try {
    const raw = readFileSync(reference.filePath, "utf8")
    const parsed = raw.trim().length > 0 ? JSON.parse(raw) : {}
    return {
      workflow: sanitizeWorkflow(parsed, reference),
      raw,
      filePath: reference.filePath,
    }
  } catch (error) {
    console.error(`Error reading workflow ${formatWorkflowRef(reference)}: ${error}`)
    return null
  }
}

function readWorkflowRunSnapshot(reference: WorkflowReference, agentSlug: string, root = process.cwd()): WorkflowRunSnapshot | null {
  const filePath = workflowRunFilePath(reference, agentSlug, root)
  if (!existsSync(filePath)) return null

  try {
    const raw = readFileSync(filePath, "utf8")
    const parsed = raw.trim().length > 0 ? JSON.parse(raw) : {}
    return {
      run: sanitizeWorkflowRun(parsed, {
        workflowRef: formatWorkflowRef(reference),
        workflowId: reference.id,
        workflowTitle: reference.id,
        workflowScope: reference.scope,
        workflowOwner: reference.owner,
        agent: agentSlug,
      }),
      raw,
      filePath,
    }
  } catch (error) {
    console.error(`Error reading workflow run ${agentSlug}:${formatWorkflowRef(reference)}: ${error}`)
    return null
  }
}

function tryWriteJson(filePath: string, value: unknown, expectedRaw: string): boolean {
  let currentRaw = ""
  if (existsSync(filePath)) {
    try {
      currentRaw = readFileSync(filePath, "utf8")
    } catch {
      return false
    }
  }

  if (currentRaw !== expectedRaw) {
    return false
  }

  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8")
  return true
}

function mutateWorkflowRunWithRetry(
  reference: WorkflowReference,
  agentSlug: string,
  mutator: (run: WorkflowRun) => { changed: boolean; result: WorkflowRun | null },
  root = process.cwd(),
): WorkflowRun | null {
  for (let attempt = 0; attempt < WORKFLOW_OCC_MAX_RETRIES; attempt++) {
    const snapshot = readWorkflowRunSnapshot(reference, agentSlug, root)
    if (!snapshot) return null

    const working = cloneRun(snapshot.run)
    const { changed, result } = mutator(working)
    if (!changed) return result
    if (tryWriteJson(snapshot.filePath, working, snapshot.raw)) return result
  }

  return null
}

function slugifySegment(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

function normalizeWorkflowId(input: string): string {
  const slug = slugifySegment(input)
  if (slug.length > 0) return slug.slice(0, 80)
  return "workflow"
}

function nextWorkflowId(scope: WorkflowScope, owner: string | undefined, title: string, root = process.cwd()): string {
  const base = normalizeWorkflowId(title)
  let candidate = base
  let suffix = 2

  while (existsSync(workflowFilePath(scope, candidate, owner, root))) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }

  return candidate
}

function bumpVersion(current?: number): number {
  return typeof current === "number" && Number.isFinite(current) ? current + 1 : 2
}

function workflowSort(a: Workflow, b: Workflow): number {
  if (a.scope !== b.scope) return a.scope === "org" ? -1 : 1
  if ((a.owner || "") !== (b.owner || "")) return (a.owner || "").localeCompare(b.owner || "")
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
  return a.title.localeCompare(b.title)
}

function workflowRunSort(a: WorkflowRun, b: WorkflowRun): number {
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
  return a.workflowTitle.localeCompare(b.workflowTitle)
}

function collectWorkflowsFromDir(
  dir: string,
  fallback: { scope: WorkflowScope; owner?: string },
): Workflow[] {
  if (!existsSync(dir)) return []

  const entries = readdirSync(dir, { withFileTypes: true })
  const workflows: Workflow[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue

    const id = entry.name.slice(0, -5)
    const snapshot = readWorkflowSnapshot({
      id,
      scope: fallback.scope,
      owner: fallback.owner,
      filePath: join(dir, entry.name),
    })
    if (snapshot) workflows.push(snapshot.workflow)
  }

  return workflows.sort(workflowSort)
}

function collectWorkflowRunsFromDir(dir: string, agentSlug: string): WorkflowRun[] {
  if (!existsSync(dir)) return []

  const entries = readdirSync(dir, { withFileTypes: true })
  const runs: WorkflowRun[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue

    try {
      const raw = readFileSync(join(dir, entry.name), "utf8")
      const parsed = raw.trim().length > 0 ? JSON.parse(raw) : {}
      const fallbackRef = typeof parsed.workflowRef === "string" ? parsed.workflowRef : entry.name.slice(0, -5)
      runs.push(sanitizeWorkflowRun(parsed, {
        workflowRef: fallbackRef,
        workflowId: typeof parsed.workflowId === "string" ? parsed.workflowId : fallbackRef,
        workflowTitle: typeof parsed.workflowTitle === "string" ? parsed.workflowTitle : fallbackRef,
        workflowScope: parsed.workflowScope === "agent" ? "agent" : "org",
        workflowOwner: typeof parsed.workflowOwner === "string" ? parsed.workflowOwner : undefined,
        agent: agentSlug,
      }))
    } catch {}
  }

  return runs.sort(workflowRunSort)
}

function buildReference(scope: WorkflowScope, id: string, owner?: string, root = process.cwd()): WorkflowReference {
  return {
    id,
    scope,
    owner,
    filePath: workflowFilePath(scope, id, owner, root),
  }
}

export function resolveWorkflowReference(
  input: string,
  currentAgentSlug = process.env.TERMLINGS_AGENT_SLUG || "",
  root = process.cwd(),
): WorkflowReference | null {
  const raw = input.trim()
  if (!raw) return null

  if (raw.startsWith("org/")) {
    const id = raw.slice(4).trim()
    if (!id) return null
    return buildReference("org", id, undefined, root)
  }

  if (raw.startsWith("agent:")) {
    const match = /^agent:([^/]+)\/(.+)$/.exec(raw)
    if (!match) return null
    const owner = (match[1] || "").trim()
    const id = (match[2] || "").trim()
    if (!owner || !id) return null
    return buildReference("agent", id, owner, root)
  }

  if (currentAgentSlug) {
    const agentRef = buildReference("agent", raw, currentAgentSlug, root)
    if (existsSync(agentRef.filePath)) return agentRef
  }

  const orgRef = buildReference("org", raw, undefined, root)
  if (existsSync(orgRef.filePath)) return orgRef

  if (currentAgentSlug) {
    return buildReference("agent", raw, currentAgentSlug, root)
  }

  return orgRef
}

export function formatWorkflowRef(workflow: Pick<Workflow, "scope" | "owner" | "id"> | WorkflowReference): string {
  if (workflow.scope === "org") return `org/${workflow.id}`
  return `agent:${workflow.owner || "unknown"}/${workflow.id}`
}

export function workflowRunProgress(run: WorkflowRun): { done: number; total: number } {
  const total = run.steps.length
  const done = run.steps.filter((step) => step.done).length
  return { done, total }
}

export function workflowRunCompleted(run: WorkflowRun): boolean {
  return run.status === "completed"
}

export function createWorkflow(
  title: string,
  options: {
    scope: WorkflowScope
    owner?: string
    creator: { createdBy: string; createdByName?: string }
    steps: WorkflowCreateStep[]
  },
  root = process.cwd(),
): Workflow | null {
  const scope = options.scope
  const owner = scope === "agent" ? options.owner?.trim() : undefined
  if (scope === "agent" && !owner) return null

  const targetDir = scope === "org" ? orgWorkflowsDir(root) : agentWorkflowsDir(owner!, root)
  mkdirSync(targetDir, { recursive: true })

  const now = Date.now()
  const id = nextWorkflowId(scope, owner, title, root)
  const steps = options.steps
    .map((step, index) => ({
      id: `step_${index + 1}`,
      text: step.text.trim(),
    }))
    .filter((step) => step.text.length > 0)

  const workflow: Workflow = {
    id,
    title: title.trim(),
    scope,
    owner,
    createdAt: now,
    createdBy: options.creator.createdBy || "human:default",
    createdByName: options.creator.createdByName,
    updatedAt: now,
    version: 1,
    steps,
  }

  writeFileSync(workflowFilePath(scope, id, owner, root), JSON.stringify(workflow, null, 2) + "\n", "utf8")
  return workflow
}

export function getWorkflow(
  workflowRef: string,
  currentAgentSlug = process.env.TERMLINGS_AGENT_SLUG || "",
  root = process.cwd(),
): Workflow | null {
  const reference = resolveWorkflowReference(workflowRef, currentAgentSlug, root)
  if (!reference) return null
  return readWorkflowSnapshot(reference)?.workflow || null
}

export function getOrgWorkflows(root = process.cwd()): Workflow[] {
  return collectWorkflowsFromDir(orgWorkflowsDir(root), { scope: "org" })
}

export function getAgentWorkflows(agentSlug: string, root = process.cwd()): Workflow[] {
  return collectWorkflowsFromDir(agentWorkflowsDir(agentSlug, root), {
    scope: "agent",
    owner: agentSlug,
  })
}

export function getAllWorkflows(root = process.cwd()): Workflow[] {
  const workflows = [...getOrgWorkflows(root)]

  if (existsSync(agentWorkflowsRoot(root))) {
    const entries = readdirSync(agentWorkflowsRoot(root), { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      workflows.push(...getAgentWorkflows(entry.name, root))
    }
  }

  return workflows.sort(workflowSort)
}

export function startWorkflow(
  workflowRef: string,
  agentSlug: string,
  root = process.cwd(),
): WorkflowRun | null {
  const reference = resolveWorkflowReference(workflowRef, agentSlug, root)
  if (!reference) return null

  const workflow = readWorkflowSnapshot(reference)?.workflow
  if (!workflow) return null

  const existing = readWorkflowRunSnapshot(reference, agentSlug, root)
  if (existing) return existing.run

  mkdirSync(agentWorkflowRunsDir(agentSlug, root), { recursive: true })

  const now = Date.now()
  const run: WorkflowRun = {
    workflowRef: formatWorkflowRef(workflow),
    workflowId: workflow.id,
    workflowTitle: workflow.title,
    workflowScope: workflow.scope,
    workflowOwner: workflow.owner,
    agent: agentSlug,
    status: "active",
    startedAt: now,
    updatedAt: now,
    version: 1,
    steps: workflow.steps.map((step) => ({
      id: step.id,
      text: step.text,
      done: false,
    })),
  }

  writeFileSync(workflowRunFilePath(reference, agentSlug, root), JSON.stringify(run, null, 2) + "\n", "utf8")
  return run
}

export function getWorkflowRun(
  workflowRef: string,
  agentSlug: string,
  root = process.cwd(),
): WorkflowRun | null {
  const reference = resolveWorkflowReference(workflowRef, agentSlug, root)
  if (!reference) return null
  return readWorkflowRunSnapshot(reference, agentSlug, root)?.run || null
}

export function getAgentWorkflowRuns(agentSlug: string, root = process.cwd()): WorkflowRun[] {
  return collectWorkflowRunsFromDir(agentWorkflowRunsDir(agentSlug, root), agentSlug)
}

export function getAllWorkflowRuns(root = process.cwd()): WorkflowRun[] {
  if (!existsSync(workflowRunsRoot(root))) return []

  const entries = readdirSync(workflowRunsRoot(root), { withFileTypes: true })
  const runs: WorkflowRun[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    runs.push(...getAgentWorkflowRuns(entry.name, root))
  }
  return runs.sort(workflowRunSort)
}

export function resetWorkflowRun(
  workflowRef: string,
  agentSlug: string,
  root = process.cwd(),
): WorkflowRun | null {
  const reference = resolveWorkflowReference(workflowRef, agentSlug, root)
  if (!reference) return null

  return mutateWorkflowRunWithRetry(reference, agentSlug, (run) => {
    const now = Date.now()
    run.status = "active"
    run.startedAt = now
    run.updatedAt = now
    delete run.completedAt
    delete run.completedBy
    delete run.completedByName
    run.version = bumpVersion(run.version)
    run.steps = run.steps.map((step) => ({
      id: step.id,
      text: step.text,
      done: false,
    }))
    return { changed: true, result: run }
  }, root)
}

export function stopWorkflowRun(
  workflowRef: string,
  agentSlug: string,
  root = process.cwd(),
): boolean {
  const reference = resolveWorkflowReference(workflowRef, agentSlug, root)
  if (!reference) return false

  const filePath = workflowRunFilePath(reference, agentSlug, root)
  if (!existsSync(filePath)) return false

  try {
    rmSync(filePath, { force: true })
    return true
  } catch {
    return false
  }
}

export function setWorkflowRunStepDone(
  workflowRef: string,
  stepId: string,
  done: boolean,
  actor: { by: string; byName: string },
  agentSlug: string,
  root = process.cwd(),
): WorkflowRun | null {
  const reference = resolveWorkflowReference(workflowRef, agentSlug, root)
  if (!reference) return null

  return mutateWorkflowRunWithRetry(reference, agentSlug, (run) => {
    const step = run.steps.find((entry) => entry.id === stepId)
    if (!step) return { changed: false, result: null }
    if (step.done === done) return { changed: false, result: run }

    const now = Date.now()
    step.done = done
    if (done) {
      step.doneAt = now
      step.doneBy = actor.by
      step.doneByName = actor.byName
    } else {
      delete step.doneAt
      delete step.doneBy
      delete step.doneByName
    }

    const progress = workflowRunProgress(run)
    if (progress.total > 0 && progress.done === progress.total) {
      run.status = "completed"
      run.completedAt = now
      run.completedBy = actor.by
      run.completedByName = actor.byName
    } else {
      run.status = "active"
      delete run.completedAt
      delete run.completedBy
      delete run.completedByName
    }

    run.updatedAt = now
    run.version = bumpVersion(run.version)
    return { changed: true, result: run }
  }, root)
}

export function formatWorkflow(workflow: Workflow, run: WorkflowRun | null = null): string {
  const lines: string[] = []
  lines.push(`🧭 ${workflow.title}`)
  lines.push(`Ref: ${formatWorkflowRef(workflow)}`)
  lines.push(`Scope: ${workflow.scope}${workflow.scope === "agent" ? ` (${workflow.owner})` : ""}`)
  lines.push(`Template steps: ${workflow.steps.length}`)

  if (run) {
    const progress = workflowRunProgress(run)
    const statusText = run.status === "completed" ? "completed" : "active"
    lines.push(`Run: ${run.agent} · ${statusText} · ${progress.done}/${progress.total} done`)
    lines.push(`Started: ${new Date(run.startedAt).toLocaleString()}`)
    if (run.completedAt) {
      lines.push(`Completed: ${new Date(run.completedAt).toLocaleString()}`)
    }
  } else {
    lines.push("Run: not started")
  }

  lines.push("")
  const steps = run ? run.steps : workflow.steps
  if (steps.length === 0) {
    lines.push("No steps.")
    return lines.join("\n")
  }

  for (const step of steps) {
    const marker = "done" in step ? (step.done ? "[x]" : "[ ]") : "-"
    lines.push(`${marker} ${step.id}  ${step.text}`)
  }

  return lines.join("\n")
}

export function formatWorkflowList(workflows: Workflow[], runs: WorkflowRun[] = []): string {
  if (workflows.length === 0) {
    return "No workflows"
  }

  const runByRef = new Map(runs.map((run) => [run.workflowRef, run]))
  const org = workflows.filter((workflow) => workflow.scope === "org")
  const agent = workflows.filter((workflow) => workflow.scope === "agent")
  const lines: string[] = []
  lines.push(`Workflows (${workflows.length}):`)
  lines.push("")

  const pushSection = (label: string, section: Workflow[]) => {
    if (section.length === 0) return
    lines.push(label)
    for (const workflow of section) {
      const run = runByRef.get(formatWorkflowRef(workflow))
      const status = run
        ? `${workflowRunProgress(run).done}/${workflowRunProgress(run).total} done`
        : `${workflow.steps.length} steps`
      const runTag = run ? ` · ${run.status}` : ""
      lines.push(`  [${formatWorkflowRef(workflow)}] ${workflow.title} · ${status}${runTag}`)
    }
  }

  pushSection("Org workflows:", org)
  if (org.length > 0 && agent.length > 0) lines.push("")
  pushSection("Agent workflows:", agent)

  lines.push("")
  lines.push("Use: termlings workflow show <ref>        - See template + active progress")
  lines.push("     termlings workflow start <ref>       - Start this workflow")
  return lines.join("\n")
}

export function formatWorkflowRunList(runs: WorkflowRun[]): string {
  if (runs.length === 0) {
    return "No active workflows"
  }

  const lines: string[] = []
  lines.push(`Active workflows (${runs.length}):`)
  for (const run of runs) {
    const progress = workflowRunProgress(run)
    lines.push(`  [${run.workflowRef}] ${run.workflowTitle} · ${run.agent} · ${progress.done}/${progress.total} done · ${run.status}`)
  }
  return lines.join("\n")
}
