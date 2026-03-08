<script lang="ts">
  interface Props {
    onAddProject: () => void;
  }

  let { onAddProject }: Props = $props();
</script>

<div class="empty-state">
  <div class="empty-content">
    <span class="eyebrow">Termlings</span>
    <h1>Open a project</h1>
    <p>Each project folder is its own Termlings workspace. Add one to launch agent tabs and the live console.</p>
    <div class="actions">
      <button onclick={onAddProject}>Open project</button>
    </div>
  </div>
</div>

<style>
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    background:
      radial-gradient(circle at top, color-mix(in srgb, var(--secondary) 45%, transparent), transparent 48%),
      var(--background);
  }

  .empty-content {
    text-align: center;
    max-width: 420px;
    padding: 24px;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 10px;
    color: var(--muted-foreground);
  }

  h1 {
    font-size: 30px;
    font-weight: 700;
    margin: 10px 0 8px;
  }

  p {
    color: var(--muted-foreground);
    margin: 0 0 24px;
    font-size: 14px;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
</style>
