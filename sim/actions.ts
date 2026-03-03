import { existsSync, readdirSync, readFileSync } from "fs"
import { join } from "path"
import { describeRelative } from "./engine/room-detect.js"
import { readSessionState, writeCommand, type SessionState } from "./engine/ipc.js"

type GestureType = "wave" | "talk"

interface MapRoom {
  id: number
  wallType: string
  bounds: { x: number; y: number; w: number; h: number }
  doors?: Array<{ x: number; y: number; toRoom?: number | null }>
}

interface MapMetadata {
  width: number
  height: number
  name?: string
  rooms?: MapRoom[]
}

function requireSessionId(): string {
  const sessionId = process.env.TERMLINGS_SESSION_ID
  if (!sessionId) {
    console.error("Error: TERMLINGS_SESSION_ID env var not set")
    process.exit(1)
  }
  return sessionId
}

function parseCoord(input?: string): { x: number; y: number } | null {
  if (!input || !input.includes(",")) return null
  const [xStr, yStr] = input.split(",")
  const x = parseInt(xStr || "", 10)
  const y = parseInt(yStr || "", 10)
  if (Number.isNaN(x) || Number.isNaN(y)) return null
  return { x, y }
}

function loadMapMetadata(): MapMetadata | null {
  const path = join(process.cwd(), ".termlings", "map-metadata.json")
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, "utf8")
    const parsed = JSON.parse(raw) as Partial<MapMetadata>
    if (typeof parsed.width !== "number" || typeof parsed.height !== "number") return null
    return {
      width: parsed.width,
      height: parsed.height,
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms as MapRoom[] : [],
    }
  } catch {
    return null
  }
}

function loadSessions(): SessionState[] {
  const dir = join(process.cwd(), ".termlings", "sessions")
  if (!existsSync(dir)) return []
  const out: SessionState[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    try {
      const raw = readFileSync(join(dir, file), "utf8")
      const parsed = JSON.parse(raw) as SessionState
      if (parsed && typeof parsed.sessionId === "string") {
        out.push(parsed)
      }
    } catch {
      // Ignore malformed session files.
    }
  }
  return out
}

function roomForPoint(x: number, y: number, rooms: MapRoom[]): MapRoom | null {
  for (const room of rooms) {
    const b = room.bounds
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return room
  }
  return null
}

function handleActionWalk(actionPositional: string[]): void {
  const sessionId = requireSessionId()
  const coord = parseCoord(actionPositional[1])
  if (!coord) {
    console.error("Usage: termlings --sim action walk <x>,<y>")
    process.exit(1)
  }
  writeCommand(sessionId, {
    action: "walk",
    x: coord.x,
    y: coord.y,
    name: process.env.TERMLINGS_AGENT_NAME || undefined,
    dna: process.env.TERMLINGS_AGENT_DNA || undefined,
    ts: Date.now(),
  })
  console.log(`Walk command sent -> (${coord.x}, ${coord.y})`)
}

function handleActionGesture(actionPositional: string[], flags: Set<string>): void {
  const sessionId = requireSessionId()
  const rawType = actionPositional[1]
  const type: GestureType =
    flags.has("wave") || rawType === "wave"
      ? "wave"
      : "talk"

  writeCommand(sessionId, {
    action: "gesture",
    type,
    name: process.env.TERMLINGS_AGENT_NAME || undefined,
    dna: process.env.TERMLINGS_AGENT_DNA || undefined,
    ts: Date.now(),
  })
  console.log(`Gesture sent: ${type}`)
}

function handleActionMap(flags: Set<string>): void {
  const map = loadMapMetadata()
  const sessions = loadSessions()
  const mySessionId = process.env.TERMLINGS_SESSION_ID
  const me = mySessionId ? readSessionState(mySessionId) : null

  if (flags.has("agents")) {
    for (const session of sessions) {
      const status = session.idle ? "idle" : "active"
      const isMe = mySessionId && session.sessionId === mySessionId ? " (you)" : ""
      console.log(`${session.sessionId.padEnd(16)} (${session.x}, ${session.footY}) [${status}]${isMe}`)
    }
    return
  }

  if (flags.has("ascii")) {
    console.log("ASCII map is unavailable in workspace mode (metadata does not include tiles).")
    console.log("Use: termlings --sim action map")
    return
  }

  if (!map) {
    console.error("No sim metadata found. Is `termlings --sim` running?")
    process.exit(1)
  }

  const rooms = map.rooms || []
  console.log(`Map: ${map.name || "unknown"} (${map.width}x${map.height})`)

  if (me) {
    const room = roomForPoint(me.x + 4, me.footY, rooms)
    const roomLabel = room ? `room${room.id}` : "outdoors"
    console.log(`You: (${me.x + 4}, ${me.footY}) in ${roomLabel}`)
  }

  if (rooms.length > 0) {
    console.log("")
    console.log(`Rooms (${rooms.length}):`)
    for (const room of rooms) {
      const b = room.bounds
      const doorCount = room.doors?.length || 0
      console.log(`  room${String(room.id).padEnd(4)} ${room.wallType.padEnd(7)} (${b.x},${b.y})-(${b.x + b.w},${b.y + b.h})  doors:${doorCount}`)
    }
  }

  console.log("")
  console.log("Agents:")
  if (sessions.length === 0) {
    console.log("  none")
    return
  }

  const myX = me ? me.x + 4 : Math.floor(map.width / 2)
  const myY = me ? me.footY : Math.floor(map.height / 2)

  for (const session of sessions) {
    const ex = session.x + 4
    const ey = session.footY
    const status = session.idle ? "idle" : "active"
    const room = roomForPoint(ex, ey, rooms)
    const roomLabel = room ? `room${room.id}` : "outdoors"
    const relative = me
      ? (session.sessionId === me.sessionId ? "(you)" : describeRelative(myX, myY, ex, ey))
      : "n/a"
    const label = session.name || session.sessionId
    console.log(`  ${label.padEnd(12)} ${session.sessionId.padEnd(16)} (${ex},${ey})  ${status.padEnd(6)} ${roomLabel.padEnd(10)} ${relative}`)
  }
}

export async function handleSimAction(actionPositional: string[], flags: Set<string>): Promise<void> {
  const verb = actionPositional[0]
  if (!verb || verb === "--help" || verb === "-h") {
    console.log(`Usage: termlings --sim action <command>

Commands:
  walk <x>,<y>                Walk avatar to coordinates
  gesture [wave|talk]         Send gesture (default: talk)
  map                         Show sim map/room/agent summary
  map --agents                Show session IDs and positions
  map --ascii                 Placeholder view (metadata-only mode)
`)
    return
  }

  if (verb === "walk") {
    handleActionWalk(actionPositional)
    return
  }

  if (verb === "gesture") {
    handleActionGesture(actionPositional, flags)
    return
  }

  if (verb === "map") {
    handleActionMap(flags)
    return
  }

  console.error(`Unknown sim action: ${verb}`)
  process.exit(1)
}
