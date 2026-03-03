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
  readFileSync,
  writeFileSync,
} from "fs"
import { join } from "path"

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

function parseJsonLines<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return []
  try {
    const raw = readFileSync(filePath, "utf8")
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as T)
  } catch {
    return []
  }
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
}

export function appendMessage(
  message: Omit<WorkspaceMessage, "id" | "ts"> & { id?: string; ts?: number },
  root: string,
): WorkspaceMessage {
  ensureMessageDirs(root)

  const record: WorkspaceMessage = {
    id: message.id ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    ts: message.ts ?? Date.now(),
    kind: message.kind,
    from: message.from,
    fromName: message.fromName,
    fromDna: message.fromDna,
    target: message.target,
    targetName: message.targetName,
    targetDna: message.targetDna,
    text: message.text,
    channel: message.channel,
  }

  const filePath = getMessageFilePath(root, message.channel, message.target)
  appendFileSync(filePath, JSON.stringify(record) + "\n")

  updateIndex(root, message.channel, message.target, record.ts)

  return record
}

export function getChannelMessages(channel: string, root: string): WorkspaceMessage[] {
  return parseJsonLines<WorkspaceMessage>(getChannelPath(channel, root))
}

export function getDmMessages(target: string, root: string): WorkspaceMessage[] {
  return parseJsonLines<WorkspaceMessage>(getDmPath(target, root))
}

export function getSystemMessages(root: string): WorkspaceMessage[] {
  return parseJsonLines<WorkspaceMessage>(getSystemPath(root))
}

export function getRecentMessages(
  limit: number = 300,
  root: string,
): WorkspaceMessage[] {
  const index = loadIndex(root)
  const messages: WorkspaceMessage[] = []

  // Load all indexed channel messages and trim globally after merge.
  for (const channel of index.channels) {
    messages.push(...getChannelMessages(channel.name, root))
  }

  // Load all indexed DM messages and trim globally after merge.
  for (const dm of index.dms) {
    messages.push(...getDmMessages(dm.target, root))
  }

  // Include system events alongside chat/DM entries.
  messages.push(...getSystemMessages(root))

  // Sort by timestamp and return recent globally.
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
