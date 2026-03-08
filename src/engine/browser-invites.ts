import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { randomUUID } from "crypto"
import { join } from "path"
import { discoverLocalAgents } from "../agents/discover.js"
import { resolveAgentToken } from "../agents/resolve.js"

export type BrowserTabInviteStatus = "pending" | "accepted" | "left" | "declined" | "expired"

export interface BrowserTabInvite {
  id: string
  version: number
  tabId: string
  tabUrl?: string
  tabTitle?: string
  ownerSessionId?: string
  ownerAgentSlug?: string
  ownerAgentName?: string
  ownerAgentDna?: string
  target: string
  targetAgentSlug: string
  targetAgentName?: string
  targetAgentDna?: string
  note?: string
  status: BrowserTabInviteStatus
  createdAt: number
  updatedAt: number
  acceptedAt?: number
  acceptedBySessionId?: string
  acceptedByAgentSlug?: string
  acceptedByAgentName?: string
  acceptedByAgentDna?: string
  leftAt?: number
}

interface BrowserInviteIdentity {
  sessionId?: string
  agentSlug?: string
  agentName?: string
  agentDna?: string
}

const BROWSER_TAB_INVITE_VERSION = 1

function resolveTermlingsDir(root = process.cwd()): string {
  const explicitIpcDir = process.env.TERMLINGS_IPC_DIR?.trim()
  if (explicitIpcDir) return explicitIpcDir
  return join(root, ".termlings")
}

function browserInviteDir(root = process.cwd()): string {
  return join(resolveTermlingsDir(root), "browser", "invites")
}

function browserInvitePath(inviteId: string, root = process.cwd()): string {
  return join(browserInviteDir(root), `${inviteId}.json`)
}

function ensureBrowserInviteDir(root = process.cwd()): void {
  mkdirSync(browserInviteDir(root), { recursive: true })
}

function normalizeInvite(raw: unknown, inviteIdFallback?: string): BrowserTabInvite | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const data = raw as Record<string, unknown>
  const id = typeof data.id === "string" && data.id.trim()
    ? data.id.trim()
    : (inviteIdFallback || "").trim()
  const tabId = typeof data.tabId === "string" ? data.tabId.trim() : ""
  const target = typeof data.target === "string" ? data.target.trim() : ""
  const targetAgentSlug = typeof data.targetAgentSlug === "string" ? data.targetAgentSlug.trim() : ""
  const createdAt = typeof data.createdAt === "number" && Number.isFinite(data.createdAt) ? data.createdAt : 0
  const updatedAt = typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt) ? data.updatedAt : createdAt
  const status = data.status === "accepted"
    || data.status === "left"
    || data.status === "declined"
    || data.status === "expired"
    ? data.status
    : "pending"

  if (!id || !tabId || !target || !targetAgentSlug || createdAt <= 0 || updatedAt <= 0) {
    return null
  }

  return {
    id,
    version: typeof data.version === "number" ? data.version : BROWSER_TAB_INVITE_VERSION,
    tabId,
    tabUrl: typeof data.tabUrl === "string" && data.tabUrl.trim() ? data.tabUrl.trim() : undefined,
    tabTitle: typeof data.tabTitle === "string" && data.tabTitle.trim() ? data.tabTitle.trim() : undefined,
    ownerSessionId: typeof data.ownerSessionId === "string" && data.ownerSessionId.trim() ? data.ownerSessionId.trim() : undefined,
    ownerAgentSlug: typeof data.ownerAgentSlug === "string" && data.ownerAgentSlug.trim() ? data.ownerAgentSlug.trim() : undefined,
    ownerAgentName: typeof data.ownerAgentName === "string" && data.ownerAgentName.trim() ? data.ownerAgentName.trim() : undefined,
    ownerAgentDna: typeof data.ownerAgentDna === "string" && data.ownerAgentDna.trim() ? data.ownerAgentDna.trim() : undefined,
    target,
    targetAgentSlug,
    targetAgentName: typeof data.targetAgentName === "string" && data.targetAgentName.trim() ? data.targetAgentName.trim() : undefined,
    targetAgentDna: typeof data.targetAgentDna === "string" && data.targetAgentDna.trim() ? data.targetAgentDna.trim() : undefined,
    note: typeof data.note === "string" && data.note.trim() ? data.note.trim() : undefined,
    status,
    createdAt,
    updatedAt,
    acceptedAt: typeof data.acceptedAt === "number" && Number.isFinite(data.acceptedAt) ? data.acceptedAt : undefined,
    acceptedBySessionId: typeof data.acceptedBySessionId === "string" && data.acceptedBySessionId.trim() ? data.acceptedBySessionId.trim() : undefined,
    acceptedByAgentSlug: typeof data.acceptedByAgentSlug === "string" && data.acceptedByAgentSlug.trim() ? data.acceptedByAgentSlug.trim() : undefined,
    acceptedByAgentName: typeof data.acceptedByAgentName === "string" && data.acceptedByAgentName.trim() ? data.acceptedByAgentName.trim() : undefined,
    acceptedByAgentDna: typeof data.acceptedByAgentDna === "string" && data.acceptedByAgentDna.trim() ? data.acceptedByAgentDna.trim() : undefined,
    leftAt: typeof data.leftAt === "number" && Number.isFinite(data.leftAt) ? data.leftAt : undefined,
  }
}

function writeInvite(invite: BrowserTabInvite, root = process.cwd()): BrowserTabInvite {
  ensureBrowserInviteDir(root)
  writeFileSync(browserInvitePath(invite.id, root), JSON.stringify(invite, null, 2) + "\n", "utf8")
  return invite
}

function readInvite(inviteId: string, root = process.cwd()): BrowserTabInvite | null {
  const trimmed = String(inviteId || "").trim()
  if (!trimmed) return null
  const path = browserInvitePath(trimmed, root)
  if (!existsSync(path)) return null
  try {
    return normalizeInvite(JSON.parse(readFileSync(path, "utf8")), trimmed)
  } catch {
    return null
  }
}

function currentIdentityFromEnv(): BrowserInviteIdentity {
  return {
    sessionId: (process.env.TERMLINGS_SESSION_ID || "").trim() || undefined,
    agentSlug: (process.env.TERMLINGS_AGENT_SLUG || "").trim() || undefined,
    agentName: (process.env.TERMLINGS_AGENT_NAME || "").trim() || undefined,
    agentDna: (process.env.TERMLINGS_AGENT_DNA || "").trim() || undefined,
  }
}

function namesMatch(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

function matchesTargetIdentity(invite: BrowserTabInvite, identity: BrowserInviteIdentity): boolean {
  if (identity.agentSlug && invite.targetAgentSlug === identity.agentSlug) return true
  if (identity.agentDna && invite.targetAgentDna && invite.targetAgentDna === identity.agentDna) return true
  if (identity.agentName && invite.targetAgentName && namesMatch(invite.targetAgentName, identity.agentName)) return true
  return false
}

function matchesParticipantIdentity(invite: BrowserTabInvite, identity: BrowserInviteIdentity): boolean {
  if (invite.status !== "accepted") return false
  if (identity.sessionId && invite.acceptedBySessionId && invite.acceptedBySessionId === identity.sessionId) return true
  if (identity.agentSlug && invite.acceptedByAgentSlug && invite.acceptedByAgentSlug === identity.agentSlug) return true
  if (identity.agentDna && invite.acceptedByAgentDna && invite.acceptedByAgentDna === identity.agentDna) return true
  if (identity.agentName && invite.acceptedByAgentName && namesMatch(invite.acceptedByAgentName, identity.agentName)) return true
  return false
}

function matchesOwnerIdentity(invite: BrowserTabInvite, identity: BrowserInviteIdentity): boolean {
  if (identity.sessionId && invite.ownerSessionId && invite.ownerSessionId === identity.sessionId) return true
  if (identity.agentSlug && invite.ownerAgentSlug && invite.ownerAgentSlug === identity.agentSlug) return true
  if (identity.agentDna && invite.ownerAgentDna && invite.ownerAgentDna === identity.agentDna) return true
  if (identity.agentName && invite.ownerAgentName && namesMatch(invite.ownerAgentName, identity.agentName)) return true
  return false
}

function listAllInvites(root = process.cwd()): BrowserTabInvite[] {
  const dir = browserInviteDir(root)
  if (!existsSync(dir)) return []
  const invites: BrowserTabInvite[] = []
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue
    const inviteId = entry.slice(0, -".json".length)
    const invite = readInvite(inviteId, root)
    if (invite) invites.push(invite)
  }
  return invites.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
}

function resolveInviteTarget(rawTarget: string): {
  target: string
  slug: string
  name?: string
  dna?: string
} {
  const trimmed = String(rawTarget || "").trim()
  if (!trimmed) {
    throw new Error("Invite target is required. Use agent:<slug>.")
  }

  const token = trimmed.startsWith("agent:") ? trimmed.slice("agent:".length) : trimmed
  if (!token.trim()) {
    throw new Error("Invite target is required. Use agent:<slug>.")
  }

  const resolved = resolveAgentToken(
    token,
    discoverLocalAgents().map((agent) => ({
      slug: agent.name,
      name: agent.soul?.name,
      title: agent.soul?.title,
      titleShort: agent.soul?.title_short,
      dna: agent.soul?.dna,
    })),
  )

  if ("error" in resolved) {
    if (resolved.error === "ambiguous") {
      throw new Error(`Agent target "${token}" is ambiguous. Use agent:<slug> instead.`)
    }
    throw new Error(`Unknown agent target "${token}". Use agent:<slug> from termlings org-chart.`)
  }

  return {
    target: `agent:${resolved.agent.slug}`,
    slug: resolved.agent.slug,
    name: resolved.agent.name,
    dna: resolved.agent.dna,
  }
}

export function listBrowserTabInvites(root = process.cwd()): BrowserTabInvite[] {
  return listAllInvites(root)
}

export function listRelevantBrowserTabInvites(root = process.cwd()): BrowserTabInvite[] {
  const identity = currentIdentityFromEnv()
  return listAllInvites(root).filter((invite) => (
    matchesTargetIdentity(invite, identity)
    || matchesParticipantIdentity(invite, identity)
    || matchesOwnerIdentity(invite, identity)
  ))
}

export function findJoinedBrowserTabInviteForCurrentIdentity(tabId?: string, root = process.cwd()): BrowserTabInvite | null {
  const identity = currentIdentityFromEnv()
  const desiredTabId = typeof tabId === "string" && tabId.trim() ? tabId.trim() : undefined
  return listAllInvites(root).find((invite) => {
    if (!matchesParticipantIdentity(invite, identity)) return false
    if (desiredTabId && invite.tabId !== desiredTabId) return false
    return true
  }) || null
}

export function createBrowserTabInvite(input: {
  target: string
  tabId: string
  tabUrl?: string
  tabTitle?: string
  note?: string
}, root = process.cwd()): BrowserTabInvite {
  const identity = currentIdentityFromEnv()
  if (!identity.sessionId && !identity.agentSlug && !identity.agentDna && !identity.agentName) {
    throw new Error("Browser invites require an active agent session.")
  }

  const resolvedTarget = resolveInviteTarget(input.target)
  if (
    (identity.agentSlug && resolvedTarget.slug === identity.agentSlug)
    || (identity.agentDna && resolvedTarget.dna && resolvedTarget.dna === identity.agentDna)
  ) {
    throw new Error("Cannot invite the current agent into its own tab.")
  }

  const tabId = String(input.tabId || "").trim()
  if (!tabId) {
    throw new Error("Invite tab is required.")
  }

  const now = Date.now()
  const invite: BrowserTabInvite = {
    id: `brinv_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    version: BROWSER_TAB_INVITE_VERSION,
    tabId,
    tabUrl: typeof input.tabUrl === "string" && input.tabUrl.trim() ? input.tabUrl.trim() : undefined,
    tabTitle: typeof input.tabTitle === "string" && input.tabTitle.trim() ? input.tabTitle.trim() : undefined,
    ownerSessionId: identity.sessionId,
    ownerAgentSlug: identity.agentSlug,
    ownerAgentName: identity.agentName,
    ownerAgentDna: identity.agentDna,
    target: resolvedTarget.target,
    targetAgentSlug: resolvedTarget.slug,
    targetAgentName: resolvedTarget.name,
    targetAgentDna: resolvedTarget.dna,
    note: typeof input.note === "string" && input.note.trim() ? input.note.trim() : undefined,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  }

  return writeInvite(invite, root)
}

export function acceptBrowserTabInvite(inviteId: string, root = process.cwd()): BrowserTabInvite {
  const invite = readInvite(inviteId, root)
  if (!invite) {
    throw new Error(`Invite not found: ${inviteId}`)
  }

  const identity = currentIdentityFromEnv()
  if (!matchesTargetIdentity(invite, identity) && !matchesParticipantIdentity(invite, identity)) {
    throw new Error("This browser invite is not addressed to the current agent.")
  }

  if (invite.status === "left" || invite.status === "declined" || invite.status === "expired") {
    throw new Error(`Cannot accept invite ${invite.id} because it is ${invite.status}.`)
  }

  if (invite.status === "accepted") {
    return invite
  }

  const now = Date.now()
  invite.status = "accepted"
  invite.acceptedAt = now
  invite.updatedAt = now
  invite.acceptedBySessionId = identity.sessionId
  invite.acceptedByAgentSlug = identity.agentSlug
  invite.acceptedByAgentName = identity.agentName
  invite.acceptedByAgentDna = identity.agentDna
  return writeInvite(invite, root)
}

export function leaveBrowserTabInvite(inviteId?: string, root = process.cwd()): BrowserTabInvite {
  const identity = currentIdentityFromEnv()
  const invite = inviteId
    ? readInvite(inviteId, root)
    : findJoinedBrowserTabInviteForCurrentIdentity(undefined, root)

  if (!invite) {
    throw new Error(inviteId ? `Invite not found: ${inviteId}` : "No active shared browser tab for the current agent.")
  }

  if (!matchesParticipantIdentity(invite, identity)) {
    throw new Error("This browser invite is not currently joined by the current agent.")
  }

  const now = Date.now()
  invite.status = "left"
  invite.leftAt = now
  invite.updatedAt = now
  return writeInvite(invite, root)
}

export function readBrowserTabInvite(inviteId: string, root = process.cwd()): BrowserTabInvite | null {
  return readInvite(inviteId, root)
}
