<script>
  import '../app.css';
  import SiteHeader from '$lib/SiteHeader.svelte';
  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</svelte:head>

<SiteHeader />
{@render children()}
