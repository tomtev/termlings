import {
  decodeDNA,
  encodeDNA,
  generateRandomDNA,
  traitsFromName,
  HATS,
  type DecodedDNA,
} from "./index.js"
import {
  type RGB,
  type Cell,
  type ChatMessage,
  type Entity,
  type RoomRegion,
  type FurnitureOverlay,
  type FurniturePlacement,
  type LoadedMap,
  DEFAULT_CONFIG,
  FURNITURE_DEFS,
  tileKey,
  allocBuffer,
  clearBuffer,
  renderBuffer,
  stampEntity,
  stampEntitySmall,
  stampUI,
  stampChatMessages,
  stampChatInput,
  stampTiles,
  isWalkable,
  loadMap,
  loadDefaultMap,
  computeCamera,
  tileScaleX,
  setupInput,
  makeEntity,
  entityHeight,
  spriteHeight,
  updateAnimations,
  stampNames,
  stampBubbles,
  type BubbleInfo,
  buildFurnitureOverlay,
  stampFurniturePiece,
  furnitureSortY,
  npcStepSound,
  toggleSound,
  isSoundEnabled,
  createDoors,
  updateDoors,
  stampDoors,
  buildWalkGrid,
  createPathfinderState,
  createNpcAIState,
  stepNpc,
  type NpcAIState,
  ensureIpcDir,
  IPC_DIR,
  pollCommands,
  writeState,
  writeMessages,
  cleanupIpc,
  findPath,
  type AgentCommand,
  setRoom,
} from "./engine/index.js"
import { resolve, join } from "path"
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs"

// --- Room selection (must happen before ensureIpcDir) ---

const roomSlug = process.env.TERMLINGS_ROOM || "default"
setRoom(roomSlug)

// --- Multiplayer detection ---

const wsUrl = process.env.TERMLINGS_WS_URL || null
const isMultiplayer = !!wsUrl

// --- CLI args ---

const rawArgs = process.argv.slice(2)
const positional: string[] = []
for (const a of rawArgs) {
  if (!a.startsWith("-")) positional.push(a)
}
const argDna = positional[0] || null
let zoomLevel = rawArgs.includes("--small") ? 1 : 0
let debugMode = rawArgs.includes("--debug")
let windLevel = 1 // Always gentle wind
const WIND_LABELS = ["Off", "Gentle", "Breezy"]
const WIND_INTENSITY = [0, 0.3, 0.8]

// --- Load map ---

const mapPath = process.env.TERMLINGS_MAP_PATH || null

let world: LoadedMap
if (mapPath) {
  world = loadMap(resolve(mapPath))
} else {
  world = loadDefaultMap()
}

const { tiles, width: mapWidth, height: mapHeight, npcSpawns, playerSpawn, rooms, tileDefs } = world

// --- Furniture (merge map-defined objects with built-in defs) ---

const mergedDefs = { ...FURNITURE_DEFS, ...world.objectDefs }
let furniturePlacements = [...world.placements]
let furnitureOverlay = buildFurnitureOverlay(furniturePlacements, mergedDefs)

// --- Persist agent-built objects ---

const PLACEMENTS_FILE = join(IPC_DIR, "placements.json")

function loadPersistedPlacements() {
  if (!existsSync(PLACEMENTS_FILE)) return
  try {
    const data = readFileSync(PLACEMENTS_FILE, "utf8")
    const saved = JSON.parse(data) as FurniturePlacement[]
    for (const p of saved) {
      if (mergedDefs[p.def]) furniturePlacements.push(p)
    }
  } catch {}
}

function savePersistedPlacements() {
  // Only persist agent-built objects (those beyond the original map placements)
  const agentBuilt = furniturePlacements.slice(world.placements.length)
  try { writeFileSync(PLACEMENTS_FILE, JSON.stringify(agentBuilt) + "\n") } catch {}
}

loadPersistedPlacements()
furnitureOverlay = buildFurnitureOverlay(furniturePlacements, mergedDefs)

function rebuildFurniture() {
  furnitureOverlay = buildFurnitureOverlay(furniturePlacements, mergedDefs)
  cacheFurnitureSortYs()
  savePersistedPlacements()
}

// --- Doors ---

const doors = createDoors(world.doors, furnitureOverlay)

// --- NPC AI pathfinding ---

const walkGrid = buildWalkGrid(tiles, tileDefs, mapWidth, mapHeight, furnitureOverlay, world.doors)

// Pre-compute door tile positions so canMoveTo treats them as walkable (matching the walk grid)
const doorTileSet = new Set<number>()
for (const d of world.doors) {
  for (let i = 0; i < d.length; i++) {
    const tx = d.orientation === "horizontal" ? d.x + i : d.x
    const ty = d.orientation === "vertical" ? d.y + i : d.y
    doorTileSet.add(tileKey(tx, ty))
  }
}
const pathfinderState = createPathfinderState()
const npcAIStates = new Map<Entity, NpcAIState>()

// --- Agent IPC ---

ensureIpcDir()
const agentSessions = new Map<string, { entity: Entity; ai: NpcAIState; gestureExpiry: number }>()

// --- Agent persistence ---

const AGENTS_FILE = join(IPC_DIR, "agents.json")

interface PersistedAgent {
  sessionId: string
  name: string
  dna: string
  x: number
  y: number
  flipped: boolean
}

function saveAgentSessions() {
  const agents: PersistedAgent[] = []
  agentSessions.forEach((session, sessionId) => {
    agents.push({
      sessionId,
      name: session.entity.name || sessionId,
      dna: session.entity.dna,
      x: session.entity.x,
      y: session.entity.y,
      flipped: session.entity.flipped,
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
      const entity = makeEntity(a.dna, a.x, a.y, zoomLevel, { idle: true, flipped: a.flipped })
      entity.name = a.name
      const ai = createNpcAIState()
      ai.phase = "idle"
      ai.idleRemaining = Infinity
      agentSessions.set(a.sessionId, { entity, ai, gestureExpiry: 0 })
    }
    if (agents.length > 0) {
      chat("system", `Restored ${agents.length} agent${agents.length !== 1 ? "s" : ""} from previous session`, [120, 180, 120])
    }
  } catch {}
}

loadAgentSessions()

// --- Terminal setup ---

const stdout = process.stdout
let cols = stdout.columns || 80
let rows = stdout.rows || 24

stdout.write("\x1b[?1049h\x1b[?25l")

function cleanup() {
  saveAgentSessions()
  if (isMultiplayer && net) net.close()
  cleanupIpc()
  stdout.write("\x1b[?25h\x1b[?1049l")
  process.exit(0)
}
process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)

// --- Config ---

const config = DEFAULT_CONFIG

// --- NPC names ---

const NPC_NAMES = [
  "Pip", "Mox", "Zara", "Kip", "Luna", "Remy", "Fern", "Ash",
  "Blix", "Coral", "Dex", "Echo", "Fizz", "Glow", "Hex", "Ivy",
  "Jazz", "Kit", "Lux", "Nova", "Opal", "Pix", "Rex", "Sky",
]

// --- NPC phrases ---

const NPC_PHRASES = [
  "Hello!", "Hi there!", "Nice day!", "Hey!", "*waves*",
  "How's it going?", "Heya!", "Yo!", "Sup!", "Howdy!",
  "Good vibes!", "La la la~", "Hmm...", "Oh!", "Heh",
  "Woah!", "Cool!", ":)", "...", "Wheee!",
]

// --- Footprint state ---

const footprints = new Map<number, number>()
const FOOTPRINT_RECOVERY_MS = 5000

function stampFootprints(entities: Entity[]) {
  const now = Date.now()
  for (const e of entities) {
    if (!e.walking) continue
    const footY = e.y + e.height - 1
    for (let dx = 3; dx <= 5; dx++) {
      footprints.set(tileKey(e.x + dx, footY), now)
    }
  }
}

function pruneFootprints() {
  const now = Date.now()
  footprints.forEach((time, key) => {
    if (now - time > FOOTPRINT_RECOVERY_MS) {
      footprints.delete(key)
    }
  })
}

// --- Screen buffer ---

let buffer = allocBuffer(cols, rows)

// --- Camera ---

let cameraX = 0
let cameraY = 0
let cameraInitialized = false

// Dead-zone camera: player moves freely in center, camera scrolls at edges
const CAMERA_PAD_X = 0.3 // fraction of viewport width as padding on each side
const CAMERA_PAD_Y = 0.3 // fraction of viewport height as padding on each side

function updateCamera() {
  const scale = tileScaleX(zoomLevel)
  const viewW = Math.floor(cols / scale)
  const viewH = rows

  const target = getSelected()

  // First call or re-center: snap camera to target (or map center)
  if (!cameraInitialized) {
    cameraInitialized = true
    if (target) {
      const cam = computeCamera(target, cols, rows, zoomLevel)
      cameraX = cam.cameraX
      cameraY = cam.cameraY
    } else {
      // No entity selected — center on playerSpawn as fallback
      cameraX = playerSpawn.x - Math.floor(viewW / 2)
      cameraY = playerSpawn.y - Math.floor(viewH / 2)
    }
    return
  }

  if (!target) return

  // Target center in tile coords
  const pcx = target.x + 4
  const pcy = target.y + Math.floor(target.height / 2)

  const padX = Math.floor(viewW * CAMERA_PAD_X)
  const padY = Math.floor(viewH * CAMERA_PAD_Y)

  // Scroll when target approaches edges of the viewport
  if (pcx < cameraX + padX) cameraX = pcx - padX
  if (pcx > cameraX + viewW - padX) cameraX = pcx - viewW + padX
  if (pcy < cameraY + padY) cameraY = pcy - padY
  if (pcy > cameraY + viewH - padY) cameraY = pcy - viewH + padY
}

// Handle terminal resize
stdout.on("resize", () => {
  cols = stdout.columns || 80
  rows = stdout.rows || 24
  buffer = allocBuffer(cols, rows)
  stdout.write("\x1b[2J")
  // Re-center camera on resize
  cameraInitialized = false
  updateCamera()
})

// --- Sim state ---

function seededRandom(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = seed.charCodeAt(i) + ((h << 5) - h)
  }
  h = Math.abs(h)
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b)
    h = (h ^ (h >>> 16)) >>> 0
    return h / 0x100000000
  }
}

function generateNpcDNAs(count: number, rng: () => number): string[] {
  const hues = Array.from({ length: 12 }, (_, i) => i)
  for (let i = hues.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [hues[i], hues[j]] = [hues[j]!, hues[i]!]
  }
  return Array.from({ length: count }, (_, i) => {
    const traits: DecodedDNA = {
      eyes: Math.floor(rng() * 11),
      mouth: Math.floor(rng() * 7),
      hat: Math.floor(rng() * HATS.length),
      body: Math.floor(rng() * 6),
      legs: Math.floor(rng() * 6),
      faceHue: hues[i % hues.length]!,
      hatHue: Math.floor(rng() * 12),
    }
    return encodeDNA(traits)
  })
}

function findRegion(wx: number, wy: number): RoomRegion | null {
  for (const r of rooms) {
    if (wx >= r.x && wx < r.x + r.w && wy >= r.y && wy < r.y + r.h) return r
  }
  return null
}

// --- NPC generation ---

function generateAllNpcs(): Entity[] {
  const rng = seededRandom("world-npcs")
  const dnas = generateNpcDNAs(npcSpawns.length, rng)
  return npcSpawns.map((sp, i) => {
    const sprH = entityHeight(decodeDNA(dnas[i]!), zoomLevel)
    const e = makeEntity(dnas[i]!, sp.x - 5, sp.y - sprH + 1, zoomLevel, { idle: true })
    e.name = sp.name ?? NPC_NAMES[i % NPC_NAMES.length]
    e.idleTicks = Math.floor(30 + rng() * 90)
    return e
  })
}

// --- Initialize world ---

// --- Spectator state (no player entity) ---

let selectedIdx = 0

function getSelectableEntities(): Entity[] {
  const list: Entity[] = []
  agentSessions.forEach(s => list.push(s.entity))
  list.push(...npcs)
  return list
}

function getSelected(): Entity | null {
  const list = getSelectableEntities()
  if (list.length === 0) return null
  selectedIdx = Math.min(selectedIdx, list.length - 1)
  return list[selectedIdx] ?? null
}

let npcs: Entity[] = isMultiplayer ? [] : []
updateCamera()

// --- Multiplayer state ---

let net: import("./engine/net.js").NetClient | null = null
let myId = ""
let remotePlayers: Entity[] = []
let remotePlayerIds = new Map<string, Entity>() // id → entity
let connectionStatus = isMultiplayer ? "connecting" : ""
let playerCount = 1
// --- NPC bubble state ---

const npcBubbles = new Map<Entity, { text: string; expiresAt: number }>()

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

// --- Multiplayer setup ---

if (isMultiplayer) {
  setupMultiplayer()
}

async function setupMultiplayer() {
  const { createNetClient } = await import("./engine/net.js")
  net = createNetClient()

  // Extract name and dna from URL query params
  const url = new URL(wsUrl!)
  const urlName = url.searchParams.get("name") || "Anon"
  const urlDna = url.searchParams.get("dna") || generateRandomDNA()

  net.onOpen(() => {
    connectionStatus = "connected"
    net!.send({ t: "join", dna: urlDna, name: urlName })
  })

  net.onMessage((msg: Record<string, unknown>) => {
    const t = msg.t as string

    if (t === "init") {
      myId = msg.id as string
      updateCamera()

      // Create remote players
      const players = msg.players as Array<{
        id: string; name: string; dna: string
        x: number; y: number; f: number; w: number; tk: number; wv: number
      }>
      for (const p of players) {
        addRemotePlayer(p)
      }

      // Sync NPC states from server
      const npcStates = msg.npcs as Array<{
        i: number; x: number; y: number; f: number; w: number; tk: number; wv: number
      }>
      syncNpcsFromServer(npcStates)

      playerCount = remotePlayers.length + 1
    }

    if (t === "pjoin") {
      const p = msg.player as {
        id: string; name: string; dna: string
        x: number; y: number; f: number; w: number; tk: number; wv: number
      }
      addRemotePlayer(p)
      playerCount = remotePlayers.length + 1
    }

    if (t === "pleave") {
      const id = msg.id as string
      const entity = remotePlayerIds.get(id)
      if (entity) {
        remotePlayers = remotePlayers.filter(e => e !== entity)
        remotePlayerIds.delete(id)
      }
      playerCount = remotePlayers.length + 1
    }

    if (t === "pmv") {
      const id = msg.id as string
      const entity = remotePlayerIds.get(id)
      if (entity) {
        entity.x = msg.x as number
        entity.y = msg.y as number
        entity.flipped = (msg.f as number) === 1
        entity.walking = true
      }
    }

    if (t === "pan") {
      const id = msg.id as string
      const entity = remotePlayerIds.get(id)
      if (entity) {
        entity.walking = (msg.w as number) === 1
        entity.talking = (msg.tk as number) === 1
        entity.waving = (msg.wv as number) === 1
        if (entity.waving && entity.waveFrame === 0) entity.waveFrame = 1
        if (!entity.waving) entity.waveFrame = 0
      }
    }

    if (t === "chat") {
      const senderId = msg.id as string
      const senderName = msg.name as string
      const text = msg.text as string
      const senderEntity = remotePlayerIds.get(senderId)
      const fg: RGB = senderEntity?.faceRgb ?? [200, 200, 200]
      chat(senderName, text, fg)
    }

    if (t === "tick") {
      const npcStates = msg.npcs as Array<{
        i: number; x: number; y: number; f: number; w: number; tk: number; wv: number
      }>
      syncNpcsFromServer(npcStates)
    }
  })

  net.onClose(() => {
    connectionStatus = "disconnected"
  })

  net.connect(wsUrl!)
}

function addRemotePlayer(p: {
  id: string; name: string; dna: string
  x: number; y: number; f: number; w: number; tk: number; wv: number
}) {
  const h = spriteHeight(p.dna)
  const entity = makeEntity(p.dna, p.x, p.y, zoomLevel, {
    walking: p.w === 1,
    talking: p.tk === 1,
    waving: p.wv === 1,
    flipped: p.f === 1,
  })
  entity.name = p.name
  remotePlayers.push(entity)
  remotePlayerIds.set(p.id, entity)
}

function syncNpcsFromServer(npcStates: Array<{
  i: number; x: number; y: number; f: number; w: number; tk: number; wv: number
}>) {
  // Ensure we have enough NPC entities
  while (npcs.length < npcStates.length) {
    const dna = generateRandomDNA()
    const e = makeEntity(dna, 0, 0, zoomLevel, { idle: true })
    e.name = NPC_NAMES[npcs.length % NPC_NAMES.length]
    npcs.push(e)
  }

  for (const state of npcStates) {
    const npc = npcs[state.i]
    if (!npc) continue
    npc.x = state.x
    npc.y = state.y
    npc.flipped = state.f === 1
    npc.walking = state.w === 1
    npc.talking = state.tk === 1
    npc.waving = state.wv === 1
    if (npc.waving && npc.waveFrame === 0) npc.waveFrame = 1
    if (!npc.waving) npc.waveFrame = 0
    npc.idle = !npc.walking && !npc.talking && !npc.waving
  }
}

// --- Input ---

const stdin = process.stdin
stdin.setRawMode!(true)
stdin.resume()
stdin.setEncoding("utf8")

function sendChat() {
  const text = chatBuffer.trim()
  if (!text) return
  if (isMultiplayer && net) {
    net.send({ t: "chat", text })
  } else {
    // Deliver to selected agent via IPC
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
    const label = targetName ? `You → ${targetName}` : "You"
    chat(label, text, [180, 180, 180])
  }
}

function selectEntity(idx: number) {
  const list = getSelectableEntities()
  if (list.length === 0) return
  selectedIdx = Math.max(0, Math.min(idx, list.length - 1))
  cameraInitialized = false
  updateCamera()
}

function cycleSelection(delta: number) {
  const list = getSelectableEntities()
  if (list.length === 0) return
  selectedIdx = ((selectedIdx + delta) % list.length + list.length) % list.length
  cameraInitialized = false
  updateCamera()
}

setupInput(
  stdin,
  (dir) => {
    if (chatMode) return
    // Arrow keys cycle selection
    if (dir === "left") cycleSelection(-1)
    else if (dir === "right") cycleSelection(1)
  },
  (ch) => {
    if (chatMode) {
      if (ch === "\r") {
        // Enter — send message
        sendChat()
        chatBuffer = ""
        chatMode = false
      } else if (ch === "\x1b") {
        // Escape — cancel
        chatBuffer = ""
        chatMode = false
      } else if (ch === "\x7f" || ch === "\b") {
        // Backspace
        chatBuffer = chatBuffer.slice(0, -1)
      } else if (ch >= " " && ch.length === 1) {
        // Printable char
        if (chatBuffer.length < cols - 14) {
          chatBuffer += ch
        }
      }
      return
    }

    // Number keys 1-9, 0 select entities
    if (ch >= "1" && ch <= "9") {
      selectEntity(ch.charCodeAt(0) - "1".charCodeAt(0))
      return
    }
    if (ch === "0") {
      selectEntity(9)
      return
    }

    // Normal mode
    if (ch === "c") {
      chatMode = true
      chatBuffer = ""
    } else if (ch === "q" || ch === "\x03") cleanup()
    else if (ch === "d") {
      debugMode = !debugMode
      stdout.write("\x1b[2J")
    } else if (ch === "s") {
      toggleSound()
    } else if (ch === "z") {
      zoomLevel = zoomLevel === 0 ? 1 : 0
      const allEntities: Entity[] = isMultiplayer ? [...npcs, ...remotePlayers] : [...npcs]
      agentSessions.forEach(s => allEntities.push(s.entity))
      for (const e of allEntities) {
        const oldH = e.height
        e.height = entityHeight(e.traits, zoomLevel)
        e.y += oldH - e.height
      }
      cameraInitialized = false
      updateCamera()
      stdout.write("\x1b[2J")
    }
  },
)

// --- Movement ---

function canMoveTo(x: number, y: number, height: number): boolean {
  const footY = y + height - 1
  for (let dx = 1; dx < 8; dx++) {
    const wx = x + dx
    // Door tiles are always passable (door auto-opens on proximity)
    if (doorTileSet.has(tileKey(wx, footY))) continue
    if (!isWalkable(tiles, tileDefs, mapWidth, mapHeight, wx, footY, furnitureOverlay)) return false
  }
  return true
}

// --- NPC wander AI (single-player only) ---

let tick = 0
let fpsCounter = 0
let fpsValue = 0
let fpsLastTime = Date.now()

function updateNpcAI() {
  if (isMultiplayer) return // Server handles NPC AI
  if (tick % 6 !== 0) return // NPCs step every 6 ticks (matching old move rate)

  for (const npc of npcs) {
    // Ensure AI state exists
    let ai = npcAIStates.get(npc)
    if (!ai) {
      ai = createNpcAIState()
      npcAIStates.set(npc, ai)
    }

    const result = stepNpc(npc, ai, walkGrid, rooms, pathfinderState, canMoveTo)

    // Side effects: talking / waving when starting a new walk
    if (result.startedWalking) {
      npc.talking = Math.random() < 0.2
      if (npc.talking) {
        const phrase = NPC_PHRASES[Math.floor(Math.random() * NPC_PHRASES.length)]!
        npcBubbles.set(npc, { text: phrase, expiresAt: Infinity })
        if (npc.name) {
          chat(npc.name, phrase, npc.faceRgb)
        }
      }
      npc.waving = Math.random() < 0.15
      if (npc.waving) npc.waveFrame = 1
    }

    // Expire chat bubble on arrival
    if (result.arrivedAtTarget) {
      const bubble = npcBubbles.get(npc)
      if (bubble && bubble.expiresAt === Infinity) {
        bubble.expiresAt = Date.now() + 2000
      }
    }

    // NPC footstep sound (only nearby, on-screen NPCs)
    if (result.moved) {
      const sel = getSelected()
      const distX = sel ? Math.abs((npc.x + 4) - (sel.x + 4)) : 999
      const distY = sel ? Math.abs((npc.y + npc.height) - (sel.y + sel.height)) : 999
      if (distX < 40 && distY < 20) {
        const npcScale = tileScaleX(zoomLevel)
        const npcScreenX = (npc.x + 4 - cameraX) * npcScale
        const npcScreenY = npc.y + npc.height - 1 - cameraY
        if (npcScreenX >= 0 && npcScreenX < cols && npcScreenY >= 0 && npcScreenY < rows) {
          npcStepSound(npcScreenX, cols)
        }
      }
    }
  }
}

// --- Agent IPC polling ---

let nextSpawnIdx = 0

function spawnAgentEntity(sessionId: string, cmd: AgentCommand): Entity {
  // Pick a spawn point (cycle through NPC spawns)
  const spawn = npcSpawns[nextSpawnIdx % npcSpawns.length]!
  nextSpawnIdx++

  // Use DNA from command if provided, otherwise derive from session ID
  const dna = cmd.dna && /^[0-9a-f]{6,7}$/i.test(cmd.dna)
    ? cmd.dna.toLowerCase()
    : encodeDNA(traitsFromName(sessionId))
  const sprH = spriteHeight(dna)
  const h = entityHeight(decodeDNA(dna), zoomLevel)
  // Spawn randomly within a radius, but only on walkable ground
  const centerX = spawn.x
  const centerY = spawn.y
  let spawnX = centerX
  let spawnY = centerY - h + 1
  for (let radius = 10; radius <= 50; radius += 10) {
    let found = false
    for (let attempt = 0; attempt < 30; attempt++) {
      const ox = Math.floor(Math.random() * radius * 2) - radius
      const oy = Math.floor(Math.random() * radius * 2) - radius
      const tx = Math.max(0, Math.min(mapWidth - 10, centerX + ox))
      const ty = Math.max(0, Math.min(mapHeight - 1, centerY + oy))
      // ty is foot Y; entity top is ty - h + 1
      if (canMoveTo(tx, ty - h + 1, h)) {
        spawnX = tx
        spawnY = ty - h + 1
        found = true
        break
      }
    }
    if (found) break
  }
  const entity = makeEntity(dna, spawnX, spawnY, zoomLevel, { idle: true })
  entity.name = cmd.name || sessionId.slice(0, 12)

  const ai = createNpcAIState()
  ai.phase = "idle"
  ai.idleRemaining = Infinity // Agents don't wander on their own

  agentSessions.set(sessionId, { entity, ai, gestureExpiry: 0 })
  return entity
}

function processAgentCommands() {
  if (isMultiplayer) return
  if (tick % 30 !== 0) return // Poll every 30 ticks (~0.5s)

  const commands = pollCommands()
  for (const { sessionId, cmd } of commands) {
    // Handle agent disconnect
    if (cmd.action === "leave") {
      const session = agentSessions.get(sessionId)
      if (session) {
        const name = session.entity.name || sessionId
        agentSessions.delete(sessionId)
        chat("system", `${name} disconnected`, [120, 120, 120])
      }
      continue
    }

    // Spawn entity if new session
    let session = agentSessions.get(sessionId)
    if (!session) {
      const entity = spawnAgentEntity(sessionId, cmd)
      chat("system", `${entity.name} connected (${sessionId})`, [120, 120, 120])
      session = agentSessions.get(sessionId)!
    }

    const { entity, ai } = session

    if (cmd.action === "walk" && cmd.x !== undefined && cmd.y !== undefined) {
      // A* pathfind to target
      const footY = entity.y + entity.height - 1
      const targetFootY = cmd.y
      const targetX = cmd.x - 5 // Adjust for sprite offset (entity.x is left edge, feet center ~x+4)

      // Use full map bounds for agents (they can cross rooms via doors)
      const bounds = { x0: 0, y0: 0, x1: mapWidth, y1: mapHeight }
      const path = findPath(walkGrid, entity.x, footY, targetX, targetFootY, bounds, pathfinderState, 5000)

      if (path && path.length > 0) {
        ai.path = path
        ai.pathIdx = 0
        ai.stuckTicks = 0
        ai.phase = "walking"
        ai.boundsOverride = bounds // keep full bounds for stuck-recompute
        entity.walking = true
        entity.idle = false
      }
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
      // Auto-clear gesture after ~3s (180 ticks at 60fps)
      session.gestureExpiry = tick + 180
    }

    if (cmd.action === "stop") {
      ai.path = null
      ai.phase = "idle"
      ai.idleRemaining = Infinity
      entity.walking = false
      entity.talking = false
      entity.waving = false
      entity.waveFrame = 0
      entity.talkFrame = 0
      entity.idle = true
    }

    if (cmd.action === "send" && cmd.text && cmd.target) {
      // Direct message to a specific agent session
      const fromName = entity.name || sessionId
      const targetSession = agentSessions.get(cmd.target)
      const targetName = targetSession?.entity.name || cmd.target
      if (targetSession) {
        writeMessages(cmd.target, [{ from: sessionId, fromName, text: cmd.text, ts: Date.now() }])
      }

      // Show in sim chat log as a DM
      chat(`${fromName} → ${targetName}`, cmd.text, entity.faceRgb)

      // Show as a chat bubble on the sender
      npcBubbles.set(entity, { text: cmd.text, expiresAt: Date.now() + 4000 })

      // Briefly toggle talk animation
      entity.talking = true
      session.gestureExpiry = tick + 120
    }

    if (cmd.action === "chat" && cmd.text) {
      // Chat message: sim-only, visible in the chat log but no IPC delivery
      const fromName = entity.name || sessionId
      chat(fromName, cmd.text, entity.faceRgb)
    }

    if (cmd.action === "build" && cmd.objectType) {
      const objDef = mergedDefs[cmd.objectType]
      if (!objDef) {
        chat("system", `Unknown object: ${cmd.objectType}`, [180, 80, 80])
      } else {
        const bx = cmd.x ?? (entity.x + 4)
        const by = cmd.y ?? (entity.y + entity.height - 1)

        // Check overlap with existing blocking furniture cells
        let blocked = false
        for (let row = 0; row < objDef.height && !blocked; row++) {
          const cellRow = objDef.cells[row]
          if (!cellRow) continue
          for (let col = 0; col < objDef.width; col++) {
            const cell = cellRow[col]
            if (!cell || cell.walkable) continue
            const key = tileKey(bx + col, by + row)
            if (furnitureOverlay.walkable.has(key) && !furnitureOverlay.walkable.get(key)) {
              blocked = true
              break
            }
          }
        }

        if (blocked) {
          chat("system", `Can't build ${cmd.objectType} at (${bx},${by}) — blocked`, [180, 80, 80])
        } else {
          const fromName = entity.name || sessionId
          furniturePlacements.push({ def: cmd.objectType, x: bx, y: by })
          rebuildFurniture()
          chat("system", `${fromName} built a ${cmd.objectType} at (${bx},${by})`, [80, 180, 80])
        }
      }
    }

    if (cmd.action === "destroy") {
      const dx = cmd.x ?? (entity.x + 4)
      const dy = cmd.y ?? (entity.y + entity.height - 1)

      // Find a placement at or near the target position
      let foundIdx = -1
      let bestDist = Infinity
      for (let i = world.placements.length; i < furniturePlacements.length; i++) {
        const p = furniturePlacements[i]!
        const def = mergedDefs[p.def]
        if (!def) continue
        // Check if target point is inside the placement bounds
        if (dx >= p.x && dx < p.x + def.width && dy >= p.y && dy < p.y + def.height) {
          const dist = Math.abs(dx - p.x) + Math.abs(dy - p.y)
          if (dist < bestDist) { bestDist = dist; foundIdx = i }
        }
      }

      if (foundIdx === -1) {
        chat("system", `Nothing to destroy at (${dx},${dy})`, [180, 80, 80])
      } else {
        const removed = furniturePlacements[foundIdx]!
        const fromName = entity.name || sessionId
        furniturePlacements.splice(foundIdx, 1)
        rebuildFurniture()
        chat("system", `${fromName} destroyed a ${removed.def} at (${removed.x},${removed.y})`, [180, 120, 80])
      }
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

function updateAgentAI() {
  if (isMultiplayer) return
  if (tick % 6 !== 0) return

  agentSessions.forEach((session) => {
    const { entity, ai } = session
    if (ai.phase !== "walking") return

    stepNpc(entity, ai, walkGrid, rooms, pathfinderState, canMoveTo)
  })
}

function writeSimState() {
  if (isMultiplayer) return
  if (tick % 120 !== 0) return // Every ~2s
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

  // Also include NPCs in state for map visibility
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i]!
    entities.push({
      sessionId: `npc-${i}`,
      name: npc.name || `NPC ${i}`,
      x: npc.x,
      y: npc.y,
      footY: npc.y + npc.height - 1,
      idle: npc.idle,
      dna: npc.dna,
    })
  }

  writeState({
    entities,
    map: { width: mapWidth, height: mapHeight, name: world.name, tiles },
  })
}

// --- HUD ---

function buildHud(): { text: string; active?: boolean; fg?: RGB }[] {
  const sel = getSelected()
  const list = getSelectableEntities()
  const hud: { text: string; active?: boolean; fg?: RGB }[] = []

  if (sel) {
    hud.push(
      { text: " ██ ", fg: sel.faceRgb },
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
    { text: "| " },
    { text: "[Z]oom", active: zoomLevel === 1 },
    { text: " | " },
    { text: "[D]ebug", active: debugMode },
    ...(debugMode ? [
      { text: ` ${fpsValue}fps ${cols}x${rows}`, fg: [180, 255, 180] as RGB },
      ...(sel ? [{ text: ` (${sel.x + 4},${sel.y + sel.height - 1})`, fg: [180, 255, 180] as RGB }] : []),
    ] : []),
    { text: " | " },
    { text: "[S]ound", active: isSoundEnabled() },
    { text: " | Q: quit " },
  )

  if (isMultiplayer) {
    hud.push(
      { text: `| ${playerCount} player${playerCount !== 1 ? "s" : ""} ` },
      { text: `| ${connectionStatus} ` },
    )
  }

  return hud
}

// --- Debug rendering ---

const _debugFg: RGB = [255, 40, 40]
const _debugBg: RGB = [80, 0, 0]
const _debugFurFg: RGB = [200, 100, 30]
const _debugFurBg: RGB = [80, 50, 0]
const _debugWallFg: RGB = [120, 30, 30]
const _debugWallBg: RGB = [60, 0, 0]

function stampDebug(e: Entity) {
  const scale = tileScaleX(zoomLevel)
  const footY = e.y + e.height - 1 - cameraY

  if (footY < 0 || footY >= rows) return
  const bufRow = buffer[footY]!
  for (let dx = 1; dx < 8; dx++) {
    const baseSx = (e.x + dx - cameraX) * scale
    for (let ci = 0; ci < scale; ci++) {
      const sx = baseSx + ci
      if (sx < 0 || sx >= cols) continue
      const c = bufRow[sx]!
      if (c.ch === " ") c.ch = "·"
      c.fg = _debugFg; c.bg = _debugBg
    }
  }
}

// --- Render loop ---

// Reusable arrays to avoid per-frame allocation
const _allEntities: Entity[] = []
const _doorEntities: Entity[] = []
const _sortKeys: number[] = []   // parallel sort key array
const _sortIdx: number[] = []    // parallel index array for sort
let _furnitureSortYs: number[] = [] // cached furniture sortY values

// Pre-compute furniture sort keys (only changes when furniture changes, which is never at runtime)
function cacheFurnitureSortYs() {
  _furnitureSortYs = furniturePlacements.map(fp => furnitureSortY(fp, mergedDefs))
}
cacheFurnitureSortYs()

function rebuildEntityArrays() {
  _allEntities.length = 0
  _doorEntities.length = 0
  for (let i = 0; i < npcs.length; i++) {
    _allEntities.push(npcs[i]!)
    _doorEntities.push(npcs[i]!) // NPCs trigger door opening too
  }
  if (isMultiplayer) {
    for (let i = 0; i < remotePlayers.length; i++) {
      _allEntities.push(remotePlayers[i]!)
      _doorEntities.push(remotePlayers[i]!)
    }
  }
  agentSessions.forEach((session) => {
    _allEntities.push(session.entity)
    _doorEntities.push(session.entity)
  })
}

function frame() {
  tick++
  fpsCounter++
  const now = Date.now()
  if (now - fpsLastTime >= 1000) {
    fpsValue = fpsCounter
    fpsCounter = 0
    fpsLastTime = now
  }
  updateNpcAI()
  processAgentCommands()
  updateAgentAI()
  writeSimState()

  rebuildEntityArrays()

  updateDoors(doors, _doorEntities, furnitureOverlay, tick)
  updateAnimations(_allEntities, tick, config)
  updateCamera()
  clearBuffer(buffer, cols, rows)

  const scale = tileScaleX(zoomLevel)
  stampFootprints(_allEntities)
  if (tick % 60 === 0) pruneFootprints()
  stampTiles(buffer, cols, rows, tiles, tileDefs, mapWidth, mapHeight, cameraX, cameraY, scale, footprints, tick, WIND_INTENSITY[windLevel]!)
  stampDoors(buffer, cols, rows, doors, cameraX, cameraY, scale)

  // Unified z-sort using parallel index array (avoids object allocation per item)
  const totalItems = _allEntities.length + furniturePlacements.length
  _sortKeys.length = totalItems
  _sortIdx.length = totalItems
  // Entities: positive index, Furniture: negative index (offset by -1 to distinguish from 0)
  for (let i = 0; i < _allEntities.length; i++) {
    const e = _allEntities[i]!
    _sortKeys[i] = (e.y + e.height) * 4 + 1 // +1 = entity renders after furniture at same y
    _sortIdx[i] = i
  }
  const eLen = _allEntities.length
  for (let i = 0; i < furniturePlacements.length; i++) {
    _sortKeys[eLen + i] = _furnitureSortYs[i]! * 4
    _sortIdx[eLen + i] = eLen + i
  }
  // Sort indices by key
  _sortIdx.sort((a, b) => _sortKeys[a]! - _sortKeys[b]!)

  const sorted: Entity[] = []
  for (let si = 0; si < totalItems; si++) {
    const idx = _sortIdx[si]!
    if (idx < eLen) {
      // Entity
      const e = _allEntities[idx]!
      sorted.push(e)
      if (zoomLevel === 1) stampEntitySmall(buffer, cols, rows, e, cameraX, cameraY)
      else stampEntity(buffer, cols, rows, e, cameraX, cameraY, scale)
    } else {
      // Furniture
      stampFurniturePiece(buffer, cols, rows, furniturePlacements[idx - eLen]!, cameraX, cameraY, scale, mergedDefs)
    }
  }

  // Build selection index labels: entity → " (1)", " (2)", etc.
  const selLabels = new Map<Entity, string>()
  const selList = getSelectableEntities()
  for (let i = 0; i < selList.length; i++) {
    selLabels.set(selList[i]!, ` (${i + 1})`)
  }

  // For names, iterate npcs + remotePlayers + agents directly (no allocation)
  // Spectator mode: pass null so all names are shown
  stampNames(buffer, cols, rows, npcs, null, cameraX, cameraY, scale, config.nameProximity, selLabels)
  if (isMultiplayer) {
    stampNames(buffer, cols, rows, remotePlayers, null, cameraX, cameraY, scale, config.nameProximity, selLabels)
  }
  if (agentSessions.size > 0) {
    const agentEntities: Entity[] = []
    agentSessions.forEach(s => agentEntities.push(s.entity))
    stampNames(buffer, cols, rows, agentEntities, null, cameraX, cameraY, scale, config.nameProximity, selLabels)
  }

  // NPC chat bubbles
  const bubbleNow = Date.now()
  const bubbles: BubbleInfo[] = []
  npcBubbles.forEach((bubble, npc) => {
    if (bubbleNow > bubble.expiresAt) {
      npcBubbles.delete(npc)
      return
    }
    const dim = 0.8
    const fg: RGB = [
      Math.round(npc.faceRgb[0] * dim),
      Math.round(npc.faceRgb[1] * dim),
      Math.round(npc.faceRgb[2] * dim),
    ]
    bubbles.push({ x: npc.x, y: npc.y, text: bubble.text, fg })
  })
  if (bubbles.length > 0) {
    stampBubbles(buffer, cols, rows, bubbles, cameraX, cameraY, scale)
  }

  if (debugMode) {
    for (let sy = 0; sy < rows; sy++) {
      const ty = sy + cameraY
      if (ty < 0 || ty >= mapHeight) continue
      const bufRow = buffer[sy]!
      for (let sx = 0; sx < cols; sx++) {
        const tx = Math.floor(sx / scale) + cameraX
        if (tx < 0 || tx >= mapWidth) continue
        if (!isWalkable(tiles, tileDefs, mapWidth, mapHeight, tx, ty, furnitureOverlay)) {
          const c = bufRow[sx]!
          if (c.ch === " ") c.ch = "░"
          const isFurniture = furnitureOverlay.walkable.has(tileKey(tx, ty))
          if (isFurniture) {
            c.fg = _debugFurFg; c.bg = _debugFurBg
          } else {
            c.fg = c.fg ?? _debugWallFg; c.bg = _debugWallBg
          }
        }
      }
    }
    for (const entity of sorted) {
      stampDebug(entity)
    }
  }

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
  if (!writeBackpressure) frame()
  setTimeout(loop, config.frameMs)
}
loop()
