<script lang="ts">
  import {
    projects,
    activeProjectId,
    setActiveProject,
    removeProject,
  } from './stores/projects';
  import { sessionsByProject } from './stores/sessions';
  import { sessionStates, getProjectState } from './stores/sessionState';
  import ProjectItem from './ProjectItem.svelte';

  interface Props {
    onAddProject: () => void;
    onOpenSettings: () => void;
    onOpenWorkspaceSettings: (projectId: string) => void;
  }

  let { onAddProject, onOpenSettings, onOpenWorkspaceSettings }: Props = $props();
  let showAddMenu = $state(false);
  let collapsed = $state(false);
</script>

<aside class="sidebar" class:collapsed>
  <div class="sidebar-header">
    {#if !collapsed}
      <div class="header-copy">
        <span class="eyebrow">Termlings</span>
        <h2>Projects</h2>
      </div>
    {:else}
      <div class="header-mark">T</div>
    {/if}
  </div>

  <div class="project-list">
    {#if $projects.length === 0 && !collapsed}
      <div class="empty-copy">
        <p>No projects added yet.</p>
        <button class="ghost small" onclick={onAddProject}>Open project</button>
      </div>
    {/if}

    {#each $projects as project (project.id)}
      {@const sessions = $sessionsByProject.get(project.id) ?? []}
      {@const projectState = getProjectState($sessionStates, sessions.map((session) => session.id))}
      <ProjectItem
        {project}
        {collapsed}
        isActive={project.id === $activeProjectId}
        aggregateState={projectState}
        onSelect={setActiveProject}
        onOpenWorkspaceConfig={onOpenWorkspaceSettings}
        onRemove={removeProject}
      />
    {/each}
  </div>

  <div class="sidebar-footer">
    <div class="footer-row">
      <div class="left-icons">
        <div class="add-wrapper">
          <button
            class="ghost small icon-btn"
            onclick={() => (showAddMenu = !showAddMenu)}
            title="Add project"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/>
            </svg>
          </button>
          {#if showAddMenu}
            <button
              class="add-backdrop"
              type="button"
              aria-label="Close add project menu"
              onclick={() => (showAddMenu = false)}
            ></button>
            <menu class="add-menu" data-dropdown>
              <button
                role="menuitem"
                onclick={() => {
                  showAddMenu = false;
                  onAddProject();
                }}
              >
                Open project
              </button>
            </menu>
          {/if}
        </div>

        <button class="ghost small icon-btn" onclick={onOpenSettings} title="Settings">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M7.429 1.525a6.593 6.593 0 0 1 1.142 0c.036.003.108.036.137.146l.289 1.105c.147.56.55.967.997 1.189.174.086.341.183.501.29.417.278.97.423 1.53.27l1.102-.303c.11-.03.175.016.195.046.219.31.41.641.573.989.014.031.022.11-.059.19l-.815.806c-.411.406-.562.957-.53 1.456a4.588 4.588 0 0 1 0 .582c-.032.499.119 1.05.53 1.456l.815.806c.08.08.073.159.059.19a6.494 6.494 0 0 1-.573.99c-.02.029-.086.074-.195.045l-1.103-.303c-.559-.153-1.112-.008-1.529.27-.16.107-.327.204-.5.29-.449.222-.851.628-.998 1.189l-.289 1.105c-.029.11-.101.143-.137.146a6.613 6.613 0 0 1-1.142 0c-.036-.003-.108-.037-.137-.146l-.289-1.105c-.147-.56-.55-.967-.997-1.189a4.502 4.502 0 0 1-.501-.29c-.417-.278-.97-.423-1.53-.27l-1.102.303c-.11.03-.175-.016-.195-.046a6.492 6.492 0 0 1-.573-.989c-.014-.031-.022-.11.059-.19l.815-.806c.411-.406.562-.957.53-1.456a4.587 4.587 0 0 1 0-.582c.032-.499-.119-1.05-.53-1.456l-.815-.806c-.08-.08-.073-.159-.059-.19a6.44 6.44 0 0 1 .573-.99c.02-.029.086-.074.195-.045l1.103.303c.559.153 1.112.008 1.529-.27.16-.107.327-.204.5-.29.449-.222.851-.628.998-1.189l.289-1.105c.029-.11.101-.143.137-.146ZM8 0c-.236 0-.47.01-.701.03-.743.065-1.29.615-1.458 1.261l-.29 1.106c-.017.066-.078.158-.211.224a5.994 5.994 0 0 0-.668.386c-.123.082-.233.118-.3.1L3.27 2.801c-.635-.175-1.357.053-1.758.753a7.974 7.974 0 0 0-.703 1.214c-.306.678-.097 1.39.323 1.806l.815.806c.05.048.098.147.088.294a6.084 6.084 0 0 0 0 .652c.01.147-.038.246-.088.294l-.815.806c-.42.417-.629 1.128-.323 1.806.189.418.416.816.703 1.214.4.7 1.123.928 1.758.753l1.103-.303c.067-.018.177.018.3.1.216.144.44.275.668.386.133.066.194.158.212.224l.289 1.106c.169.646.715 1.196 1.458 1.26a8.094 8.094 0 0 0 1.402 0c.743-.064 1.29-.614 1.458-1.26l.29-1.106c.017-.066.078-.158.211-.224a5.98 5.98 0 0 0 .668-.386c.123-.082.233-.118.3-.1l1.102.302c.635.176 1.357-.052 1.758-.752.287-.398.514-.796.703-1.214.306-.678.097-1.39-.323-1.806l-.815-.806c-.05-.048-.098-.147-.088-.294a6.1 6.1 0 0 0 0-.652c-.01-.147.039-.246.088-.294l.815-.806c.42-.417.629-1.128.323-1.806a7.985 7.985 0 0 0-.703-1.214c-.4-.7-1.123-.928-1.758-.753l-1.103.303c-.066.018-.176-.018-.299-.1a5.98 5.98 0 0 0-.668-.386c-.133-.066-.194-.158-.212-.224L9.16 1.29C8.99.645 8.444.095 7.701.031A8.094 8.094 0 0 0 8 0Zm0 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
          </svg>
        </button>
      </div>

      <button
        class="ghost small icon-btn"
        onclick={() => (collapsed = !collapsed)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          {#if collapsed}
            <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
          {:else}
            <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06Z"/>
          {/if}
        </svg>
      </button>
    </div>
  </div>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    height: 100%;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent), var(--card));
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transition: width 0.15s, min-width 0.15s;
  }

  .sidebar.collapsed {
    width: var(--sidebar-collapsed-width);
    min-width: var(--sidebar-collapsed-width);
  }

  .sidebar-header {
    padding: 12px 12px 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
  }

  .header-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .header-copy h2 {
    margin: 0;
    font-size: 15px;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 10px;
    color: var(--muted-foreground);
  }

  .header-mark {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--secondary) 70%, transparent);
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 700;
  }

  .project-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .empty-copy {
    padding: 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--background) 38%, transparent);
    border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .empty-copy p {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 12px;
    line-height: 1.4;
  }

  .sidebar-footer {
    padding: 8px;
    border-top: 1px solid var(--border);
  }

  .footer-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sidebar.collapsed .footer-row {
    flex-direction: column;
    gap: 4px;
  }

  .left-icons {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .sidebar.collapsed .left-icons {
    flex-direction: column;
  }

  .icon-btn {
    padding: 6px;
  }

  .add-wrapper {
    position: relative;
  }

  .add-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .add-menu {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    z-index: 51;
    list-style: none;
    padding: 4px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--shadow-medium);
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 160px;
  }

  .add-menu button {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border: none;
    background: none;
    color: var(--foreground);
    border-radius: 6px;
    cursor: pointer;
  }

  .add-menu button:hover {
    background: var(--muted);
  }
</style>
