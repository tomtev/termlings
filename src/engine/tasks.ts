import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"

export type TaskStatus = "open" | "claimed" | "in-progress" | "completed" | "blocked"
export type TaskPriority = "low" | "medium" | "high"
const TASK_OCC_MAX_RETRIES = 6

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  createdAt: number
  createdBy: string // "OWNER", "human:*", "agent:*", or legacy agent slug
  createdByName?: string
  updatedAt: number
  version?: number // optimistic concurrency version
  assignedTo?: string // agent slug (e.g. "developer", "alice")
  assignedAt?: number
  dueDate?: number // optional deadline
  notes: TaskNote[]
  blockedOn?: string // reason if blocked
  blockedBy?: string[] // task IDs that must complete before this can start
}

export interface TaskNote {
  by: string // agent slug or "OWNER"
  byName: string // display name
  text: string
  at: number // timestamp
}

function tasksDir(): string {
  return join(process.cwd(), ".termlings", "store", "tasks")
}

function tasksFile(): string {
  return join(tasksDir(), "tasks.json")
}

function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(7)}`
}

function parseTasksRaw(raw: string): Task[] {
  if (!raw.trim()) return []
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.map((task) => ({
    ...task,
    createdBy: (task?.createdBy || "human:default").toString(),
    createdByName: typeof task?.createdByName === "string" ? task.createdByName : undefined,
    version: typeof task?.version === "number" && Number.isFinite(task.version)
      ? task.version
      : 1,
    notes: Array.isArray(task?.notes) ? task.notes : [],
  })) as Task[]
}

function readTasksSnapshot(): { tasks: Task[]; raw: string } {
  const file = tasksFile()
  if (!existsSync(file)) {
    return { tasks: [], raw: "" }
  }

  try {
    const raw = readFileSync(file, "utf-8")
    return { tasks: parseTasksRaw(raw), raw }
  } catch (e) {
    console.error(`Error reading tasks: ${e}`)
    return { tasks: [], raw: "" }
  }
}

function tryWriteTasks(tasks: Task[], expectedRaw: string): boolean {
  const file = tasksFile()
  mkdirSync(tasksDir(), { recursive: true })

  let currentRaw = ""
  if (existsSync(file)) {
    try {
      currentRaw = readFileSync(file, "utf-8")
    } catch {
      return false
    }
  }

  if (currentRaw !== expectedRaw) {
    return false
  }

  writeFileSync(file, JSON.stringify(tasks, null, 2) + "\n")
  return true
}

function mutateTasksWithRetry<T>(
  mutator: (tasks: Task[]) => { changed: boolean; result: T },
): T | null {
  for (let attempt = 0; attempt < TASK_OCC_MAX_RETRIES; attempt++) {
    const snapshot = readTasksSnapshot()
    const working = snapshot.tasks.map((task) => ({
      ...task,
      notes: task.notes.map((note) => ({ ...note })),
      blockedBy: task.blockedBy ? [...task.blockedBy] : undefined,
    }))

    const { changed, result } = mutator(working)
    if (!changed) return result
    if (tryWriteTasks(working, snapshot.raw)) return result
  }

  return null
}

function unresolvedDepsFromTasks(task: Task, allTasks: Task[]): string[] {
  if (!task.blockedBy || task.blockedBy.length === 0) return []
  const taskMap = new Map(allTasks.map(t => [t.id, t]))
  return task.blockedBy.filter(depId => {
    const dep = taskMap.get(depId)
    return !dep || dep.status !== "completed"
  })
}

function bumpTaskVersion(task: Task): void {
  const current = typeof task.version === "number" && Number.isFinite(task.version) ? task.version : 1
  task.version = current + 1
}

/**
 * Create a new task
 */
export function createTask(
  title: string,
  description: string,
  priority: TaskPriority = "medium",
  dueDate?: number,
  creator: { createdBy: string; createdByName?: string } = { createdBy: "human:default", createdByName: "Owner" },
): Task | null {
  mkdirSync(tasksDir(), { recursive: true })
  const now = Date.now()

  const task: Task = {
    id: generateTaskId(),
    title,
    description,
    status: "open",
    priority,
    createdAt: now,
    createdBy: creator.createdBy || "human:default",
    createdByName: creator.createdByName,
    updatedAt: now,
    version: 1,
    notes: [],
    dueDate,
  }

  const created = mutateTasksWithRetry<Task>((tasks) => {
    tasks.push(task)
    return { changed: true, result: task }
  })

  return created
}

/**
 * Get all tasks
 */
export function getAllTasks(): Task[] {
  return readTasksSnapshot().tasks
}

/**
 * Get a specific task
 */
export function getTask(taskId: string): Task | null {
  const tasks = getAllTasks()
  return tasks.find(t => t.id === taskId) || null
}

/**
 * Filter tasks by status
 */
export function getTasksByStatus(status: TaskStatus): Task[] {
  const tasks = getAllTasks()
  return tasks.filter(t => t.status === status)
}

/**
 * Get tasks assigned to an agent by slug
 */
export function getAgentTasks(agentSlug: string): Task[] {
  const tasks = getAllTasks()
  return tasks.filter(t => t.assignedTo === agentSlug)
}

/**
 * Get unresolved dependency IDs for a task
 * Returns task IDs from blockedBy that are not yet completed
 */
export function getUnresolvedDeps(task: Task): string[] {
  return unresolvedDepsFromTasks(task, getAllTasks())
}

/**
 * Add a dependency: taskId is blocked by depTaskId
 */
export function addTaskDependency(taskId: string, depTaskId: string): Task | null {
  return mutateTasksWithRetry<Task | null>((tasks) => {
    const task = tasks.find(t => t.id === taskId)
    const dep = tasks.find(t => t.id === depTaskId)

    if (!task || !dep) return { changed: false, result: null }
    if (taskId === depTaskId) return { changed: false, result: null }

    if (!task.blockedBy) task.blockedBy = []
    if (task.blockedBy.includes(depTaskId)) return { changed: false, result: task }

    const now = Date.now()
    task.blockedBy.push(depTaskId)
    task.updatedAt = now
    bumpTaskVersion(task)
    task.notes.push({
      by: "OWNER",
      byName: "System",
      text: `Dependency added: blocked by ${dep.title} (${depTaskId})`,
      at: now,
    })

    return { changed: true, result: task }
  })
    ?? null
}

/**
 * Remove a dependency
 */
export function removeTaskDependency(taskId: string, depTaskId: string): Task | null {
  return mutateTasksWithRetry<Task | null>((tasks) => {
    const task = tasks.find(t => t.id === taskId)

    if (!task || !task.blockedBy) return { changed: false, result: null }
    if (!task.blockedBy.includes(depTaskId)) return { changed: false, result: task }

    task.blockedBy = task.blockedBy.filter(id => id !== depTaskId)
    if (task.blockedBy.length === 0) delete task.blockedBy
    task.updatedAt = Date.now()
    bumpTaskVersion(task)

    return { changed: true, result: task }
  })
    ?? null
}

/**
 * Claim a task (assign to agent by slug)
 */
export function claimTask(taskId: string, agentSlug: string, agentName: string): Task | null {
  return mutateTasksWithRetry<Task | null>((tasks) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { changed: false, result: null }
    if (task.status !== "open" && task.status !== "claimed") return { changed: false, result: null }

    const unresolved = unresolvedDepsFromTasks(task, tasks)
    if (unresolved.length > 0) return { changed: false, result: null }

    const now = Date.now()
    task.assignedTo = agentSlug
    task.assignedAt = now
    task.status = "claimed"
    task.updatedAt = now
    bumpTaskVersion(task)
    task.notes.push({
      by: agentSlug,
      byName: agentName,
      text: "Claimed this task",
      at: now,
    })

    return { changed: true, result: task }
  })
    ?? null
}

/**
 * Update task status
 */
export function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  agentSlug: string,
  agentName: string,
  note?: string,
  room = "default",
): Task | null {
  return mutateTasksWithRetry<Task | null>((tasks) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { changed: false, result: null }

    const now = Date.now()
    task.status = status
    task.updatedAt = now
    bumpTaskVersion(task)

    const noteText = note || `Status updated to ${status}`
    task.notes.push({
      by: agentSlug,
      byName: agentName,
      text: noteText,
      at: now,
    })

    if (status === "blocked" && note) {
      task.blockedOn = note
    } else if (status !== "blocked") {
      delete task.blockedOn
    }

    return { changed: true, result: task }
  })
    ?? null
}

/**
 * Add a note to a task
 */
export function addTaskNote(
  taskId: string,
  text: string,
  agentSlug: string,
  agentName: string,
  room = "default",
): Task | null {
  return mutateTasksWithRetry<Task | null>((tasks) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { changed: false, result: null }

    const now = Date.now()
    task.notes.push({
      by: agentSlug,
      byName: agentName,
      text,
      at: now,
    })
    task.updatedAt = now
    bumpTaskVersion(task)

    return { changed: true, result: task }
  })
    ?? null
}

/**
 * Assign task to agent
 */
export function assignTask(taskId: string, agentSlug: string, agentName: string): Task | null {
  return mutateTasksWithRetry<Task | null>((tasks) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { changed: false, result: null }

    const now = Date.now()
    task.assignedTo = agentSlug
    task.assignedAt = now
    task.updatedAt = now
    bumpTaskVersion(task)
    task.notes.push({
      by: "OWNER",
      byName: "Owner",
      text: `Assigned to ${agentName}`,
      at: now,
    })

    return { changed: true, result: task }
  })
    ?? null
}

/**
 * Delete a task
 */
export function deleteTask(taskId: string): boolean {
  const deleted = mutateTasksWithRetry<boolean>((tasks) => {
    const filtered = tasks.filter(t => t.id !== taskId)
    if (filtered.length === tasks.length) {
      return { changed: false, result: false }
    }
    tasks.length = 0
    tasks.push(...filtered)
    return { changed: true, result: true }
  })
  return deleted === true
}

/**
 * Format task for display
 */
export function formatTask(task: Task): string {
  const lines: string[] = []

  lines.push(`📋 ${task.title}`)
  lines.push(`ID: ${task.id}`)
  lines.push(`Status: ${task.status}${task.assignedTo ? ` (assigned to agent)` : ""}`)
  lines.push(`Priority: ${task.priority}`)

  if (task.dueDate) {
    const daysUntil = Math.ceil((task.dueDate - Date.now()) / (1000 * 60 * 60 * 24))
    lines.push(`Due: ${new Date(task.dueDate).toLocaleDateString()} (${daysUntil} days)`)
  }

  lines.push("")
  lines.push(task.description)

  if (task.blockedBy && task.blockedBy.length > 0) {
    const allTasks = getAllTasks()
    const unresolved = getUnresolvedDeps(task)
    lines.push("")
    lines.push("🔗 Dependencies:")
    for (const depId of task.blockedBy) {
      const dep = allTasks.find(t => t.id === depId)
      const done = dep?.status === "completed"
      const icon = done ? "✅" : "⏳"
      lines.push(`  ${icon} ${dep?.title || depId} (${depId})`)
    }
    if (unresolved.length > 0) {
      lines.push(`  ⚠️  ${unresolved.length} unresolved — cannot be claimed yet`)
    }
  }

  if (task.blockedOn) {
    lines.push("")
    lines.push(`🚫 Blocked: ${task.blockedOn}`)
  }

  if (task.notes.length > 0) {
    lines.push("")
    lines.push("📝 Updates:")
    for (const note of task.notes) {
      const time = new Date(note.at).toLocaleTimeString()
      lines.push(`  [${time}] ${note.byName}: ${note.text}`)
    }
  }

  return lines.join("\n")
}

/**
 * Format task list
 */
export function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) {
    return "No tasks"
  }

  const lines: string[] = []
  lines.push(`Tasks (${tasks.length}):`)
  lines.push("")

  for (const task of tasks) {
    const icon = getStatusIcon(task.status)
    const priority = getPriorityBadge(task.priority)
    const assignedBadge = task.assignedTo ? "👤" : "  "
    const title = task.title.substring(0, 50) + (task.title.length > 50 ? "..." : "")

    lines.push(`${icon} ${priority} ${assignedBadge} [${task.id}] ${title}`)
  }

  lines.push("")
  lines.push("Use: termlings task show <id>      - See full details")
  lines.push("     termlings task claim <id>     - Claim a task (agents)")

  return lines.join("\n")
}

/**
 * Format task list for agents
 */
export function formatAgentTaskList(tasks: Task[], myAgentSlug: string): string {
  if (tasks.length === 0) {
    return "No tasks available"
  }

  const lines: string[] = []
  const myTasks = tasks.filter(t => t.assignedTo === myAgentSlug)
  const openTasks = tasks.filter(t => t.status === "open")

  if (myTasks.length > 0) {
    lines.push("📋 Your Tasks:")
    for (const task of myTasks) {
      const icon = getStatusIcon(task.status)
      const priority = getPriorityBadge(task.priority)
      lines.push(`${icon} ${priority} [${task.id}] ${task.title}`)
    }
    lines.push("")
  }

  if (openTasks.length > 0) {
    lines.push("🔓 Available Tasks:")
    for (const task of openTasks) {
      const priority = getPriorityBadge(task.priority)
      const unresolved = getUnresolvedDeps(task)
      const depTag = unresolved.length > 0 ? ` ⏳ waiting on ${unresolved.length} dep${unresolved.length > 1 ? "s" : ""}` : ""
      lines.push(`${priority} [${task.id}] ${task.title}${depTag}`)
    }
  }

  lines.push("")
  lines.push("Use: termlings task show <id>            - See full details")
  lines.push("     termlings task claim <id>           - Claim a task")
  lines.push("     termlings task status <id> <status> - Update task status")

  return lines.join("\n")
}

function getStatusIcon(status: TaskStatus): string {
  switch (status) {
    case "open": return "🔓"
    case "claimed": return "📌"
    case "in-progress": return "⚙️ "
    case "completed": return "✅"
    case "blocked": return "🚫"
  }
}

function getPriorityBadge(priority: TaskPriority): string {
  switch (priority) {
    case "low": return "⬇️"
    case "medium": return "➡️"
    case "high": return "⬆️"
  }
}
