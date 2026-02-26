import {
  decodeDNA,
  encodeDNA,
  generateRandomDNA,
  traitsFromName,
  HATS,
  LEGS,
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
  createInputState,
  setupInput,
  pressDir,
  isHeld,
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
  stepSound,
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
} from "./engine/index.js"
import { resolve } from "path"

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
let windLevel = 0 // 0=off, 1=gentle, 2=breezy
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
const furniturePlacements = world.placements
const furnitureOverlay = buildFurnitureOverlay(furniturePlacements, mergedDefs)

// --- Doors ---

const doors = createDoors(world.doors, furnitureOverlay)

// --- NPC AI pathfinding ---

const walkGrid = buildWalkGrid(tiles, tileDefs, mapWidth, mapHeight, furnitureOverlay, world.doors)
const pathfinderState = createPathfinderState()
const npcAIStates = new Map<Entity, NpcAIState>()

// --- Terminal setup ---

const stdout = process.stdout
let cols = stdout.columns || 80
let rows = stdout.rows || 24

stdout.write("\x1b[?1049h\x1b[?25l")

function cleanup() {
  if (isMultiplayer && net) net.close()
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

  // First call: center camera on player
  if (!cameraInitialized) {
    cameraInitialized = true
    const cam = computeCamera(player, cols, rows, zoomLevel)
    cameraX = cam.cameraX
    cameraY = cam.cameraY
    return
  }

  // Player center in tile coords
  const pcx = player.x + 4 // sprite center x
  const pcy = player.y + Math.floor(player.height / 2) // sprite center y

  const padX = Math.floor(viewW * CAMERA_PAD_X)
  const padY = Math.floor(viewH * CAMERA_PAD_Y)

  // Scroll when player approaches edges of the viewport
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

// --- Game state ---

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

function resolvePlayerDna(): string {
  if (!argDna) return generateRandomDNA()
  if (/^[0-9a-f]{6,7}$/i.test(argDna)) return argDna.toLowerCase()
  return encodeDNA(traitsFromName(argDna))
}

function generateNpcDNAs(count: number, playerHue: number, rng: () => number): string[] {
  const hues = Array.from({ length: 12 }, (_, i) => i).filter((h) => h !== playerHue)
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

const playerDna = resolvePlayerDna()
const playerTraits = decodeDNA(playerDna)

function getCurrentRoom(): string {
  const { fx, fy } = feetPos(player.x, player.y)
  for (const r of rooms) {
    if (fx >= r.x && fx < r.x + r.w && fy >= r.y && fy < r.y + r.h) return r.name
  }
  return "???"
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
  const dnas = generateNpcDNAs(npcSpawns.length, playerTraits.faceHue, rng)
  return npcSpawns.map((sp, i) => {
    const sprH = entityHeight(decodeDNA(dnas[i]!), zoomLevel)
    const e = makeEntity(dnas[i]!, sp.x - 5, sp.y - sprH + 1, zoomLevel, { idle: true })
    e.name = sp.name ?? NPC_NAMES[i % NPC_NAMES.length]
    e.idleTicks = Math.floor(30 + rng() * 90)
    return e
  })
}

// --- Initialize world ---

const playerH = spriteHeight(playerDna)
const player = makeEntity(playerDna, playerSpawn.x - 5, playerSpawn.y - playerH + 1, zoomLevel)
let npcs: Entity[] = isMultiplayer ? [] : generateAllNpcs()
updateCamera()

// --- Multiplayer state ---

let net: import("./engine/net.js").NetClient | null = null
let myId = ""
let remotePlayers: Entity[] = []
let remotePlayerIds = new Map<string, Entity>() // id → entity
let connectionStatus = isMultiplayer ? "connecting" : ""
let playerCount = 1
let lastSentX = player.x
let lastSentY = player.y
let lastSentFlipped = player.flipped
let lastSentWalking = player.walking
let lastSentTalking = player.talking
let lastSentWaving = player.waving
let lastSendTime = 0

// --- NPC bubble state ---

const npcBubbles = new Map<Entity, { text: string; expiresAt: number }>()

// --- Chat state ---

let chatMode = false
let chatBuffer = ""
const chatMessages: ChatMessage[] = []

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
  const urlDna = url.searchParams.get("dna") || playerDna

  net.onOpen(() => {
    connectionStatus = "connected"
    net!.send({ t: "join", dna: urlDna, name: urlName })
  })

  net.onMessage((msg: Record<string, unknown>) => {
    const t = msg.t as string

    if (t === "init") {
      myId = msg.id as string
      const spawn = msg.spawn as { x: number; y: number }
      // Position player at spawn
      const h = spriteHeight(playerDna)
      player.x = spawn.x - 5
      player.y = spawn.y - h + 1
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
      const fg: RGB = senderId === myId ? player.faceRgb : (senderEntity?.faceRgb ?? [200, 200, 200])
      chatMessages.push({ name: senderName, text, time: Date.now(), fg })
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

function sendMoveToServer() {
  if (!net || !net.isConnected()) return
  const now = Date.now()
  if (now - lastSendTime < 50) return // throttle to 20Hz

  if (player.x !== lastSentX || player.y !== lastSentY || player.flipped !== lastSentFlipped) {
    net.send({ t: "mv", x: player.x, y: player.y, f: player.flipped ? 1 : 0 })
    lastSentX = player.x
    lastSentY = player.y
    lastSentFlipped = player.flipped
    lastSendTime = now
  }
}

function sendAnimToServer() {
  if (!net || !net.isConnected()) return

  if (
    player.walking !== lastSentWalking ||
    player.talking !== lastSentTalking ||
    player.waving !== lastSentWaving
  ) {
    net.send({
      t: "an",
      w: player.walking ? 1 : 0,
      tk: player.talking ? 1 : 0,
      wv: player.waving ? 1 : 0,
    })
    lastSentWalking = player.walking
    lastSentTalking = player.talking
    lastSentWaving = player.waving
  }
}

// --- Input ---

const stdin = process.stdin
stdin.setRawMode!(true)
stdin.resume()
stdin.setEncoding("utf8")

const inputState = createInputState(config)

function sendChat() {
  const text = chatBuffer.trim()
  if (!text) return
  if (isMultiplayer && net) {
    net.send({ t: "chat", text })
  } else {
    chatMessages.push({ name: "You", text, time: Date.now(), fg: player.faceRgb })
  }
}

setupInput(
  stdin,
  (dir) => {
    if (chatMode) return
    pressDir(inputState, dir)
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

    // Normal mode
    if (ch === "c") {
      chatMode = true
      chatBuffer = ""
    } else if (ch === "q" || ch === "\x03") cleanup()
    else if (ch === "t") {
      player.talking = !player.talking
      if (!player.talking) player.talkFrame = 0
      if (isMultiplayer) sendAnimToServer()
    } else if (ch === "w") {
      player.waving = !player.waving
      if (!player.waving) player.waveFrame = 0
      else player.waveFrame = 1
      if (isMultiplayer) sendAnimToServer()
    } else if (ch === "d") {
      debugMode = !debugMode
      stdout.write("\x1b[2J")
    } else if (ch === "f") {
      windLevel = (windLevel + 1) % 3
    } else if (ch === "s") {
      toggleSound()
    } else if (ch === "z") {
      zoomLevel = zoomLevel === 0 ? 1 : 0
      const allEntities = isMultiplayer ? [player, ...npcs, ...remotePlayers] : [player, ...npcs]
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

function canMoveTo(x: number, y: number, height = player.height): boolean {
  const footY = y + height - 1
  for (let dx = 1; dx < 8; dx++) {
    if (!isWalkable(tiles, tileDefs, mapWidth, mapHeight, x + dx, footY, furnitureOverlay)) return false
  }
  return true
}

function feetPos(x: number, y: number): { fx: number; fy: number } {
  return { fx: x + 4, fy: y + player.height - 1 }
}

// Frame-based movement: consistent rate independent of system key repeat
const BACKSIDE_TURN_TICKS = 30 // ~500ms delay before turning back to front
let backsideTurnDelay = 0

function processMovement() {
  if (chatMode) return

  // Only move when a new key event arrives (pending).
  // For diagonal movement, co-held directions also move when any direction fires.
  const hadPending = inputState.pending.up || inputState.pending.down ||
                     inputState.pending.left || inputState.pending.right

  const up = hadPending && (inputState.pending.up || isHeld(inputState, "up"))
  const down = hadPending && (inputState.pending.down || isHeld(inputState, "down"))
  const left = hadPending && (inputState.pending.left || isHeld(inputState, "left"))
  const right = hadPending && (inputState.pending.right || isHeld(inputState, "right"))

  inputState.pending.up = false
  inputState.pending.down = false
  inputState.pending.left = false
  inputState.pending.right = false

  const anyHeld = isHeld(inputState, "up") || isHeld(inputState, "down") ||
                  isHeld(inputState, "left") || isHeld(inputState, "right")

  let moved = false

  if (up && canMoveTo(player.x, player.y - 1)) { player.y -= 1; moved = true }
  if (down && canMoveTo(player.x, player.y + 1)) { player.y += 1; moved = true }
  if (left && canMoveTo(player.x - 1, player.y)) { player.x -= 1; moved = true }
  if (right && canMoveTo(player.x + 1, player.y)) { player.x += 1; moved = true }
  if (left) { player.flipped = true; player.backside = false; backsideTurnDelay = 0 }
  if (right) { player.flipped = false; player.backside = false; backsideTurnDelay = 0 }
  if (up) { player.backside = true; backsideTurnDelay = 0 }
  if (down) { player.backside = false; backsideTurnDelay = 0 }

  // Play footstep sound with positional panning
  if (moved) {
    const scale = tileScaleX(zoomLevel)
    const screenX = (player.x + 4 - cameraX) * scale
    stepSound(screenX, cols)
  }

  // Walking animation stays active while any direction is held
  const wasWalking = player.walking
  player.walking = moved || anyHeld

  if (!anyHeld && !moved && wasWalking) {
    player.walking = false
    player.walkFrame = 0
    if (player.backside) backsideTurnDelay = BACKSIDE_TURN_TICKS
  }

  // Delayed turn-around after stopping while facing away
  if (backsideTurnDelay > 0) {
    backsideTurnDelay--
    if (backsideTurnDelay === 0) player.backside = false
  }

  if (isMultiplayer) {
    sendMoveToServer()
    if (player.walking !== wasWalking) sendAnimToServer()
  }
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
          chatMessages.push({ name: npc.name, text: phrase, time: Date.now(), fg: npc.faceRgb })
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
      const distX = Math.abs((npc.x + 4) - (player.x + 4))
      const distY = Math.abs((npc.y + npc.height) - (player.y + player.height))
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

// --- HUD ---

function buildHud(): { text: string; active?: boolean; fg?: RGB }[] {
  const mapName = world.name
  const hud: { text: string; active?: boolean; fg?: RGB }[] = [
    { text: " ██ ", fg: player.faceRgb },
    { text: `${playerDna} ` },
    { text: mapName ? `| ${mapName} ` : `| room: ${getCurrentRoom()} ` },
    { text: "| Arrows: move " },
    { text: "| " },
    { text: "[T]alk", active: player.talking },
    { text: " | " },
    { text: "[W]ave", active: player.waving },
    { text: " | " },
    { text: "[Z]oom", active: zoomLevel === 1 },
    { text: " | " },
    { text: `[F]wind:${WIND_LABELS[windLevel]}`, active: windLevel > 0 },
    { text: " | " },
    { text: "[D]ebug", active: debugMode },
    ...(debugMode ? [{ text: ` ${fpsValue}fps ${cols}x${rows}`, fg: [180, 255, 180] as RGB }] : []),
    { text: " | " },
    { text: "[S]ound", active: isSoundEnabled() },
    { text: " | " },
    { text: "[C]hat" },
    { text: " | Q: quit " },
  ]

  if (isMultiplayer) {
    hud.push(
      { text: `| ${playerCount} player${playerCount !== 1 ? "s" : ""} ` },
      { text: `| ${connectionStatus} ` },
    )
  }

  return hud
}

// --- Debug rendering ---

const _title = world.name ? `Termlings — ${world.name}` : "Termlings 0.1"
const _titleFg: RGB = [100, 120, 140]
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
  _allEntities.push(player)
  _doorEntities.push(player)
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
  processMovement()
  updateNpcAI()

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

  // For names, iterate npcs + remotePlayers directly (no allocation)
  stampNames(buffer, cols, rows, npcs, player, cameraX, cameraY, scale, config.nameProximity)
  if (isMultiplayer) {
    stampNames(buffer, cols, rows, remotePlayers, player, cameraX, cameraY, scale, config.nameProximity)
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

  // Title text (centered at top)
  const topRow = buffer[0]!
  const titleStart = ((cols - _title.length) >> 1) | 0
  for (let i = 0; i < _title.length; i++) {
    const sx = titleStart + i
    if (sx < 0 || sx >= cols) continue
    const c = topRow[sx]!; c.ch = _title[i]!; c.fg = _titleFg; c.bg = null
  }

  if (chatMode) {
    stampChatInput(buffer, cols, rows, chatBuffer)
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
