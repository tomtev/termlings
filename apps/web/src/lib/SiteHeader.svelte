<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';

  const THEME_STORAGE_KEY = 'termlings-theme';

  const links = [
    { href: '/docs', label: 'Docs' }
  ];

  let theme = $state<'dark' | 'light'>('dark');

  function applyTheme(nextTheme: 'dark' | 'light', persist = false) {
    theme = nextTheme;

    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
    }

    if (persist && typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    }
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark', true);
  }

  function isActive(href: string) {
    return page.url.pathname === href;
  }

  onMount(() => {
    const fromDom = document.documentElement.dataset.theme;
    if (fromDom === 'light' || fromDom === 'dark') {
      theme = fromDom;
      return;
    }

    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme: 'dark' | 'light' =
      storedTheme === 'light' || storedTheme === 'dark'
        ? storedTheme
        : prefersDark
          ? 'dark'
          : 'light';

    applyTheme(initialTheme);
  });
</script>

<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/">
      <img class="brand-logo" src="/logo.svg" alt="Termlings logo" />
      <span class="brand-name">termlings</span>
    </a>

    <nav class="menu" aria-label="Main links">
      {#each links as link}
        <a href={link.href} class:active={isActive(link.href)}>{link.label}</a>
      {/each}
    </nav>

    <button
      class="theme-toggle"
      type="button"
      onclick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {#if theme === 'dark'}
        <Sun size={14} strokeWidth={2.2} />
      {:else}
        <Moon size={14} strokeWidth={2.2} />
      {/if}
    </button>

    <a class="header-link" href="https://github.com/tomtev/termlings" target="_blank" rel="noreferrer">
      GitHub
    </a>
  </div>
</header>

<style>
  .site-header {
    position: sticky;
    top: 0;
    z-index: 20;
    border-bottom: 1px solid var(--line-soft);
    background: var(--surface-1);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .header-inner {
    width: 100%;
    padding: 0.75rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .brand-logo {
    width: 1.6rem;
    height: 1.6rem;
    display: block;
    image-rendering: pixelated;
  }

  .brand-name {
    font-family: var(--font-mono);
    font-size: 0.95rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--foreground);
    letter-spacing: 0.04em;
  }

  .menu {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    overflow-x: auto;
    padding-bottom: 0.15rem;
    scrollbar-width: none;
  }

  .menu::-webkit-scrollbar {
    display: none;
  }

  .menu a {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--foreground);
    border: 1px solid var(--line-strong);
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--surface-2) 78%, transparent);
    padding: 0.4rem 0.85rem;
    min-height: 2.1rem;
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .menu a:hover {
    background: var(--surface-2);
  }

  .menu a.active {
    border-color: color-mix(in srgb, var(--primary) 45%, var(--line-strong));
    background: color-mix(in srgb, var(--primary) 16%, var(--surface-2));
  }

  .theme-toggle {
    flex-shrink: 0;
    color: var(--foreground);
    border: 1px solid var(--line-strong);
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--surface-2) 78%, transparent);
    width: 2.1rem;
    height: 2.1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    transition: all 0.15s;
  }

  .theme-toggle:hover {
    background: var(--surface-3);
  }

  .header-link {
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--foreground);
    border: 1px solid var(--line-strong);
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--surface-2) 78%, transparent);
    min-height: 2.1rem;
    display: inline-flex;
    align-items: center;
    padding: 0.4rem 0.85rem;
    transition: all 0.15s;
  }

  .header-link:hover {
    background: var(--surface-3);
  }

  @media (max-width: 720px) {
    .header-inner {
      padding: 0.6rem 0.9rem;
    }

    .header-link {
      display: none;
    }
  }
</style>
