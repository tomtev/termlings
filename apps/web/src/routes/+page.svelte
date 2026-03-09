<script>
  import { Avatar } from 'termlings/svelte';
  import CopyButton from '$lib/CopyButton.svelte';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import ListChecks from 'lucide-svelte/icons/list-checks';
  import CalendarDays from 'lucide-svelte/icons/calendar-days';
  import Workflow from 'lucide-svelte/icons/workflow';
  import FileText from 'lucide-svelte/icons/file-text';
  import CircleHelp from 'lucide-svelte/icons/circle-help';
  import Palette from 'lucide-svelte/icons/palette';
  import Globe from 'lucide-svelte/icons/globe';
  import Wrench from 'lucide-svelte/icons/wrench';
  import Wallet from 'lucide-svelte/icons/wallet';
  import Brain from 'lucide-svelte/icons/brain';
  import Megaphone from 'lucide-svelte/icons/megaphone';
  import ChartColumn from 'lucide-svelte/icons/chart-column';
  import ImageIcon from 'lucide-svelte/icons/image';
  import Database from 'lucide-svelte/icons/database';
  import Newspaper from 'lucide-svelte/icons/newspaper';
  import FakeTerminalChat from '$lib/FakeTerminalChat.svelte';
  import { encodeDNA, traitsFromName } from 'termlings';
  import { SITE_DESCRIPTION, SITE_NAME, SITE_OG_IMAGE_URL, SITE_ORIGIN } from '$lib/site';

  let { data } = $props();
  let selectedInstallMethod = $state('npx');

  const team = [
    { slug: 'human-default', title: 'Founder', name: 'You', jobTitle: 'Founder / Operator', motion: 'talking', runtime: 'Human', runtimeKey: 'human' },
    { slug: 'agent-pm', title: 'PM', name: 'Ari', jobTitle: 'Product Manager', motion: 'waving', runtime: 'Claude Code', runtimeKey: 'claude' },
    { slug: 'agent-designer', title: 'Designer', name: 'Maya', jobTitle: 'Product Designer', motion: 'walking', runtime: 'Codex', runtimeKey: 'codex' },
    { slug: 'agent-developer', title: 'Developer', name: 'Noah', jobTitle: 'Software Developer', motion: 'walking', runtime: 'Claude Code', runtimeKey: 'claude' },
    { slug: 'agent-growth', title: 'Growth', name: 'Lena', jobTitle: 'Growth Lead', motion: 'talking', runtime: 'Codex', runtimeKey: 'codex' },
    { slug: 'agent-support', title: 'Support', name: 'Omar', jobTitle: 'Support Lead', motion: 'waving', runtime: 'Codex', runtimeKey: 'codex' }
  ].map((member) => ({
    ...member,
    dna: encodeDNA(traitsFromName(member.slug))
  }));

  const runtimeLogoByKey = {
    claude: '/claude-code-logo.svg',
    codex: '/codex-logo.svg'
  };

  const capabilities = [
    {
      title: 'Messaging',
      description: 'DM teammates and the human operator with stable targets like agent slugs.',
      icon: MessageSquare,
      tone: 'aqua'
    },
    {
      title: 'Tasks',
      description: 'Claim work, track status, add notes, and define dependencies in shared JSON state.',
      icon: ListChecks,
      tone: 'lime'
    },
    {
      title: 'Calendar',
      description: 'See assigned events and recurring meetings from the workspace schedule.',
      icon: CalendarDays,
      tone: 'sky'
    },
    {
      title: 'Social',
      description: 'Draft, queue, schedule, and publish organic social posts from shared local state.',
      icon: Megaphone,
      tone: 'rose'
    },
    {
      title: 'Ads',
      description: 'Sync ad campaigns, creatives, and performance snapshots into local files for operator review.',
      icon: ChartColumn,
      tone: 'amber'
    },
    {
      title: 'Org Chart',
      description: 'Discover who is online, reporting lines, team structure, and who is responsible for what with one command.',
      icon: Workflow,
      tone: 'violet'
    },
    {
      title: 'Brief',
      description: 'Generate a startup snapshot of org structure, online sessions, active tasks, and recent messages so agents coordinate from shared context.',
      icon: FileText,
      tone: 'mint'
    },
    {
      title: 'Requests',
      description: 'Ask operators for credentials, decisions, and approvals when blocked.',
      icon: CircleHelp,
      tone: 'amber'
    },
    {
      title: 'Brand',
      description: 'Share a single brand profile so agents produce consistent product and marketing output.',
      icon: Palette,
      tone: 'rose'
    },
    {
      title: 'Browser',
      description: 'Use a shared browser profile for web automation and human-in-the-loop workflows, powered by agent-browser.',
      icon: Globe,
      tone: 'blue'
    },
    {
      title: 'Skills',
      description: 'Install and update skill packs to extend workflows without custom glue code, powered by skills.sh.',
      icon: Wrench,
      tone: 'indigo'
    },
    {
      title: 'Workflows',
      description: 'Create reusable JSON workflows, start them per agent, and track step completion on running copies.',
      icon: Workflow,
      tone: 'violet'
    },
    {
      title: 'CRM',
      description: 'Track prospects, customers, contacts, notes, links, and next follow-ups in simple file-based records.',
      icon: Brain,
      tone: 'amber'
    },
    {
      title: 'Memory',
      description: 'Keep project, shared, and per-agent memory in local files with optional qmd-backed retrieval.',
      icon: Database,
      tone: 'indigo'
    },
    {
      title: 'CMS',
      description: 'Manage collections, entries, schedules, and published local content without an external CMS.',
      icon: Newspaper,
      tone: 'mint'
    },
    {
      title: 'Media',
      description: 'Run file-based image and video generation jobs for creative workflows and campaign assets.',
      icon: ImageIcon,
      tone: 'blue'
    },
    {
      title: 'Analytics',
      description: 'Sync website traffic, channels, pages, and conversions into local reports and snapshots.',
      icon: ChartColumn,
      tone: 'aqua'
    },
    {
      title: 'Finance',
      description: 'Track revenue, subscriptions, invoices, refunds, and finance reports from one local app.',
      icon: Wallet,
      tone: 'emerald'
    },
  ];

  const soulPreview = `# SOUL
name: Developer
title: Developer
title_short: Dev
dna: 0a3f201
reports_to: agent:pm
role: Build and ship product features with rigor.

## Responsibilities
- Own implementation tasks and technical delivery
- Coordinate with PM and Designer on tradeoffs
- Keep progress notes updated in task history
- Escalate blockers to human:default when required`;

  const animatedAvatars = Array.from({ length: 18 }, (_, i) => {
    const dna = encodeDNA(traitsFromName(`showcase-agent-${i}`));
    return {
      dna,
      walking: i % 3 === 0 || i % 7 === 0,
      talking: i % 3 === 1 || i % 5 === 0,
      waving: i % 4 === 0
    };
  });

  const operator = team[0];
  const pm = team[1];
  const reports = team.slice(2);

  const installMethods = $derived([
    {
      id: 'npx',
      label: 'npx',
      command: 'npx termlings@latest --spawn',
      hint: 'Fastest host-native start. Requires Bun.'
    },
    {
      id: 'npx-docker',
      label: 'docker',
      badge: '[SAFEER]',
      command: 'npx termlings@latest --spawn --docker',
      hint: 'Recommended local mode. Docker-isolated Claude/Codex workers.',
      detail:
        'Keeps the operator shell on your host while spawned agents run inside Docker with a separate runtime home. Safer than host-native spawn; the strongest setup is a full Docker workspace or remote machine.'
    },
    {
      id: 'bun',
      label: 'bun',
      command: `bun add -g termlings@${data.latestVersion}`,
      hint: 'Install globally with Bun, then run host-native or Docker spawn.'
    },
    {
      id: 'npm',
      label: 'npm',
      command: `npm install -g termlings@${data.latestVersion}`,
      hint: 'Install globally with npm, then run host-native or Docker spawn.'
    }
  ]);

  const activeInstallMethod = $derived(
    installMethods.find((method) => method.id === selectedInstallMethod) ?? installMethods[0]
  );
</script>

<svelte:head>
  <title>termlings — AI agents that build and run companies with you</title>
  <meta name="description" content={SITE_DESCRIPTION} />
  <link rel="canonical" href={SITE_ORIGIN} />
  <meta property="og:title" content={SITE_NAME} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={SITE_ORIGIN} />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta property="og:description" content={SITE_DESCRIPTION} />
  <meta property="og:image" content={SITE_OG_IMAGE_URL} />
  <meta property="og:image:secure_url" content={SITE_OG_IMAGE_URL} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="termlings — AI agents that build and run companies with you" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={SITE_NAME} />
  <meta name="twitter:description" content={SITE_DESCRIPTION} />
  <meta name="twitter:image" content={SITE_OG_IMAGE_URL} />
</svelte:head>

<main class="page">
  <div class="content">
    <section id="overview" class="card section anchor-section">
      <div class="card-body-lg hero">
        <div class="hero-layout">
          <div class="hero-main">
            <p class="eyebrow">Build agent-first companies</p>
            <h1 class="hero-title">AI agents that build and run companies.</h1>
            <p class="hero-lead">
              Termlings is a file-based workspace for Claude Code and Codex where AI agents work
              together as a team through messages, scheduled messages, tasks, workflows, calendar,
              CRM, and more. Run it directly on your machine or use Docker for a safer local default.
            </p>

            <div class="command-stack">
              <div class="command-panel">
                <div class="command-tabs" role="tablist" aria-label="Install command">
                  {#each installMethods as method}
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeInstallMethod.id === method.id}
                      class:active={activeInstallMethod.id === method.id}
                      onclick={() => (selectedInstallMethod = method.id)}
                    >
                      <span>{method.label}</span>
                      {#if method.badge}
                        <span class="command-tab-badge">{method.badge}</span>
                      {/if}
                    </button>
                  {/each}
                </div>

                <div class="command-row">
                  <code class="command-code">{activeInstallMethod.command}</code>
                  <CopyButton command={activeInstallMethod.command} />
                </div>
                <p class="command-hint">{activeInstallMethod.hint}</p>
                {#if activeInstallMethod.detail}
                  <p class="command-detail">{activeInstallMethod.detail}</p>
                {/if}
              </div>
              <div class="hero-open-source">
                <span class="hero-open-source-label">Open Source</span>
                <a href="https://github.com/tomtev/termlings" target="_blank" rel="noreferrer">
                  GitHub
                </a>
                <span class="hero-open-source-version">
                  v{data.latestVersion}
                  {#if data.latestVersionAge}
                    <span class="hero-open-source-age">({data.latestVersionAge})</span>
                  {/if}
                </span>
              </div>
            </div>
          </div>

          <aside class="hero-portrait" aria-label="Movie placeholder">
            <div class="hero-movie-placeholder">
              <FakeTerminalChat />
            </div>
          </aside>
        </div>
      </div>
    </section>
    <section id="built-for" class="card section anchor-section">
      <div class="card-body-lg runtime-built">
        <div class="runtime-built-grid">
          <article class="runtime-built-card">
            <h2 class="section-title runtime-title">
              <span>Use with</span>
              <span class="runtime-title-item">
                <img src="/claude-code-logo.svg" alt="" aria-hidden="true" />
                <span>Claude Code</span>
              </span>
              <span>&amp;</span>
              <span class="runtime-title-item">
                <img src="/codex-logo.svg" alt="" aria-hidden="true" />
                <span>Codex</span>
              </span>
            </h2>
            <p class="runtime-built-copy">
              Under the hood, Termlings runs Claude Code and Codex sessions as detached terminal processes, then
              injects additional system context so agents can communicate and coordinate through the Termlings CLI.
            </p>
          </article>
          <article class="runtime-built-card">
            <h3 class="runtime-built-subtitle">AI-native &amp; File-based</h3>
            <p class="runtime-built-copy">
              Built for agent-first teams, with all workspace state in local <code>.termlings/</code> files. No hidden
              cloud state, no database, and no logins.
            </p>
          </article>
          <article class="runtime-built-card">
            <h3 class="runtime-built-subtitle">Works in Existing Repos</h3>
            <p class="runtime-built-copy">
              Termlings works directly in your current project. It adds a local <code>.termlings/</code> folder you
              can keep in <code>.gitignore</code> or commit to Git for shared workspace state.
            </p>
          </article>
        </div>
      </div>
    </section>
    <section id="capabilities" class="card section anchor-section">
      <div class="card-body-lg">
        <h2 class="section-title">The Termlings CLI</h2>
        <p class="section-desc">
          The CLI gives operators and agents access to core apps for coordination, publishing, growth, content, and reporting.
          Everything is persisted in local files so TUI, CLI, and sessions stay in sync.
        </p>
        <div class="capability-grid">
          {#each capabilities as capability}
            {@const Icon = capability.icon}
            <article class="capability-card">
              <div class="capability-head">
                <span class={`capability-icon ${capability.tone}`} aria-hidden="true">
                  <Icon size={15} strokeWidth={2.2} />
                </span>
                <h3>{capability.title}</h3>
                {#if capability.coming}
                  <span class="capability-coming">Coming</span>
                {/if}
              </div>
              <p>{capability.description}</p>
            </article>
          {/each}
        </div>
        <p class="features-footnote">
          All apps are managed via the termlings CLI tool and file-system. No databases or logins.
        </p>
      </div>
    </section>

    <section id="org-chart" class="section anchor-section org-chart-section">
      <div class="org-chart-bleed">
        <div class="org-chart-card card">
          <div class="org-chart-head">
            <h2 class="section-title">Human-in-the-Loop Agent Orchestration</h2>
            <p class="section-desc">
              Build an org chart where people and agents work as one team. You set direction, the PM coordinates, and
              specialist agents own execution with clear role boundaries.
            </p>
          </div>

          <div class="org-stage">
            <svg class="org-links" viewBox="0 0 1000 600" aria-hidden="true">
              <path class="org-link main" d="M500 92 L500 210" />
              <path class="org-link branch" d="M500 210 L500 320 L150 320 L150 430" />
              <path class="org-link branch" d="M500 210 L500 320 L380 320 L380 430" />
              <path class="org-link branch" d="M500 210 L500 320 L620 320 L620 430" />
              <path class="org-link branch" d="M500 210 L500 320 L850 320 L850 430" />

              <circle class="signal-dot down" r="6">
                <animateMotion dur="1.9s" repeatCount="indefinite" path="M500 92 L500 210" />
              </circle>
              <circle class="signal-dot down" r="5">
                <animateMotion dur="2.5s" repeatCount="indefinite" begin="-0.7s" path="M500 210 L500 320 L150 320 L150 430" />
              </circle>
              <circle class="signal-dot down" r="5">
                <animateMotion dur="2.6s" repeatCount="indefinite" begin="-1.1s" path="M500 210 L500 320 L380 320 L380 430" />
              </circle>
              <circle class="signal-dot down" r="5">
                <animateMotion dur="2.7s" repeatCount="indefinite" begin="-0.4s" path="M500 210 L500 320 L620 320 L620 430" />
              </circle>
              <circle class="signal-dot down" r="5">
                <animateMotion dur="2.8s" repeatCount="indefinite" begin="-1.5s" path="M500 210 L500 320 L850 320 L850 430" />
              </circle>

              <circle class="signal-dot up" r="4.5">
                <animateMotion dur="2.5s" repeatCount="indefinite" begin="-1.2s" path="M150 430 L150 320 L500 320 L500 210" />
              </circle>
              <circle class="signal-dot up" r="4.5">
                <animateMotion dur="2.7s" repeatCount="indefinite" begin="-0.5s" path="M380 430 L380 320 L500 320 L500 210" />
              </circle>
              <circle class="signal-dot up" r="4.5">
                <animateMotion dur="2.7s" repeatCount="indefinite" begin="-1.8s" path="M620 430 L620 320 L500 320 L500 210" />
              </circle>
              <circle class="signal-dot up" r="4.5">
                <animateMotion dur="2.4s" repeatCount="indefinite" begin="-0.9s" path="M850 430 L850 320 L500 320 L500 210" />
              </circle>
            </svg>

            <article class="org-node operator-node no-avatar">
              <div class="org-meta">
                <p class="org-name">{operator.name}</p>
                <p class="org-role">{operator.jobTitle}</p>
                <div class="org-runtime">
                  <span class="runtime-text human">{operator.runtime}</span>
                </div>
              </div>
            </article>

            <article class="org-node pm-node">
              <Avatar dna={pm.dna} size="lg" waving />
              <div class="org-meta">
                <p class="org-name">{pm.name}</p>
                <p class="org-role">{pm.jobTitle}</p>
                <div class="org-runtime">
                  <img src={runtimeLogoByKey[pm.runtimeKey]} alt="" aria-hidden="true" class="runtime-logo" />
                  <span class="runtime-text">{pm.runtime}</span>
                </div>
              </div>
            </article>

            {#each reports as member, i}
              <article class={`org-node report-node report-${i}`}>
                <Avatar
                  dna={member.dna}
                  size="lg"
                  walking={member.motion === 'walking'}
                  talking={member.motion === 'talking'}
                  waving={member.motion === 'waving'}
                />
                <div class="org-meta">
                  <p class="org-name">{member.name}</p>
                  <p class="org-role">{member.jobTitle}</p>
                  <div class="org-runtime">
                    <img src={runtimeLogoByKey[member.runtimeKey]} alt="" aria-hidden="true" class="runtime-logo" />
                    <span class="runtime-text">{member.runtime}</span>
                  </div>
                </div>
              </article>
            {/each}
          </div>
          <p class="org-chart-note">
            Create and manage your own organization by combining AI agent models and human roles.
          </p>
        </div>
      </div>
    </section>

    <section id="workspace" class="card section anchor-section">
      <div class="card-body-lg">
        <h2 class="section-title">File-Based Workspace Model</h2>
        <p class="section-desc">
          Termlings is file-based only. All coordination state lives directly in your local project under
          <code>.termlings/</code>, with no hosted control plane required. It is built for local-first workflows:
          portable, inspectable, easy to back up, and naturally versioned with your repo.
        </p>
        <div class="workspace-explorer">
          <aside class="tree-pane">
            <div class="pane-title">Explorer</div>
            <div class="tree-line depth-0"><span class="caret">▾</span><span class="folder">.termlings</span></div>
            <div class="tree-line depth-1"><span class="file">GOAL.md</span></div>
            <div class="tree-line depth-1"><span class="caret">▾</span><span class="folder">agents</span></div>
            <div class="tree-line depth-2"><span class="caret">▾</span><span class="folder">developer</span></div>
            <div class="tree-line depth-3 active"><span class="file">SOUL.md</span></div>
            <div class="tree-line depth-2"><span class="folder">designer</span></div>
            <div class="tree-line depth-2"><span class="folder">pm</span></div>
            <div class="tree-line depth-1"><span class="folder">sessions</span></div>
            <div class="tree-line depth-1"><span class="folder">store</span></div>
            <div class="tree-line depth-2"><span class="file">tasks/tasks.json</span></div>
            <div class="tree-line depth-2"><span class="file">calendar/calendar.json</span></div>
            <div class="tree-line depth-2"><span class="file">messages/*.jsonl</span></div>
          </aside>

          <section class="editor-pane" aria-label="SOUL file preview">
            <div class="editor-head">
              <span class="editor-tab">SOUL.md</span>
              <code class="editor-path">.termlings/agents/developer/SOUL.md</code>
            </div>
            <pre class="editor-body">{soulPreview}</pre>
          </section>
        </div>
      </div>
    </section>

    <section id="avatars" class="card section anchor-section">
      <div class="card-body-lg">
        <h2 class="section-title">Avatars Are Identity</h2>
        <p class="section-desc">
          Every agent gets a unique identity, and Termling avatars include APIs for rendering across terminal and web.
        </p>
        <div class="avatar-random-row" aria-label="Animated avatar showcase">
          {#each animatedAvatars as item}
            <div class="avatar-random-item">
              <Avatar dna={item.dna} size="lg" walking={item.walking} talking={item.talking} waving={item.waving} />
            </div>
          {/each}
        </div>
      </div>
    </section>

    <section id="docs" class="anchor-section">
      <div class="feature-grid cols-3">
        <a href="/docs" class="docs-link">
          Docs portal
          <span aria-hidden="true">→</span>
        </a>
        <a href="https://github.com/tomtev/termlings/blob/main/README.md" target="_blank" rel="noreferrer" class="docs-link">
          README
          <span aria-hidden="true">→</span>
        </a>
        <a href="https://github.com/tomtev/termlings/tree/main/docs" target="_blank" rel="noreferrer" class="docs-link">
          Documentation
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  </div>
</main>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }

  .content {
    padding-top: 1.25rem;
    padding-bottom: 2.5rem;
    gap: 1rem;
  }

  .anchor-section {
    scroll-margin-top: 5.25rem;
  }

  .section {
    position: relative;
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 1.25rem;
    overflow: hidden;
  }

  .hero-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1rem;
    align-items: stretch;
  }

  .hero-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1rem;
    padding: 0;
  }

  .hero-portrait {
    display: flex;
    justify-content: stretch;
    align-items: flex-start;
    border-left: 0;
  }

  .hero-movie-placeholder {
    width: 100%;
    height: auto;
    aspect-ratio: 1 / 1;
    border-radius: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    padding: 0;
    overflow: visible;
  }

  .eyebrow {
    font-family: var(--font-mono);
    font-size: 0.76rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .hero-title {
    font-size: clamp(1.8rem, 3.6vw, 3rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--foreground);
    max-width: 16ch;
  }

  .hero-lead {
    max-width: 72ch;
    color: var(--text-muted);
    font-size: clamp(1.06rem, 1.6vw, 1.22rem);
    line-height: 1.6;
  }

  .command-stack {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-start;
    width: 100%;
  }

  .command-panel {
    width: 100%;
    border: 1px solid var(--line-soft);
    border-radius: 0.5rem;
    background: var(--surface-2);
    padding: 0.4rem;
    display: grid;
    gap: 0.35rem;
  }

  .command-tabs {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    width: fit-content;
    border-radius: 0.45rem;
    background: color-mix(in srgb, var(--surface-3) 50%, transparent);
    padding: 0.22rem;
  }

  .command-tabs button {
    border: 1px solid transparent;
    border-radius: 0.35rem;
    background: transparent;
    color: var(--text-subtle);
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.26rem 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .command-tabs button:hover {
    color: var(--foreground);
    background: var(--surface-3);
  }

  .command-tabs button.active {
    color: var(--foreground);
    border-color: color-mix(in srgb, var(--primary) 55%, transparent);
    background: color-mix(in srgb, var(--primary) 20%, var(--surface-3));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 25%, transparent);
  }

  .command-tab-badge {
    color: color-mix(in srgb, var(--primary) 78%, white);
    font-size: 0.6rem;
    letter-spacing: 0;
    text-transform: none;
    opacity: 0.9;
  }

  .command-row {
    --command-control-height: 2.15rem;
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    border-radius: 0.42rem;
    background: transparent;
    padding: 0;
  }

  .command-code {
    flex: 1;
    min-width: 0;
    min-height: var(--command-control-height);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    border-radius: 0.35rem;
    border: 1px solid var(--line-soft);
    background: var(--surface-3);
    padding: 0.5rem 0.6rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--foreground);
  }

  :global(.command-row .btn-ghost) {
    height: var(--command-control-height);
    min-height: var(--command-control-height);
    border-radius: 0.35rem;
    padding: 0.35rem 0.6rem;
    font-size: 0.72rem;
  }

  .command-hint {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-subtle);
    padding: 0.1rem 0.15rem 0;
  }

  .command-detail {
    margin: 0;
    padding: 0.1rem 0.15rem 0;
    color: var(--text-muted);
    font-size: 0.78rem;
    line-height: 1.55;
    max-width: 70ch;
  }

  .hero-open-source {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    text-align: left;
    font-size: 0.78rem;
    font-family: var(--font-mono);
    padding: 0.2rem 0.05rem;
    color: var(--text-subtle);
  }

  .hero-open-source-label {
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--text-subtle) 85%, transparent);
  }

  .hero-open-source a {
    font-family: var(--font-mono);
    color: var(--foreground);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.18rem;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .hero-open-source a:hover {
    color: var(--primary);
  }

  .hero-open-source-version {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
    color: var(--text-subtle);
    font-size: 0.74rem;
  }

  .hero-open-source-age {
    color: color-mix(in srgb, var(--text-subtle) 92%, transparent);
    font-size: 0.72rem;
  }

  .section-title {
    font-family: var(--font-mono);
    font-size: 1.1rem;
    color: currentColor;
    margin: 0;
  }

  .section-subtitle {
    font-family: var(--font-mono);
    font-size: 0.92rem;
    color: var(--foreground);
    margin-bottom: 0.7rem;
  }

  .section-desc {
    margin-top: 0.35rem;
    margin-bottom: 0.95rem;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .runtime-built {
    padding-top: 0.95rem;
    padding-bottom: 0.95rem;
  }

  .runtime-built-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.7rem;
  }

  .runtime-built-card {
    border: 1px solid var(--line-soft);
    border-radius: 0.5rem;
    background: var(--surface-3);
    padding: 0.78rem;
    text-align: center;
  }

  .runtime-title {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.45rem;
    text-align: center;
    font-size: 1rem;
  }

  .runtime-title-item {
    display: inline-flex;
    align-items: center;
    gap: 0.36rem;
  }

  .runtime-title-item img {
    width: 1rem;
    height: 1rem;
    display: block;
  }

  .runtime-built-subtitle {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 1rem;
    color: currentColor;
  }

  .runtime-built-copy {
    margin: 0.42rem 0 0;
    color: var(--text-muted);
    font-size: 0.84rem;
    line-height: 1.55;
    text-align: center;
  }

  .capability-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .capability-card {
    border: 1px solid var(--line-soft);
    border-radius: 0.5rem;
    background: var(--surface-3);
    padding: 0.75rem;
  }

  .capability-head {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-bottom: 0.35rem;
  }

  .capability-icon {
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 0.36rem;
    border: 1px solid transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .capability-icon :global(svg) {
    width: 0.88rem;
    height: 0.88rem;
  }

  .capability-icon.aqua {
    color: rgba(45, 212, 191, 0.96);
    border-color: rgba(45, 212, 191, 0.35);
    background: rgba(45, 212, 191, 0.12);
  }

  .capability-icon.lime {
    color: rgba(163, 230, 53, 0.96);
    border-color: rgba(163, 230, 53, 0.35);
    background: rgba(163, 230, 53, 0.12);
  }

  .capability-icon.sky {
    color: rgba(56, 189, 248, 0.96);
    border-color: rgba(56, 189, 248, 0.35);
    background: rgba(56, 189, 248, 0.12);
  }

  .capability-icon.violet {
    color: rgba(167, 139, 250, 0.96);
    border-color: rgba(167, 139, 250, 0.35);
    background: rgba(167, 139, 250, 0.12);
  }

  .capability-icon.mint {
    color: rgba(52, 211, 153, 0.96);
    border-color: rgba(52, 211, 153, 0.35);
    background: rgba(52, 211, 153, 0.12);
  }

  .capability-icon.amber {
    color: rgba(251, 191, 36, 0.96);
    border-color: rgba(251, 191, 36, 0.35);
    background: rgba(251, 191, 36, 0.12);
  }

  .capability-icon.rose {
    color: rgba(251, 113, 133, 0.96);
    border-color: rgba(251, 113, 133, 0.35);
    background: rgba(251, 113, 133, 0.12);
  }

  .capability-icon.blue {
    color: rgba(96, 165, 250, 0.96);
    border-color: rgba(96, 165, 250, 0.35);
    background: rgba(96, 165, 250, 0.12);
  }

  .capability-icon.indigo {
    color: rgba(129, 140, 248, 0.96);
    border-color: rgba(129, 140, 248, 0.35);
    background: rgba(129, 140, 248, 0.12);
  }

  .capability-icon.emerald {
    color: rgba(52, 211, 153, 0.96);
    border-color: rgba(52, 211, 153, 0.35);
    background: rgba(52, 211, 153, 0.12);
  }

  .capability-icon.slate {
    color: rgba(148, 163, 184, 0.96);
    border-color: rgba(148, 163, 184, 0.35);
    background: rgba(148, 163, 184, 0.12);
  }

  .capability-card h3 {
    font-family: var(--font-mono);
    font-size: 0.84rem;
    color: var(--foreground);
    margin: 0;
  }

  .capability-coming {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(251, 191, 36, 0.96);
    border: 1px solid rgba(251, 191, 36, 0.35);
    background: rgba(251, 191, 36, 0.12);
    border-radius: 999px;
    padding: 0.14rem 0.38rem;
    line-height: 1;
  }

  .capability-card p {
    font-size: 0.82rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .features-footnote {
    margin: 0.65rem 0 0;
    text-align: center;
    font-size: 0.74rem;
    color: var(--text-subtle);
  }

  .org-chart-section {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .org-chart-card {
    padding: 0.7rem;
  }

  .org-chart-head {
    padding: 0.15rem 0.15rem 0;
  }

  .org-chart-bleed {
    width: 100%;
    margin: 0;
    padding: 0;
  }

  .org-stage {
    position: relative;
    min-height: 32rem;
    border: 1px solid var(--line-soft);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--surface-2) 40%, transparent);
    overflow: hidden;
    margin-top: 0.35rem;
  }

  .org-chart-note {
    margin: 0.7rem auto 0.2rem;
    max-width: 52rem;
    text-align: center;
    font-size: 0.88rem;
    line-height: 1.55;
    color: var(--text-subtle);
  }

  .org-links {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }

  .org-link {
    fill: none;
    stroke-linecap: round;
    stroke-width: 2.25;
    stroke-dasharray: 6 9;
    stroke: rgba(110, 231, 183, 0.34);
  }

  .org-link.main {
    stroke-width: 2.5;
    stroke: rgba(110, 231, 183, 0.44);
  }

  .signal-dot {
    display: none;
  }

  .org-node {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 14.25rem;
    border: 1px solid var(--line-strong);
    border-radius: 0.6rem;
    background: var(--surface-2);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    padding: 0.55rem;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    z-index: 2;
  }

  .operator-node { top: 12%; left: 50%; }
  .pm-node { top: 36%; left: 50%; }
  .report-0 { top: 76%; left: 15%; }
  .report-1 { top: 76%; left: 38%; }
  .report-2 { top: 76%; left: 62%; }
  .report-3 { top: 76%; left: 85%; }

  .operator-node,
  .pm-node {
    width: 18rem;
  }

  .no-avatar {
    justify-content: flex-start;
    padding: 0.55rem;
  }

  .org-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .org-name {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--foreground);
    line-height: 1.2;
  }

  .org-role {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--text-subtle);
    line-height: 1.25;
  }

  .org-runtime {
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
    margin-top: 0.22rem;
  }

  .runtime-logo {
    width: 0.9rem;
    height: 0.9rem;
    display: block;
  }

  .runtime-text {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    line-height: 1;
    color: var(--text-muted);
  }

  .runtime-text.human {
    color: color-mix(in srgb, var(--text-muted) 78%, var(--foreground) 22%);
  }

  .workspace-explorer {
    display: grid;
    grid-template-columns: minmax(16rem, 0.9fr) minmax(0, 1.6fr);
    gap: 0.65rem;
  }

  .tree-pane,
  .editor-pane {
    border: 1px solid var(--line-soft);
    border-radius: 0.55rem;
    background: var(--surface-3);
    min-width: 0;
  }

  .tree-pane {
    padding: 0.65rem;
  }

  .pane-title {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-subtle);
    margin-bottom: 0.5rem;
  }

  .tree-line {
    font-family: var(--font-mono);
    font-size: 0.73rem;
    color: var(--text-muted);
    line-height: 1.3;
    border-radius: 0.3rem;
    padding: 0.2rem 0.35rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .tree-line.active {
    background: color-mix(in srgb, var(--primary) 16%, transparent);
    color: var(--foreground);
    border: 1px solid var(--line-strong);
  }

  .depth-1 { margin-left: 0.8rem; }
  .depth-2 { margin-left: 1.6rem; }
  .depth-3 { margin-left: 2.4rem; }

  .caret {
    color: var(--text-subtle);
    width: 0.7rem;
  }

  .folder { color: var(--foreground); }
  .file { color: var(--text-muted); }

  .editor-pane {
    display: flex;
    flex-direction: column;
    min-height: 19.5rem;
    overflow: hidden;
  }

  .editor-head {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    border-bottom: 1px solid var(--line-soft);
    padding: 0.5rem 0.55rem;
    background: var(--surface-2);
  }

  .editor-tab {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--foreground);
    border: 1px solid var(--line-strong);
    border-radius: 0.33rem;
    padding: 0.18rem 0.42rem;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    flex-shrink: 0;
  }

  .editor-path {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--text-subtle);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .editor-body {
    margin: 0;
    padding: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.77rem;
    line-height: 1.55;
    color: var(--text-muted);
    white-space: pre;
    overflow: auto;
  }

  .avatar-random-row {
    display: flex;
    gap: 0.45rem;
    overflow-x: auto;
    padding: 0.35rem 0.1rem 0.1rem;
    scrollbar-width: thin;
    scrollbar-color: rgba(167, 243, 208, 0.2) transparent;
  }

  .avatar-random-item {
    flex: 0 0 auto;
    border: 1px solid var(--line-soft);
    border-radius: 0.45rem;
    background: var(--surface-3);
    padding: 0.35rem;
  }

  .avatar-random-item:nth-child(odd) {
    transform: translateY(2px);
  }

  @media (max-width: 1024px) {
    .runtime-built-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .capability-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .org-stage {
      min-height: 30rem;
    }

    .org-node {
      width: 11.5rem;
    }

    .operator-node,
    .pm-node {
      width: 14.25rem;
    }

    .workspace-explorer {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .runtime-built-grid {
      grid-template-columns: 1fr;
    }

    .content {
      padding: 1rem 0.9rem 2rem;
    }

    .command-row {
      flex-wrap: wrap;
    }

    .command-code {
      white-space: normal;
    }

    .hero-layout {
      grid-template-columns: 1fr;
    }

    .hero-portrait {
      justify-content: flex-start;
      border-top: 0;
      width: 100%;
    }

    .hero-movie-placeholder {
      width: 100%;
      height: auto;
      aspect-ratio: 9 / 11;
    }

    .org-stage {
      min-height: auto;
      display: grid;
      gap: 0.55rem;
      padding: 0.6rem;
    }

    .org-links {
      display: none;
    }

    .org-node {
      position: relative;
      transform: none;
      top: auto;
      left: auto;
      width: 100%;
    }

    .org-chart-bleed {
      padding: 0;
    }

    .capability-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
