<script lang="ts">
  import "@knadh/oat/oat.min.css"
  import { onMount } from "svelte"

  onMount(async () => {
    // Oat's JS adds behavior to UI primitives (menus, tabs, dialogs, etc.).
    await import("@knadh/oat/oat.min.js")
  })
</script>

<slot />
