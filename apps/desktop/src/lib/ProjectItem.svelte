<script lang="ts">
  import type { Project } from './stores/projects';
  import type { SessionState } from './stores/sessionState';
  import { tooltip } from './actions/tooltip';
  import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
  import { invoke } from '@tauri-apps/api/core';

  interface Props {
    project: Project;
    isActive: boolean;
    collapsed: boolean;
    aggregateState: SessionState | null;
    onSelect: (id: string) => void;
    onOpenWorkspaceConfig: (id: string) => void;
    onRemove: (id: string) => void;
  }

  let { project, isActive, collapsed, aggregateState, onSelect, onOpenWorkspaceConfig, onRemove }: Props = $props();

  const initials = $derived(
    project.name
      .split(/[\s\-_]+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('') || project.name[0]?.toUpperCase() || '?'
  );

  const avatarColor = $derived.by(() => {
    let hash = 0;
    for (let i = 0; i < project.name.length; i++) {
      hash = project.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 45%, 45%)`;
  });

  const shortPath = $derived.by(() => {
    const path = project.path;
    const mac = path.match(/^\/Users\/[^/]+(.*)$/);
    if (mac) return `~${mac[1]}`;
    const linux = path.match(/^\/home\/[^/]+(.*)$/);
    if (linux) return `~${linux[1]}`;
    return path;
  });

  async function showContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const editor = await invoke<string>('get_code_editor').catch(() => 'code');
    const editorLabel: Record<string, string> = {
      code: 'VS Code',
      cursor: 'Cursor',
      zed: 'Zed',
      idea: 'IntelliJ',
      webstorm: 'WebStorm',
    };
    const label = editorLabel[editor] ?? editor;

    const items = [
      await MenuItem.new({
        id: 'workspace-config',
        text: 'Workspace config',
        action: () => {
          onOpenWorkspaceConfig(project.id);
        },
      }),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await MenuItem.new({
        id: 'reveal',
        text: 'Reveal in Finder',
        action: () => {
          invoke('reveal_in_finder', { path: project.path });
        },
      }),
      await MenuItem.new({
        id: 'open-editor',
        text: `Open in ${label}`,
        action: () => {
          invoke('open_in_editor', { path: project.path });
        },
      }),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await MenuItem.new({ id: 'remove', text: 'Remove', action: () => onRemove(project.id) }),
    ];

    const menu = await Menu.new({ items });
    await menu.popup();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="project-item"
  class:active={isActive}
  class:collapsed
  onclick={() => onSelect(project.id)}
  onkeydown={(e) => {
    if (e.key === 'Enter') onSelect(project.id);
  }}
  oncontextmenu={showContextMenu}
  role="option"
  aria-selected={isActive}
  tabindex="0"
  use:tooltip={collapsed ? project.name : undefined}
>
  <span class="avatar-wrapper" class:inactive={!aggregateState}>
    <span class="avatar" style:background={avatarColor}>{initials}</span>
    {#if aggregateState === 'attention'}
      <span class="project-state-dot attention"></span>
    {/if}
  </span>
  {#if !collapsed}
    <span class="project-info">
      <span class="project-name" class:shimmer={aggregateState === 'busy'}>{project.name}</span>
      <span class="project-path">{shortPath}</span>
    </span>
    <button
      class="ghost small dots-btn"
      onclick={(e: MouseEvent) => {
        e.stopPropagation();
        showContextMenu(e);
      }}
      title="Workspace options"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
      </svg>
    </button>
  {/if}
</div>

<style>
  .project-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px;
    border-radius: 10px;
    text-align: left;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;
    position: relative;
    border: 1px solid transparent;
  }

  .project-item:hover {
    background: color-mix(in srgb, var(--muted) 85%, transparent);
    color: var(--foreground);
  }

  .project-item.active {
    background: color-mix(in srgb, var(--secondary) 72%, transparent);
    color: var(--foreground);
    border-color: color-mix(in srgb, var(--foreground) 8%, var(--border));
  }

  .project-item.collapsed {
    justify-content: center;
    padding: 6px;
  }

  .avatar-wrapper {
    position: relative;
    flex-shrink: 0;
    transition: filter 0.2s ease;
  }

  .avatar-wrapper.inactive {
    filter: grayscale(1);
    opacity: 0.5;
  }

  .avatar {
    width: 28px;
    height: 28px;
    min-width: 28px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: var(--primary-foreground);
    line-height: 1;
  }

  .project-state-dot {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 2px solid var(--card);
  }

  .project-state-dot.attention {
    background: var(--warning);
    animation: project-pulse 0.8s ease-in-out infinite;
  }

  @keyframes project-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .project-name.shimmer {
    background: linear-gradient(
      90deg,
      var(--foreground) 0%,
      var(--foreground) 40%,
      var(--muted-foreground) 50%,
      var(--foreground) 60%,
      var(--foreground) 100%
    );
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: project-shimmer 2s ease-in-out infinite;
  }

  @keyframes project-shimmer {
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }

  .project-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: 1px;
  }

  .project-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 600;
  }

  .project-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    color: var(--muted-foreground);
    opacity: 0.8;
  }

  .dots-btn {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    color: var(--muted-foreground);
  }

  .project-item:hover .dots-btn,
  .project-item.active .dots-btn {
    opacity: 1;
  }
</style>
