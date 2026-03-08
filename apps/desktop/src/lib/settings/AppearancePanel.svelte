<script lang="ts">
  import { theme, setTheme } from '../stores/theme';
</script>

<div class="appearance-panel">
  <div class="setting-group">
    <div class="setting-label">Mode</div>
    <div class="theme-options">
      <button
        class="theme-option"
        class:active={$theme === 'system'}
        onclick={() => setTheme('system')}
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
          <path d="M2.75 3A1.75 1.75 0 0 0 1 4.75v6.5C1 12.216 1.784 13 2.75 13h10.5A1.75 1.75 0 0 0 15 11.25v-6.5A1.75 1.75 0 0 0 13.25 3H2.75ZM2.5 4.75c0-.138.112-.25.25-.25H8v7H2.75a.25.25 0 0 1-.25-.25v-6.5Zm6.75 6.75v-7h4a.25.25 0 0 1 .25.25v6.5a.25.25 0 0 1-.25.25h-4Z"/>
        </svg>
        <span>System</span>
      </button>
      <button
        class="theme-option"
        class:active={$theme === 'light'}
        onclick={() => setTheme('light')}
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-1.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm5.657-8.157a.75.75 0 0 1 0 1.06l-1.061 1.06a.75.75 0 0 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0Zm-9.193 9.193a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 0 1-1.061-1.06l1.06-1.061a.75.75 0 0 1 1.061 0ZM16 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 16 8ZM2.75 8a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1 0-1.5H2a.75.75 0 0 1 .75.75ZM13.657 12.596a.75.75 0 0 1-1.06 0l-1.061-1.06a.75.75 0 0 1 1.06-1.061l1.061 1.06a.75.75 0 0 1 0 1.061Zm-9.193-9.193a.75.75 0 0 1-1.06 0L2.343 2.342a.75.75 0 0 1 1.06-1.06L4.464 2.34a.75.75 0 0 1 0 1.062ZM8 16a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5A.75.75 0 0 1 8 16ZM8 2.25a.75.75 0 0 1-.75-.75V.75a.75.75 0 0 1 1.5 0V1.5A.75.75 0 0 1 8 2.25Z"/>
        </svg>
        <span>Light</span>
      </button>
      <button
        class="theme-option"
        class:active={$theme === 'dark'}
        onclick={() => setTheme('dark')}
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
          <path d="M9.598 1.591a.749.749 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Zm1.616 1.945a7 7 0 0 1-7.678 7.678 5.499 5.499 0 1 0 7.678-7.678Z"/>
        </svg>
        <span>Dark</span>
      </button>
    </div>
    <p class="hint">The app now follows Oak/Oat dark and light tokens directly, so system, light, and dark stay in sync across the shell and the embedded terminals.</p>
  </div>
</div>

<style>
  .appearance-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .setting-label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 8px;
    color: var(--muted-foreground);
  }

  .theme-options {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .theme-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 20px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: none;
    color: var(--muted-foreground);
    cursor: pointer;
    font-size: 12px;
    transition: border-color 0.15s, color 0.15s;
  }

  .theme-option:hover {
    border-color: var(--foreground);
    color: var(--foreground);
  }

  .theme-option.active {
    border-color: var(--foreground);
    color: var(--foreground);
    background: var(--secondary);
  }

  .hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--muted-foreground);
    line-height: 1.4;
  }

</style>
