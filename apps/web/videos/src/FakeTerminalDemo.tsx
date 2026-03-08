import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import './fake-terminal.css';

type Tone = 'tommy' | 'nova' | 'breeze' | 'clover' | 'frost' | 'pickle';

type ThreadMessage = {
  from: string;
  to: string;
  stamp: string;
  text: string;
  request?: boolean;
};

type RuntimeInfo = {
  key: 'claude' | 'codex';
  label: 'Claude Code' | 'Codex';
  logo: string;
};

type JoinMessage = {
  from: string;
  stamp: string;
  join: true;
  runtime: RuntimeInfo;
};

type FeedMessage = {
  id: string;
  from: string;
  stamp: string;
  fromTone: Tone;
  join?: boolean;
  to?: string;
  toTone?: Tone;
  text?: string;
  request?: boolean;
  runtime?: RuntimeInfo;
};

type ScheduledMessage = {
  frame: number;
  message: FeedMessage;
};

type TypingWindow = {
  start: number;
  end: number;
  party: string;
  tone: Tone;
  agentName: string;
};

const tabs = [
  {id: 'chat', label: '[1] Chat', active: true},
  {id: 'requests', label: '[2] Requests', active: false},
  {id: 'tasks', label: '[3] Tasks', active: false},
  {id: 'calendar', label: '[4] Calendar', active: false},
  {id: 'settings', label: '[5] Settings', active: false}
];

const agents = [
  {name: 'Nova', role: 'PM', avatar: staticFile('avatars/preview-nova.svg')},
  {name: 'Breeze', role: 'Design', avatar: staticFile('avatars/preview-breeze.svg')},
  {name: 'Clover', role: 'Dev', avatar: staticFile('avatars/preview-clover.svg')},
  {name: 'Frost', role: 'Growth', avatar: staticFile('avatars/preview-frost.svg')},
  {name: 'Pickle', role: 'Support', avatar: staticFile('avatars/preview-pickle.svg')}
];

const partyTone: Record<string, Tone> = {
  'Tommy (You)': 'tommy',
  'Nova (PM)': 'nova',
  'Breeze (Design)': 'breeze',
  'Clover (Dev)': 'clover',
  'Frost (Growth)': 'frost',
  'Pickle (Support)': 'pickle'
};

const runtimeMap: Record<string, RuntimeInfo> = {
  'Nova (PM)': {key: 'claude', label: 'Claude Code', logo: staticFile('claude-code-logo.svg')},
  'Breeze (Design)': {key: 'codex', label: 'Codex', logo: staticFile('codex-logo.svg')},
  'Clover (Dev)': {key: 'claude', label: 'Claude Code', logo: staticFile('claude-code-logo.svg')},
  'Frost (Growth)': {key: 'codex', label: 'Codex', logo: staticFile('codex-logo.svg')},
  'Pickle (Support)': {key: 'codex', label: 'Codex', logo: staticFile('codex-logo.svg')}
};

const mentionOptions = [
  {handle: 'everyone', role: 'All agents', tone: 'tommy' as Tone},
  {handle: 'Nova', role: 'PM', tone: 'nova' as Tone},
  {handle: 'Breeze', role: 'Design', tone: 'breeze' as Tone}
];

const checkInText = 'where does each team stand right now?';

const joinThread: JoinMessage[] = [
  {from: 'Nova (PM)', stamp: '3/4/2026, 7:10:06 PM', join: true, runtime: runtimeMap['Nova (PM)']},
  {from: 'Clover (Dev)', stamp: '3/4/2026, 7:10:06 PM', join: true, runtime: runtimeMap['Clover (Dev)']},
  {from: 'Frost (Growth)', stamp: '3/4/2026, 7:10:06 PM', join: true, runtime: runtimeMap['Frost (Growth)']},
  {from: 'Pickle (Support)', stamp: '3/4/2026, 7:10:06 PM', join: true, runtime: runtimeMap['Pickle (Support)']},
  {from: 'Breeze (Design)', stamp: '3/4/2026, 7:10:06 PM', join: true, runtime: runtimeMap['Breeze (Design)']}
];

const checkInThread: ThreadMessage[] = [
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
  }
];

const MAX_VISIBLE_MESSAGES = 9;
const USER_SEND_FRAME = 236;

const toneFor = (party: string): Tone => partyTone[party] ?? 'tommy';

const agentNameFromParty = (party: string): string => {
  return party.split(' ')[0] ?? party;
};

const decorateJoin = (item: JoinMessage, index: number): FeedMessage => ({
  id: `join-${index}`,
  from: item.from,
  stamp: item.stamp,
  join: true,
  fromTone: toneFor(item.from),
  runtime: item.runtime
});

const decorateThread = (item: ThreadMessage, index: number): FeedMessage => ({
  id: `msg-${index}`,
  from: item.from,
  to: item.to,
  stamp: item.stamp,
  text: item.text,
  request: item.request,
  fromTone: toneFor(item.from),
  toTone: toneFor(item.to)
});

const buildTimeline = (): {
  messages: ScheduledMessage[];
  typing: TypingWindow[];
  requestFrame: number | null;
  endFrame: number;
} => {
  const messages: ScheduledMessage[] = [];
  const typing: TypingWindow[] = [];

  const joinStart = 6;
  const joinStep = 12;

  joinThread.forEach((item, index) => {
    messages.push({frame: joinStart + index * joinStep, message: decorateJoin(item, index)});
  });

  messages.push({
    frame: USER_SEND_FRAME,
    message: decorateThread(
      {
        from: 'Tommy (You)',
        to: 'Nova (PM)',
        stamp: '3/4/2026, 9:14:17 PM',
        text: 'Where does each team stand right now?'
      },
      900
    )
  });

  let cursor = USER_SEND_FRAME + 26;

  checkInThread.forEach((item, index) => {
    if (item.from !== 'Tommy (You)') {
      const typingDuration = 20 + (index % 3) * 6;
      typing.push({
        start: cursor,
        end: cursor + typingDuration,
        party: item.from,
        tone: toneFor(item.from),
        agentName: agentNameFromParty(item.from)
      });
      cursor += typingDuration;
    }

    messages.push({
      frame: cursor,
      message: decorateThread(item, index)
    });

    cursor += item.from === 'Tommy (You)' ? 42 : 58;
  });

  const request = messages.find((entry) => entry.message.request);

  return {
    messages,
    typing,
    requestFrame: request ? request.frame : null,
    endFrame: cursor + 90
  };
};

const timeline = buildTimeline();
export const FAKE_TERMINAL_DURATION_FRAMES = timeline.endFrame;

const getComposerState = (frame: number): {draftText: string; showMenu: boolean; activeHandle: string} => {
  const start = 90;
  const atTyped = 98;
  const navEveryoneEnd = 112;
  const navNovaEnd = 124;
  const navBreezeEnd = 136;
  const navNovaBackEnd = 148;
  const typeNovaEnd = 170;
  const pickEnd = 184;
  const typeTextEnd = 230;

  if (frame < start) {
    return {draftText: '', showMenu: false, activeHandle: 'Nova'};
  }

  if (frame < atTyped) {
    return {draftText: '@', showMenu: true, activeHandle: 'everyone'};
  }

  if (frame < navEveryoneEnd) {
    return {draftText: '@', showMenu: true, activeHandle: 'everyone'};
  }

  if (frame < navNovaEnd) {
    return {draftText: '@', showMenu: true, activeHandle: 'Nova'};
  }

  if (frame < navBreezeEnd) {
    return {draftText: '@', showMenu: true, activeHandle: 'Breeze'};
  }

  if (frame < navNovaBackEnd) {
    return {draftText: '@', showMenu: true, activeHandle: 'Nova'};
  }

  if (frame < typeNovaEnd) {
    const typed = 'Nova'.slice(0, Math.max(1, Math.min(4, Math.floor((frame - navNovaBackEnd) / 5) + 1)));
    return {draftText: `@${typed}`, showMenu: true, activeHandle: 'Nova'};
  }

  if (frame < pickEnd) {
    return {draftText: '@Nova ', showMenu: false, activeHandle: 'Nova'};
  }

  if (frame < typeTextEnd) {
    const progress = frame - pickEnd;
    const count = Math.max(1, Math.min(checkInText.length, Math.floor(progress / 1.4) + 1));
    const typed = checkInText.slice(0, count);
    return {draftText: `@Nova ${typed}`, showMenu: false, activeHandle: 'Nova'};
  }

  if (frame < USER_SEND_FRAME + 8) {
    return {draftText: `@Nova ${checkInText}`, showMenu: false, activeHandle: 'Nova'};
  }

  return {draftText: '', showMenu: false, activeHandle: 'Nova'};
};

export const FakeTerminalDemo: React.FC = () => {
  const frame = useCurrentFrame();

  const visibleFeed = timeline.messages
    .filter((entry) => frame >= entry.frame)
    .map((entry) => entry.message)
    .slice(-MAX_VISIBLE_MESSAGES);

  const activeTyping = timeline.typing.find((window) => frame >= window.start && frame < window.end) ?? null;

  const typingAgentName = activeTyping ? activeTyping.agentName : null;

  const hasRequestAlert = timeline.requestFrame !== null && frame >= timeline.requestFrame;
  const requestPulse =
    timeline.requestFrame !== null && frame >= timeline.requestFrame && frame < timeline.requestFrame + 20;

  const composer = getComposerState(frame);
  const mentionSplit = composer.draftText.startsWith('@')
    ? (() => {
        const divider = composer.draftText.indexOf(' ');
        if (divider === -1) {
          return {mention: composer.draftText, rest: ''};
        }
        return {
          mention: composer.draftText.slice(0, divider),
          rest: composer.draftText.slice(divider)
        };
      })()
    : {mention: '', rest: composer.draftText};

  return (
    <AbsoluteFill className="terminal-demo-root">
      <div className="terminal-preview">
        <div className="terminal-tabs">
          {tabs.map((tab) => {
            return (
              <span key={tab.id} className={`tab-item ${tab.active ? 'active' : ''}`}>
                <span>{tab.label}</span>
                {tab.id === 'requests' && hasRequestAlert ? (
                  <span className={`request-indicator ${requestPulse ? 'pulse' : ''}`} />
                ) : null}
              </span>
            );
          })}
        </div>

        <div className="agent-row">
          <article className="agent-chip all-activity">
            <Img src={staticFile('logo.svg')} alt="Termlings logo" />
            <div className="agent-meta">
              <p className="agent-name">All</p>
              <p className="agent-role">Activity</p>
            </div>
          </article>

          {agents.map((agent) => {
            const isTyping = typingAgentName === agent.name;
            return (
              <article key={agent.name} className="agent-chip">
                <Img src={agent.avatar} alt={`${agent.name} avatar`} />
                <div className="agent-meta">
                  <p className="agent-name">{agent.name}</p>
                  <p className="agent-role">
                    <span>{agent.role}</span>
                    {isTyping ? <span className="talking-dots" aria-hidden="true" /> : null}
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="feed">
          {visibleFeed.map((item) => {
            return (
              <article key={item.id} className={`feed-item ${item.request ? 'request-message' : ''} ${item.join ? 'join-message' : ''}`}>
                <div className="feed-head">
                  {item.join ? (
                    <div className="feed-route">
                      <span className={`tone ${item.fromTone}`} />
                      <span className="feed-party">{item.from}</span>
                      <span className="join-word">joined</span>
                      {item.runtime ? (
                        <>
                          <span className="join-via">via</span>
                          <span className="join-runtime">
                            <Img src={item.runtime.logo} alt="" />
                            <span>{item.runtime.label}</span>
                          </span>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <div className="feed-route">
                      <span className={`tone ${item.fromTone}`} />
                      <span className="feed-party">{item.from}</span>
                      <span className="feed-arrow">→</span>
                      <span className={`tone ${item.toTone}`} />
                      <span className="feed-party">{item.to}</span>
                    </div>
                  )}
                  <span className="feed-time">{item.stamp}</span>
                </div>
                {!item.join ? <p className="feed-body">{item.text}</p> : null}
              </article>
            );
          })}
        </div>

        {activeTyping ? (
          <div className="typing-row">
            <span className={`tone ${activeTyping.tone}`} />
            <span className="typing-label">{activeTyping.party} is writing</span>
            <span className="typing-dots" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </div>
        ) : null}

        <div className="composer">
          <div className="composer-input">
            <span className="prompt">›</span>
            {composer.draftText ? (
              <>
                <span className="draft">
                  {mentionSplit.mention ? <span className="draft-mention">{mentionSplit.mention}</span> : null}
                  {mentionSplit.rest}
                </span>
                <span className="cursor" />
              </>
            ) : (
              <>
                <span className="cursor" />
                <span className="hint">
                  Write "<strong>@everyone</strong>" or "<strong>@agent</strong>" to send DM
                </span>
              </>
            )}
          </div>
          {composer.showMenu ? (
            <div className="mention-menu">
              {mentionOptions.map((option) => {
                const active = composer.activeHandle === option.handle;
                return (
                  <div key={option.handle} className={`mention-item ${active ? 'active' : ''}`}>
                    <span className="mention-caret">{active ? '›' : ''}</span>
                    <span className="mention-name">@{option.handle}</span>
                    <span className={`mention-swatch ${option.tone}`} />
                    <span className="mention-sep">·</span>
                    <span className="mention-role">{option.role}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="statusbar">
          <span>my-project / All activity</span>
          <span>0/591 ↑/↓</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
