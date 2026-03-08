<script lang="ts">
  import { encodeDNA, getAvatarCSS, renderLayeredSVG, traitsFromName } from 'termlings';

  interface Props {
    name?: string;
    size?: 'sm' | 'lg' | 'xl';
    dna?: string;
    animated?: boolean;
    walking?: boolean;
    talking?: boolean;
    waving?: boolean;
  }

  let {
    name,
    size = 'lg',
    dna,
    animated = false,
    walking = false,
    talking = false,
    waving = false,
  }: Props = $props();

  const resolvedDna = $derived(dna ?? encodeDNA(traitsFromName(name ?? 'agent')));
  const rendered = $derived(renderLayeredSVG(resolvedDna, size === 'xl' ? 14 : size === 'sm' ? 3 : 8));
  const idle = $derived(!walking && !talking && !waving);
  const idleDelay = Math.random() * 3;

  const activeWalking = $derived(animated && walking);
  const activeTalking = $derived(animated && talking);
  const activeWaving = $derived(animated && waving);
</script>

<svelte:head>{@html `<style>${getAvatarCSS()}</style>`}</svelte:head>

<div
  class="tg-avatar"
  class:idle={animated && idle}
  class:walking={activeWalking}
  class:talking={activeTalking}
  class:waving={activeWaving}
  class:walk-3f={rendered.legFrames === 3}
  class:walk-4f={rendered.legFrames === 4}
  class:sm={size === 'sm'}
  class:lg={size === 'lg'}
  class:xl={size === 'xl'}
  style:--tg-idle-delay={`${idleDelay}s`}
>
  {@html rendered.svg}
</div>

<style>
  .tg-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .tg-avatar.sm {
    width: 27px;
    height: 27px;
    overflow: hidden;
  }

  .tg-avatar.sm :global(svg) {
    width: 27px;
    height: 27px;
  }

  .tg-avatar.lg :global(svg) {
    width: 72px;
    height: 72px;
  }

  .tg-avatar.xl :global(svg) {
    width: 120px;
    height: 120px;
  }
</style>
