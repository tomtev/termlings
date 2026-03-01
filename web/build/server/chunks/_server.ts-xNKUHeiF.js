import { l as loadWorkspaceSnapshot } from './workspace-BILcvbix.js';
import { r as resolveProjectContext } from './hub-BHhrJYhI.js';
import { watch } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import 'crypto';

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
const GET = ({ request, url }) => {
  const requestedProject = url.searchParams.get("project") ?? void 0;
  const encoder = new TextEncoder();
  let heartbeat = null;
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let watchedProjectRoot = "";
      let unsubscribeProject = null;
      let unsubscribeHub = null;
      let sendScheduled = false;
      const scheduleSend = () => {
        if (closed || sendScheduled) return;
        sendScheduled = true;
        queueMicrotask(() => {
          sendScheduled = false;
          sendUpdate();
        });
      };
      const sendUpdate = () => {
        if (closed) return;
        const context = resolveProjectContext(requestedProject);
        if (context.projectRoot !== watchedProjectRoot) {
          watchedProjectRoot = context.projectRoot;
          if (unsubscribeProject) unsubscribeProject();
          unsubscribeProject = subscribeProjectChanges(context.projectRoot, scheduleSend);
        }
        const snapshot = loadWorkspaceSnapshot(context.projectRoot);
        const payload = {
          snapshot,
          projects: context.projects,
          activeProjectId: context.activeProjectId
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}

`));
      };
      unsubscribeHub = subscribeHubChanges(scheduleSend);
      sendUpdate();
      heartbeat = setInterval(sendUpdate, 1e3);
      const onAbort = () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribeProject) unsubscribeProject();
        if (unsubscribeHub) unsubscribeHub();
        try {
          controller.close();
        } catch {
        }
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
    }
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream"
    }
  });
};

export { GET };
//# sourceMappingURL=_server.ts-xNKUHeiF.js.map
