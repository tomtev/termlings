<script lang="ts">
  import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
  import { invoke } from '@tauri-apps/api/core';
  import { activeProject } from '../stores/projects';

  type FileKey = 'workspace' | 'spawn';

  interface FileConfig {
    key: FileKey;
    label: string;
    filename: string;
    description: string;
    helper: string;
    starter: string;
  }

  const files: FileConfig[] = [
    {
      key: 'workspace',
      label: 'workspace.json',
      filename: 'workspace.json',
      description: 'Workspace metadata, app availability, and UI-level Termlings settings.',
      helper: 'Changes here affect available apps and workspace behavior. The sidecar will pick up updates on the next refresh.',
      starter: `{
  "version": 1,
  "settings": {
    "avatarSize": "small",
    "showBrowserActivity": true
  }
}`,
    },
    {
      key: 'spawn',
      label: 'spawn.json',
      filename: 'spawn.json',
      description: 'Agent runtime routing for startup and background tab launch behavior.',
      helper: 'Changes here affect future agent launches. Existing agent terminals keep running until they are restarted.',
      starter: `{
  "default": { "runtime": "claude", "preset": "default" },
  "agents": {},
  "runtimes": {
    "claude": {
      "default": {
        "description": "Launch with full autonomy",
        "command": "termlings claude --dangerously-skip-permissions"
      }
    }
  }
}`,
    },
  ];

  let activeFile = $state<FileKey>('workspace');
  let contentByFile = $state<Record<FileKey, string>>({
    workspace: '',
    spawn: '',
  });
  let missingByFile = $state<Record<FileKey, boolean>>({
    workspace: false,
    spawn: false,
  });
  let loading = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  const project = $derived($activeProject);
  const fileConfig = $derived(files.find((entry) => entry.key === activeFile) ?? files[0]!);
  const currentValue = $derived(contentByFile[activeFile]);
  const currentMissing = $derived(missingByFile[activeFile]);

  function joinPath(base: string, ...parts: string[]): string {
    const separator = base.includes('\\') ? '\\' : '/';
    return [base.replace(/[\\/]+$/, ''), ...parts].join(separator);
  }

  function termlingsDir(projectPath: string): string {
    return joinPath(projectPath, '.termlings');
  }

  function filePath(projectPath: string, key: FileKey): string {
    const config = files.find((entry) => entry.key === key) ?? files[0]!;
    return joinPath(termlingsDir(projectPath), config.filename);
  }

  async function loadConfigFiles(projectPath: string) {
    loading = true;
    error = null;
    success = null;

    try {
      const nextContent: Record<FileKey, string> = { workspace: '', spawn: '' };
      const nextMissing: Record<FileKey, boolean> = { workspace: false, spawn: false };

      for (const config of files) {
        const path = filePath(projectPath, config.key);
        if (await exists(path)) {
          nextContent[config.key] = await readTextFile(path);
          nextMissing[config.key] = false;
        } else {
          nextContent[config.key] = config.starter;
          nextMissing[config.key] = true;
        }
      }

      contentByFile = nextContent;
      missingByFile = nextMissing;
    } catch (loadError: any) {
      error = loadError?.toString() ?? 'Failed to load workspace configuration';
    } finally {
      loading = false;
    }
  }

  async function saveActiveFile() {
    if (!project) {
      return;
    }

    saving = true;
    error = null;
    success = null;

    try {
      const raw = contentByFile[activeFile].trim();
      const parsed = JSON.parse(raw || '{}');
      const formatted = `${JSON.stringify(parsed, null, 2)}\n`;
      const dir = termlingsDir(project.path);
      const path = filePath(project.path, activeFile);

      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
      }

      await writeTextFile(path, formatted);
      contentByFile = {
        ...contentByFile,
        [activeFile]: formatted,
      };
      missingByFile = {
        ...missingByFile,
        [activeFile]: false,
      };
      success = `${fileConfig.filename} saved`;
    } catch (saveError: any) {
      if (saveError instanceof SyntaxError) {
        error = `Invalid JSON in ${fileConfig.filename}`;
      } else {
        error = saveError?.toString() ?? `Failed to save ${fileConfig.filename}`;
      }
    } finally {
      saving = false;
    }
  }

  function formatActiveFile() {
    error = null;
    success = null;

    try {
      const parsed = JSON.parse(contentByFile[activeFile].trim() || '{}');
      contentByFile = {
        ...contentByFile,
        [activeFile]: `${JSON.stringify(parsed, null, 2)}\n`,
      };
    } catch {
      error = `Invalid JSON in ${fileConfig.filename}`;
    }
  }

  async function reloadActiveProject() {
    if (!project) {
      return;
    }
    await loadConfigFiles(project.path);
  }

  async function openActiveInEditor() {
    if (!project) {
      return;
    }
    await invoke('open_in_editor', {
      path: filePath(project.path, activeFile),
    }).catch((openError: any) => {
      error = openError?.toString() ?? 'Failed to open file in editor';
    });
  }

  $effect(() => {
    const currentProject = project;
    if (!currentProject) {
      contentByFile = { workspace: '', spawn: '' };
      missingByFile = { workspace: false, spawn: false };
      error = null;
      success = null;
      return;
    }

    loadConfigFiles(currentProject.path);
  });
</script>

{#if !project}
  <div class="empty-state">
    Select a project to edit workspace configuration.
  </div>
{:else}
  <div class="workspace-panel">
    <div class="panel-header">
      <div class="panel-copy">
        <div class="project-label">{project.name}</div>
        <div class="project-path">{project.path}</div>
      </div>
      <button class="outline small" onclick={reloadActiveProject} disabled={loading || saving}>Reload</button>
    </div>

    <div class="file-tabs">
      {#each files as config (config.key)}
        <button
          class="ghost small file-tab"
          class:active={activeFile === config.key}
          onclick={() => {
            activeFile = config.key;
            error = null;
            success = null;
          }}
        >
          {config.label}
        </button>
      {/each}
    </div>

    <div class="file-meta">
      <div class="file-description">
        <strong>{fileConfig.description}</strong>
        <span>{fileConfig.helper}</span>
      </div>
      {#if currentMissing}
        <span class="status-chip missing">Not found yet</span>
      {:else}
        <span class="status-chip">Live file</span>
      {/if}
    </div>

    <textarea
      class="config-editor"
      spellcheck="false"
      value={currentValue}
      oninput={(event) => {
        contentByFile = {
          ...contentByFile,
          [activeFile]: (event.currentTarget as HTMLTextAreaElement).value,
        };
      }}
    ></textarea>

    {#if error}
      <div class="feedback error">{error}</div>
    {:else if success}
      <div class="feedback success">{success}</div>
    {/if}

    <div class="panel-actions">
      <button class="ghost small" onclick={formatActiveFile} disabled={saving}>Format JSON</button>
      <button class="outline small" onclick={openActiveInEditor} disabled={loading || saving}>Open in editor</button>
      <button onclick={saveActiveFile} disabled={loading || saving}>
        {saving ? 'Saving...' : `Save ${fileConfig.filename}`}
      </button>
    </div>
  </div>
{/if}

<style>
  .workspace-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-height: 0;
  }

  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .panel-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .project-label {
    font-size: var(--text-6);
    font-weight: var(--font-semibold);
    color: var(--foreground);
  }

  .project-path {
    font-size: var(--text-8);
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .file-tab.active {
    background: var(--secondary);
    color: var(--secondary-foreground);
  }

  .file-meta {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-medium);
    background: var(--faint);
  }

  .file-description {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-7);
  }

  .file-description strong {
    color: var(--foreground);
  }

  .file-description span {
    color: var(--muted-foreground);
    line-height: 1.45;
  }

  .status-chip {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.55rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background: var(--card);
    color: var(--muted-foreground);
    font-size: var(--text-8);
    white-space: nowrap;
  }

  .status-chip.missing {
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 30%, var(--border));
    background: color-mix(in srgb, var(--warning) 10%, var(--card));
  }

  .config-editor {
    width: 100%;
    min-height: 22rem;
    margin: 0;
    padding: var(--space-4);
    font-family: var(--font-mono);
    font-size: var(--text-7);
    line-height: 1.5;
    resize: vertical;
    background: var(--background);
  }

  .feedback {
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-medium);
    font-size: var(--text-7);
  }

  .feedback.error {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 34%, var(--border));
    background: color-mix(in srgb, var(--danger) 8%, var(--card));
  }

  .feedback.success {
    color: var(--success);
    border-color: color-mix(in srgb, var(--success) 34%, var(--border));
    background: color-mix(in srgb, var(--success) 8%, var(--card));
  }

  .panel-actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .empty-state {
    padding: var(--space-8);
    text-align: center;
    color: var(--muted-foreground);
    border: 1px dashed var(--border);
    border-radius: var(--radius-large);
    background: var(--faint);
  }

  @media (max-width: 900px) {
    .panel-header,
    .file-meta {
      flex-direction: column;
    }

    .project-path {
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
    }
  }
</style>
