/**
 * Message storage layer - organizes messages by channel and DM threads
 *
 * Architecture:
 *   .termlings/store/messages/
 *   ├── channels/
 *   │   ├── general.jsonl
 *   │   ├── engineering.jsonl
 *   │   └── {channel-name}.jsonl
 *   ├── dms/
 *   │   ├── agent-{dna}.jsonl
 *   │   ├── human-default.jsonl
 *   │   └── {target-id}.jsonl
 *   ├── system.jsonl
 *   └── index.json
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { join } from "path"
import { parseJsonLines, readLastJsonLines, readLastMatchingJsonLines } from "./jsonl.js"

export interface WorkspaceMessage {
  id: string
  kind: "chat" | "dm" | "system"
  channel?: string         // NEW: set for channel messages
  from: string
  fromName: string
  fromDna?: string
  target?: string
  targetName?: string
  targetDna?: string
  text: string
  ts: number
}

interface MessageIndex {
  channels: Array<{
    name: string
    count: number
    lastTs: number
  }>
  dms: Array<{
    target: string
    count: number
    lastTs: number
  }>
  updatedAt: number
}

function getStorageDir(root: string): string {
  return join(root, ".termlings", "store", "messages")
}

function getChannelsDir(root: string): string {
  return join(getStorageDir(root), "channels")
}

function getDmsDir(root: string): string {
  return join(getStorageDir(root), "dms")
}

function getIndexPath(root: string): string {
  return join(getStorageDir(root), "index.json")
}

function getSystemPath(root: string): string {
  return join(getStorageDir(root), "system.jsonl")
}

function getChannelPath(channel: string, root: string): string {
  return join(getChannelsDir(root), `${channel}.jsonl`)
}

function getDmPath(target: string, root: string): string {
  return join(getDmsDir(root), `${target}.jsonl`)
}

function getMessageFilePath(
  root: string,
  channel?: string,
  target?: string,
): string {
  if (channel) {
    return getChannelPath(channel, root)
  }
  if (target) {
    return getDmPath(target, root)
  }
  return getSystemPath(root)
}

function rebuildIndex(root: string): void {
  const index: MessageIndex = { channels: [], dms: [], updatedAt: Date.now() }

  try {
    for (const entry of readdirSync(getChannelsDir(root))) {
      if (!entry.endsWith(".jsonl")) continue
      const channel = entry.slice(0, -".jsonl".length)
      const messages = getChannelMessages(channel, root)
      if (messages.length <= 0) continue
      index.channels.push({
        name: channel,
        count: messages.length,
        lastTs: Math.max(...messages.map((msg) => msg.ts || 0)),
      })
    }
  } catch {}

  try {
    for (const entry of readdirSync(getDmsDir(root))) {
      if (!entry.endsWith(".jsonl")) continue
      const target = entry.slice(0, -".jsonl".length)
      const messages = getDmMessages(target, root)
      if (messages.length <= 0) continue
      index.dms.push({
        target,
        count: messages.length,
        lastTs: Math.max(...messages.map((msg) => msg.ts || 0)),
      })
    }
  } catch {}

  index.channels.sort((a, b) => a.name.localeCompare(b.name))
  index.dms.sort((a, b) => a.target.localeCompare(b.target))
  saveIndex(root, index)
}

function migrateLegacySessionSystemDmThreads(root: string): void {
  ensureMessageDirs(root)
  const dms = getDmsDir(root)
  const systemPath = getSystemPath(root)
  let changed = false

  let entries: string[] = []
  try {
    entries = readdirSync(dms)
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue
    const target = entry.slice(0, -".jsonl".length)
    if (!/^tl-[0-9a-f]{8}$/i.test(target)) continue

    const path = join(dms, entry)
    const messages = parseJsonLines<WorkspaceMessage>(path)
    if (messages.length <= 0) continue
    const allSystem = messages.every((message) => message.kind === "system")
    if (!allSystem) continue

    for (const message of messages) {
      const migrated: WorkspaceMessage = {
        ...message,
        kind: "system",
        target: undefined,
      }
      appendFileSync(systemPath, JSON.stringify(migrated) + "\n")
    }

    try {
      unlinkSync(path)
      changed = true
    } catch {}
  }

  if (changed) {
    rebuildIndex(root)
  }
}

function ensureMessageDirs(root: string): void {
  mkdirSync(getStorageDir(root), { recursive: true })
  mkdirSync(getChannelsDir(root), { recursive: true })
  mkdirSync(getDmsDir(root), { recursive: true })
}

function loadIndex(root: string): MessageIndex {
  const indexPath = getIndexPath(root)
  if (!existsSync(indexPath)) {
    return { channels: [], dms: [], updatedAt: Date.now() }
  }
  try {
    return JSON.parse(readFileSync(indexPath, "utf8")) as MessageIndex
  } catch {
    return { channels: [], dms: [], updatedAt: Date.now() }
  }
}

function saveIndex(root: string, index: MessageIndex): void {
  const indexPath = getIndexPath(root)
  writeFileSync(indexPath, JSON.stringify(index, null, 2))
}

function updateIndex(
  root: string,
  channel?: string,
  target?: string,
  ts?: number,
): void {
  const index = loadIndex(root)
  const now = ts ?? Date.now()

  if (channel) {
    const existing = index.channels.find((c) => c.name === channel)
    if (existing) {
      existing.count++
      existing.lastTs = now
    } else {
      index.channels.push({
        name: channel,
        count: 1,
        lastTs: now,
      })
    }
  } else if (target) {
    const existing = index.dms.find((d) => d.target === target)
    if (existing) {
      existing.count++
      existing.lastTs = now
    } else {
      index.dms.push({
        target: target,
        count: 1,
        lastTs: now,
      })
    }
  }

  index.updatedAt = Date.now()
  saveIndex(root, index)
}

export function initializeMessageDirs(root: string): void {
  ensureMessageDirs(root)
  migrateLegacySessionSystemDmThreads(root)
}

export function appendMessage(
  message: Omit<WorkspaceMessage, "id" | "ts"> & { id?: string; ts?: number },
  root: string,
): WorkspaceMessage {
  ensureMessageDirs(root)

  const normalizedChannel = message.kind === "chat" ? message.channel : undefined
  const normalizedTarget = message.kind === "dm" ? message.target : undefined

  const record: WorkspaceMessage = {
    id: message.id ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    ts: message.ts ?? Date.now(),
    kind: message.kind,
    from: message.from,
    fromName: message.fromName,
    fromDna: message.fromDna,
    target: normalizedTarget,
    targetName: message.targetName,
    targetDna: message.targetDna,
    text: message.text,
    channel: normalizedChannel,
  }

  const filePath = getMessageFilePath(root, normalizedChannel, normalizedTarget)
  appendFileSync(filePath, JSON.stringify(record) + "\n")

  updateIndex(root, normalizedChannel, normalizedTarget, record.ts)

  return record
}

export function getChannelMessages(
  channel: string,
  root: string,
  opts: { limit?: number } = {},
): WorkspaceMessage[] {
  const path = getChannelPath(channel, root)
  return typeof opts.limit === "number"
    ? readLastJsonLines<WorkspaceMessage>(path, opts.limit)
    : parseJsonLines<WorkspaceMessage>(path)
}

export function getDmMessages(
  target: string,
  root: string,
  opts: { limit?: number; match?: (message: WorkspaceMessage) => boolean } = {},
): WorkspaceMessage[] {
  const path = getDmPath(target, root)
  if (typeof opts.limit === "number") {
    return opts.match
      ? readLastMatchingJsonLines<WorkspaceMessage>(path, opts.limit, opts.match)
      : readLastJsonLines<WorkspaceMessage>(path, opts.limit)
  }

  const parsed = parseJsonLines<WorkspaceMessage>(path)
  return opts.match ? parsed.filter(opts.match) : parsed
}

export function getSystemMessages(
  root: string,
  opts: { limit?: number } = {},
): WorkspaceMessage[] {
  const path = getSystemPath(root)
  return typeof opts.limit === "number"
    ? readLastJsonLines<WorkspaceMessage>(path, opts.limit)
    : parseJsonLines<WorkspaceMessage>(path)
}

export function getRecentMessages(
  limit: number = 300,
  root: string,
): WorkspaceMessage[] {
  if (limit <= 0) return []

  const index = loadIndex(root)
  const messages: WorkspaceMessage[] = []
  const useTailReads = limit <= 2_000

  for (const channel of index.channels) {
    messages.push(...getChannelMessages(channel.name, root, useTailReads ? { limit } : {}))
  }

  for (const dm of index.dms) {
    messages.push(...getDmMessages(dm.target, root, useTailReads ? { limit } : {}))
  }

  messages.push(...getSystemMessages(root, useTailReads ? { limit } : {}))

  messages.sort((a, b) => a.ts - b.ts)
  return messages.slice(-limit)
}

export function getChannels(root: string): Array<{
  name: string
  count: number
  lastTs: number
}> {
  const index = loadIndex(root)
  return index.channels
}

export function getDmThreads(root: string): Array<{
  target: string
  count: number
  lastTs: number
}> {
  const index = loadIndex(root)
  return index.dms
}

export function getMessageIndex(root: string): MessageIndex {
  return loadIndex(root)
}
