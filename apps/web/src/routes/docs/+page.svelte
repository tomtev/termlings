<script lang="ts">
  import { page } from '$app/state';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import ListChecks from 'lucide-svelte/icons/list-checks';
  import CalendarDays from 'lucide-svelte/icons/calendar-days';
  import Workflow from 'lucide-svelte/icons/workflow';
  import FileText from 'lucide-svelte/icons/file-text';
  import CircleHelp from 'lucide-svelte/icons/circle-help';
  import Palette from 'lucide-svelte/icons/palette';
  import Globe from 'lucide-svelte/icons/globe';
  import Wrench from 'lucide-svelte/icons/wrench';
  import Users from 'lucide-svelte/icons/users';
  import Bot from 'lucide-svelte/icons/bot';
  import Brain from 'lucide-svelte/icons/brain';
  import UserRound from 'lucide-svelte/icons/user-round';
  import Server from 'lucide-svelte/icons/server';
  import Shield from 'lucide-svelte/icons/shield';
  import Settings2 from 'lucide-svelte/icons/settings-2';
  import PanelLeft from 'lucide-svelte/icons/panel-left';
  import PanelLeftClose from 'lucide-svelte/icons/panel-left-close';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let sidebarOpen = $state(false);
  let lastPathKey = $state('');

  type DocEntry = PageData['docs'][number];

  const GROUP_CONFIG: Record<string, { label: string; order: number }> = {
    general: { label: 'general', order: 10 },
    cli_agents: { label: 'agent apps', order: 20 },
    avatar: { label: 'avatar', order: 40 },
    other: { label: 'other', order: 90 },
    wip: { label: 'advanced', order: 100 }
  };

  const DOC_GROUP: Record<string, keyof typeof GROUP_CONFIG> = {
    install: 'general',
    agents: 'general',
    termlings: 'general',
    organizations: 'general',
    settings: 'general',
    templates: 'general',
    spawn: 'general',
    humans: 'general',
    apps: 'cli_agents',
    browser: 'cli_agents',
    docker: 'wip',
    machines: 'wip',
    security: 'wip',
    'org-chart': 'cli_agents',
    requests: 'cli_agents',
    brief: 'cli_agents',
    skills: 'cli_agents',
    brand: 'cli_agents',
    crm: 'cli_agents',
    workflows: 'cli_agents',
    messaging: 'cli_agents',
    task: 'cli_agents',
    calendar: 'cli_agents',
    scheduler: 'wip',
    presence: 'wip',
    avatars: 'avatar',
    lifecycle: 'wip',
    server: 'wip'
  };

  function getGroupForDoc(doc: DocEntry): keyof typeof GROUP_CONFIG {
    return DOC_GROUP[doc.slug] ?? 'other';
  }

  function formatDocLabel(doc: DocEntry): string {
    if (doc.slug === 'install') {
      return 'welcome';
    }

    if (doc.slug === 'termlings') {
      return 'agents';
    }

    if (doc.slug === 'apps') {
      return 'apps';
    }

    return doc.slug.replace(/-/g, ' ').toLowerCase();
  }

  const DOC_SORT_WEIGHTS: Record<string, number> = {
    install: -100,
    spawn: -95,
    agents: -70,
    organizations: -80,
    apps: 0,
    messaging: 10,
    requests: 20,
    'org-chart': 30,
    brief: 40,
    task: 50,
    workflows: 55,
    calendar: 60,
    browser: 70,
    skills: 80,
    brand: 90,
    crm: 95,
    settings: 100,
    docker: 190,
    machines: 195,
    security: 197,
    presence: 200,
    scheduler: 210
  };

  function getDocSortWeight(doc: DocEntry): number {
    return DOC_SORT_WEIGHTS[doc.slug] ?? 0;
  }

  function toDocHref(doc: DocEntry): string {
    if (doc.slug === 'install') {
      return '/docs';
    }

    const slug = doc.slug === 'termlings' ? 'agents' : doc.slug;
    return `/docs/${slug}`;
  }

  const DOC_META: Record<string, { icon: unknown; tone: string }> = {
    install: { icon: FileText, tone: 'slate' },
    agents: { icon: FileText, tone: 'slate' },
    termlings: { icon: Bot, tone: 'violet' },
    organizations: { icon: Workflow, tone: 'mint' },
    humans: { icon: Users, tone: 'emerald' },
    spawn: { icon: FileText, tone: 'slate' },
    templates: { icon: FileText, tone: 'slate' },
    apps: { icon: Workflow, tone: 'violet' },
    lifecycle: { icon: Workflow, tone: 'slate' },
    browser: { icon: Globe, tone: 'blue' },
    docker: { icon: Server, tone: 'slate' },
    machines: { icon: Server, tone: 'slate' },
    security: { icon: Shield, tone: 'rose' },
    brief: { icon: FileText, tone: 'mint' },
    messaging: { icon: MessageSquare, tone: 'aqua' },
    task: { icon: ListChecks, tone: 'lime' },
    calendar: { icon: CalendarDays, tone: 'sky' },
    'org-chart': { icon: Workflow, tone: 'violet' },
    requests: { icon: CircleHelp, tone: 'amber' },
    brand: { icon: Palette, tone: 'rose' },
    crm: { icon: Brain, tone: 'amber' },
    workflows: { icon: Workflow, tone: 'violet' },
    skills: { icon: Wrench, tone: 'indigo' },
    scheduler: { icon: CalendarDays, tone: 'mint' },
    presence: { icon: UserRound, tone: 'slate' },
    avatars: { icon: Bot, tone: 'violet' },
    settings: { icon: Settings2, tone: 'slate' },
    server: { icon: Server, tone: 'amber' }
  };

  function getDocMeta(doc: DocEntry): { icon: unknown; tone: string } | null {
    return DOC_META[doc.slug] ?? null;
  }

  const groupedDocs = $derived.by(() => {
    const groups = new Map<string, DocEntry[]>();

    for (const doc of data.docs) {
      const group = getGroupForDoc(doc);
      const existing = groups.get(group);
      if (existing) {
        existing.push(doc);
      } else {
        groups.set(group, [doc]);
      }
    }

    return Array.from(groups.entries())
      .map(([group, docs]) => ({
        id: group,
        label: GROUP_CONFIG[group]?.label ?? group,
        order: GROUP_CONFIG[group]?.order ?? 80,
        docs: docs.sort((a, b) => {
          const weightDiff = getDocSortWeight(a) - getDocSortWeight(b);
          if (weightDiff !== 0) {
            return weightDiff;
          }

          return formatDocLabel(a).localeCompare(formatDocLabel(b));
        })
      }))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  });

  $effect(() => {
    const pathKey = `${page.url.pathname}${page.url.search}`;
    if (lastPathKey && lastPathKey !== pathKey) {
      sidebarOpen = false;
    }
    lastPathKey = pathKey;
  });

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }
</script>

<svelte:head>
  <title>termlings docs</title>
  <meta
    name="description"
    content="Auto-synced Termlings documentation parsed from the termlings git repository."
  />
</svelte:head>

<div class="docs-shell" class:sidebar-open={sidebarOpen}>
  <button
    type="button"
    class="docs-sidebar-toggle"
    aria-expanded={sidebarOpen}
    aria-controls="docs-sidebar-nav"
    aria-label={sidebarOpen ? 'Hide docs navigation' : 'Show docs navigation'}
    onclick={toggleSidebar}
  >
    {#if sidebarOpen}
      <PanelLeftClose size={16} strokeWidth={2.2} />
    {:else}
      <PanelLeft size={16} strokeWidth={2.2} />
    {/if}
    <span>Documentation</span>
  </button>

  {#if sidebarOpen}
    <button
      type="button"
      class="docs-sidebar-backdrop"
      aria-label="Close docs navigation"
      onclick={() => (sidebarOpen = false)}
    ></button>
  {/if}

  <main class="docs-layout">
    <aside id="docs-sidebar-nav" class="docs-sidebar" class:open={sidebarOpen} aria-label="Documentation files">
      {#if data.docs.length === 0}
        <p class="empty">No docs found in this repo path.</p>
      {:else}
        {#each groupedDocs as group}
          <section class="docs-sidebar-group" aria-label={group.label}>
            <p class="docs-sidebar-group-label">{group.label}</p>
            <div class="docs-sidebar-group-list">
              {#each group.docs as doc}
                {@const docMeta = getDocMeta(doc)}
                <a href={toDocHref(doc)} class:active={data.activeSlug === doc.slug} onclick={() => (sidebarOpen = false)}>
                  <span class={`docs-link-icon ${docMeta?.tone ?? 'slate'}`} aria-hidden="true">
                    {#if docMeta?.icon}
                      {@const Icon = docMeta.icon}
                      <Icon size={12} strokeWidth={2.2} />
                    {/if}
                  </span>
                  <span>{formatDocLabel(doc)}</span>
                </a>
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    </aside>

    <section class="docs-content" aria-live="polite">
      {#if data.activeDoc}
        <div class="docs-content-head">
          <a href={data.activeDoc.htmlUrl} target="_blank" rel="noreferrer">View source</a>
        </div>

        <article class="markdown-body">{@html data.activeDoc.html}</article>
      {:else}
        <p class="empty">Select a doc to view its content.</p>
      {/if}
    </section>
  </main>
</div>

<style>
  .docs-shell {
    --docs-shell-pad-y: 1.25rem;
    --docs-shell-pad-x: 1.25rem;
    --docs-header-offset: var(--site-header-height, 3.6rem);
    min-height: 100vh;
    background: var(--background);
    color: var(--foreground);
    padding: var(--docs-shell-pad-y) var(--docs-shell-pad-x);
  }

  .docs-layout {
    display: block;
  }

  .docs-sidebar-toggle {
    position: fixed;
    left: var(--docs-shell-pad-x);
    right: var(--docs-shell-pad-x);
    bottom: calc(env(safe-area-inset-bottom, 0px) + 0.9rem);
    z-index: 46;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    border: 1px solid color-mix(in srgb, var(--primary) 42%, var(--line-strong));
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--primary) 18%, var(--surface-1));
    color: var(--foreground);
    font-family: var(--font-mono);
    font-size: 0.86rem;
    letter-spacing: 0.01em;
    padding: 0.78rem 1rem;
    cursor: pointer;
    transition: background-color 0.15s ease, transform 0.15s ease;
  }

  .docs-sidebar-toggle:hover {
    background: color-mix(in srgb, var(--primary) 24%, var(--surface-2));
  }

  .docs-sidebar-toggle:active {
    transform: translateY(1px);
  }

  .docs-sidebar-backdrop {
    position: fixed;
    inset: 0;
    z-index: 38;
    border: 0;
    background: color-mix(in srgb, var(--background) 72%, transparent);
  }

  .docs-sidebar,
  .docs-content {
    border: 1px solid var(--line-strong);
    border-radius: 0.75rem;
    background: var(--surface-1);
  }

  .docs-sidebar {
    display: grid;
    gap: 0.65rem;
    padding: 0.7rem;
    position: fixed;
    z-index: 40;
    top: calc(var(--docs-header-offset) + var(--docs-shell-pad-y));
    left: var(--docs-shell-pad-x);
    width: min(16rem, calc(100vw - (var(--docs-shell-pad-x) * 2)));
    max-height: calc(100vh - var(--docs-header-offset) - (var(--docs-shell-pad-y) * 2) - 4.5rem);
    overflow: auto;
    transition: transform 0.22s ease;
    transform: translateX(calc(-100% - 0.75rem));
  }

  .docs-sidebar.open {
    transform: translateX(0);
  }

  .docs-content {
    padding: 1.1rem 1.15rem;
    overflow: hidden;
    min-height: calc(100vh - var(--docs-header-offset) - (var(--docs-shell-pad-y) * 2));
    padding-bottom: calc(1.15rem + 4.6rem);
  }

  @media (min-width: 900px) {
    .docs-layout {
      display: grid;
      grid-template-columns: 16rem minmax(0, 1fr);
      align-items: start;
      gap: 0.9rem;
    }

    .docs-sidebar-toggle,
    .docs-sidebar-backdrop {
      display: none;
    }

    .docs-sidebar {
      position: sticky;
      z-index: auto;
      top: calc(var(--docs-header-offset) + var(--docs-shell-pad-y));
      left: auto;
      width: auto;
      max-height: calc(100vh - var(--docs-header-offset) - (var(--docs-shell-pad-y) * 2));
      transform: none;
    }

    .docs-content {
      padding-bottom: 1.15rem;
    }
  }

  .docs-sidebar-group {
    border-bottom: 1px solid var(--line-soft);
    padding-bottom: 0.5rem;
  }

  .docs-sidebar-group:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .docs-sidebar-group-label {
    margin: 0 0 0.35rem;
    font-size: 0.68rem;
    letter-spacing: 0.03em;
    color: var(--text-subtle);
    font-family: var(--font-mono);
  }

  .docs-sidebar-group-list {
    display: grid;
    gap: 0.25rem;
  }

  .docs-sidebar a {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    border-radius: 0.5rem;
    padding: 0.45rem 0.55rem;
    font-size: 0.88rem;
    color: var(--text-muted);
    transition: background-color 0.15s;
  }

  .docs-link-icon {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 0.32rem;
    border: 1px solid transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .docs-link-icon.aqua {
    color: rgba(45, 212, 191, 0.96);
    border-color: rgba(45, 212, 191, 0.35);
    background: rgba(45, 212, 191, 0.12);
  }

  .docs-link-icon.lime {
    color: rgba(163, 230, 53, 0.96);
    border-color: rgba(163, 230, 53, 0.35);
    background: rgba(163, 230, 53, 0.12);
  }

  .docs-link-icon.sky {
    color: rgba(56, 189, 248, 0.96);
    border-color: rgba(56, 189, 248, 0.35);
    background: rgba(56, 189, 248, 0.12);
  }

  .docs-link-icon.violet {
    color: rgba(167, 139, 250, 0.96);
    border-color: rgba(167, 139, 250, 0.35);
    background: rgba(167, 139, 250, 0.12);
  }

  .docs-link-icon.mint {
    color: rgba(52, 211, 153, 0.96);
    border-color: rgba(52, 211, 153, 0.35);
    background: rgba(52, 211, 153, 0.12);
  }

  .docs-link-icon.amber {
    color: rgba(251, 191, 36, 0.96);
    border-color: rgba(251, 191, 36, 0.35);
    background: rgba(251, 191, 36, 0.12);
  }

  .docs-link-icon.rose {
    color: rgba(251, 113, 133, 0.96);
    border-color: rgba(251, 113, 133, 0.35);
    background: rgba(251, 113, 133, 0.12);
  }

  .docs-link-icon.blue {
    color: rgba(96, 165, 250, 0.96);
    border-color: rgba(96, 165, 250, 0.35);
    background: rgba(96, 165, 250, 0.12);
  }

  .docs-link-icon.indigo {
    color: rgba(129, 140, 248, 0.96);
    border-color: rgba(129, 140, 248, 0.35);
    background: rgba(129, 140, 248, 0.12);
  }

  .docs-link-icon.emerald {
    color: rgba(52, 211, 153, 0.96);
    border-color: rgba(52, 211, 153, 0.35);
    background: rgba(52, 211, 153, 0.12);
  }

  .docs-link-icon.slate {
    color: rgba(148, 163, 184, 0.96);
    border-color: rgba(148, 163, 184, 0.35);
    background: rgba(148, 163, 184, 0.12);
  }

  .docs-sidebar a:hover {
    background: var(--surface-2);
    color: var(--foreground);
  }

  .docs-sidebar a.active {
    background: color-mix(in srgb, var(--primary) 18%, transparent);
    color: var(--foreground);
    border: 1px solid color-mix(in srgb, var(--primary) 50%, transparent);
  }

  .docs-content-head {
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 0.8rem;
    margin-bottom: 0.35rem;
  }

  .docs-content-head a {
    font-size: 0.85rem;
    color: var(--primary);
    white-space: nowrap;
  }

  .empty {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  :global(.markdown-body) {
    color: var(--text-muted);
    line-height: 1.65;
    font-size: 0.95rem;
  }

  :global(.markdown-body h1),
  :global(.markdown-body h2),
  :global(.markdown-body h3),
  :global(.markdown-body h4) {
    color: var(--foreground);
    font-family: var(--font-mono);
    line-height: 1.3;
    margin: 1.2rem 0 0.55rem;
  }

  :global(.markdown-body h1) {
    margin-top: 0;
    font-size: 1.4rem;
  }

  :global(.markdown-body h2) {
    font-size: 1.15rem;
  }

  :global(.markdown-body h3) {
    font-size: 1rem;
  }

  :global(.markdown-body p),
  :global(.markdown-body ul),
  :global(.markdown-body ol),
  :global(.markdown-body pre),
  :global(.markdown-body blockquote) {
    margin: 0.65rem 0;
  }

  :global(.markdown-body ul),
  :global(.markdown-body ol) {
    padding-left: 1.25rem;
  }

  :global(.markdown-body a) {
    color: var(--primary);
    text-decoration: underline;
    text-decoration-thickness: 0.08em;
    text-underline-offset: 0.13em;
  }

  :global(.markdown-body code) {
    font-family: var(--font-mono);
    font-size: 0.86em;
    background: var(--surface-2);
    border: 1px solid var(--line-soft);
    border-radius: 0.32rem;
    padding: 0.08rem 0.28rem;
  }

  :global(.markdown-body pre) {
    overflow: auto;
    padding: 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--line-soft);
    background: var(--surface-2);
  }

  :global(.markdown-body pre code) {
    border: 0;
    background: transparent;
    padding: 0;
    font-size: 0.84rem;
  }

  :global(.markdown-body pre[class*='language-']) {
    background: color-mix(in srgb, var(--surface-2) 78%, var(--background));
    border-color: color-mix(in srgb, var(--line-soft) 75%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--line-soft) 20%, transparent);
  }

  :global(.markdown-body code[class*='language-']) {
    color: color-mix(in srgb, var(--foreground) 92%, transparent);
    text-shadow: none;
  }

  :global(.markdown-body .token.comment),
  :global(.markdown-body .token.prolog),
  :global(.markdown-body .token.doctype),
  :global(.markdown-body .token.cdata) {
    color: color-mix(in srgb, var(--text-muted) 62%, transparent);
  }

  :global(.markdown-body .token.punctuation) {
    color: color-mix(in srgb, var(--text-muted) 88%, transparent);
  }

  :global(.markdown-body .token.property),
  :global(.markdown-body .token.number),
  :global(.markdown-body .token.constant),
  :global(.markdown-body .token.symbol),
  :global(.markdown-body .token.boolean) {
    color: color-mix(in srgb, #f2b880 70%, var(--primary));
  }

  :global(.markdown-body .token.tag),
  :global(.markdown-body .token.selector),
  :global(.markdown-body .token.attr-name),
  :global(.markdown-body .token.string),
  :global(.markdown-body .token.char),
  :global(.markdown-body .token.builtin),
  :global(.markdown-body .token.inserted) {
    color: color-mix(in srgb, #f7d4b0 45%, var(--primary));
  }

  :global(.markdown-body .token.operator),
  :global(.markdown-body .token.entity),
  :global(.markdown-body .token.url),
  :global(.markdown-body .language-css .token.string),
  :global(.markdown-body .style .token.string),
  :global(.markdown-body .token.variable) {
    color: color-mix(in srgb, var(--text-muted) 86%, transparent);
  }

  :global(.markdown-body .token.atrule),
  :global(.markdown-body .token.attr-value),
  :global(.markdown-body .token.keyword) {
    color: color-mix(in srgb, var(--primary) 88%, #f3d2ff);
  }

  :global(.markdown-body .token.function),
  :global(.markdown-body .token.class-name) {
    color: color-mix(in srgb, var(--primary) 72%, var(--foreground));
  }

  :global(.markdown-body .token.regex),
  :global(.markdown-body .token.important) {
    color: color-mix(in srgb, #ffce9f 75%, var(--primary));
  }

  :global(.markdown-body .token.deleted) {
    color: #f08ba7;
  }

  :global(.markdown-body .token.bold) {
    font-weight: 700;
  }

  :global(.markdown-body .token.italic) {
    font-style: italic;
  }

  :global(.markdown-body hr) {
    border: 0;
    border-top: 1px solid var(--line-soft);
    margin: 1rem 0;
  }
</style>
