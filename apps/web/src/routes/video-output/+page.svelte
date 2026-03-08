<script>
  import FakeTerminalChat from '$lib/FakeTerminalChat.svelte';
</script>

<svelte:head>
  <title>Video Output · Termlings</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="video-output-page">
  <section class="video-stage" aria-label="Terminal demo output">
    <div class="video-square">
      <FakeTerminalChat />
    </div>
  </section>
</main>

<style>
  .video-output-page {
    min-height: 100vh;
    background: var(--background);
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  .video-stage {
    width: min(96vw, 888.89px);
    aspect-ratio: 16 / 9;
    max-height: 500px;
    border-radius: 0.9rem;
    border: 1px solid var(--line-strong);
    overflow: hidden;
    background: #16a34a;
    display: grid;
    place-items: center;
    padding: 1.8rem;
  }

  .video-square {
    width: min(92%, calc(100% * 9 / 16));
    aspect-ratio: 1 / 1;
    border-radius: 0.65rem;
    overflow: hidden;
    animation: video-square-enter 720ms cubic-bezier(0.22, 1, 0.36, 1) 950ms both;
  }

  @keyframes video-square-enter {
    from {
      opacity: 0;
      transform: translateY(22px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 900px) {
    .video-output-page {
      padding: 0.5rem;
    }

    .video-stage {
      width: 100%;
      border-radius: 0.7rem;
      padding: 1rem;
    }

    .video-square {
      width: min(96%, calc(100% * 9 / 16));
    }
  }
</style>
