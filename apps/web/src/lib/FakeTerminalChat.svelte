<script>
  import { Avatar } from 'termlings/svelte';
  import { encodeDNA, traitsFromName } from 'termlings';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  const tabs = [
    { id: 'chat', label: '[1] Chat', active: true },
    { id: 'requests', label: '[2] Requests', active: false },
    { id: 'tasks', label: '[3] Tasks', active: false },
    { id: 'calendar', label: '[4] Calendar', active: false }
  ];

  const agents = [
    { name: 'Nova', role: 'PM', slug: 'preview-nova', motion: 'talking' },
    { name: 'Breeze', role: 'Design', slug: 'preview-breeze', motion: 'walking' },
    { name: 'Clover', role: 'Dev', slug: 'preview-clover', motion: 'waving' },
    { name: 'Frost', role: 'Growth', slug: 'preview-frost', motion: 'talking' },
    { name: 'Pickle', role: 'Support', slug: 'preview-pickle', motion: 'walking' }
  ].map((agent) => ({
    ...agent,
    dna: encodeDNA(traitsFromName(agent.slug))
  }));

  const partyTone = {
    'Tommy (You)': 'tommy',
    'Nova (PM)': 'nova',
    'Breeze (Design)': 'breeze',
    'Clover (Dev)': 'clover',
    'Frost (Growth)': 'frost',
    'Pickle (Support)': 'pickle'
  };

  const partyRuntime = {
    'Nova (PM)': { key: 'claude', label: 'Claude Code', logo: '/claude-code-logo.svg' },
    'Breeze (Design)': { key: 'codex', label: 'Codex', logo: '/codex-logo.svg' },
    'Clover (Dev)': { key: 'claude', label: 'Claude Code', logo: '/claude-code-logo.svg' },
    'Frost (Growth)': { key: 'codex', label: 'Codex', logo: '/codex-logo.svg' },
    'Pickle (Support)': { key: 'codex', label: 'Codex', logo: '/codex-logo.svg' }
  };

  const checkInText = 'where does each team stand right now?';

  const joinThread = [
    {
      from: 'Nova (PM)',
      stamp: '3/4/2026, 7:10:06 PM',
      join: true,
      runtime: partyRuntime['Nova (PM)']
    },
    {
      from: 'Clover (Dev)',
      stamp: '3/4/2026, 7:10:06 PM',
      join: true,
      runtime: partyRuntime['Clover (Dev)']
    },
    {
      from: 'Frost (Growth)',
      stamp: '3/4/2026, 7:10:06 PM',
      join: true,
      runtime: partyRuntime['Frost (Growth)']
    },
    {
      from: 'Pickle (Support)',
      stamp: '3/4/2026, 7:10:06 PM',
      join: true,
      runtime: partyRuntime['Pickle (Support)']
    },
    {
      from: 'Breeze (Design)',
      stamp: '3/4/2026, 7:10:06 PM',
      join: true,
      runtime: partyRuntime['Breeze (Design)']
    }
  ];

  const checkInThread = [
    {
      from: 'Nova (PM)',
      to: 'Tommy (You)',
      stamp: '3/4/2026, 11:09:02 AM',
      text: 'All teams are active. Designer and Developer are in execution, Growth is drafting launch copy, Support is waiting on one decision.'
    },
    {
      from: 'Nova (PM)',
      to: 'Breeze (Design)',
      stamp: '3/4/2026, 11:09:04 AM',
      text: 'For this check-in, send your exact design completion status and remaining tasks.'
    },
    {
      from: 'Breeze (Design)',
      to: 'Nova (PM)',
      stamp: '3/4/2026, 11:09:08 AM',
      text: 'Design status: hero hierarchy locked, org-chart spacing tuned, and mobile adjustments in progress.'
    },
    {
      from: 'Nova (PM)',
      to: 'Clover (Dev)',
      stamp: '3/4/2026, 11:09:11 AM',
      text: 'Engineering check-in: what is shipped now vs still in-progress?'
    },
    {
      from: 'Clover (Dev)',
      to: 'Nova (PM)',
      stamp: '3/4/2026, 11:09:14 AM',
      text: 'Engineering status: SvelteKit sections are wired, responsive behavior is stable, and terminal chat component is integrating.'
    },
    {
      from: 'Frost (Growth)',
      to: 'Nova (PM)',
      stamp: '3/4/2026, 11:09:21 AM',
      text: 'Growth status: onboarding copy updated around agent orchestration and human-in-the-loop workflow.'
    },
    {
      from: 'Nova (PM)',
      to: 'Pickle (Support)',
      stamp: '3/4/2026, 11:09:24 AM',
      text: 'Support check-in: any blocker that prevents go-live today?'
    },
    {
      from: 'Pickle (Support)',
      to: 'Tommy (You)',
      stamp: '3/4/2026, 11:09:27 AM',
      text: 'Request: please add WEBSITE_DOMAIN and SUPPORT_FROM_EMAIL in .env so we can complete support rollout.',
      request: true
    },
    {
      from: 'Tommy (You)',
      to: 'Pickle (Support)',
      stamp: '3/4/2026, 11:09:33 AM',
      text: 'Approved. Add them and continue.'
    },
    {
      from: 'Pickle (Support)',
      to: 'Tommy (You)',
      stamp: '3/4/2026, 11:09:38 AM',
      text: 'Received. Completing setup and final QA now.'
    },
    {
      from: 'Nova (PM)',
      to: 'Clover (Dev)',
      stamp: '3/4/2026, 11:09:40 AM',
      text: 'Please verify theme toggle + terminal preview contrast in both dark and light.'
    },
    {
      from: 'Clover (Dev)',
      to: 'Nova (PM)',
      stamp: '3/4/2026, 11:09:46 AM',
      text: 'Confirmed. Theme variables are wired and terminal section renders correctly in both modes.'
    },
    {
      from: 'Nova (PM)',
      to: 'Tommy (You)',
      stamp: '3/4/2026, 11:09:44 AM',
      text: 'Summary: team is aligned and moving. Next check-in in 20 minutes with a full page preview.'
    },
    {
      from: 'Tommy (You)',
      to: 'Nova (PM)',
      stamp: '3/4/2026, 11:09:49 AM',
      text: 'Great. Any risk left besides domain and env setup?'
    },
    {
      from: 'Nova (PM)',
      to: 'Tommy (You)',
      stamp: '3/4/2026, 11:09:54 AM',
      text: 'Low risk. Main item is syncing final copy and QA pass timing.'
    },
    {
      from: 'Breeze (Design)',
      to: 'Clover (Dev)',
      stamp: '3/4/2026, 11:10:02 AM',
      text: 'Pushed updated spacing tokens for feature cards and chat panel rhythm.'
    },
    {
      from: 'Clover (Dev)',
      to: 'Breeze (Design)',
      stamp: '3/4/2026, 11:10:08 AM',
      text: 'Integrated. Cards and composer now match terminal density targets.'
    },
    {
      from: 'Frost (Growth)',
      to: 'Nova (PM)',
      stamp: '3/4/2026, 11:10:12 AM',
      text: 'Messaging update: reframed value around running AI teams end-to-end from one terminal workspace.'
    },
    {
      from: 'Nova (PM)',
      to: 'Frost (Growth)',
      stamp: '3/4/2026, 11:10:17 AM',
      text: 'Perfect. Keep language short and outcome-focused for hero + feature list.'
    },
    {
      from: 'Pickle (Support)',
      to: 'Nova (PM)',
      stamp: '3/4/2026, 11:10:22 AM',
      text: 'Support docs update: request handling flow and env handoff are now documented for launch.'
    },
    {
      from: 'Clover (Dev)',
      to: 'Nova (PM)',
      stamp: '3/4/2026, 11:10:29 AM',
      text: 'Added mention picker simulation and request badge state in the fake terminal chat.'
    },
    {
      from: 'Nova (PM)',
      to: 'Tommy (You)',
      stamp: '3/4/2026, 11:10:35 AM',
      text: 'Second check-in: implementation is stable, copy is aligned, support blocker cleared, and preview is nearly ready.'
    },
    {
      from: 'Tommy (You)',
      to: 'Nova (PM)',
      stamp: '3/4/2026, 11:10:41 AM',
      text: 'Looks good. Proceed to final polish and share preview link.'
    },
    {
      from: 'Nova (PM)',
      to: 'Tommy (You)',
      stamp: '3/4/2026, 11:10:47 AM',
      text: 'Acknowledged. Final review pass now, then shipping preview in the next update.'
    }
  ].map((item, index) => ({
    ...item,
    id: index,
    fromTone: partyTone[item.from] || 'white',
    toTone: partyTone[item.to] || 'white'
  }));

  const MAX_VISIBLE_MESSAGES = 9;
  const mentionOptions = [
    { handle: 'everyone', role: 'All agents', tone: 'tommy' },
    { handle: 'Nova', role: 'PM', tone: 'nova' },
    { handle: 'Breeze', role: 'Design', tone: 'breeze' }
  ];

  let visibleFeed = [];
  let nextFeedIndex = 0;
  let hasRequestAlert = false;
  let requestPulse = false;
  let draftText = '';
  let draftMention = '';
  let draftRest = '';
  let showMentionMenu = false;
  let activeMentionHandle = 'Nova';
  let composerBusy = false;
  let liveMessageCounter = 0;
  let typingParty = '';
  let typingTone = 'white';
  let typingAgentName = '';
  let typingDotFrame = 0;
  let messageQueuePaused = false;
  const typingDotFrames = ['.', '..', '...'];

  function isAgentTyping(agentName) {
    return typingAgentName === agentName;
  }

  function splitDraftMention(text) {
    if (!text.startsWith('@')) {
      return { mention: '', rest: text };
    }
    const divider = text.indexOf(' ');
    if (divider === -1) {
      return { mention: text, rest: '' };
    }
    return {
      mention: text.slice(0, divider),
      rest: text.slice(divider)
    };
  }

  $: ({ mention: draftMention, rest: draftRest } = splitDraftMention(draftText));

  function formatStamp(date = new Date()) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  function toTimeOnly(stamp) {
    if (!stamp) return '';
    const parts = String(stamp).split(',');
    return (parts.at(-1) || '').trim() || String(stamp).trim();
  }

  onMount(() => {
    const timers = new Set();
    let cancelled = false;
    const wait = (ms) =>
      new Promise((resolve) => {
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.add(id);
      });

    const triggerRequestIndicator = () => {
      hasRequestAlert = true;
      requestPulse = true;
      const requestId = setTimeout(() => {
        requestPulse = false;
        timers.delete(requestId);
      }, 700);
      timers.add(requestId);
    };

    const appendMessage = (item) => {
      const liveId = `live-${liveMessageCounter++}`;
      const decorated = {
        ...item,
        id: liveId,
        fromTone: partyTone[item.from] || 'white',
        toTone: partyTone[item.to] || 'white',
        loopId: `${liveId}-${Date.now()}`
      };
      visibleFeed = [...visibleFeed, decorated].slice(-MAX_VISIBLE_MESSAGES);
      if (decorated.request) triggerRequestIndicator();
    };

    const showTypingThenAppend = (item) => {
      typingParty = item.from;
      typingTone = partyTone[item.from] || 'white';
      messageQueuePaused = true;
      const typingDelay = 900 + Math.floor(Math.random() * 900);
      const typingId = setTimeout(() => {
        timers.delete(typingId);
        if (cancelled) return;
        appendMessage(item);
        typingParty = '';
        typingTone = 'white';
        messageQueuePaused = false;
      }, typingDelay);
      timers.add(typingId);
    };

    const pushNextMessage = () => {
      if (messageQueuePaused) return;
      const next = checkInThread[nextFeedIndex % checkInThread.length];
      nextFeedIndex += 1;
      if (next.from === 'Tommy (You)') {
        appendMessage(next);
        return;
      }
      showTypingThenAppend(next);
    };

    const typeDraft = async (text, minDelay = 70, maxDelay = 120) => {
      for (const char of text) {
        if (cancelled) return;
        draftText += char;
        const pause = Math.floor(minDelay + Math.random() * (maxDelay - minDelay));
        await wait(pause);
      }
    };

    const runMentionSequence = async () => {
      if (composerBusy || cancelled) return;
      composerBusy = true;
      draftText = '';
      showMentionMenu = false;
      activeMentionHandle = 'Nova';

      await wait(520 + Math.floor(Math.random() * 720));
      if (cancelled) return;

      draftText = '@';
      showMentionMenu = true;
      activeMentionHandle = 'everyone';
      await wait(280);
      activeMentionHandle = 'Nova';
      await wait(240);
      activeMentionHandle = 'Breeze';
      await wait(210);
      activeMentionHandle = 'Nova';
      await wait(260);
      await typeDraft('Nova', 90, 145);
      if (cancelled) return;

      await wait(260);
      draftText = '@Nova ';
      showMentionMenu = false;
      await wait(300);
      await typeDraft(checkInText, 60, 105);
      if (cancelled) return;

      await wait(420);
      appendMessage({
        from: 'Tommy (You)',
        to: 'Nova (PM)',
        stamp: formatStamp(),
        text: 'Where does each team stand right now?'
      });
      draftText = '';
      showMentionMenu = false;
      composerBusy = false;
    };

    const start = async () => {
      for (const joinEvent of joinThread) {
        if (cancelled) return;
        appendMessage(joinEvent);
        await wait(360);
      }
      await wait(240);
      if (cancelled) return;
      await runMentionSequence();
      if (cancelled) return;
      const intervalId = setInterval(pushNextMessage, 2800);
      timers.add(intervalId);
    };

    start();
    return () => {
      cancelled = true;
      for (const id of timers) {
        clearTimeout(id);
        clearInterval(id);
      }
    };
  });
</script>

<div class="terminal-preview" aria-label="Terminal activity preview">
  <div class="terminal-tabs">
    {#each tabs as tab}
      <span class="tab-item" class:active={tab.active}>
        <span>{tab.label}</span>
        {#if tab.id === 'requests' && hasRequestAlert}
          <span class={`request-indicator ${requestPulse ? 'pulse' : ''}`} aria-label="New request"></span>
        {/if}
      </span>
    {/each}
  </div>

  <div class="agent-row">
    <article class="agent-chip all-activity">
      <img src="/logo.svg" alt="Termlings logo" />
      <div class="agent-meta">
        <p class="agent-name">All</p>
        <p class="agent-role">Activity</p>
      </div>
    </article>

    {#each agents as agent}
      <article class="agent-chip">
        <Avatar
          dna={agent.dna}
          size="lg"
          walking={agent.motion === 'walking'}
          talking={agent.motion === 'talking'}
          waving={agent.motion === 'waving'}
        />
        <div class="agent-meta">
          <p class="agent-name">{agent.name}</p>
          <p class="agent-role">
            <span>{agent.role}</span>
            {#if isAgentTyping(agent.name)}
              <span class="talking-dots" aria-hidden="true"></span>
            {/if}
          </p>
        </div>
      </article>
    {/each}
  </div>

  <div class="feed">
    {#each visibleFeed as item (item.loopId)}
      <article
        class={`feed-item ${item.request ? 'request-message' : ''} ${item.join ? 'join-message' : ''}`}
        in:fade={{ duration: 220 }}
      >
        <div class="feed-head">
          {#if item.join}
            <div class="feed-route">
              <span class={`tone ${item.fromTone}`} aria-hidden="true"></span>
              <span class="feed-party">{item.from}</span>
              <span class="join-word">joined</span>
              {#if item.runtime}
                <span class="join-via">via</span>
                <span class="join-runtime">
                  <img src={item.runtime.logo} alt="" aria-hidden="true" />
                  <span>{item.runtime.label}</span>
                </span>
              {/if}
            </div>
          {:else}
            <div class="feed-route">
              <span class={`tone ${item.fromTone}`} aria-hidden="true"></span>
              <span class="feed-party">{item.from}</span>
              <span class="feed-arrow">→</span>
              <span class={`tone ${item.toTone}`} aria-hidden="true"></span>
              <span class="feed-party">{item.to}</span>
            </div>
          {/if}
          <span class="feed-time">{toTimeOnly(item.stamp)}</span>
        </div>
        {#if !item.join}
          <p class="feed-body">{item.text}</p>
        {/if}
      </article>
    {/each}
  </div>

  {#if typingParty}
    <div class="typing-row" aria-live="polite">
      <span class={`tone ${typingTone}`} aria-hidden="true"></span>
      <span class="typing-label">{typingParty} is writing</span>
      <span class="typing-dots" aria-hidden="true">
        <span>.</span><span>.</span><span>.</span>
      </span>
    </div>
  {/if}

  <div class="composer">
    <div class="composer-input">
      <span class="prompt">›</span>
      {#if draftText}
        <span class="draft">
          {#if draftMention}<span class="draft-mention">{draftMention}</span>{/if}{draftRest}
        </span>
        <span class="cursor" aria-hidden="true"></span>
      {:else}
        <span class="cursor" aria-hidden="true"></span>
        <span class="hint">Write "<strong>@everyone</strong>" or "<strong>@agent</strong>" to send DM</span>
      {/if}
    </div>
    {#if showMentionMenu}
      <div class="mention-menu">
        {#each mentionOptions as option}
          <div class={`mention-item ${option.handle === activeMentionHandle ? 'active' : ''}`}>
            <span class="mention-caret">{option.handle === activeMentionHandle ? '›' : ''}</span>
            <span class="mention-name">@{option.handle}</span>
            <span class={`mention-swatch ${option.tone}`}></span>
            <span class="mention-sep">·</span>
            <span class="mention-role">{option.role}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="statusbar">
    <span>my-project / All activity</span>
    <span>0/591 ↑/↓</span>
  </div>
</div>

<style>
  .terminal-preview {
    --tp-bg: #09080d;
    --tp-bg-elevated: #13111a;
    --tp-border: rgba(203, 194, 216, 0.27);
    --tp-border-soft: rgba(203, 194, 216, 0.17);
    --tp-text: rgba(242, 236, 250, 0.94);
    --tp-text-muted: rgba(211, 198, 227, 0.9);
    --tp-text-subtle: rgba(177, 161, 196, 0.86);
    --tp-accent: #a06bff;
    --tp-accent-soft: rgba(160, 107, 255, 0.2);
    --tp-danger: #ef5f77;
    --tp-danger-soft: rgba(239, 95, 119, 0.2);
    color-scheme: dark;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-rows: auto auto 1fr auto auto;
    border-radius: 0.65rem;
    border: 1px solid var(--tp-border);
    background: var(--tp-bg);
    color: var(--tp-text);
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 0.35rem;
    overflow: hidden;
  }

  .terminal-tabs {
    display: flex;
    align-items: center;
    gap: 0.58rem;
    border-bottom: 1px solid var(--tp-border-soft);
    padding: 0.05rem 0.14rem 0.32rem;
    font-size: 11px;
    color: var(--tp-text-subtle);
    white-space: nowrap;
    overflow: hidden;
  }

  .tab-item {
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
  }

  .terminal-tabs .active {
    color: var(--tp-text);
    font-weight: 700;
  }

  .request-indicator {
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 0;
    background: var(--tp-danger);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--tp-danger) 56%, transparent);
    flex-shrink: 0;
  }

  .request-indicator.pulse {
    animation: none;
  }

  .agent-row {
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
    flex-wrap: nowrap;
    gap: 0.08rem;
    border: 1px solid var(--tp-border);
    border-radius: 0;
    padding: 0.32rem;
    background: var(--tp-bg);
    overflow: hidden;
  }

  .agent-chip {
    min-width: 0;
    width: calc((100% - 0.4rem) / 6);
    flex: 0 0 calc((100% - 0.4rem) / 6);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.08rem;
  }

  .agent-chip img {
    width: 3.35rem;
    height: 3.35rem;
    image-rendering: pixelated;
  }

  .agent-chip.all-activity img {
    width: 3.35rem;
    height: 3.35rem;
    margin: 0;
  }

  .agent-chip :global(.tg-avatar) {
    width: 3.35rem;
    height: 3.35rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .agent-chip :global(.tg-avatar svg) {
    width: 3.35rem;
    height: 3.35rem;
    image-rendering: pixelated;
  }

  .agent-meta {
    min-width: 0;
    text-align: left;
    line-height: 1.1;
  }

  .agent-name {
    margin: 0;
    color: var(--tp-text);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .agent-role {
    margin: 0.04rem 0 0;
    color: var(--tp-text-subtle);
    font-size: 11px;
    display: inline-flex;
    align-items: center;
    gap: 0.22rem;
  }

  .talking-dots {
    display: inline-block;
    width: 3ch;
    color: var(--tp-text-subtle);
    text-align: left;
    letter-spacing: 0;
  }

  .talking-dots::before {
    content: '...';
    animation: terminal-dot-loop 1300ms steps(1, end) infinite;
  }

  .all-activity .agent-name,
  .all-activity .agent-role {
    color: var(--tp-accent);
  }

  .feed {
    margin-top: 0.3rem;
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.34rem;
  }

  .feed-item {
    border: 1px solid var(--tp-border);
    border-radius: 0;
    background: color-mix(in srgb, var(--tp-bg-elevated) 90%, transparent);
    padding: 0.22rem 0.28rem;
  }

  .feed-item.request-message {
    border-color: color-mix(in srgb, var(--tp-danger) 58%, transparent);
    background: var(--tp-danger-soft);
  }

  .typing-row {
    margin-top: 0.16rem;
    margin-bottom: 0.08rem;
    min-height: 1rem;
    display: inline-flex;
    align-items: center;
    gap: 0.24rem;
    color: var(--tp-text-subtle);
    font-size: 11px;
    line-height: 1;
  }

  .typing-label {
    color: var(--tp-text-subtle);
  }

  .typing-dots {
    display: inline-flex;
    align-items: center;
    gap: 0.08rem;
    color: var(--tp-text-muted);
    letter-spacing: 0.02rem;
  }

  .typing-dots span {
    opacity: 0;
    animation: typing-step 720ms steps(1, end) infinite;
  }

  .typing-dots span:nth-child(2) {
    animation-delay: 120ms;
  }

  .typing-dots span:nth-child(3) {
    animation-delay: 240ms;
  }

  .feed-head {
    display: flex;
    align-items: center;
    gap: 0.42rem;
    justify-content: space-between;
    font-size: 11px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .feed-route {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 0.24rem;
  }

  .feed-party {
    color: var(--tp-text);
    white-space: normal;
    word-break: break-word;
  }

  .feed-arrow {
    color: var(--tp-text-subtle);
    flex-shrink: 0;
  }

  .feed-time {
    margin-left: auto;
    color: var(--tp-text-subtle);
    flex-shrink: 0;
  }

  .feed-body {
    margin: 0.08rem 0 0;
    font-size: 11px;
    line-height: 1.2;
    color: var(--tp-text-muted);
    white-space: normal;
    word-break: break-word;
  }

  .join-word {
    color: var(--tp-text-muted);
  }

  .join-via {
    color: var(--tp-text-subtle);
  }

  .join-runtime {
    display: inline-flex;
    align-items: center;
    gap: 0.12rem;
    font-size: 11px;
    line-height: 1;
    color: var(--tp-text);
    padding: 0;
    flex-shrink: 0;
  }

  .join-runtime img {
    width: 0.52rem;
    height: 0.52rem;
    display: block;
  }

  .feed-item.join-message {
    padding-top: 0.3rem;
    padding-bottom: 0.3rem;
  }

  .tone {
    width: 0.33rem;
    height: 0.33rem;
    border-radius: 0;
    flex-shrink: 0;
  }

  .tone.tommy,
  .mention-swatch.tommy {
    background: #ede8f3;
  }

  .tone.nova,
  .mention-swatch.nova {
    background: #40bf80;
  }

  .tone.breeze,
  .mention-swatch.breeze {
    background: #40bf80;
  }

  .tone.clover,
  .mention-swatch.clover {
    background: #c33ecc;
  }

  .tone.frost,
  .mention-swatch.frost {
    background: #c33ecc;
  }

  .tone.pickle,
  .mention-swatch.pickle {
    background: #4040bf;
  }

  .mention-menu {
    margin-top: 0.26rem;
    border: 1px solid var(--tp-border-soft);
    border-radius: 0;
    background: var(--tp-bg-elevated);
    padding: 0.28rem 0.3rem;
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
  }

  .mention-item {
    display: flex;
    align-items: center;
    gap: 0.22rem;
    color: var(--tp-text-subtle);
    padding: 0.1rem 0.06rem;
    border-radius: 0;
    font-size: 11px;
    line-height: 1.2;
    transition: none;
  }

  .mention-item.active {
    color: var(--tp-text);
    background: var(--tp-accent-soft);
    transform: translateX(1px);
  }

  .mention-caret {
    width: 0.38rem;
    color: var(--tp-accent);
    text-align: center;
    flex-shrink: 0;
  }

  .mention-name {
    color: inherit;
  }

  .mention-swatch {
    width: 0.72rem;
    height: 0.72rem;
    border-radius: 0;
    opacity: 0.9;
    flex-shrink: 0;
  }

  .mention-sep {
    color: var(--tp-text-subtle);
    flex-shrink: 0;
  }

  .mention-role {
    color: var(--tp-text-muted);
  }

  .composer {
    margin-top: 0.26rem;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    background: var(--tp-bg-elevated);
    color: var(--tp-text-subtle);
    padding: 0.34rem 0.42rem;
    min-height: 1.6rem;
  }

  .composer-input {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }

  .prompt {
    color: var(--tp-text);
    font-size: 11px;
    flex-shrink: 0;
  }

  .cursor {
    width: 0.3rem;
    height: 0.7rem;
    background: var(--tp-text);
    display: inline-block;
    animation: blink 1s steps(1, end) infinite;
    flex-shrink: 0;
  }

  .hint {
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .draft {
    color: var(--tp-text);
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .draft-mention {
    color: var(--tp-accent);
  }

  .hint strong {
    color: var(--tp-text-muted);
    font-weight: 500;
  }

  .statusbar {
    background: var(--tp-bg);
    border-top: 1px solid var(--tp-border-soft);
    color: var(--tp-text-subtle);
    padding: 0.14rem 0.3rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.35rem;
    font-size: 11px;
    white-space: nowrap;
    border-radius: 0;
  }

  @media (max-width: 720px) {
    .feed-time {
      display: none;
    }
  }

  @keyframes blink {
    0%,
    49% {
      opacity: 1;
    }
    50%,
    100% {
      opacity: 0;
    }
  }

  @keyframes request-pulse {
    0% {
      transform: scale(0.86);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--tp-danger) 70%, transparent);
    }
    70% {
      transform: scale(1.05);
      box-shadow: 0 0 0 0.25rem color-mix(in srgb, var(--tp-danger) 8%, transparent);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--tp-danger) 56%, transparent);
    }
  }

  @keyframes terminal-dot-loop {
    0%,
    33% {
      content: '...';
    }
    34%,
    66% {
      content: '..';
    }
    67%,
    100% {
      content: '.';
    }
  }

  @keyframes typing-step {
    0%,
    24% {
      opacity: 0;
    }
    25%,
    100% {
      opacity: 1;
    }
  }

</style>
