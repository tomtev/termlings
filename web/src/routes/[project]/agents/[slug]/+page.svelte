<script lang="ts">
  import WorkspaceView from "$lib/components/WorkspaceView.svelte"

  export let data: {
    payload: {
      snapshot: any
      projects: any[]
      activeProjectId: string
    }
    activeThreadId: string
  }
</script>

{#key `${data.payload.activeProjectId}:${data.activeThreadId}`}
  <WorkspaceView initialPayload={data.payload} initialThreadId={data.activeThreadId} />
{/key}
