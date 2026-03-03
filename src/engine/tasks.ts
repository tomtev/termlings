import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"

export type TaskStatus = "open" | "claimed" | "in-progress" | "completed" | "blocked"
export type TaskPriority = "low" | "medium" | "high"

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  createdAt: number
  createdBy: string // "OWNER" or agent slug
  updatedAt: number
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

/**
 * Create a new task
 */
export function createTask(
  title: string,
  description: string,
  priority: TaskPriority = "medium",
  dueDate?: number
): Task {
  mkdirSync(tasksDir(), { recursive: true })

  const task: Task = {
    id: generateTaskId(),
    title,
    description,
    status: "open",
    priority,
    createdAt: Date.now(),
    createdBy: "OWNER",
    updatedAt: Date.now(),
    notes: [],
    dueDate,
  }

  saveTasks([...getAllTasks(), task])
  return task
}

/**
 * Get all tasks
 */
export function getAllTasks(): Task[] {
  const file = tasksFile()
  try {
    if (!existsSync(file)) {
      return []
    }
    const data = readFileSync(file, "utf-8")
    return JSON.parse(data) as Task[]
  } catch (e) {
    console.error(`Error reading tasks: ${e}`)
    return []
  }
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
  if (!task.blockedBy || task.blockedBy.length === 0) return []
  const allTasks = getAllTasks()
  const taskMap = new Map(allTasks.map(t => [t.id, t]))
  return task.blockedBy.filter(depId => {
    const dep = taskMap.get(depId)
    return !dep || dep.status !== "completed"
  })
}

/**
 * Add a dependency: taskId is blocked by depTaskId
 */
export function addTaskDependency(taskId: string, depTaskId: string): Task | null {
  const tasks = getAllTasks()
  const task = tasks.find(t => t.id === taskId)
  const dep = tasks.find(t => t.id === depTaskId)

  if (!task || !dep) return null
  if (taskId === depTaskId) return null

  if (!task.blockedBy) task.blockedBy = []
  if (task.blockedBy.includes(depTaskId)) return task // already added

  task.blockedBy.push(depTaskId)
  task.updatedAt = Date.now()
  task.notes.push({
    by: "OWNER",
    byName: "System",
    text: `Dependency added: blocked by ${dep.title} (${depTaskId})`,
    at: Date.now(),
  })

  saveTasks(tasks)
  return task
}

/**
 * Remove a dependency
 */
export function removeTaskDependency(taskId: string, depTaskId: string): Task | null {
  const tasks = getAllTasks()
  const task = tasks.find(t => t.id === taskId)

  if (!task || !task.blockedBy) return null

  task.blockedBy = task.blockedBy.filter(id => id !== depTaskId)
  if (task.blockedBy.length === 0) delete task.blockedBy
  task.updatedAt = Date.now()

  saveTasks(tasks)
  return task
}

/**
 * Claim a task (assign to agent by slug)
 */
export function claimTask(taskId: string, agentSlug: string, agentName: string): Task | null {
  const tasks = getAllTasks()
  const task = tasks.find(t => t.id === taskId)

  if (!task) return null
  if (task.status !== "open" && task.status !== "claimed") return null

  // Check dependencies — can't claim if blocked by unfinished tasks
  const unresolved = getUnresolvedDeps(task)
  if (unresolved.length > 0) return null

  task.assignedTo = agentSlug
  task.assignedAt = Date.now()
  task.status = "claimed"
  task.updatedAt = Date.now()
  task.notes.push({
    by: agentSlug,
    byName: agentName,
    text: "Claimed this task",
    at: Date.now(),
  })

  saveTasks(tasks)
  return task
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
  room = "default"
): Task | null {
  const tasks = getAllTasks()
  const task = tasks.find(t => t.id === taskId)

  if (!task) return null

  task.status = status
  task.updatedAt = Date.now()

  const noteText = note || `Status updated to ${status}`
  task.notes.push({
    by: agentSlug,
    byName: agentName,
    text: noteText,
    at: Date.now(),
  })

  if (status === "blocked" && note) {
    task.blockedOn = note
  }

  saveTasks(tasks)
  return task
}

/**
 * Add a note to a task
 */
export function addTaskNote(
  taskId: string,
  text: string,
  agentSlug: string,
  agentName: string,
  room = "default"
): Task | null {
  const tasks = getAllTasks()
  const task = tasks.find(t => t.id === taskId)

  if (!task) return null

  task.notes.push({
    by: agentSlug,
    byName: agentName,
    text,
    at: Date.now(),
  })
  task.updatedAt = Date.now()

  saveTasks(tasks)
  return task
}

/**
 * Assign task to agent
 */
export function assignTask(taskId: string, agentSlug: string, agentName: string): Task | null {
  const tasks = getAllTasks()
  const task = tasks.find(t => t.id === taskId)

  if (!task) return null

  task.assignedTo = agentSlug
  task.assignedAt = Date.now()
  task.updatedAt = Date.now()
  task.notes.push({
    by: "OWNER",
    byName: "Owner",
    text: `Assigned to ${agentName}`,
    at: Date.now(),
  })

  saveTasks(tasks)
  return task
}

/**
 * Delete a task
 */
export function deleteTask(taskId: string): boolean {
  const tasks = getAllTasks()
  const filtered = tasks.filter(t => t.id !== taskId)

  if (filtered.length === tasks.length) return false // Task not found

  if (filtered.length === 0) {
    // Delete file if no tasks left
    try {
      require("fs").unlinkSync(tasksFile())
    } catch {}
  } else {
    saveTasks(filtered)
  }

  return true
}

/**
 * Save tasks to disk
 */
function saveTasks(tasks: Task[]): void {
  const file = tasksFile()
  mkdirSync(tasksDir(), { recursive: true })
  writeFileSync(file, JSON.stringify(tasks, null, 2) + "\n")
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
