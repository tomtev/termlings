import { invoke } from '@tauri-apps/api/core';
import { derived, writable } from 'svelte/store';
import { activeProjectId } from './projects';

export interface SnapshotProjectRef {
  projectId: string;
  projectName: string;
}

export interface SnapshotMeta {
  version?: number;
  projectName?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface SnapshotSession {
  sessionId: string;
  name: string;
  dna: string;
  joinedAt: number;
  lastSeenAt: number;
  runtime?: string;
  launcherPid?: number;
  runtimePid?: number;
  runtimeSessionId?: string;
}

export interface SnapshotAgent {
  id: string;
  agentId?: string;
  name: string;
  dna: string;
  title?: string;
  title_short?: string;
  sort_order?: number;
  role?: string;
  online: boolean;
  typing: boolean;
  sessionIds: string[];
  source: 'saved' | 'ephemeral';
}

export interface SnapshotMessage {
  id: string;
  kind: 'chat' | 'dm' | 'system';
  channel?: string;
  from: string;
  fromName: string;
  fromDna?: string;
  target?: string;
  targetName?: string;
  targetDna?: string;
  text: string;
  ts: number;
}

export interface SnapshotChannel {
  name: string;
  count: number;
  lastTs: number;
}

export interface SnapshotDmThread {
  id: string;
  dna: string;
  slug?: string;
  label: string;
  online: boolean;
  typing: boolean;
  sort_order?: number;
}

export interface SnapshotTaskNote {
  by: string;
  byName: string;
  text: string;
  at: number;
}

export interface SnapshotTask {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'claimed' | 'in-progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  createdByName?: string;
  assignedTo?: string;
  assignedAt?: number;
  dueDate?: number;
  blockedOn?: string;
  blockedBy?: string[];
  notes: SnapshotTaskNote[];
}

export interface SnapshotCalendarEvent {
  id?: string;
  title?: string;
  startTime?: number;
  endTime?: number;
  agent?: string;
}

export interface SnapshotRequest {
  id: string;
  type: 'env' | 'confirm' | 'choice';
  status: 'pending' | 'resolved' | 'dismissed';
  from: string;
  fromName: string;
  fromSlug?: string;
  fromDna?: string;
  ts: number;
  varName?: string;
  reason?: string;
  url?: string;
  envScope?: string;
  question?: string;
  options?: string[];
  resolvedAt?: number;
  response?: string;
}

export interface SnapshotBrowserProcess {
  pid: number | null;
  port: number;
  status: 'running' | 'starting' | 'stopped';
  startedAt: number | null;
  url?: string;
  cdpWsUrl?: string;
  profilePath?: string;
  mode?: 'cdp';
}

export interface SnapshotBrowserProfile {
  name: string;
  location: string;
  projectName: string;
  createdAt: number;
  lastUsed?: number;
}

export interface SnapshotBrowserAgent {
  sessionId: string;
  agentName?: string;
  agentSlug?: string;
  agentDna?: string;
  tabId?: string;
  url?: string;
  status: 'active' | 'idle' | 'closed';
  active: boolean;
  startedAt: number;
  lastSeenAt: number;
  lastAction: string;
  lastActionAt: number;
  idleAt?: number;
  endedAt?: number;
  endReason?: 'idle' | 'closed';
}

export interface SnapshotBrowserOwner {
  ownerKey: string;
  tabId: string;
  updatedAt: number;
  sessionId?: string;
  agentSlug?: string;
  agentName?: string;
}

export interface SnapshotBrowserInvite {
  id: string;
  tabId: string;
  status: string;
  ownerAgentSlug?: string;
  ownerAgentName?: string;
  target: string;
  targetAgentSlug: string;
  targetAgentName?: string;
  acceptedByAgentSlug?: string;
  acceptedByAgentName?: string;
  tabTitle?: string;
  tabUrl?: string;
  updatedAt: number;
}

export interface SnapshotBrowserTab {
  id: string;
  targetId?: string;
  title?: string;
  url?: string;
  type?: string;
  active: boolean;
  owner?: SnapshotBrowserOwner;
  inviteCount: number;
}

export interface SnapshotBrowser {
  version: number;
  generatedAt: number;
  process: SnapshotBrowserProcess | null;
  profile: SnapshotBrowserProfile | null;
  agents: SnapshotBrowserAgent[];
  owners: SnapshotBrowserOwner[];
  invites: SnapshotBrowserInvite[];
  tabs: SnapshotBrowserTab[];
}

export interface ProjectOverviewSnapshot {
  apiVersion: string;
  project: SnapshotProjectRef;
  meta: SnapshotMeta | null;
  sessions: SnapshotSession[];
  agents: SnapshotAgent[];
  messages: SnapshotMessage[];
  channels: SnapshotChannel[];
  dmThreads: SnapshotDmThread[];
  tasks: SnapshotTask[];
  calendarEvents: SnapshotCalendarEvent[];
  requests: SnapshotRequest[];
  browser: SnapshotBrowser | null;
  activityUpdatedAt: number;
  generatedAt: number;
}

export interface ProjectOverviewState {
  snapshot: ProjectOverviewSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  loadedAt: number | null;
}

const EMPTY_STATE: ProjectOverviewState = {
  snapshot: null,
  loading: false,
  refreshing: false,
  error: null,
  loadedAt: null,
};

export const projectOverviewByProject = writable<Map<string, ProjectOverviewState>>(new Map());

export const currentProjectOverview = derived(
  [projectOverviewByProject, activeProjectId],
  ([$projectOverviewByProject, $activeProjectId]) => {
    if (!$activeProjectId) {
      return EMPTY_STATE;
    }
    return $projectOverviewByProject.get($activeProjectId) ?? EMPTY_STATE;
  },
);

export function clearProjectOverview(projectId?: string) {
  if (!projectId) {
    projectOverviewByProject.set(new Map());
    return;
  }

  projectOverviewByProject.update((state) => {
    const next = new Map(state);
    next.delete(projectId);
    return next;
  });
}

export async function loadProjectOverview(
  projectId: string,
  projectPath: string,
): Promise<ProjectOverviewSnapshot> {
  let hadSnapshot = false;

  projectOverviewByProject.update((state) => {
    const next = new Map(state);
    const current = next.get(projectId) ?? EMPTY_STATE;
    hadSnapshot = Boolean(current.snapshot);
    next.set(projectId, {
      ...current,
      loading: !hadSnapshot,
      refreshing: hadSnapshot,
      error: null,
    });
    return next;
  });

  try {
    const snapshot = await invoke<ProjectOverviewSnapshot>('load_project_snapshot', {
      projectId,
      projectPath,
    });

    projectOverviewByProject.update((state) => {
      const next = new Map(state);
      next.set(projectId, {
        snapshot,
        loading: false,
        refreshing: false,
        error: null,
        loadedAt: Date.now(),
      });
      return next;
    });

    return snapshot;
  } catch (error: any) {
    const message = error?.toString() ?? 'Failed to load project overview';
    projectOverviewByProject.update((state) => {
      const next = new Map(state);
      const current = next.get(projectId) ?? EMPTY_STATE;
      next.set(projectId, {
        ...current,
        loading: false,
        refreshing: false,
        error: message,
      });
      return next;
    });
    throw error;
  }
}
