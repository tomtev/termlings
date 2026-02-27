import {
  decodeDNA,
  encodeDNA,
  traitsFromName,
} from "./index.js"
import {
  type RGB,
  type Cell,
  type ChatMessage,
  type Entity,
  DEFAULT_CONFIG,
  allocBuffer,
  clearBuffer,
  renderBuffer,
  stampEntity,
  stampUI,
  stampChatMessages,
  stampChatInput,
  stampText,
  setupInput,
  makeEntity,
  entityHeight,
  updateAnimations,
  stampNames,
  ensureIpcDir,
  IPC_DIR,
  pollCommands,
  writeState,
  writeMessages,
  cleanupIpc,
  type AgentCommand,
  setRoom,
  enterScreen,
  exitScreen,
} from "./engine/index.js"
import { join } from "path"
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs"

// --- Room selection ---

const roomSlug = process.env.TERMLINGS_ROOM || "default"
setRoom(roomSlug)

// --- Agent IPC ---

ensureIpcDir()
const agentSessions = new Map<string, { entity: Entity; gestureExpiry: number }>()

// --- Agent persistence ---

const AGENTS_FILE = join(IPC_DIR, "agents.json")

interface PersistedAgent {
  sessionId: string
  name: string
  dna: string
}

function saveAgentSessions() {
  const agents: PersistedAgent[] = []
  agentSessions.forEach((session, sessionId) => {
    agents.push({
      sessionId,
      name: session.entity.name || sessionId,
      dna: session.entity.dna,
    })
  })
  try { writeFileSync(AGENTS_FILE, JSON.stringify(agents) + "\n") } catch {}
}

function loadAgentSessions() {
  if (!existsSync(AGENTS_FILE)) return
  try {
    const data = readFileSync(AGENTS_FILE, "utf8")
    const agents = JSON.parse(data) as PersistedAgent[]
    for (const a of agents) {
      const entity = makeEntity(a.dna, 0, 0, 0, { idle: true })
      entity.name = a.name
      agentSessions.set(a.sessionId, { entity, gestureExpiry: 0 })
    }
    if (agents.length > 0) {
      chat("system", `Restored ${agents.length} agent${agents.length !== 1 ? "s" : ""} from previous session`, [120, 180, 120])
    }
  } catch {}
}

loadAgentSessions()

// --- Title screen return state ---

let hadAgents = agentSessions.size > 0
let simPaused = false

// --- Terminal setup ---

const stdout = process.stdout
let cols = stdout.columns || 80
let rows = stdout.rows || 24

stdout.write(enterScreen(rows))

function cleanup() {
  saveAgentSessions()
  cleanupIpc()
  stdout.write(exitScreen())
  process.exit(0)
}
process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)

// --- Config ---

const config = DEFAULT_CONFIG

// --- Screen buffer ---

let buffer = allocBuffer(cols, rows)

// Handle terminal resize
stdout.on("resize", () => {
  cols = stdout.columns || 80
  rows = stdout.rows || 24
  buffer = allocBuffer(cols, rows)
  stdout.write("\x1b[2J")
})

// --- Chat state ---

const CHAT_LOG = join(IPC_DIR, "chat.jsonl")

function loadChatLog(): ChatMessage[] {
  try {
    const data = readFileSync(CHAT_LOG, "utf8")
    const msgs: ChatMessage[] = []
    for (const line of data.split("\n")) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line) as { name: string; text: string; time: number; fg: RGB }
        msgs.push(obj)
      } catch {}
    }
    return msgs
  } catch {
    return []
  }
}

function appendChatLog(msg: ChatMessage) {
  try {
    appendFileSync(CHAT_LOG, JSON.stringify({ name: msg.name, text: msg.text, time: msg.time, fg: msg.fg }) + "\n")
  } catch {}
}

function chat(name: string, text: string, fg: RGB) {
  const msg: ChatMessage = { name, text, time: Date.now(), fg }
  chatMessages.push(msg)
  appendChatLog(msg)
}

let chatMode = false
let chatBuffer = ""
const chatMessages: ChatMessage[] = loadChatLog()

// --- Selection state ---

let selectedIdx = 0

function getSelectableEntities(): Entity[] {
  const list: Entity[] = []
  agentSessions.forEach(s => list.push(s.entity))
  return list
}

function getSelected(): Entity | null {
  const list = getSelectableEntities()
  if (list.length === 0) return null
  selectedIdx = Math.min(selectedIdx, list.length - 1)
  return list[selectedIdx] ?? null
}

// --- Input ---

const stdin = process.stdin
stdin.setRawMode!(true)
stdin.resume()
stdin.setEncoding("utf8")

function sendChat() {
  const text = chatBuffer.trim()
  if (!text) return
  const sel = getSelected()
  let targetName: string | null = null
  if (sel) {
    let targetSessionId: string | null = null
    agentSessions.forEach((session, sessionId) => {
      if (session.entity === sel) { targetSessionId = sessionId; targetName = session.entity.name || sessionId }
    })
    if (targetSessionId) {
      writeMessages(targetSessionId, [{ from: "spectator", fromName: "Spectator", text, ts: Date.now() }])
    }
  }
  const label = targetName ? `You \u2192 ${targetName}` : "You"
  chat(label, text, [180, 180, 180])
}

function selectEntity(idx: number) {
  const list = getSelectableEntities()
  if (list.length === 0) return
  selectedIdx = Math.max(0, Math.min(idx, list.length - 1))
}

function cycleSelection(delta: number) {
  const list = getSelectableEntities()
  if (list.length === 0) return
  selectedIdx = ((selectedIdx + delta) % list.length + list.length) % list.length
}

const simOnArrow = (dir: string) => {
  if (chatMode) return
  if (dir === "left") cycleSelection(-1)
  else if (dir === "right") cycleSelection(1)
}

const simOnKey = (ch: string) => {
  if (chatMode) {
    if (ch === "\r") {
      sendChat()
      chatBuffer = ""
      chatMode = false
    } else if (ch === "\x1b") {
      chatBuffer = ""
      chatMode = false
    } else if (ch === "\x7f" || ch === "\b") {
      chatBuffer = chatBuffer.slice(0, -1)
    } else if (ch >= " " && ch.length === 1) {
      if (chatBuffer.length < cols - 14) {
        chatBuffer += ch
      }
    }
    return
  }

  if (ch >= "1" && ch <= "9") {
    selectEntity(ch.charCodeAt(0) - "1".charCodeAt(0))
    return
  }
  if (ch === "0") {
    selectEntity(9)
    return
  }

  if (ch === "c") {
    chatMode = true
    chatBuffer = ""
  } else if (ch === "q" || ch === "\x03") cleanup()
}

let removeSimInput = setupInput(stdin, simOnArrow, simOnKey)

// --- Return to title screen when all agents leave ---

async function returnToTitle() {
  if (simPaused) return
  simPaused = true

  removeSimInput()
  saveAgentSessions()

  const { showTitleScreen } = await import("./title.js")
  await showTitleScreen(roomSlug)

  stdin.setRawMode!(true)
  stdin.resume()
  stdin.setEncoding("utf8")
  removeSimInput = setupInput(stdin, simOnArrow, simOnKey)

  stdout.write("\x1b[2J")
  hadAgents = false
  simPaused = false
  loop()
}

// --- Grid layout: position entities in a grid ---

function layoutGrid() {
  const entities = getSelectableEntities()
  if (entities.length === 0) return

  const cellW = 20 // terminal cols per cell (sprite is 9*2=18 chars wide)
  const cellH = 16  // terminal rows per cell
  const perRow = Math.max(1, Math.floor((cols - 2) / cellW))

  for (let i = 0; i < entities.length; i++) {
    const col = i % perRow
    const row = Math.floor(i / perRow)
    const gridX = 2 + col * cellW
    const gridY = 3 + row * cellH

    const e = entities[i]!
    // stampEntity uses (entity.x - cameraX) * scale for screen X
    // With cameraX=0, scale=1: screenX = entity.x * 1 → entity.x pixels = entity.x/2 terminal chars (sprite is 9 cols × 2 chars)
    // To place at terminal column gridX: entity.x = gridX / 2 (keep gridX even)
    e.x = Math.floor(gridX / 2)
    e.y = gridY
  }
}

// --- Agent IPC polling ---

function spawnAgentEntity(sessionId: string, cmd: AgentCommand): Entity {
  const dna = cmd.dna && /^[0-9a-f]{6,7}$/i.test(cmd.dna)
    ? cmd.dna.toLowerCase()
    : encodeDNA(traitsFromName(sessionId))
  const entity = makeEntity(dna, 0, 0, 0, { idle: true })
  entity.name = cmd.name || sessionId.slice(0, 12)
  agentSessions.set(sessionId, { entity, gestureExpiry: 0 })
  return entity
}

function processAgentCommands() {
  if (tick % 30 !== 0) return

  const commands = pollCommands()
  for (const { sessionId, cmd } of commands) {
    if (cmd.action === "leave") {
      const session = agentSessions.get(sessionId)
      if (session) {
        const name = session.entity.name || sessionId
        agentSessions.delete(sessionId)
        chat("system", `${name} disconnected`, [120, 120, 120])
      }
      continue
    }

    let session = agentSessions.get(sessionId)
    if (!session) {
      const entity = spawnAgentEntity(sessionId, cmd)
      chat("system", `${entity.name} connected (${sessionId})`, [120, 120, 120])
      session = agentSessions.get(sessionId)!
    }

    const { entity } = session

    // Walk/build/destroy rejected in simple mode
    if (cmd.action === "walk") {
      chat("system", "walk is disabled in simple mode", [180, 80, 80])
    }

    if (cmd.action === "place") {
      chat("system", "place is disabled in simple mode", [180, 80, 80])
    }

    if (cmd.action === "destroy") {
      chat("system", "destroy is disabled in simple mode", [180, 80, 80])
    }

    if (cmd.action === "gesture") {
      if (cmd.type === "talk") {
        entity.talking = !entity.talking
        if (!entity.talking) entity.talkFrame = 0
      } else if (cmd.type === "wave") {
        entity.waving = !entity.waving
        if (!entity.waving) entity.waveFrame = 0
        else entity.waveFrame = 1
      }
      session.gestureExpiry = tick + 180
    }

    if (cmd.action === "stop") {
      entity.walking = false
      entity.talking = false
      entity.waving = false
      entity.waveFrame = 0
      entity.talkFrame = 0
      entity.idle = true
    }

    if (cmd.action === "send" && cmd.text && cmd.target) {
      const fromName = entity.name || sessionId
      const targetSession = agentSessions.get(cmd.target)
      const targetName = targetSession?.entity.name || cmd.target
      if (targetSession) {
        writeMessages(cmd.target, [{ from: sessionId, fromName, text: cmd.text, ts: Date.now() }])
      }
      chat(`${fromName} \u2192 ${targetName}`, cmd.text, entity.faceRgb)
      entity.talking = true
      session.gestureExpiry = tick + 120
    }

    if (cmd.action === "chat" && cmd.text) {
      const fromName = entity.name || sessionId
      chat(fromName, cmd.text, entity.faceRgb)
    }
  }

  // Auto-clear expired gestures
  agentSessions.forEach((session) => {
    if (session.gestureExpiry > 0 && tick >= session.gestureExpiry) {
      session.entity.talking = false
      session.entity.waving = false
      session.entity.waveFrame = 0
      session.entity.talkFrame = 0
      session.gestureExpiry = 0
    }
  })
}

function writeSimState() {
  if (tick % 120 !== 0) return
  saveAgentSessions()

  const entities: { sessionId: string; name: string; x: number; y: number; footY: number; idle: boolean; dna: string }[] = []
  agentSessions.forEach((session, sessionId) => {
    entities.push({
      sessionId,
      name: session.entity.name || sessionId,
      x: session.entity.x,
      y: session.entity.y,
      footY: session.entity.y + session.entity.height - 1,
      idle: session.entity.idle,
      dna: session.entity.dna,
    })
  })

  writeState({
    entities,
    map: { width: cols, height: rows, name: `${roomSlug} (simple)`, mode: "simple" },
  })
}

// --- HUD ---

function buildHud(): { text: string; active?: boolean; fg?: RGB }[] {
  const sel = getSelected()
  const list = getSelectableEntities()
  const hud: { text: string; active?: boolean; fg?: RGB }[] = []

  if (sel) {
    hud.push(
      { text: " \u2588\u2588 ", fg: sel.faceRgb },
      { text: `${sel.name || "???"}`, fg: sel.faceRgb },
      { text: ` (${selectedIdx + 1}/${list.length}) ` },
    )
  } else {
    hud.push({ text: " Waiting for agents... " })
  }

  hud.push(
    { text: "| [C]hat " },
    { text: "| [1-9] select " },
    { text: "| [\u2190\u2192] cycle " },
    { text: "| Simple mode " },
    { text: "| Q: quit " },
  )

  return hud
}

// --- Render loop ---

let tick = 0

function frame() {
  tick++
  processAgentCommands()
  writeSimState()

  // Track agent presence and return to title when all agents leave
  if (agentSessions.size > 0) hadAgents = true
  if (hadAgents && agentSessions.size === 0) {
    returnToTitle()
    return
  }

  const allEntities = getSelectableEntities()
  updateAnimations(allEntities, tick, config)

  // Position entities in grid layout
  layoutGrid()

  clearBuffer(buffer, cols, rows)

  // Header
  const header = `Simple Mode \u2014 Room: ${roomSlug} \u2014 ${agentSessions.size} agent${agentSessions.size !== 1 ? "s" : ""}`
  const headerX = Math.floor((cols - header.length) / 2)
  stampText(buffer, cols, rows, headerX, 1, header, [140, 140, 160])

  // Stamp entities (z-sorted by foot Y)
  const sorted = allEntities.slice().sort((a, b) => (a.y + a.height) - (b.y + b.height))
  for (const e of sorted) {
    stampEntity(buffer, cols, rows, e, 0, 0, 1)
  }

  // Build selection index labels
  const selLabels = new Map<Entity, string>()
  for (let i = 0; i < allEntities.length; i++) {
    selLabels.set(allEntities[i]!, ` (${i + 1})`)
  }

  // Stamp names
  stampNames(buffer, cols, rows, allEntities, null, 0, 0, 1, Infinity, selLabels)

  // Prune old chat messages
  const chatNow = Date.now()
  while (chatMessages.length > 0 && chatNow - chatMessages[0]!.time >= 30000) {
    chatMessages.shift()
  }

  stampChatMessages(buffer, cols, rows, chatMessages)

  if (chatMode) {
    const chatTarget = getSelected()?.name
    stampChatInput(buffer, cols, rows, chatBuffer, chatTarget)
  } else {
    stampUI(buffer, cols, rows, buildHud())
  }

  const ok = stdout.write(renderBuffer(buffer, cols, rows))
  if (!ok) writeBackpressure = true
}

let writeBackpressure = false
stdout.on("drain", () => { writeBackpressure = false })

function loop() {
  if (simPaused) return
  if (!writeBackpressure) frame()
  setTimeout(loop, config.frameMs)
}
loop()
