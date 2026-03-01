import { a as loadWorkspaceSnapshot } from "../../../../../chunks/workspace.js";
import { r as resolveProjectContext } from "../../../../../chunks/hub.js";
import { s as subscribeHubChanges, a as subscribeProjectChanges, b as subscribeMessageChanges } from "../../../../../chunks/message-watcher.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
class WorkspaceDeltaComputer {
  lastSnapshot = null;
  /**
   * Load current workspace state efficiently
   */
  loadWorkspaceState(root) {
    const storageDir = join(root, ".termlings", "store", "messages");
    const messagesState = {
      messageIds: /* @__PURE__ */ new Set(),
      channels: /* @__PURE__ */ new Set(),
      dms: /* @__PURE__ */ new Set()
    };
    if (existsSync(storageDir)) {
      try {
        const channelsDir = join(storageDir, "channels");
        if (existsSync(channelsDir)) {
          const fs = require("fs");
          for (const file of fs.readdirSync(channelsDir)) {
            if (file.endsWith(".jsonl")) {
              const channel = file.replace(".jsonl", "");
              messagesState.channels.add(channel);
              const content = readFileSync(join(channelsDir, file), "utf8");
              for (const line of content.split("\n")) {
                if (line.trim()) {
                  try {
                    const msg = JSON.parse(line);
                    messagesState.messageIds.add(msg.id);
                  } catch {
                  }
                }
              }
            }
          }
        }
        const dmsDir = join(storageDir, "dms");
        if (existsSync(dmsDir)) {
          const fs = require("fs");
          for (const file of fs.readdirSync(dmsDir)) {
            if (file.endsWith(".jsonl")) {
              const target = file.replace(".jsonl", "");
              messagesState.dms.add(target);
              const content = readFileSync(join(dmsDir, file), "utf8");
              for (const line of content.split("\n")) {
                if (line.trim()) {
                  try {
                    const msg = JSON.parse(line);
                    messagesState.messageIds.add(msg.id);
                  } catch {
                  }
                }
              }
            }
          }
        }
      } catch {
      }
    }
    return messagesState;
  }
  /**
   * Compute deltas from changed channels/DMs
   */
  computeDeltas(root, changes) {
    const deltas = [];
    const now = Date.now();
    const newState = this.loadWorkspaceState(root);
    if (!this.lastSnapshot) {
      this.lastSnapshot = {
        ...newState,
        taskIds: /* @__PURE__ */ new Set(),
        eventIds: /* @__PURE__ */ new Set(),
        sessionIds: /* @__PURE__ */ new Set()
      };
      return [];
    }
    for (const channel of newState.channels) {
      if (!this.lastSnapshot.channels.has(channel)) {
        deltas.push({
          type: "channel.created",
          timestamp: now,
          data: { name: channel }
        });
      }
    }
    for (const dm of newState.dms) {
      if (!this.lastSnapshot.dms.has(dm)) {
        deltas.push({
          type: "dm.created",
          timestamp: now,
          data: { target: dm }
        });
      }
    }
    const storageDir = join(root, ".termlings", "store", "messages");
    require("fs");
    for (const channel of changes.channels) {
      const channelPath = join(storageDir, "channels", `${channel}.jsonl`);
      if (existsSync(channelPath)) {
        try {
          const content = readFileSync(channelPath, "utf8");
          const lines = content.split("\n").filter((l) => l.trim());
          const recentLines = lines.slice(-20);
          for (const line of recentLines) {
            try {
              const msg = JSON.parse(line);
              if (!this.lastSnapshot.messageIds.has(msg.id)) {
                deltas.push({
                  type: "message.added",
                  timestamp: msg.ts,
                  data: msg
                });
                this.lastSnapshot.messageIds.add(msg.id);
              }
            } catch {
            }
          }
        } catch {
        }
      }
    }
    for (const dm of changes.dms) {
      const dmPath = join(storageDir, "dms", `${dm}.jsonl`);
      if (existsSync(dmPath)) {
        try {
          const content = readFileSync(dmPath, "utf8");
          const lines = content.split("\n").filter((l) => l.trim());
          const recentLines = lines.slice(-20);
          for (const line of recentLines) {
            try {
              const msg = JSON.parse(line);
              if (!this.lastSnapshot.messageIds.has(msg.id)) {
                deltas.push({
                  type: "message.added",
                  timestamp: msg.ts,
                  data: msg
                });
                this.lastSnapshot.messageIds.add(msg.id);
              }
            } catch {
            }
          }
        } catch {
        }
      }
    }
    this.lastSnapshot = {
      ...newState,
      taskIds: /* @__PURE__ */ new Set(),
      eventIds: /* @__PURE__ */ new Set(),
      sessionIds: /* @__PURE__ */ new Set()
    };
    return deltas;
  }
  /**
   * Reset snapshot for next comparison
   */
  reset() {
    this.lastSnapshot = null;
  }
}
const deltaComputers = /* @__PURE__ */ new Map();
const GET = ({ request, url }) => {
  const requestedProject = url.searchParams.get("project") ?? void 0;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let watchedProjectRoot = "";
      let unsubscribeProject = null;
      let unsubscribeHub = null;
      let unsubscribeMessages = null;
      const sendInitialSnapshot = () => {
        if (closed) return;
        const context = resolveProjectContext(requestedProject);
        const snapshot = loadWorkspaceSnapshot(context.projectRoot);
        const payload = {
          type: "snapshot",
          snapshot,
          projects: context.projects,
          activeProjectId: context.activeProjectId,
          timestamp: Date.now()
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}

`));
      };
      const sendDeltas = (changes) => {
        if (closed) return;
        const context = resolveProjectContext(requestedProject);
        const key = context.projectRoot;
        if (!deltaComputers.has(key)) {
          deltaComputers.set(key, new WorkspaceDeltaComputer());
        }
        const computer = deltaComputers.get(key);
        const deltas = computer.computeDeltas(context.projectRoot, changes);
        for (const delta of deltas) {
          if (closed) return;
          const payload = {
            type: "delta",
            delta,
            timestamp: delta.timestamp
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}

`));
        }
      };
      const setupWatchers = () => {
        const context = resolveProjectContext(requestedProject);
        if (context.projectRoot !== watchedProjectRoot) {
          watchedProjectRoot = context.projectRoot;
          if (unsubscribeProject) unsubscribeProject();
          if (unsubscribeMessages) unsubscribeMessages();
          unsubscribeProject = subscribeProjectChanges(
            context.projectRoot,
            () => sendInitialSnapshot()
          );
          unsubscribeMessages = subscribeMessageChanges(context.projectRoot, sendDeltas);
        }
      };
      setupWatchers();
      sendInitialSnapshot();
      unsubscribeHub = subscribeHubChanges(() => {
        setupWatchers();
        sendInitialSnapshot();
      });
      const onAbort = () => {
        closed = true;
        if (unsubscribeProject) unsubscribeProject();
        if (unsubscribeHub) unsubscribeHub();
        if (unsubscribeMessages) unsubscribeMessages();
        try {
          controller.close();
        } catch {
        }
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
    },
    cancel() {
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
export {
  GET
};
