<script lang="ts">
  import { onMount } from 'svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';

  import Sidebar from './lib/Sidebar.svelte';
  import BottomBar from './lib/BottomBar.svelte';
  import TerminalView from './lib/TerminalView.svelte';
  import EmptyState from './lib/EmptyState.svelte';
  import SettingsModal from './lib/SettingsModal.svelte';
  import AgentFace from './lib/AgentFace.svelte';
  import SetupWizard from './lib/SetupWizard.svelte';
  import ToastContainer from './lib/ToastContainer.svelte';
  import WorkspaceConsole from './lib/WorkspaceConsole.svelte';

  import { showToast } from './lib/stores/toasts';
  import { loadTheme, resolvedTheme } from './lib/stores/theme';
  import {
    projects,
    activeProject,
    activeProjectId,
    loadProjects,
    addProject,
    setActiveProject,
  } from './lib/stores/projects';
  import {
    currentSessions,
    activeSessionId,
    spawnSession,
    setActiveTab,
    loadSessions,
    resumeSession,
    isLiveSession,
    killSession,
  } from './lib/stores/sessions';
  import {
    currentProjectOverview,
    clearProjectOverview,
    loadProjectOverview,
  } from './lib/stores/projectOverview';
  import type { SessionInfo } from './lib/stores/sessions';

  const appWindow = getCurrentWindow();

  interface ProjectAgent {
    slug: string;
    name: string;
    title?: string | null;
    title_short?: string | null;
    sort_order?: number | null;
  }

  interface MessagePayload {
    kind: 'chat' | 'dm';
    text: string;
    target?: string;
  }

  type SettingsTab = 'general' | 'workspace' | 'appearance';

  let showSettings = $state(false);
  let showTerminalDock = $state(false);
  let selectedThreadId = $state('activity');
  let settingsTab = $state<SettingsTab>('general');
  let setupComplete = $state(false);
  let setupChecking = $state(true);

  const serverFailures = new Set<string>();
  const overviewFailures = new Set<string>();
  const projectBootstrapLocks = new Set<string>();

  function handleTitlebarMousedown(e: MouseEvent) {
    if (e.buttons !== 1) {
      return;
    }
    if (e.detail === 2) {
      appWindow.toggleMaximize();
      return;
    }
    appWindow.startDragging();
  }

  function sessionAgentSlug(session: SessionInfo): string | null {
    if (session.agent_slug) {
      return session.agent_slug;
    }
    const match = session.command.match(/--agent=([a-z0-9-]+)/i);
    return match?.[1] ?? null;
  }

  function agentTabLabel(agent: ProjectAgent): string {
    return agent.title_short || agent.title || agent.name || agent.slug;
  }

  function agentSpawnCommand(agentSlug: string): string {
    return `termlings spawn --agent=${agentSlug} --inline`;
  }

  async function initApp() {
    loadTheme();
    await loadProjects();
    const projectId = $activeProjectId;
    if (!projectId) {
      return;
    }

    const project = $projects.find((candidate) => candidate.id === projectId);
    await loadSessions(projectId);
    if (project) {
      await loadProjectOverview(project.id, project.path).catch(() => {});
    }
  }

  onMount(async () => {
    loadTheme();
    try {
      const report = await invoke<{ termlings: { installed: boolean } }>('check_dependencies');
      if (report.termlings.installed) {
        setupComplete = true;
        await initApp();
      }
    } catch {
      // If dependency check fails, the setup wizard handles bootstrapping.
    }
    setupChecking = false;
  });

  async function reconcileAgentTabs(projectId: string, projectPath: string, sessions: SessionInfo[]) {
    const agents = await invoke<ProjectAgent[]>('list_project_agents', { projectPath });
    const validAgentSlugs = new Set(agents.map((agent) => agent.slug));

    for (const session of sessions) {
      const slug = sessionAgentSlug(session);
      if (!slug || !validAgentSlugs.has(slug)) {
        await killSession(session.id, projectId);
      }
    }

    const currentSessions = await loadSessions(projectId);

    const existingByAgent = new Map<string, SessionInfo>();
    for (const session of currentSessions) {
      const slug = sessionAgentSlug(session);
      if (slug && !existingByAgent.has(slug)) {
        existingByAgent.set(slug, session);
      }
    }

    for (const agent of agents) {
      const existing = existingByAgent.get(agent.slug);
      if (!existing) {
        await spawnSession(
          projectId,
          agentSpawnCommand(agent.slug),
          agentTabLabel(agent),
          projectPath,
          agent.slug,
          undefined,
          $resolvedTheme === 'dark',
          false,
        );
        continue;
      }

      if (!isLiveSession(existing.id)) {
        await resumeSession(existing, projectPath, $resolvedTheme === 'dark');
      }
    }
  }

  async function syncProjectRuntime(projectId: string, projectPath: string) {
    if (projectBootstrapLocks.has(projectId)) {
      return;
    }
    projectBootstrapLocks.add(projectId);

    try {
      const sessions = await loadSessions(projectId);
      await reconcileAgentTabs(projectId, projectPath, sessions);
      await loadSessions(projectId);
    } finally {
      projectBootstrapLocks.delete(projectId);
    }
  }

  async function refreshProjectOverview(projectId: string, projectPath: string) {
    try {
      await invoke('ensure_project_server', { projectId, projectPath });
      serverFailures.delete(projectId);
    } catch (error: any) {
      if (!serverFailures.has(projectId)) {
        serverFailures.add(projectId);
        showToast(error?.toString() ?? 'Failed to start Termlings server', {
          title: 'Server unavailable',
          variant: 'danger',
        });
      }
      return;
    }

    try {
      await loadProjectOverview(projectId, projectPath);
      await syncProjectRuntime(projectId, projectPath);
      overviewFailures.delete(projectId);
    } catch (error: any) {
      if (!overviewFailures.has(projectId)) {
        overviewFailures.add(projectId);
        showToast(error?.toString() ?? 'Failed to load workspace overview', {
          title: 'Overview unavailable',
          variant: 'danger',
        });
      }
    }
  }

  $effect(() => {
    const project = $activeProject;
    if (!project) {
      selectedThreadId = 'activity';
      return;
    }
    syncProjectRuntime(project.id, project.path);
  });

  $effect(() => {
    const project = $activeProject;
    if (!project) {
      clearProjectOverview();
      return;
    }

    refreshProjectOverview(project.id, project.path);
    const timer = window.setInterval(() => {
      refreshProjectOverview(project.id, project.path);
    }, 1800);

    return () => {
      window.clearInterval(timer);
    };
  });

  function openSettings(tab: SettingsTab = 'general') {
    settingsTab = tab;
    showSettings = true;
  }

  async function handleAddProject() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select workspace folder',
    });
    if (!selected) {
      return;
    }

    try {
      const project = await addProject(selected as string);
      await setActiveProject(project.id);
    } catch (error: any) {
      showToast(error?.toString() ?? 'Failed to add workspace', { variant: 'danger' });
    }
  }

  async function ensureAgentTerminal(agentSlug: string, label: string, openDock = false) {
    const project = $activeProject;
    if (!project) {
      return;
    }

    if (openDock) {
      showTerminalDock = true;
    }

    const existing = $currentSessions.find((session) => sessionAgentSlug(session) === agentSlug);
    if (existing) {
      if (isLiveSession(existing.id)) {
        setActiveTab(project.id, existing.id);
      } else {
        await resumeSession(existing, project.path, $resolvedTheme === 'dark');
      }
      return;
    }

    await spawnSession(
      project.id,
      agentSpawnCommand(agentSlug),
      label,
      project.path,
      agentSlug,
      undefined,
      $resolvedTheme === 'dark',
      true,
    );
  }

  async function handleFocusAgent(agentSlug: string, label: string) {
    await ensureAgentTerminal(agentSlug, label, true);
  }

  async function handleSelectThread(threadId: string) {
    selectedThreadId = threadId;
    if (!threadId.startsWith('agent:')) {
      return;
    }

    const agentSlug = threadId.slice('agent:'.length).trim();
    if (!agentSlug) {
      return;
    }

    const agent = $currentProjectOverview.snapshot?.agents.find((candidate) => candidate.agentId === agentSlug);
    const label = agent?.title_short || agent?.title || agent?.name || agentSlug;
    await ensureAgentTerminal(agentSlug, label, false);
  }

  function handleResumeTab(session: SessionInfo) {
    const project = $activeProject;
    if (!project) {
      return;
    }
    showTerminalDock = true;
    resumeSession(session, project.path, $resolvedTheme === 'dark');
  }

  function handleToggleTerminalDock() {
    showTerminalDock = !showTerminalDock;
    const project = $activeProject;
    if (!showTerminalDock || !project || $activeSessionId || $currentSessions.length === 0) {
      return;
    }
    if (selectedThreadId.startsWith('agent:')) {
      const selectedAgentSlug = selectedThreadId.slice('agent:'.length).trim();
      const matching = $currentSessions.find((session) => sessionAgentSlug(session) === selectedAgentSlug);
      if (matching) {
        setActiveTab(project.id, matching.id);
        return;
      }
    }
    setActiveTab(project.id, $currentSessions[0]!.id);
  }

  async function handleSendMessage(payload: MessagePayload) {
    const project = $activeProject;
    if (!project) {
      return;
    }

    try {
      await invoke('send_project_message', {
        projectId: project.id,
        projectPath: project.path,
        kind: payload.kind,
        text: payload.text,
        target: payload.target ?? null,
        fromName: 'Operator',
        fromDna: null,
      });
      await loadProjectOverview(project.id, project.path);
    } catch (error: any) {
      showToast(error?.toString() ?? 'Failed to send message', {
        title: 'Message failed',
        variant: 'danger',
      });
      throw error;
    }
  }

  async function handleResolveRequest(requestId: string, response: string) {
    const project = $activeProject;
    if (!project) {
      return;
    }

    try {
      await invoke('resolve_project_request', {
        projectId: project.id,
        projectPath: project.path,
        requestId,
        response,
      });
      await loadProjectOverview(project.id, project.path);
    } catch (error: any) {
      showToast(error?.toString() ?? 'Failed to resolve request', {
        title: 'Request failed',
        variant: 'danger',
      });
      throw error;
    }
  }

  async function handleDismissRequest(requestId: string) {
    const project = $activeProject;
    if (!project) {
      return;
    }

    try {
      await invoke('dismiss_project_request', {
        projectId: project.id,
        projectPath: project.path,
        requestId,
      });
      await loadProjectOverview(project.id, project.path);
    } catch (error: any) {
      showToast(error?.toString() ?? 'Failed to dismiss request', {
        title: 'Request failed',
        variant: 'danger',
      });
      throw error;
    }
  }
</script>

<div class="app-shell">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="titlebar" onmousedown={handleTitlebarMousedown}>
    <span class="titlebar-title">{setupComplete && $activeProject ? $activeProject.name : 'termlings'}</span>
  </div>

  {#if !setupComplete && !setupChecking}
    <SetupWizard
      onComplete={async () => {
        setupComplete = true;
        await initApp();
      }}
    />
  {:else if setupComplete}
    <div class="app-layout">
      <Sidebar
        onAddProject={handleAddProject}
        onOpenSettings={() => openSettings()}
        onOpenWorkspaceSettings={async (projectId) => {
          await setActiveProject(projectId);
          openSettings('workspace');
        }}
      />

      <main class="main-panel">
        {#if $activeProject}
          <div class="workspace-shell">
            <section class="workspace-surface">
              <WorkspaceConsole
                project={$activeProject}
                overview={$currentProjectOverview}
                sessions={$currentSessions}
                activeSessionId={$activeSessionId}
                {selectedThreadId}
                terminalDockOpen={showTerminalDock}
                onToggleTerminalDock={handleToggleTerminalDock}
                onSelectThread={handleSelectThread}
                onFocusAgent={handleFocusAgent}
                onSendMessage={handleSendMessage}
                onResolveRequest={handleResolveRequest}
                onDismissRequest={handleDismissRequest}
              />
            </section>

            <section class="terminal-dock" class:open={showTerminalDock}>
              <div class="dock-header">
                <div class="dock-meta">
                  <button class="dock-toggle" onclick={handleToggleTerminalDock}>
                    {showTerminalDock ? 'Hide terminals' : 'Peek terminals'}
                  </button>
                  <div class="dock-copy">
                    <span class="dock-title">
                      {selectedThreadId.startsWith('agent:')
                        ? `${$currentProjectOverview.snapshot?.dmThreads.find((thread) => thread.id === selectedThreadId)?.label ?? 'Agent'} terminal`
                        : 'Agent terminals'}
                    </span>
                    <span class="dock-subtitle">
                      {selectedThreadId.startsWith('agent:')
                        ? 'Selected from the workspace roster'
                        : `${$currentSessions.length} ${$currentSessions.length === 1 ? 'background tab' : 'background tabs'}`}
                    </span>
                  </div>
                </div>

                <div class="dock-actions">
                  <span class="dock-mode">Driven by workspace agents</span>
                </div>
              </div>

              <div class="dock-body">
                <div class="terminal-area">
                  {#each $currentSessions as session (session.id)}
                    {#if isLiveSession(session.id)}
                      <TerminalView
                        sessionId={session.id}
                        visible={showTerminalDock && session.id === $activeSessionId}
                      />
                    {:else if showTerminalDock && session.id === $activeSessionId}
                      <div class="dead-session">
                        <AgentFace name={$activeProject.name} size="lg" />
                        <p class="dead-label">{session.label}</p>
                        <p class="dead-desc">Session ended</p>
                        <button onclick={() => handleResumeTab(session)}>Resume</button>
                      </div>
                    {/if}
                  {/each}

                  {#if $currentSessions.length === 0}
                    <div class="no-sessions">
                      <p>No agent terminals yet.</p>
                      <p class="no-sessions-copy">Add an agent to this project and a terminal tab will appear automatically.</p>
                    </div>
                  {/if}
                </div>

                <BottomBar
                  sessionId={$activeSessionId}
                  projectPath={$activeProject.path}
                  visible={$currentSessions.length > 0}
                />
              </div>
            </section>
          </div>
        {:else}
          <EmptyState onAddProject={handleAddProject} />
        {/if}
      </main>
    </div>
  {/if}
</div>

{#if showSettings}
  <SettingsModal initialTab={settingsTab} onClose={() => (showSettings = false)} />
{/if}

<ToastContainer />

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }

  .titlebar {
    height: var(--titlebar-height);
    min-height: var(--titlebar-height);
    background: var(--card);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
  }

  .titlebar-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--muted-foreground);
    pointer-events: none;
  }

  .app-layout {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .main-panel {
    flex: 1;
    display: flex;
    min-width: 0;
    min-height: 0;
    position: relative;
  }

  .workspace-shell {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    background: transparent;
  }

  .workspace-surface {
    min-width: 0;
    min-height: 0;
    border-bottom: 1px solid var(--border);
  }

  .terminal-dock {
    min-width: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    background: var(--card);
  }

  .dock-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    min-height: 52px;
    padding: 0 var(--space-4);
    border-top: 1px solid var(--border);
  }

  .dock-meta,
  .dock-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .dock-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dock-mode {
    font-size: 11px;
    color: var(--muted-foreground);
    white-space: nowrap;
  }

  .dock-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--foreground);
  }

  .dock-subtitle {
    font-size: 11px;
    color: var(--muted-foreground);
  }

  .dock-toggle {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--foreground);
    font-size: var(--text-7);
    font-weight: var(--font-medium);
    padding: var(--space-2) var(--space-4);
    border-radius: 999px;
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      transform var(--transition-fast);
  }

  .dock-toggle:hover {
    background: var(--accent);
    border-color: var(--border);
    transform: translateY(-1px);
  }

  .dock-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    height: 0;
    max-height: 0;
    transition: height 0.18s ease, max-height 0.18s ease;
  }

  .terminal-dock.open .dock-body {
    height: min(42vh, 520px);
    max-height: min(42vh, 520px);
  }

  .terminal-area {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: color-mix(in srgb, var(--background) 84%, var(--card));
  }

  .no-sessions,
  .dead-session {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
  }

  .no-sessions p {
    color: var(--muted-foreground);
    font-size: var(--text-7);
    margin: 0;
  }

  .no-sessions-copy {
    font-size: var(--text-8);
    max-width: 360px;
    text-align: center;
  }

  .dead-label {
    font-size: var(--text-7);
    font-weight: var(--font-medium);
    color: var(--foreground);
  }

  .dead-desc {
    font-size: var(--text-7);
    color: var(--muted-foreground);
    margin-bottom: 4px;
  }

  .dock-actions :global(button) {
    white-space: nowrap;
  }

  @media (max-width: 1100px) {
    .dock-header {
      padding: 10px 12px;
      align-items: flex-start;
      flex-direction: column;
    }

    .dock-meta,
    .dock-actions {
      width: 100%;
      justify-content: space-between;
      flex-wrap: wrap;
    }

    .terminal-dock.open .dock-body {
      height: 45vh;
      max-height: 45vh;
    }
  }
</style>
