<script lang="ts">
  import type { Project } from './stores/projects';
  import type { SessionInfo } from './stores/sessions';
  import { isLiveSession } from './stores/sessions';
  import type {
    ProjectOverviewState,
    SnapshotAgent,
    SnapshotBrowserTab,
    SnapshotMessage,
    SnapshotTask,
  } from './stores/projectOverview';

  interface Props {
    project: Project;
    overview: ProjectOverviewState;
    sessions: SessionInfo[];
    activeSessionId: string | null;
    onRunCommand: (command: string, label: string) => void;
    onFocusAgent: (agentSlug: string, label: string) => void;
  }

  let {
    project,
    overview,
    sessions,
    activeSessionId,
    onRunCommand,
    onFocusAgent,
  }: Props = $props();

  const quickActions = [
    { label: 'Brief', command: 'termlings brief', sessionLabel: 'brief' },
    { label: 'Org Chart', command: 'termlings org-chart', sessionLabel: 'org-chart' },
    { label: 'Browser', command: 'termlings browser status', sessionLabel: 'browser status' },
    { label: 'Tasks', command: 'termlings task list', sessionLabel: 'task list' },
    { label: 'Recent', command: 'termlings conversation recent --limit 120', sessionLabel: 'recent conversation' },
  ];

  const snapshot = $derived(overview.snapshot);

  const headline = $derived(snapshot?.meta?.projectName || snapshot?.project.projectName || project.name);
  const onlineCount = $derived(snapshot?.agents.filter((agent) => agent.online).length ?? 0);
  const totalTasks = $derived(snapshot?.tasks.filter((task) => task.status !== 'completed').length ?? 0);
  const threadCount = $derived(snapshot?.dmThreads.length ?? 0);
  const browserState = $derived(snapshot?.browser ?? null);
  const browserActiveAgents = $derived(browserState?.agents.filter((agent) => agent.status === 'active').length ?? 0);
  const browserOpenTabs = $derived(browserState?.tabs.length ?? 0);

  const browserTabs = $derived.by(() => {
    const tabs = browserState?.tabs ?? [];
    return tabs
      .slice()
      .sort((left, right) => {
        if (left.active !== right.active) return left.active ? -1 : 1;
        return (right.owner?.updatedAt ?? 0) - (left.owner?.updatedAt ?? 0);
      })
      .slice(0, 5);
  });

  const taskList = $derived.by(() => {
    if (!snapshot) return [];

    const statusRank: Record<SnapshotTask['status'], number> = {
      'in-progress': 0,
      blocked: 1,
      claimed: 2,
      open: 3,
      completed: 4,
    };
    const priorityRank: Record<SnapshotTask['priority'], number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    return snapshot.tasks
      .filter((task) => task.status !== 'completed')
      .slice()
      .sort((left, right) => {
        const byStatus = statusRank[left.status] - statusRank[right.status];
        if (byStatus !== 0) return byStatus;
        const byPriority = priorityRank[left.priority] - priorityRank[right.priority];
        if (byPriority !== 0) return byPriority;
        return right.updatedAt - left.updatedAt;
      })
      .slice(0, 6);
  });

  const recentMessages = $derived.by(() => {
    if (!snapshot) return [];
    return snapshot.messages.slice(-8).reverse();
  });

  const topThreads = $derived.by(() => {
    if (!snapshot) return [];
    return snapshot.dmThreads
      .slice()
      .sort((left, right) => {
        const orderDelta = (left.sort_order ?? 0) - (right.sort_order ?? 0);
        if (orderDelta !== 0) return orderDelta;
        if (left.online !== right.online) return left.online ? -1 : 1;
        return left.label.localeCompare(right.label);
      })
      .slice(0, 4);
  });

  function sessionAgentSlug(session: SessionInfo): string | null {
    if (session.agent_slug) {
      return session.agent_slug;
    }
    const match = session.command.match(/--agent=([a-z0-9-]+)/i);
    return match?.[1] ?? null;
  }

  function shortPath(path: string): string {
    const mac = path.match(/^\/Users\/[^/]+(.*)$/);
    if (mac) return `~${mac[1]}`;
    const linux = path.match(/^\/home\/[^/]+(.*)$/);
    if (linux) return `~${linux[1]}`;
    return path;
  }

  function relativeTime(ts?: number | null): string {
    if (!ts) return 'now';
    const delta = Math.max(0, Date.now() - ts);
    const seconds = Math.floor(delta / 1000);
    if (seconds < 10) return 'now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function messageContext(message: SnapshotMessage): string {
    if (message.channel) return `#${message.channel}`;
    if (message.targetName) return `to ${message.targetName}`;
    return message.kind;
  }

  function taskSubtitle(task: SnapshotTask): string {
    const owner = task.assignedTo ? `@${task.assignedTo}` : 'unassigned';
    return `${owner} · ${relativeTime(task.updatedAt)}`;
  }

  function taskTone(status: SnapshotTask['status']): string {
    switch (status) {
      case 'in-progress':
        return 'progress';
      case 'blocked':
        return 'blocked';
      case 'claimed':
        return 'claimed';
      case 'completed':
        return 'completed';
      default:
        return 'open';
    }
  }

  function agentSession(agent: SnapshotAgent): SessionInfo | null {
    if (!agent.agentId) {
      return null;
    }
    return sessions.find((session) => sessionAgentSlug(session) === agent.agentId) ?? null;
  }

  function agentAction(agent: SnapshotAgent): { label: string; disabled: boolean } {
    if (!agent.agentId) {
      return { label: 'Seen', disabled: true };
    }

    const session = agentSession(agent);
    if (!session) {
      return { label: 'Start', disabled: false };
    }
    if (session.id === activeSessionId && isLiveSession(session.id)) {
      return { label: 'Active', disabled: false };
    }
    if (isLiveSession(session.id)) {
      return { label: 'Tab', disabled: false };
    }
    return { label: 'Resume', disabled: false };
  }

  function openTask(taskId: string) {
    onRunCommand(`termlings task show ${taskId}`, taskId);
  }

  function browserStatusLabel(): string {
    const status = browserState?.process?.status;
    if (!status) return 'not started';
    if (status === 'running') return 'running';
    if (status === 'starting') return 'starting';
    return 'stopped';
  }

  function browserTabTitle(tab: SnapshotBrowserTab): string {
    return tab.title?.trim() || tab.url?.trim() || `Tab ${tab.id}`;
  }

  function browserTabSubtitle(tab: SnapshotBrowserTab): string {
    const owner = tab.owner?.agentName || tab.owner?.agentSlug || 'unowned';
    const suffix = tab.inviteCount > 0 ? ` · ${tab.inviteCount} invite${tab.inviteCount === 1 ? '' : 's'}` : '';
    return `${owner}${suffix}`;
  }
</script>

<section class="overview-shell">
  <header class="hero">
    <div class="hero-copy">
      <span class="eyebrow">Workspace</span>
      <h2>{headline}</h2>
      <p>{shortPath(project.path)}</p>
    </div>

    <div class="hero-stats">
      <div class="stat-card">
        <span class="stat-value">{onlineCount}</span>
        <span class="stat-label">agents online</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{totalTasks}</span>
        <span class="stat-label">open tasks</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{threadCount}</span>
        <span class="stat-label">DM threads</span>
      </div>
    </div>
  </header>

  <div class="panel-section">
    <div class="section-head">
      <h3>Quick Actions</h3>
      <span class="section-meta">{overview.refreshing ? 'Refreshing' : relativeTime(overview.loadedAt)}</span>
    </div>
    <div class="quick-grid">
      {#each quickActions as action (action.command)}
        <button class="quick-action" onclick={() => onRunCommand(action.command, action.sessionLabel)}>
          <span>{action.label}</span>
          <small>{action.command}</small>
        </button>
      {/each}
    </div>
  </div>

  {#if overview.error}
    <div class="panel-section error-panel">
      <div class="section-head">
        <h3>Overview Error</h3>
      </div>
      <p>{overview.error}</p>
    </div>
  {/if}

  {#if overview.loading && !snapshot}
    <div class="panel-section empty-panel">
      <p>Loading workspace overview...</p>
    </div>
  {:else if snapshot}
    <div class="panel-section">
      <div class="section-head">
        <h3>Team</h3>
        <span class="section-meta">{onlineCount}/{snapshot.agents.length} live</span>
      </div>
      <div class="stack-list">
        {#each snapshot.agents as agent (agent.id)}
          {@const session = agentSession(agent)}
          {@const action = agentAction(agent)}
          <button
            class="list-row agent-row"
            class:disabled={action.disabled}
            onclick={() => agent.agentId && onFocusAgent(agent.agentId, agent.title_short || agent.title || agent.name)}
            disabled={action.disabled}
          >
            <div class="row-main">
              <span
                class="presence-dot"
                class:online={agent.online}
                class:tab-live={Boolean(session && isLiveSession(session.id))}
                class:active={session?.id === activeSessionId}
              ></span>
              <div class="row-copy">
                <span class="row-title">{agent.name}</span>
                <span class="row-subtitle">{agent.title_short || agent.title || agent.agentId || agent.source}</span>
              </div>
            </div>
            <span class="pill">{action.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="panel-section">
      <div class="section-head">
        <h3>Tasks</h3>
        <button class="mini-link" onclick={() => onRunCommand('termlings task list', 'task list')}>Open list</button>
      </div>
      {#if taskList.length === 0}
        <p class="empty-copy">No open tasks.</p>
      {:else}
        <div class="stack-list">
          {#each taskList as task (task.id)}
            <button class="list-row task-row" onclick={() => openTask(task.id)}>
              <div class="task-meta-row">
                <span class="status-pill {taskTone(task.status)}">{task.status}</span>
                <span class="priority-pill">{task.priority}</span>
              </div>
              <span class="row-title">{task.title}</span>
              <span class="row-subtitle">{taskSubtitle(task)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="panel-section">
      <div class="section-head">
        <h3>Browser</h3>
        <button class="mini-link" onclick={() => onRunCommand('termlings browser overview --json', 'browser overview')}>
          Open CLI
        </button>
      </div>
      <div class="browser-meta-row">
        <span class="pill">{browserStatusLabel()}</span>
        <span class="row-subtitle">{browserActiveAgents} active · {browserOpenTabs} tabs</span>
      </div>
      {#if !browserState}
        <p class="empty-copy">No browser state yet.</p>
      {:else if browserTabs.length === 0}
        <p class="empty-copy">Browser has no tracked tabs.</p>
      {:else}
        <div class="stack-list">
          {#each browserTabs as tab (tab.id)}
            <button class="list-row thread-row" onclick={() => onRunCommand('termlings browser tabs list', 'browser tabs')}>
              <div class="message-head">
                <span class="row-title">{browserTabTitle(tab)}</span>
                <span class="message-time">{tab.active ? 'active' : `tab ${tab.id}`}</span>
              </div>
              <span class="row-subtitle">{browserTabSubtitle(tab)}</span>
              {#if tab.url}
                <span class="message-body">{tab.url}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="panel-section">
      <div class="section-head">
        <h3>Activity</h3>
        <button class="mini-link" onclick={() => onRunCommand('termlings conversation recent --limit 120', 'recent conversation')}>
          Open feed
        </button>
      </div>
      {#if recentMessages.length === 0}
        <p class="empty-copy">No messages yet.</p>
      {:else}
        <div class="stack-list">
          {#each recentMessages as message (message.id)}
            <button class="list-row message-row" onclick={() => onRunCommand('termlings conversation recent --limit 120', 'recent conversation')}>
              <div class="message-head">
                <span class="row-title">{message.fromName}</span>
                <span class="message-time">{relativeTime(message.ts)}</span>
              </div>
              <span class="row-subtitle">{messageContext(message)}</span>
              <span class="message-body">{message.text}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if topThreads.length > 0}
      <div class="panel-section">
        <div class="section-head">
          <h3>Hot Threads</h3>
          <span class="section-meta">{topThreads.length}</span>
        </div>
        <div class="stack-list">
          {#each topThreads as thread (thread.id)}
            <button class="list-row thread-row" onclick={() => onRunCommand('termlings conversation recent --limit 120', 'recent conversation')}>
              <span class="row-title">{thread.label}</span>
              <span class="row-subtitle">{thread.online ? 'online' : 'offline'}</span>
              <span class="message-time">{thread.typing ? 'typing…' : 'thread'}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <div class="panel-section empty-panel">
      <p>No workspace data yet.</p>
    </div>
  {/if}
</section>

<style>
  .overview-shell {
    height: 100%;
    overflow-y: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--secondary) 55%, transparent) 0%, transparent 42%),
      linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, transparent), var(--background));
  }

  .hero {
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    border-radius: 18px;
    padding: 18px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--secondary) 72%, transparent), transparent 62%),
      var(--card);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 10px;
    color: var(--muted-foreground);
  }

  .hero h2 {
    margin: 0;
    font-size: 24px;
    line-height: 1.1;
  }

  .hero p {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 12px;
    word-break: break-word;
  }

  .hero-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .stat-card {
    border-radius: 12px;
    padding: 10px;
    background: color-mix(in srgb, var(--background) 35%, transparent);
    border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-value {
    font-size: 20px;
    font-weight: 700;
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted-foreground);
  }

  .panel-section {
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    border-radius: 16px;
    padding: 14px;
    background: color-mix(in srgb, var(--card) 92%, transparent);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-head h3 {
    margin: 0;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .section-meta {
    color: var(--muted-foreground);
    font-size: 11px;
  }

  .quick-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .quick-action {
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--background) 40%, transparent);
    color: var(--foreground);
    padding: 12px;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
    transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
  }

  .quick-action:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--foreground) 18%, var(--border));
    background: color-mix(in srgb, var(--secondary) 45%, transparent);
  }

  .quick-action small {
    font-size: 10px;
    color: var(--muted-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stack-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .list-row {
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--background) 42%, transparent);
    color: var(--foreground);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .list-row:hover {
    background: color-mix(in srgb, var(--secondary) 42%, transparent);
    border-color: color-mix(in srgb, var(--foreground) 16%, var(--border));
  }

  .list-row:disabled,
  .agent-row.disabled {
    opacity: 0.6;
    cursor: default;
  }

  .row-main,
  .message-head,
  .task-meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .row-main {
    justify-content: space-between;
  }

  .row-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .row-title {
    font-size: 13px;
    font-weight: 600;
  }

  .row-subtitle,
  .message-time,
  .message-body {
    font-size: 11px;
    color: var(--muted-foreground);
  }

  .message-body {
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.45;
  }

  .presence-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--muted-foreground) 70%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--background) 82%, transparent);
  }

  .presence-dot.online {
    background: #22c55e;
  }

  .presence-dot.tab-live {
    box-shadow: 0 0 0 3px color-mix(in srgb, #22c55e 25%, transparent);
  }

  .presence-dot.active {
    background: #60a5fa;
  }

  .pill,
  .status-pill,
  .priority-pill {
    width: fit-content;
    border-radius: 999px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  }

  .pill,
  .priority-pill {
    color: var(--muted-foreground);
    background: color-mix(in srgb, var(--background) 45%, transparent);
  }

  .status-pill.open {
    color: #38bdf8;
    background: color-mix(in srgb, #38bdf8 14%, transparent);
  }

  .status-pill.claimed {
    color: #a78bfa;
    background: color-mix(in srgb, #a78bfa 14%, transparent);
  }

  .status-pill.progress {
    color: #22c55e;
    background: color-mix(in srgb, #22c55e 14%, transparent);
  }

  .status-pill.blocked {
    color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 16%, transparent);
  }

  .status-pill.completed {
    color: #94a3b8;
    background: color-mix(in srgb, #94a3b8 16%, transparent);
  }

  .task-meta-row,
  .message-head {
    justify-content: space-between;
  }

  .mini-link {
    border: none;
    background: none;
    color: var(--muted-foreground);
    cursor: pointer;
    padding: 0;
    font-size: 11px;
  }

  .mini-link:hover {
    color: var(--foreground);
  }

  .browser-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .empty-copy,
  .empty-panel p,
  .error-panel p {
    margin: 0;
    font-size: 12px;
    color: var(--muted-foreground);
  }

  .error-panel {
    border-color: color-mix(in srgb, #ef4444 34%, var(--border));
  }

  @media (max-width: 960px) {
    .overview-shell {
      padding: 14px;
    }

    .hero-stats,
    .quick-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
