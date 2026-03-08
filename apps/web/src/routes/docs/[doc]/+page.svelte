<script lang="ts">
  import DocsPage from '../+page.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<DocsPage {data} />
