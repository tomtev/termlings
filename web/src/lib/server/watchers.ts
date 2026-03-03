import { watch, type FSWatcher } from "fs"
import { homedir } from "os"
import { join, resolve } from "path"

type Listener = () => void

interface ManagedWatcher {
  listeners: Set<Listener>
  fsWatchers: FSWatcher[]
  debounceTimer: ReturnType<typeof setTimeout> | null
}

const projectWatchers = new Map<string, ManagedWatcher>()
let hubWatcher: ManagedWatcher | null = null

function notifyManaged(watcher: ManagedWatcher): void {
  if (watcher.debounceTimer) {
    clearTimeout(watcher.debounceTimer)
  }
  watcher.debounceTimer = setTimeout(() => {
    watcher.debounceTimer = null
    for (const listener of watcher.listeners) {
      try {
        listener()
      } catch {}
    }
  }, 25)
}

function addFsWatcher(targetPath: string, managed: ManagedWatcher, recursive = false): boolean {
  try {
    const watcher = watch(targetPath, { recursive }, () => {
      notifyManaged(managed)
    })
    managed.fsWatchers.push(watcher)
    return true
  } catch {
    return false
  }
}

function closeManaged(watcher: ManagedWatcher): void {
  if (watcher.debounceTimer) {
    clearTimeout(watcher.debounceTimer)
    watcher.debounceTimer = null
  }
  for (const fsWatcher of watcher.fsWatchers) {
    try {
      fsWatcher.close()
    } catch {}
  }
  watcher.fsWatchers = []
}

function createProjectManagedWatcher(projectRoot: string): ManagedWatcher {
  const managed: ManagedWatcher = {
    listeners: new Set<Listener>(),
    fsWatchers: [],
    debounceTimer: null,
  }

  const root = resolve(projectRoot)
  const termlingsRoot = join(root, ".termlings")

  // Fastest path on macOS/Windows: recursive watch from project root.
  const rootRecursive = addFsWatcher(root, managed, true)
  if (rootRecursive) {
    return managed
  }

  // Fallback on platforms without recursive support.
  // Detect .termlings directory creation/removal and top-level changes.
  addFsWatcher(root, managed, false)

  // Fast path: recursive watch on supported platforms.
  const recursive = addFsWatcher(termlingsRoot, managed, true)
  if (!recursive) {
    // Fallback path for platforms without recursive watch support.
    addFsWatcher(termlingsRoot, managed, false)
    addFsWatcher(join(termlingsRoot, "sessions"), managed, false)
    addFsWatcher(join(termlingsRoot, "store"), managed, false)
    addFsWatcher(join(termlingsRoot, "store", "tasks"), managed, false)
    addFsWatcher(join(termlingsRoot, "store", "calendar"), managed, false)
  }

  return managed
}

function getOrCreateProjectWatcher(projectRoot: string): ManagedWatcher {
  const key = resolve(projectRoot)
  const existing = projectWatchers.get(key)
  if (existing) return existing

  const created = createProjectManagedWatcher(key)
  projectWatchers.set(key, created)
  return created
}

export function subscribeProjectChanges(projectRoot: string, listener: Listener): () => void {
  const key = resolve(projectRoot)
  const managed = getOrCreateProjectWatcher(key)
  managed.listeners.add(listener)

  return () => {
    const current = projectWatchers.get(key)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size > 0) return
    closeManaged(current)
    projectWatchers.delete(key)
  }
}

function getOrCreateHubWatcher(): ManagedWatcher {
  if (hubWatcher) return hubWatcher

  const managed: ManagedWatcher = {
    listeners: new Set<Listener>(),
    fsWatchers: [],
    debounceTimer: null,
  }

  const hubRoot = join(homedir(), ".termlings", "hub")
  addFsWatcher(hubRoot, managed, false)

  hubWatcher = managed
  return managed
}

export function subscribeHubChanges(listener: Listener): () => void {
  const managed = getOrCreateHubWatcher()
  managed.listeners.add(listener)

  return () => {
    const current = hubWatcher
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size > 0) return
    closeManaged(current)
    hubWatcher = null
  }
}
