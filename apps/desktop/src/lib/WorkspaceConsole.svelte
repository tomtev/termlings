<script lang="ts">
  import AgentFace from './AgentFace.svelte';
  import type { Project } from './stores/projects';
  import type { SessionInfo } from './stores/sessions';
  import type {
    ProjectOverviewState,
    SnapshotCalendarEvent,
    SnapshotDmThread,
    SnapshotMessage,
    SnapshotRequest,
    SnapshotTask,
  } from './stores/projectOverview';

  type WorkspaceView = 'chat' | 'requests' | 'tasks' | 'calendar';

  interface MessagePayload {
    kind: 'chat' | 'dm';
    text: string;
    target?: string;
  }

  interface Props {
    project: Project;
    overview: ProjectOverviewState;
    sessions: SessionInfo[];
    activeSessionId: string | null;
    selectedThreadId: string;
    terminalDockOpen: boolean;
    onToggleTerminalDock: () => void;
    onSelectThread: (threadId: string) => void | Promise<void>;
    onFocusAgent: (agentSlug: string, label: string) => void;
    onSendMessage: (payload: MessagePayload) => Promise<void>;
    onResolveRequest: (requestId: string, response: string) => Promise<void>;
    onDismissRequest: (requestId: string) => Promise<void>;
  }

  let {
    project,
    overview,
    sessions,
    activeSessionId,
    selectedThreadId,
    terminalDockOpen,
    onToggleTerminalDock,
    onSelectThread,
    onFocusAgent,
    onSendMessage,
    onResolveRequest,
    onDismissRequest,
  }: Props = $props();

  let activeView = $state<WorkspaceView>('chat');
  let draft = $state('');
  let sending = $state(false);
  let requestActionId = $state<string | null>(null);
  let envResponses = $state<Record<string, string>>({});
  let messageListEl = $state<HTMLDivElement | null>(null);

  const snapshot = $derived(overview.snapshot);
  const pendingRequests = $derived(snapshot?.requests.filter((request) => request.status === 'pending') ?? []);
  const resolvedRequests = $derived(snapshot?.requests.filter((request) => request.status !== 'pending').slice(0, 8) ?? []);

  const taskItems = $derived.by(() => {
    if (!snapshot) return [];
    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const statusRank: Record<string, number> = {
      'in-progress': 0,
      blocked: 1,
      claimed: 2,
      open: 3,
      completed: 4,
    };

    return snapshot.tasks
      .slice()
      .sort((left, right) => {
        const byStatus = (statusRank[left.status] ?? 99) - (statusRank[right.status] ?? 99);
        if (byStatus !== 0) return byStatus;
        const byPriority = (priorityRank[left.priority] ?? 99) - (priorityRank[right.priority] ?? 99);
        if (byPriority !== 0) return byPriority;
        return right.updatedAt - left.updatedAt;
      });
  });

  const calendarItems = $derived.by(() => {
    if (!snapshot) return [];
    return snapshot.calendarEvents
      .slice()
      .sort((left, right) => (left.startTime ?? 0) - (right.startTime ?? 0));
  });

  const selectedThread = $derived(snapshot?.dmThreads.find((thread) => thread.id === selectedThreadId) ?? null);
  const activeTerminalThreadId = $derived.by(() => {
    const activeSession = sessions.find((session) => session.id === activeSessionId);
    const slug = activeSession ? sessionAgentSlug(activeSession) : null;
    return slug ? `agent:${slug}` : null;
  });

  const messageItems = $derived.by(() => {
    if (!snapshot) return [];
    return selectedThreadId === 'activity'
      ? snapshot.messages.slice().sort(compareMessages)
      : filterThreadMessages(snapshot.dmThreads, snapshot.messages, snapshot.sessions, selectedThreadId);
  });

  $effect(() => {
    const snap = snapshot;
    if (!snap) {
      if (selectedThreadId !== 'activity') {
        onSelectThread('activity');
      }
      return;
    }

    if (selectedThreadId !== 'activity' && !snap.dmThreads.some((thread) => thread.id === selectedThreadId)) {
      onSelectThread('activity');
    }
  });

  $effect(() => {
    activeThreadKey(messageItems);
    if (messageListEl) {
      requestAnimationFrame(() => {
        if (messageListEl) {
          messageListEl.scrollTop = messageListEl.scrollHeight;
        }
      });
    }
  });

  function activeThreadKey(messages: SnapshotMessage[]): string {
    return `${selectedThreadId}:${messages.length}:${messages.at(-1)?.id ?? 'none'}`;
  }

  function compareMessages(left: SnapshotMessage, right: SnapshotMessage): number {
    if (left.ts !== right.ts) return left.ts - right.ts;
    return left.id.localeCompare(right.id);
  }

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

  function isHumanAddress(value?: string): boolean {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'owner' || normalized === 'operator' || normalized.startsWith('human:');
  }

  function filterThreadMessages(
    dmThreads: SnapshotDmThread[],
    messages: SnapshotMessage[],
    allSessions: { sessionId: string; dna: string }[],
    threadId: string,
  ): SnapshotMessage[] {
    const thread = dmThreads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      return [];
    }

    const sessionDnaById = new Map(allSessions.map((session) => [session.sessionId, session.dna]));
    const candidateTargets = new Set<string>();
    if (thread.slug) candidateTargets.add(`agent:${thread.slug}`);
    candidateTargets.add(`agent:${thread.dna}`);
    for (const session of allSessions) {
      if (session.dna === thread.dna) {
        candidateTargets.add(session.sessionId);
      }
    }

    return messages
      .filter((message) => {
        if (message.kind !== 'dm') return false;

        const fromDna = message.fromDna ?? (message.from ? sessionDnaById.get(message.from) : undefined);
        const targetDna = message.targetDna ?? (message.target ? sessionDnaById.get(message.target) : undefined);
        const agentSideMatches = fromDna === thread.dna
          || targetDna === thread.dna
          || (message.from ? candidateTargets.has(message.from) : false)
          || (message.target ? candidateTargets.has(message.target) : false);
        const humanSideMatches = isHumanAddress(message.from) || isHumanAddress(message.target);
        return agentSideMatches && humanSideMatches;
      })
      .slice()
      .sort(compareMessages);
  }

  function threadSubtitle(thread: SnapshotDmThread): string {
    const agent = snapshot?.agents.find((candidate) => candidate.dna === thread.dna);
    if (activeTerminalThreadId === thread.id && terminalDockOpen) return 'terminal open';
    if (thread.typing) return 'typing...';
    if (agent?.title_short) return agent.title_short;
    if (agent?.title) return agent.title;
    return thread.online ? 'online' : 'offline';
  }

  function threadLabel(): string {
    if (selectedThreadId === 'activity') return 'All activity';
    return selectedThread?.label || selectedThreadId;
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

  function timeOfDay(ts?: number | null): string {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function messageHeadline(message: SnapshotMessage): string {
    const fromName = displayPartyLabel(message.fromName, message.from);
    const targetName = displayPartyLabel(message.targetName, message.target);
    if (message.kind === 'dm' && message.targetName) {
      return `${fromName} -> ${targetName}`;
    }
    if (message.channel) {
      return `${fromName} -> #${message.channel}`;
    }
    return fromName;
  }

  function messageTone(message: SnapshotMessage): string {
    if (message.kind === 'system') return 'system';
    if (isHumanAddress(message.from)) return 'human';
    return 'agent';
  }

  function displayPartyLabel(name: string | undefined, id: string | undefined): string {
    const resolved = name?.trim() || 'Unknown';
    if (!isHumanAddress(id)) {
      return resolved;
    }
    return resolved === 'Operator' ? 'You' : `${resolved} (You)`;
  }

  function navCount(view: WorkspaceView): number | null {
    if (!snapshot) return null;
    if (view === 'requests') return pendingRequests.length;
    if (view === 'tasks') return snapshot.tasks.filter((task) => task.status !== 'completed').length;
    if (view === 'calendar') return calendarItems.length;
    return null;
  }

  function pickThread(threadId: string) {
    activeView = 'chat';
    onSelectThread(threadId);
  }

  function mentionTarget(raw: string): SnapshotDmThread | null {
    const token = raw.trim().toLowerCase();
    if (!snapshot || !token) return null;

    return snapshot.dmThreads.find((thread) => {
      const names = [
        thread.slug,
        thread.label,
        snapshot.agents.find((candidate) => candidate.dna === thread.dna)?.agentId,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());
      return names.includes(token);
    }) ?? null;
  }

  async function submitDraft() {
    const raw = draft.trim();
    if (!raw || sending || !snapshot) {
      return;
    }

    let payload: MessagePayload | null = null;
    let nextThreadId = selectedThreadId;

    if (selectedThreadId === 'activity') {
      if (!raw.startsWith('@')) {
        return;
      }

      const [mention, ...rest] = raw.split(/\s+/);
      const text = rest.join(' ').trim();
      if (!text) {
        return;
      }

      const targetToken = mention.slice(1).trim();
      if (targetToken === 'everyone' || targetToken === 'all') {
        payload = { kind: 'chat', text, target: 'channel:workspace' };
      } else {
        const thread = mentionTarget(targetToken);
        if (!thread) {
          return;
        }
        payload = { kind: 'dm', text, target: thread.id };
        nextThreadId = thread.id;
      }
    } else if (selectedThread) {
      payload = { kind: 'dm', text: raw, target: selectedThread.id };
    }

    if (!payload) {
      return;
    }

    sending = true;
    try {
      await onSendMessage(payload);
      draft = '';
      onSelectThread(nextThreadId);
      activeView = 'chat';
    } finally {
      sending = false;
    }
  }

  async function resolvePendingRequest(request: SnapshotRequest, response: string) {
    requestActionId = request.id;
    try {
      await onResolveRequest(request.id, response);
      envResponses = { ...envResponses, [request.id]: '' };
    } finally {
      requestActionId = null;
    }
  }

  async function dismissPendingRequest(requestId: string) {
    requestActionId = requestId;
    try {
      await onDismissRequest(requestId);
    } finally {
      requestActionId = null;
    }
  }

  function requestLabel(request: SnapshotRequest): string {
    if (request.type === 'env') {
      return request.varName || request.id;
    }
    return request.question || request.reason || request.id;
  }

  function eventTitle(event: SnapshotCalendarEvent): string {
    return event.title || 'Untitled event';
  }

  function formatDate(ts?: number): string {
    if (!ts) return 'Unscheduled';
    return new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function peekSelectedThreadTerminal() {
    if (!selectedThread?.slug) {
      onToggleTerminalDock();
      return;
    }
    onFocusAgent(selectedThread.slug, selectedThread.label);
  }

  function peekTerminalLabel(): string {
    if (!selectedThread?.slug) {
      return terminalDockOpen ? 'Hide terminals' : 'Peek terminals';
    }
    if (terminalDockOpen && activeTerminalThreadId === selectedThread.id) {
      return 'Terminal open';
    }
    return 'Peek terminal';
  }
</script>

<section class="workspace-console">
  <header class="console-header">
    <div class="tabs">
      {#each [
        { id: 'chat', label: 'Chat' },
        { id: 'requests', label: 'Requests' },
        { id: 'tasks', label: 'Tasks' },
        { id: 'calendar', label: 'Calendar' },
      ] as tab}
        <button
          class="top-tab"
          class:active={activeView === tab.id}
          onclick={() => (activeView = tab.id as WorkspaceView)}
        >
          <span>{tab.label}</span>
          {#if navCount(tab.id as WorkspaceView)}
            <span class="count-pill">{navCount(tab.id as WorkspaceView)}</span>
          {/if}
        </button>
      {/each}
    </div>

    <button class="terminal-toggle" class:open={terminalDockOpen} onclick={onToggleTerminalDock}>
      {terminalDockOpen ? 'Hide terminals' : 'Peek terminals'}
    </button>
  </header>

  {#if !snapshot && overview.loading}
    <div class="state-panel">Loading workspace surface...</div>
  {:else if overview.error && !snapshot}
    <div class="state-panel error">{overview.error}</div>
  {:else if snapshot}
    {#if activeView === 'chat'}
      <div class="chat-surface">
        <div class="thread-strip">
          <button
            class="thread-card"
            class:selected={selectedThreadId === 'activity'}
            onclick={() => pickThread('activity')}
          >
            <div class="activity-avatar">All</div>
            <div class="thread-copy">
              <span class="thread-name">All</span>
              <span class="thread-role">Activity</span>
            </div>
          </button>

          {#each snapshot.dmThreads as thread (thread.id)}
            <button
              class="thread-card"
              class:selected={selectedThreadId === thread.id}
              class:terminal-active={activeTerminalThreadId === thread.id && terminalDockOpen}
              onclick={() => pickThread(thread.id)}
            >
              <AgentFace
                name={thread.label}
                dna={thread.dna}
                size="lg"
                animated
                talking={thread.typing}
                waving={thread.id === selectedThreadId}
              />
              <div class="thread-copy">
                <span class="thread-name">{thread.label}</span>
                <span class="thread-role">{threadSubtitle(thread)}</span>
              </div>
            </button>
          {/each}
        </div>

        <div class="thread-banner">
          <div>
            <span class="banner-label">{threadLabel()}</span>
            <span class="banner-subtitle">{shortPath(project.path)}</span>
          </div>

          <div class="banner-actions">
            {#if selectedThread?.slug}
              <button class="ghost small" onclick={peekSelectedThreadTerminal}>{peekTerminalLabel()}</button>
            {/if}
            <span class="banner-updated">{relativeTime(snapshot.generatedAt)}</span>
          </div>
        </div>

        <div class="message-list" bind:this={messageListEl}>
          {#each messageItems as message (message.id)}
            <article class="message-card {messageTone(message)}">
              <div class="message-meta">
                <span class="message-title">{messageHeadline(message)}</span>
                <span class="message-time">{timeOfDay(message.ts)}</span>
              </div>
              <div class="message-body">{message.text}</div>
            </article>
          {/each}

          {#if messageItems.length === 0}
            <div class="empty-panel">No messages yet.</div>
          {/if}
        </div>

        {#if selectedThread?.typing}
          <div class="typing-footer">{selectedThread.label} is typing...</div>
        {/if}

        <div class="composer">
          <textarea
            rows="2"
            bind:value={draft}
            placeholder={selectedThreadId === 'activity'
              ? 'Message @everyone or @agent'
              : `Message ${selectedThread?.label ?? 'agent'}`}
            onkeydown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submitDraft();
              }
            }}
          ></textarea>
          <button onclick={submitDraft} disabled={sending || !draft.trim()}>
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>

        <footer class="surface-footer">
          <span>{shortPath(project.path)} / {threadLabel()}</span>
          <span>{messageItems.length} messages</span>
        </footer>
      </div>
    {:else if activeView === 'requests'}
      <div class="stack-panel">
        <section class="pane-card">
          <div class="pane-head">
            <h3>Pending Requests</h3>
            <span>{pendingRequests.length}</span>
          </div>

          {#if pendingRequests.length === 0}
            <div class="empty-panel">No pending requests.</div>
          {:else}
            <div class="stack-list">
              {#each pendingRequests as request (request.id)}
                <article class="list-card">
                  <div class="card-head">
                    <div>
                      <strong>{request.fromName}</strong>
                      <span>{request.type}</span>
                    </div>
                    <span>{relativeTime(request.ts)}</span>
                  </div>

                  <div class="card-title">{requestLabel(request)}</div>
                  {#if request.reason}
                    <div class="card-copy">{request.reason}</div>
                  {/if}

                  {#if request.type === 'confirm'}
                    <div class="action-row">
                      <button onclick={() => resolvePendingRequest(request, 'yes')} disabled={requestActionId === request.id}>Yes</button>
                      <button class="ghost" onclick={() => resolvePendingRequest(request, 'no')} disabled={requestActionId === request.id}>No</button>
                    </div>
                  {:else if request.type === 'choice'}
                    <div class="choice-grid">
                      {#each request.options ?? [] as option (option)}
                        <button onclick={() => resolvePendingRequest(request, option)} disabled={requestActionId === request.id}>
                          {option}
                        </button>
                      {/each}
                    </div>
                  {:else}
                    <div class="action-row">
                      <input
                        type="text"
                        value={envResponses[request.id] ?? ''}
                        placeholder={request.varName || 'Value'}
                        oninput={(event) => {
                          envResponses = {
                            ...envResponses,
                            [request.id]: (event.currentTarget as HTMLInputElement).value,
                          };
                        }}
                      />
                      <button
                        onclick={() => resolvePendingRequest(request, envResponses[request.id] ?? '')}
                        disabled={requestActionId === request.id || !(envResponses[request.id] ?? '').trim()}
                      >
                        Save
                      </button>
                    </div>
                  {/if}

                  <button class="ghost small dismiss-btn" onclick={() => dismissPendingRequest(request.id)} disabled={requestActionId === request.id}>
                    Dismiss
                  </button>
                </article>
              {/each}
            </div>
          {/if}
        </section>

        <section class="pane-card">
          <div class="pane-head">
            <h3>Recent Decisions</h3>
            <span>{resolvedRequests.length}</span>
          </div>
          {#if resolvedRequests.length === 0}
            <div class="empty-panel">No resolved requests yet.</div>
          {:else}
            <div class="stack-list compact">
              {#each resolvedRequests as request (request.id)}
                <article class="list-card compact">
                  <div class="card-head">
                    <strong>{request.fromName}</strong>
                    <span>{request.response || request.status}</span>
                  </div>
                  <div class="card-title">{requestLabel(request)}</div>
                </article>
              {/each}
            </div>
          {/if}
        </section>
      </div>
    {:else if activeView === 'tasks'}
      <div class="pane-card fill">
        <div class="pane-head">
          <h3>Tasks</h3>
          <span>{taskItems.length}</span>
        </div>
        {#if taskItems.length === 0}
          <div class="empty-panel">No tasks in this workspace.</div>
        {:else}
          <div class="stack-list">
            {#each taskItems as task (task.id)}
              <article class="list-card">
                <div class="card-head">
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.id}</span>
                  </div>
                  <span>{relativeTime(task.updatedAt)}</span>
                </div>
                <div class="badge-row">
                  <span class="status-tag {task.status}">{task.status}</span>
                  <span class="priority-tag">{task.priority}</span>
                  <span class="assignee-tag">{task.assignedTo ? `@${task.assignedTo}` : 'unassigned'}</span>
                </div>
                {#if task.description}
                  <div class="card-copy">{task.description}</div>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </div>
    {:else if activeView === 'calendar'}
      <div class="pane-card fill">
        <div class="pane-head">
          <h3>Calendar</h3>
          <span>{calendarItems.length}</span>
        </div>
        {#if calendarItems.length === 0}
          <div class="empty-panel">No upcoming events.</div>
        {:else}
          <div class="stack-list">
            {#each calendarItems as event, index (event.id ?? `${event.title ?? 'event'}-${index}`)}
              <article class="list-card">
                <div class="card-head">
                  <strong>{eventTitle(event)}</strong>
                  <span>{formatDate(event.startTime)}</span>
                </div>
                <div class="card-copy">
                  {#if event.agent}
                    Assigned to {event.agent}
                  {:else}
                    Workspace event
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="state-panel">No workspace data available yet.</div>
  {/if}
</section>

<style>
  .workspace-console {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: var(--space-4);
    gap: var(--space-4);
    color: var(--foreground);
  }

  .console-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-large);
    background: var(--card);
    box-shadow: var(--shadow-small);
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .top-tab,
  .terminal-toggle {
    border: 1px solid transparent;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--muted-foreground);
    padding: var(--space-1) var(--space-3);
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    font: inherit;
    font-size: var(--text-7);
    font-weight: var(--font-medium);
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      transform var(--transition-fast);
  }

  .top-tab:hover,
  .terminal-toggle:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .top-tab.active,
  .terminal-toggle.open {
    color: var(--foreground);
    border-color: var(--border);
    background: var(--secondary);
    transform: translateY(-1px);
  }

  .count-pill {
    min-width: 1.25rem;
    height: 1.25rem;
    display: inline-grid;
    place-items: center;
    padding: 0 var(--space-1);
    font-size: var(--text-8);
    font-weight: var(--font-semibold);
    background: var(--secondary);
    color: var(--secondary-foreground);
    border-radius: var(--radius-full);
  }

  .chat-surface,
  .stack-panel,
  .pane-card.fill {
    flex: 1;
    min-height: 0;
  }

  .chat-surface {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto auto;
    gap: var(--space-3);
  }

  .thread-strip {
    display: flex;
    gap: var(--space-3);
    overflow-x: auto;
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-large);
    background: var(--card);
    box-shadow: var(--shadow-small);
  }

  .thread-card {
    width: 8.75rem;
    min-width: 8.75rem;
    border: 1px solid transparent;
    border-radius: calc(var(--radius-large) - 2px);
    background: var(--background);
    color: var(--foreground);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    cursor: pointer;
    box-shadow: var(--shadow-small);
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
  }

  .thread-card:hover {
    background: var(--accent);
    transform: translateY(-1px);
  }

  .thread-card.selected {
    background: var(--secondary);
    border-color: var(--border);
  }

  .thread-card.terminal-active {
    box-shadow:
      inset 0 0 0 1px rgb(from var(--primary) r g b / 0.18),
      0 0 0 1px rgb(from var(--primary) r g b / 0.08);
  }

  .activity-avatar {
    width: 3.5rem;
    height: 3.5rem;
    border: 1px solid color-mix(in srgb, var(--primary) 24%, var(--border));
    border-radius: 1rem;
    display: grid;
    place-items: center;
    font-size: var(--text-7);
    font-weight: var(--font-semibold);
    color: var(--foreground);
    background: color-mix(in srgb, var(--primary) 14%, var(--card));
  }

  .thread-copy {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-align: center;
  }

  .thread-name {
    font-size: var(--text-7);
    font-weight: var(--font-semibold);
    color: var(--foreground);
  }

  .thread-role {
    font-size: var(--text-8);
    color: var(--muted-foreground);
    min-height: 1rem;
  }

  .thread-banner,
  .composer,
  .surface-footer,
  .pane-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-large);
    background: var(--card);
    box-shadow: var(--shadow-small);
  }

  .thread-banner,
  .surface-footer {
    padding: var(--space-3);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .banner-label {
    display: block;
    font-size: var(--text-7);
    font-weight: var(--font-semibold);
    color: var(--foreground);
  }

  .banner-subtitle,
  .banner-updated,
  .surface-footer {
    color: var(--muted-foreground);
    font-size: var(--text-8);
  }

  .banner-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .message-list {
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-right: 2px;
  }

  .message-card {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-medium);
    background: var(--card);
    box-shadow: var(--shadow-small);
    border-inline-start-width: 4px;
    border-inline-start-style: solid;
  }

  .message-card.agent {
    border-inline-start-color: var(--primary);
  }

  .message-card.human {
    border-inline-start-color: var(--success);
  }

  .message-card.system {
    border-inline-start-color: var(--muted-foreground);
    background: var(--faint);
  }

  .message-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    color: var(--muted-foreground);
    font-size: var(--text-8);
  }

  .message-title {
    color: var(--foreground);
    font-weight: var(--font-medium);
  }

  .message-body {
    white-space: pre-wrap;
    line-height: 1.5;
    color: var(--foreground);
    font-size: var(--text-7);
  }

  .typing-footer {
    color: var(--primary);
    font-size: var(--text-8);
    padding-left: 2px;
  }

  .composer {
    padding: var(--space-3);
    display: flex;
    align-items: flex-end;
    gap: var(--space-3);
  }

  .composer textarea {
    flex: 1;
    min-height: 68px;
    margin: 0;
    border: none;
    outline: none;
    resize: none;
    background: transparent;
    color: var(--foreground);
    font: inherit;
    line-height: 1.45;
    box-shadow: none;
    padding: 0;
  }

  .composer textarea:focus {
    border: none;
    box-shadow: none;
  }

  .composer button,
  .banner-actions button,
  .action-row button,
  .choice-grid button {
    flex-shrink: 0;
  }

  .stack-panel {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: var(--space-4);
  }

  .pane-card {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .pane-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .pane-head h3 {
    margin: 0;
    font-size: var(--text-5);
    color: var(--foreground);
  }

  .stack-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
    overflow-y: auto;
    padding-right: 2px;
  }

  .stack-list.compact {
    gap: var(--space-2);
  }

  .list-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-medium);
    background: var(--background);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    box-shadow: var(--shadow-small);
  }

  .list-card.compact {
    padding: var(--space-3);
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: var(--text-8);
    color: var(--muted-foreground);
  }

  .card-head strong {
    color: var(--foreground);
    display: block;
    margin-bottom: 2px;
  }

  .card-title {
    color: var(--foreground);
    font-size: var(--text-7);
    font-weight: var(--font-medium);
  }

  .card-copy {
    color: var(--muted-foreground);
    font-size: var(--text-7);
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .action-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }

  .action-row input {
    flex: 1;
    min-width: 160px;
  }

  .choice-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .dismiss-btn {
    align-self: flex-start;
  }

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .status-tag,
  .priority-tag,
  .assignee-tag {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.55rem;
    font-size: var(--text-8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background: var(--faint);
    color: var(--secondary-foreground);
  }

  .status-tag.in-progress {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 14%, var(--card));
    border-color: color-mix(in srgb, var(--success) 30%, var(--border));
  }

  .status-tag.blocked {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 14%, var(--card));
    border-color: color-mix(in srgb, var(--warning) 30%, var(--border));
  }

  .status-tag.claimed {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, var(--card));
    border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
  }

  .status-tag.open {
    color: var(--secondary-foreground);
    background: color-mix(in srgb, var(--secondary) 80%, var(--card));
  }

  .priority-tag,
  .assignee-tag {
    color: var(--muted-foreground);
  }

  .state-panel,
  .empty-panel {
    border: 1px dashed var(--border);
    border-radius: var(--radius-large);
    background: var(--faint);
    padding: var(--space-8);
    text-align: center;
    color: var(--muted-foreground);
  }

  .state-panel.error {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 34%, var(--border));
    background: color-mix(in srgb, var(--danger) 8%, var(--card));
  }

  @media (max-width: 1100px) {
    .workspace-console {
      padding: var(--space-4);
    }

    .stack-panel {
      grid-template-columns: 1fr;
    }

    .console-header {
      flex-direction: column;
      align-items: stretch;
    }

    .thread-banner,
    .surface-footer,
    .banner-actions {
      flex-wrap: wrap;
    }
  }
</style>
