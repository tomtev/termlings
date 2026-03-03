/**
 * Super smart message watcher - tracks only changed channels/DMs
 *
 * Optimizations:
 * - Only triggers on .jsonl/.json files (ignores temp/lock files)
 * - Tracks which channels/DMs changed
 * - Batches updates by channel/thread
 * - Adaptive debouncing based on change frequency
 * - Zero overhead for unrelated file changes
 */

import { watch, type FSWatcher } from "fs"
import { join, resolve, basename } from "path"

type MessageWatcherListener = (changes: {
  channels: Set<string>
  dms: Set<string>
  indexChanged: boolean
}) => void

interface SmartWatcher {
  listeners: Set<MessageWatcherListener>
  fsWatcher: FSWatcher | null
  debounceTimer: ReturnType<typeof setTimeout> | null
  pendingChanges: {
    channels: Set<string>
    dms: Set<string>
    indexChanged: boolean
  }
  lastChangeTime: number
  changeCount: number
}

const projectMessageWatchers = new Map<string, SmartWatcher>()

/**
 * Parse which channel/DM changed from file path
 * Examples:
 *   .termlings/store/messages/channels/general.jsonl → {type: 'channel', name: 'general'}
 *   .termlings/store/messages/dms/agent-abc.jsonl → {type: 'dm', name: 'agent-abc'}
 *   .termlings/store/messages/index.json → {type: 'index'}
 */
function parseMessageFilePath(filePath: string): {
  type: "channel" | "dm" | "index" | "ignored"
  name?: string
} {
  const normalized = filePath.replace(/\\/g, "/")

  // Skip temp/lock files
  if (
    normalized.endsWith(".swp") ||
    normalized.endsWith(".tmp") ||
    normalized.endsWith("~") ||
    normalized.includes(".git") ||
    normalized.includes("node_modules")
  ) {
    return { type: "ignored" }
  }

  // Check index.json
  if (normalized.endsWith("store/messages/index.json")) {
    return { type: "index" }
  }

  // Check channels
  const channelMatch = normalized.match(/store\/messages\/channels\/([^/]+)\.jsonl$/)
  if (channelMatch) {
    return { type: "channel", name: channelMatch[1] }
  }

  // Check DMs
  const dmMatch = normalized.match(/store\/messages\/dms\/([^/]+)\.jsonl$/)
  if (dmMatch) {
    return { type: "dm", name: dmMatch[1] }
  }

  return { type: "ignored" }
}

/**
 * Adaptive debounce: shorter delays for bursty changes, longer for sparse
 */
function getAdaptiveDebounce(changeCount: number): number {
  if (changeCount > 10) return 25    // Very bursty: batch aggressively
  if (changeCount > 5) return 50     // Moderate burst
  if (changeCount > 2) return 75     // A few changes
  return 100                          // Single/rare changes
}

function notifySmart(watcher: SmartWatcher): void {
  if (watcher.debounceTimer) {
    clearTimeout(watcher.debounceTimer)
  }

  const now = Date.now()
  const timeSinceLastChange = now - watcher.lastChangeTime
  watcher.lastChangeTime = now
  watcher.changeCount++

  // Adaptive debounce based on change pattern
  const debounceMs = getAdaptiveDebounce(watcher.changeCount)

  watcher.debounceTimer = setTimeout(() => {
    watcher.debounceTimer = null
    watcher.changeCount = 0

    // Notify all listeners with what changed
    const changes = {
      channels: new Set(watcher.pendingChanges.channels),
      dms: new Set(watcher.pendingChanges.dms),
      indexChanged: watcher.pendingChanges.indexChanged,
    }

    // Clear pending
    watcher.pendingChanges.channels.clear()
    watcher.pendingChanges.dms.clear()
    watcher.pendingChanges.indexChanged = false

    // Notify listeners
    for (const listener of watcher.listeners) {
      try {
        listener(changes)
      } catch (err) {
        console.error("Message watcher listener error:", err)
      }
    }
  }, debounceMs)
}

function createSmartMessageWatcher(
  projectRoot: string,
): SmartWatcher {
  const watcher: SmartWatcher = {
    listeners: new Set(),
    fsWatcher: null,
    debounceTimer: null,
    pendingChanges: {
      channels: new Set(),
      dms: new Set(),
      indexChanged: false,
    },
    lastChangeTime: 0,
    changeCount: 0,
  }

  const messagesDir = resolve(join(projectRoot, ".termlings", "store", "messages"))

  try {
    watcher.fsWatcher = watch(messagesDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return

      const filePath = join(messagesDir, filename)
      const change = parseMessageFilePath(filePath)

      // Ignore irrelevant changes
      if (change.type === "ignored") return

      // Track what changed
      if (change.type === "index") {
        watcher.pendingChanges.indexChanged = true
      } else if (change.type === "channel" && change.name) {
        watcher.pendingChanges.channels.add(change.name)
      } else if (change.type === "dm" && change.name) {
        watcher.pendingChanges.dms.add(change.name)
      }

      // Notify with batching & adaptive debounce
      notifySmart(watcher)
    })
  } catch (err) {
    console.error("Failed to create message watcher:", err)
  }

  return watcher
}

function getOrCreateSmartWatcher(
  projectRoot: string,
): SmartWatcher {
  const key = resolve(projectRoot)
  const existing = projectMessageWatchers.get(key)
  if (existing) return existing

  const created = createSmartMessageWatcher(key)
  projectMessageWatchers.set(key, created)
  return created
}

function closeSmartWatcher(watcher: SmartWatcher): void {
  if (watcher.debounceTimer) {
    clearTimeout(watcher.debounceTimer)
    watcher.debounceTimer = null
  }
  if (watcher.fsWatcher) {
    try {
      watcher.fsWatcher.close()
    } catch {}
    watcher.fsWatcher = null
  }
  watcher.listeners.clear()
  watcher.pendingChanges.channels.clear()
  watcher.pendingChanges.dms.clear()
}

/**
 * Subscribe to message storage changes
 * Listener receives {channels, dms, indexChanged} showing what actually changed
 */
export function subscribeMessageChanges(
  projectRoot: string,
  listener: MessageWatcherListener,
): () => void {
  const key = resolve(projectRoot)
  const watcher = getOrCreateSmartWatcher(key)
  watcher.listeners.add(listener)

  return () => {
    const current = projectMessageWatchers.get(key)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size > 0) return
    closeSmartWatcher(current)
    projectMessageWatchers.delete(key)
  }
}
