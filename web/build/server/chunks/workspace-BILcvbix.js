import { readdirSync, unlinkSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve, basename } from 'path';

const SESSION_STALE_MS = 35e3;
const HOOK_TYPING_STALE_MS = 8e3;
function defaultProjectRoot() {
  if (process.env.TERMLINGS_PROJECT_ROOT) {
    return resolve(process.env.TERMLINGS_PROJECT_ROOT);
  }
  const cwd = process.cwd();
  if (basename(cwd) === "web") {
    return resolve(cwd, "..");
  }
  return resolve(cwd);
}
function projectRoot(root) {
  return root ? resolve(root) : defaultProjectRoot();
}
function termlingsDir(root) {
  return join(projectRoot(root), ".termlings");
}
function sessionsDir(root) {
  return join(termlingsDir(root), "sessions");
}
function agentsDir(root) {
  return join(termlingsDir(root), "agents");
}
function storeDir(root) {
  return join(termlingsDir(root), "store");
}
function workspaceMetaPath(root) {
  return join(termlingsDir(root), "workspace.json");
}
function messageStorageDir(root) {
  return join(storeDir(root), "messages");
}
function messageIndexPath(root) {
  return join(messageStorageDir(root), "index.json");
}
function inboxPath(sessionId, root) {
  return join(termlingsDir(root), `${sessionId}.msg.json`);
}
function tasksPath(root) {
  return join(storeDir(root), "tasks", "tasks.json");
}
function calendarPath(root) {
  return join(storeDir(root), "calendar", "calendar.json");
}
function typingPath(sessionId, root) {
  return join(termlingsDir(root), `${sessionId}.typing.json`);
}
function safeReadJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}
function safeReadJsonLines(filePath) {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, "utf8").split("\n").map((line) => line.trim()).filter((line) => line.length > 0).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
function loadRecentMessages(limit = 300, root) {
  const storageDir = messageStorageDir(root);
  const messages = [];
  if (existsSync(storageDir)) {
    const indexPath = messageIndexPath(root);
    const index = safeReadJson(indexPath, {});
    const channelsDir = join(storageDir, "channels");
    if (existsSync(channelsDir)) {
      const channelLimit = Math.ceil(limit * 0.6 / Math.max(index.channels?.length || 1));
      for (const file of readdirSync(channelsDir)) {
        if (!file.endsWith(".jsonl")) continue;
        const channelMsgs = safeReadJsonLines(join(channelsDir, file));
        if (channelMsgs.length > channelLimit) {
          messages.push(...channelMsgs.slice(-channelLimit));
        } else {
          messages.push(...channelMsgs);
        }
      }
    }
    const dmsDir = join(storageDir, "dms");
    if (existsSync(dmsDir)) {
      const dmLimit = Math.ceil(limit * 0.4 / Math.max(index.dms?.length || 1));
      for (const file of readdirSync(dmsDir)) {
        if (!file.endsWith(".jsonl")) continue;
        const dmMsgs = safeReadJsonLines(join(dmsDir, file));
        if (dmMsgs.length > dmLimit) {
          messages.push(...dmMsgs.slice(-dmLimit));
        } else {
          messages.push(...dmMsgs);
        }
      }
    }
    const systemPath = join(storageDir, "system.jsonl");
    if (existsSync(systemPath)) {
      const sysMsgs = safeReadJsonLines(systemPath);
      messages.push(...sysMsgs.slice(-Math.ceil(limit * 0.1)));
    }
  }
  messages.sort((a, b) => a.ts - b.ts);
  return messages.slice(-limit);
}
function normalizeSession(raw, fallbackSessionId) {
  if (!raw || typeof raw !== "object") return null;
  const hasPresenceTimestamps = typeof raw.joinedAt === "number" || typeof raw.lastSeenAt === "number";
  if (!hasPresenceTimestamps) return null;
  const now = Date.now();
  return {
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : fallbackSessionId,
    name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : fallbackSessionId,
    dna: typeof raw.dna === "string" && raw.dna.length > 0 ? raw.dna : "0000000",
    joinedAt: typeof raw.joinedAt === "number" ? raw.joinedAt : now,
    lastSeenAt: typeof raw.lastSeenAt === "number" ? raw.lastSeenAt : now
  };
}
function parseSoul(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/);
  if (!frontmatterMatch) return null;
  const yaml = frontmatterMatch[1] || "";
  const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const dna = yaml.match(/^dna:\s*(.+)$/m)?.[1]?.trim();
  const title = yaml.match(/^title:\s*(.+)$/m)?.[1]?.trim();
  if (!name || !dna) return null;
  return { name, dna, title };
}
function listSavedAgents(root) {
  const currentRoot = projectRoot(root);
  const base = agentsDir(currentRoot);
  if (!existsSync(base)) return [];
  const saved = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const soulPath = join(base, entry.name, "SOUL.md");
    if (!existsSync(soulPath)) continue;
    try {
      const content = readFileSync(soulPath, "utf8");
      const parsed = parseSoul(content);
      if (!parsed) continue;
      saved.push({
        agentId: entry.name,
        name: parsed.name,
        dna: parsed.dna,
        title: parsed.title
      });
    } catch {
    }
  }
  saved.sort((a, b) => a.name.localeCompare(b.name));
  return saved;
}
function mergeAgentPresence(savedAgents, sessions, activityBySessionId) {
  const byDna = /* @__PURE__ */ new Map();
  for (const agent of savedAgents) {
    byDna.set(agent.dna, {
      id: `saved:${agent.agentId}`,
      agentId: agent.agentId,
      name: agent.name,
      dna: agent.dna,
      title: agent.title,
      online: false,
      typing: false,
      sessionIds: [],
      source: "saved"
    });
  }
  for (const session of sessions) {
    const activity = activityBySessionId.get(session.sessionId);
    const existing = byDna.get(session.dna);
    if (existing) {
      existing.online = true;
      if (activity?.typing) {
        existing.typing = true;
        existing.activitySource = activity.source;
      }
      if (!existing.sessionIds.includes(session.sessionId)) {
        existing.sessionIds.push(session.sessionId);
      }
      continue;
    }
    byDna.set(session.dna, {
      id: `online:${session.sessionId}`,
      name: session.name,
      dna: session.dna,
      online: true,
      typing: activity?.typing ?? false,
      activitySource: activity?.source,
      sessionIds: [session.sessionId],
      source: "ephemeral"
    });
  }
  return Array.from(byDna.values()).sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
function resolveHookTyping(sessionId, root) {
  const direct = safeReadJson(typingPath(sessionId, root), null);
  if (direct && typeof direct.typing === "boolean") {
    return {
      typing: direct.typing,
      updatedAt: typeof direct.updatedAt === "number" ? direct.updatedAt : 0
    };
  }
  return null;
}
function collectSessionActivity(sessions, root) {
  const bySessionId = /* @__PURE__ */ new Map();
  const now = Date.now();
  let maxUpdatedAt = 0;
  for (const session of sessions) {
    const hookTyping = resolveHookTyping(session.sessionId, root);
    const hookUpdatedAt = hookTyping?.updatedAt ?? 0;
    const hookFresh = hookUpdatedAt > 0 && now - hookUpdatedAt <= HOOK_TYPING_STALE_MS;
    const hookTypingActive = hookFresh && hookTyping?.typing === true;
    let typing = false;
    let source;
    if (hookTypingActive) {
      typing = true;
      source = "hook";
    }
    const updatedAt = hookUpdatedAt;
    bySessionId.set(session.sessionId, { typing, source, updatedAt });
    if (updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;
  }
  return { bySessionId, updatedAt: maxUpdatedAt };
}
function ensureWorkspace(root) {
  const currentRoot = projectRoot(root);
  const base = termlingsDir(currentRoot);
  mkdirSync(base, { recursive: true });
  mkdirSync(join(base, "agents"), { recursive: true });
  mkdirSync(join(base, "objects"), { recursive: true });
  mkdirSync(sessionsDir(currentRoot), { recursive: true });
  mkdirSync(storeDir(currentRoot), { recursive: true });
  if (!existsSync(workspaceMetaPath(currentRoot))) {
    const now = Date.now();
    const meta = {
      version: 1,
      projectName: basename(currentRoot),
      createdAt: now,
      updatedAt: now
    };
    writeFileSync(workspaceMetaPath(currentRoot), JSON.stringify(meta, null, 2) + "\n");
  }
}
function touchWorkspace(root) {
  const currentRoot = projectRoot(root);
  const meta = safeReadJson(workspaceMetaPath(currentRoot), {
    version: 1,
    projectName: basename(currentRoot),
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  meta.updatedAt = Date.now();
  writeFileSync(workspaceMetaPath(currentRoot), JSON.stringify(meta, null, 2) + "\n");
}
function upsertWorkspaceSession(input, root) {
  const currentRoot = projectRoot(root);
  ensureWorkspace(currentRoot);
  const path = join(sessionsDir(currentRoot), `${input.sessionId}.json`);
  const existing = safeReadJson(path, null);
  const now = Date.now();
  const session = {
    sessionId: input.sessionId,
    name: input.name,
    dna: input.dna,
    joinedAt: existing?.joinedAt ?? now,
    lastSeenAt: now
  };
  writeFileSync(path, JSON.stringify(session, null, 2) + "\n");
  touchWorkspace(currentRoot);
  return session;
}
function removeWorkspaceSession(sessionId, root) {
  const currentRoot = projectRoot(root);
  const path = join(sessionsDir(currentRoot), `${sessionId}.json`);
  try {
    unlinkSync(path);
  } catch {
  }
  touchWorkspace(currentRoot);
}
function listSessions(root) {
  const currentRoot = projectRoot(root);
  ensureWorkspace(currentRoot);
  const sessions = [];
  const now = Date.now();
  for (const file of readdirSync(sessionsDir(currentRoot))) {
    if (!file.endsWith(".json")) continue;
    const sessionRaw = safeReadJson(join(sessionsDir(currentRoot), file), null);
    const normalized = normalizeSession(sessionRaw, file.slice(0, -".json".length));
    if (!normalized) continue;
    if (now - normalized.lastSeenAt > SESSION_STALE_MS) {
      try {
        unlinkSync(join(sessionsDir(currentRoot), file));
      } catch {
      }
      continue;
    }
    sessions.push(normalized);
  }
  sessions.sort((a, b) => a.joinedAt - b.joinedAt);
  return sessions;
}
function loadWorkspaceSnapshot(root) {
  const currentRoot = projectRoot(root);
  ensureWorkspace(currentRoot);
  const meta = safeReadJson(workspaceMetaPath(currentRoot), null);
  const sessions = listSessions(currentRoot);
  const activity = collectSessionActivity(sessions, currentRoot);
  const agents = mergeAgentPresence(listSavedAgents(currentRoot), sessions, activity.bySessionId);
  const messages = loadRecentMessages(300, currentRoot);
  const indexPath = messageIndexPath(currentRoot);
  const index = safeReadJson(indexPath, { channels: [], dms: [] });
  const channels = index.channels ?? [];
  const dmThreads = index.dms ?? [];
  const tasks = safeReadJson(tasksPath(currentRoot), []);
  const calendarEvents = safeReadJson(calendarPath(currentRoot), []);
  return {
    meta,
    sessions,
    agents,
    messages,
    channels,
    dmThreads,
    tasks: tasks.slice(-200),
    calendarEvents,
    activityUpdatedAt: activity.updatedAt,
    generatedAt: Date.now()
  };
}
function postWorkspaceMessage(input, root) {
  const currentRoot = projectRoot(root);
  ensureWorkspace(currentRoot);
  const record = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now(),
    kind: input.kind,
    channel: input.channel,
    from: input.from,
    fromName: input.fromName,
    fromDna: input.fromDna,
    target: input.target,
    targetName: input.targetName,
    targetDna: input.targetDna,
    text: input.text
  };
  const storageDir = messageStorageDir(currentRoot);
  mkdirSync(storageDir, { recursive: true });
  let filePath;
  if (input.channel) {
    const channelsDir = join(storageDir, "channels");
    mkdirSync(channelsDir, { recursive: true });
    filePath = join(channelsDir, `${input.channel}.jsonl`);
  } else if (input.target) {
    const dmsDir = join(storageDir, "dms");
    mkdirSync(dmsDir, { recursive: true });
    filePath = join(dmsDir, `${input.target}.jsonl`);
  } else {
    filePath = join(storageDir, "system.jsonl");
  }
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  writeFileSync(filePath, `${existing}${JSON.stringify(record)}
`);
  if (input.channel || input.target) {
    const indexPath = messageIndexPath(currentRoot);
    const index = safeReadJson(
      indexPath,
      { channels: [], dms: [], updatedAt: Date.now() }
    );
    if (input.channel) {
      const existing2 = index.channels.find((c) => c.name === input.channel);
      if (existing2) {
        existing2.count++;
        existing2.lastTs = record.ts;
      } else {
        index.channels.push({
          name: input.channel,
          count: 1,
          lastTs: record.ts
        });
      }
    } else if (input.target) {
      const existing2 = index.dms.find((d) => d.target === input.target);
      if (existing2) {
        existing2.count++;
        existing2.lastTs = record.ts;
      } else {
        index.dms.push({
          target: input.target,
          count: 1,
          lastTs: record.ts
        });
      }
    }
    index.updatedAt = Date.now();
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }
  if (record.kind === "dm" && record.target) {
    const inboxFile = inboxPath(record.target, currentRoot);
    const inbox = safeReadJson(inboxFile, []);
    inbox.push({
      from: record.from,
      fromName: record.fromName,
      text: record.text,
      ts: record.ts
    });
    writeFileSync(inboxFile, JSON.stringify(inbox) + "\n");
  }
  touchWorkspace(currentRoot);
  return record;
}

export { listSessions as a, loadWorkspaceSnapshot as l, postWorkspaceMessage as p, removeWorkspaceSession as r, upsertWorkspaceSession as u };
//# sourceMappingURL=workspace-BILcvbix.js.map
