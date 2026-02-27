import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"


export interface DeskAssignment {
  sessionId: string           // Agent session ID
  agentName: string           // Agent display name
  deskNumber: number          // Desk number (0-19 for 5x4 grid)
  deskCol: number             // Column (0-4)
  deskRow: number             // Row (0-3)
  x: number                   // X coordinate on map
  y: number                   // Y coordinate on map
  assignedAt: number          // Timestamp
  active: boolean             // Is agent currently active
}

const DESK_COLS = 5
const DESK_ROWS = 4
const TOTAL_DESKS = DESK_COLS * DESK_ROWS

function assignmentsDir(): string {
  return join(process.cwd(), ".termlings", "_data", "assignments")
}

function assignmentsFile(): string {
  return join(assignmentsDir(), "desks.json")
}

/**
 * Get all desk assignments
 */
export function getAllAssignments(room = "default"): DeskAssignment[] {
  const file = assignmentsFile()
  try {
    if (!existsSync(file)) {
      return []
    }
    const data = readFileSync(file, "utf-8")
    return JSON.parse(data) as DeskAssignment[]
  } catch (e) {
    return []
  }
}

/**
 * Get assignment for a specific agent
 */
export function getAssignment(sessionId: string): DeskAssignment | null {
  const assignments = getAllAssignments()
  return assignments.find(a => a.sessionId === sessionId) || null
}

/**
 * Assign an agent to the next available desk
 */
export function assignDesk(sessionId: string, agentName: string): DeskAssignment | null {
  const assignments = getAllAssignments()

  // Check if already assigned
  const existing = assignments.find(a => a.sessionId === sessionId)
  if (existing && existing.active) {
    return existing
  }

  // Find next available desk
  const usedDesks = new Set(assignments.filter(a => a.active).map(a => a.deskNumber))
  let deskNumber = -1

  for (let i = 0; i < TOTAL_DESKS; i++) {
    if (!usedDesks.has(i)) {
      deskNumber = i
      break
    }
  }

  if (deskNumber === -1) {
    console.error("No desks available!")
    return null
  }

  // Calculate desk position
  const deskCol = deskNumber % DESK_COLS
  const deskRow = Math.floor(deskNumber / DESK_COLS)

  // Calculate map coordinates based on desk grid layout
  // From generate-office-map.ts:
  // x = 2 + col * (DESK_WIDTH + DESK_SPACING_X)
  // y = 5 + row * (DESK_HEIGHT + DESK_SPACING_Y)
  const DESK_WIDTH = 8
  const DESK_HEIGHT = 6
  const DESK_SPACING_X = 2
  const DESK_SPACING_Y = 2

  const x = 2 + deskCol * (DESK_WIDTH + DESK_SPACING_X)
  const y = 5 + deskRow * (DESK_HEIGHT + DESK_SPACING_Y)

  const assignment: DeskAssignment = {
    sessionId,
    agentName,
    deskNumber,
    deskCol,
    deskRow,
    x,
    y,
    assignedAt: Date.now(),
    active: true,
  }

  // Remove old assignment if exists
  const filtered = assignments.filter(a => a.sessionId !== sessionId)
  filtered.push(assignment)

  saveAssignments(filtered)
  return assignment
}

/**
 * Release a desk (agent logged out)
 */
export function releaseDesk(sessionId: string): void {
  const assignments = getAllAssignments()
  const assignment = assignments.find(a => a.sessionId === sessionId)

  if (assignment) {
    assignment.active = false
  }

  saveAssignments(assignments)
}

/**
 * Get desk occupancy
 */
export function getDeskOccupancy(room = "default"): { available: number; occupied: number; total: number } {
  const assignments = getAllAssignments()
  const occupied = assignments.filter(a => a.active).length

  return {
    total: TOTAL_DESKS,
    occupied,
    available: TOTAL_DESKS - occupied,
  }
}

/**
 * Get all active agents
 */
export function getActiveAgents(room = "default"): DeskAssignment[] {
  const assignments = getAllAssignments()
  return assignments.filter(a => a.active).sort((a, b) => a.deskNumber - b.deskNumber)
}

/**
 * Save assignments to disk
 */
function saveAssignments(assignments: DeskAssignment[]): void {
  const dir = assignmentsDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(assignmentsFile(), JSON.stringify(assignments, null, 2) + "\n")
}

/**
 * Format desk occupancy display
 */
export function formatOccupancy(room = "default"): string {
  const assignments = getActiveAgents()
  const occupancy = getDeskOccupancy()

  if (assignments.length === 0) {
    return `🪑 Office is empty (${occupancy.available}/${occupancy.total} desks available)`
  }

  const lines: string[] = []
  lines.push(`👥 Office Status (${occupancy.occupied}/${occupancy.total} desks occupied):`)
  lines.push("")

  // Show grid visualization
  const grid: string[][] = Array(DESK_ROWS)
    .fill(null)
    .map(() => Array(DESK_COLS).fill("[ ]"))

  for (const assignment of assignments) {
    grid[assignment.deskRow][assignment.deskCol] = `[${assignment.agentName[0]}]`
  }

  for (let row = 0; row < DESK_ROWS; row++) {
    lines.push("  " + grid[row].join(" "))
  }

  lines.push("")
  for (const assignment of assignments) {
    lines.push(`  ${assignment.agentName} → Desk ${assignment.deskNumber + 1} (row ${assignment.deskRow + 1}, col ${assignment.deskCol + 1})`)
  }

  return lines.join("\n")
}
