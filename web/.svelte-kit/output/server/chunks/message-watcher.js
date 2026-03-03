import { watch } from "fs";
import { homedir } from "os";
import { resolve, join } from "path";
const projectWatchers = /* @__PURE__ */ new Map();
let hubWatcher = null;
function notifyManaged(watcher) {
  if (watcher.debounceTimer) {
    clearTimeout(watcher.debounceTimer);
  }
  watcher.debounceTimer = setTimeout(() => {
    watcher.debounceTimer = null;
    for (const listener of watcher.listeners) {
      try {
        listener();
      } catch {
      }
    }
  }, 25);
}
function addFsWatcher(targetPath, managed, recursive = false) {
  try {
    const watcher = watch(targetPath, { recursive }, () => {
      notifyManaged(managed);
    });
    managed.fsWatchers.push(watcher);
    return true;
  } catch {
    return false;
  }
}
function closeManaged(watcher) {
  if (watcher.debounceTimer) {
    clearTimeout(watcher.debounceTimer);
    watcher.debounceTimer = null;
  }
  for (const fsWatcher of watcher.fsWatchers) {
    try {
      fsWatcher.close();
    } catch {
    }
  }
  watcher.fsWatchers = [];
}
function createProjectManagedWatcher(projectRoot) {
  const managed = {
    listeners: /* @__PURE__ */ new Set(),
    fsWatchers: [],
    debounceTimer: null
  };
  const root = resolve(projectRoot);
  const termlingsRoot = join(root, ".termlings");
  const rootRecursive = addFsWatcher(root, managed, true);
  if (rootRecursive) {
    return managed;
  }
  addFsWatcher(root, managed, false);
  const recursive = addFsWatcher(termlingsRoot, managed, true);
  if (!recursive) {
    addFsWatcher(termlingsRoot, managed, false);
    addFsWatcher(join(termlingsRoot, "sessions"), managed, false);
    addFsWatcher(join(termlingsRoot, "store"), managed, false);
    addFsWatcher(join(termlingsRoot, "store", "tasks"), managed, false);
    addFsWatcher(join(termlingsRoot, "store", "calendar"), managed, false);
  }
  return managed;
}
function getOrCreateProjectWatcher(projectRoot) {
  const key = resolve(projectRoot);
  const existing = projectWatchers.get(key);
  if (existing) return existing;
  const created = createProjectManagedWatcher(key);
  projectWatchers.set(key, created);
  return created;
}
function subscribeProjectChanges(projectRoot, listener) {
  const key = resolve(projectRoot);
  const managed = getOrCreateProjectWatcher(key);
  managed.listeners.add(listener);
  return () => {
    const current = projectWatchers.get(key);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    closeManaged(current);
    projectWatchers.delete(key);
  };
}
function getOrCreateHubWatcher() {
  if (hubWatcher) return hubWatcher;
  const managed = {
    listeners: /* @__PURE__ */ new Set(),
    fsWatchers: [],
    debounceTimer: null
  };
  const hubRoot = join(homedir(), ".termlings", "hub");
  addFsWatcher(hubRoot, managed, false);
  hubWatcher = managed;
  return managed;
}
function subscribeHubChanges(listener) {
  const managed = getOrCreateHubWatcher();
  managed.listeners.add(listener);
  return () => {
    const current = hubWatcher;
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    closeManaged(current);
    hubWatcher = null;
  };
}
const projectMessageWatchers = /* @__PURE__ */ new Map();
function parseMessageFilePath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.endsWith(".swp") || normalized.endsWith(".tmp") || normalized.endsWith("~") || normalized.includes(".git") || normalized.includes("node_modules")) {
    return { type: "ignored" };
  }
  if (normalized.endsWith("store/messages/index.json")) {
    return { type: "index" };
  }
  const channelMatch = normalized.match(/store\/messages\/channels\/([^/]+)\.jsonl$/);
  if (channelMatch) {
    return { type: "channel", name: channelMatch[1] };
  }
  const dmMatch = normalized.match(/store\/messages\/dms\/([^/]+)\.jsonl$/);
  if (dmMatch) {
    return { type: "dm", name: dmMatch[1] };
  }
  return { type: "ignored" };
}
function getAdaptiveDebounce(changeCount) {
  if (changeCount > 10) return 25;
  if (changeCount > 5) return 50;
  if (changeCount > 2) return 75;
  return 100;
}
function notifySmart(watcher) {
  if (watcher.debounceTimer) {
    clearTimeout(watcher.debounceTimer);
  }
  const now = Date.now();
  now - watcher.lastChangeTime;
  watcher.lastChangeTime = now;
  watcher.changeCount++;
  const debounceMs = getAdaptiveDebounce(watcher.changeCount);
  watcher.debounceTimer = setTimeout(() => {
    watcher.debounceTimer = null;
    watcher.changeCount = 0;
    const changes = {
      channels: new Set(watcher.pendingChanges.channels),
      dms: new Set(watcher.pendingChanges.dms),
      indexChanged: watcher.pendingChanges.indexChanged
    };
    watcher.pendingChanges.channels.clear();
    watcher.pendingChanges.dms.clear();
    watcher.pendingChanges.indexChanged = false;
    for (const listener of watcher.listeners) {
      try {
        listener(changes);
      } catch (err) {
        console.error("Message watcher listener error:", err);
      }
    }
  }, debounceMs);
}
function createSmartMessageWatcher(projectRoot) {
  const watcher = {
    listeners: /* @__PURE__ */ new Set(),
    fsWatcher: null,
    debounceTimer: null,
    pendingChanges: {
      channels: /* @__PURE__ */ new Set(),
      dms: /* @__PURE__ */ new Set(),
      indexChanged: false
    },
    lastChangeTime: 0,
    changeCount: 0
  };
  const messagesDir = resolve(join(projectRoot, ".termlings", "store", "messages"));
  try {
    watcher.fsWatcher = watch(messagesDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const filePath = join(messagesDir, filename);
      const change = parseMessageFilePath(filePath);
      if (change.type === "ignored") return;
      if (change.type === "index") {
        watcher.pendingChanges.indexChanged = true;
      } else if (change.type === "channel" && change.name) {
        watcher.pendingChanges.channels.add(change.name);
      } else if (change.type === "dm" && change.name) {
        watcher.pendingChanges.dms.add(change.name);
      }
      notifySmart(watcher);
    });
  } catch (err) {
    console.error("Failed to create message watcher:", err);
  }
  return watcher;
}
function getOrCreateSmartWatcher(projectRoot) {
  const key = resolve(projectRoot);
  const existing = projectMessageWatchers.get(key);
  if (existing) return existing;
  const created = createSmartMessageWatcher(key);
  projectMessageWatchers.set(key, created);
  return created;
}
function closeSmartWatcher(watcher) {
  if (watcher.debounceTimer) {
    clearTimeout(watcher.debounceTimer);
    watcher.debounceTimer = null;
  }
  if (watcher.fsWatcher) {
    try {
      watcher.fsWatcher.close();
    } catch {
    }
    watcher.fsWatcher = null;
  }
  watcher.listeners.clear();
  watcher.pendingChanges.channels.clear();
  watcher.pendingChanges.dms.clear();
}
function subscribeMessageChanges(projectRoot, listener) {
  const key = resolve(projectRoot);
  const watcher = getOrCreateSmartWatcher(key);
  watcher.listeners.add(listener);
  return () => {
    const current = projectMessageWatchers.get(key);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    closeSmartWatcher(current);
    projectMessageWatchers.delete(key);
  };
}
export {
  subscribeProjectChanges as a,
  subscribeMessageChanges as b,
  subscribeHubChanges as s
};
