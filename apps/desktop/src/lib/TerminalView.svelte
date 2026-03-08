<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { WebglAddon } from '@xterm/addon-webgl';
  import { WebLinksAddon } from '@xterm/addon-web-links';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import type { UnlistenFn } from '@tauri-apps/api/event';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { resolvedTheme, type ResolvedTheme } from './stores/theme';
  import { sessionStates, reportOutput, reportExit, reportInput, reportHookEvent, removeSessionState } from './stores/sessionState';
  import { isLiveSession } from './stores/sessions';
  import { getOakMonoFont, getOakTerminalTheme, getOakToken } from './theme/oakTerminal';

  interface Props {
    sessionId: string;
    visible: boolean;
  }

  let { sessionId, visible }: Props = $props();

  let containerEl: HTMLDivElement;
  let terminal: Terminal;
  let fitAddon: FitAddon;
  let scrolledUp = $state(false);
  let unlistenOutput: UnlistenFn;
  let unlistenExit: UnlistenFn;
  let unlistenHook: UnlistenFn;
  let unlistenDrop: UnlistenFn;
  let resizeObserver: ResizeObserver;
  let fitTimer: ReturnType<typeof setTimeout>;

  function getTermTheme(t: ResolvedTheme) {
    return getOakTerminalTheme(t);
  }

  function doFit() {
    if (!fitAddon || !terminal || !containerEl) return;
    // Only fit if container has real dimensions
    if (containerEl.offsetWidth === 0 || containerEl.offsetHeight === 0) return;
    const dims = fitAddon.proposeDimensions();
    if (dims) {
      // Subtract 1 row to prevent the last row from being clipped by overflow
      terminal.resize(dims.cols, Math.max(1, dims.rows - 1));
    }
    terminal.refresh(0, terminal.rows - 1);
  }

  function scheduleFit() {
    clearTimeout(fitTimer);
    // Retry at increasing intervals until the container has real dimensions.
    // Project switches can cause layout to settle slowly.
    const delays = [0, 50, 150, 300, 500, 1000];
    let i = 0;
    function attempt() {
      clearTimeout(fitTimer);
      doFit();
      i++;
      if (i < delays.length && containerEl && (containerEl.offsetWidth === 0 || containerEl.offsetHeight === 0)) {
        fitTimer = setTimeout(attempt, delays[i]);
      } else if (i < delays.length) {
        // One final fit after layout is stable
        fitTimer = setTimeout(() => doFit(), delays[i]);
      }
    }
    requestAnimationFrame(attempt);
  }

  function loadWebGl() {
    if (!terminal) return;
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
        try {
          const fresh = new WebglAddon();
          fresh.onContextLoss(() => {
            fresh.dispose();
          });
          terminal.loadAddon(fresh);
        } catch {
          // Canvas fallback
        }
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available, canvas renderer is fine
    }
  }

  // Wait for container to have real dimensions before opening terminal
  function waitForDimensions(): Promise<void> {
    return new Promise((resolve) => {
      if (containerEl.offsetWidth > 0 && containerEl.offsetHeight > 0) {
        resolve();
        return;
      }
      let checks = 0;
      const interval = setInterval(() => {
        checks++;
        if ((containerEl.offsetWidth > 0 && containerEl.offsetHeight > 0) || checks > 50) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
  }

  onMount(async () => {
    terminal = new Terminal({
      fontSize: 13,
      fontFamily: getOakMonoFont(),
      theme: getTermTheme($resolvedTheme),
      cursorBlink: false,
      allowProposedApi: true,
      scrollback: 5000,
      fastScrollSensitivity: 10,
      rescaleOverlappingGlyphs: true,
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Wait for container to have real dimensions before opening
    // (project switches can cause mount before layout settles)
    await waitForDimensions();

    terminal.open(containerEl);
    // Set container background to match terminal theme (covers padding area)
    containerEl.style.background = getTermTheme($resolvedTheme).background ?? '';
    loadWebGl();
    terminal.loadAddon(new WebLinksAddon());

    // Respond to OSC 10 (foreground) and OSC 11 (background) color queries
    // so CLI tools can detect light/dark mode at runtime
    function hexToOsc(hex: string): string {
      const r = hex.slice(1, 3); const g = hex.slice(3, 5); const b = hex.slice(5, 7);
      return `rgb:${r}${r}/${g}${g}/${b}${b}`;
    }
    terminal.parser.registerOscHandler(10, (data) => {
      if (data === '?') {
        const theme = getTermTheme($resolvedTheme);
        const fg = theme.foreground || getOakToken('--foreground');
        invoke('write_to_session', { sessionId, data: `\x1b]10;${hexToOsc(fg)}\x1b\\` });
      }
      return true;
    });
    terminal.parser.registerOscHandler(11, (data) => {
      if (data === '?') {
        const theme = getTermTheme($resolvedTheme);
        const bg = theme.background || getOakToken('--background');
        invoke('write_to_session', { sessionId, data: `\x1b]11;${hexToOsc(bg)}\x1b\\` });
      }
      return true;
    });

    scheduleFit();

    // Send initial size to backend after fit
    setTimeout(async () => {
      await invoke('resize_session', {
        sessionId,
        cols: terminal.cols,
        rows: terminal.rows,
      });
    }, 150);

    // Terminal input → PTY
    terminal.onData(async (data) => {
      reportInput(sessionId);
      await invoke('write_to_session', { sessionId, data });
    });

    // Terminal resize → PTY (also report as input since resize triggers TUI redraws)
    terminal.onResize(async ({ cols, rows }) => {
      reportInput(sessionId);
      await invoke('resize_session', { sessionId, cols, rows });
    });

    // Track scroll position to show "scroll to bottom" button
    terminal.onScroll(() => {
      const buf = terminal.buffer.active;
      scrolledUp = buf.viewportY < buf.baseY;
    });

    // PTY output → Terminal + state tracking
    unlistenOutput = await listen<number[]>(`pty-output-${sessionId}`, (event) => {
      const bytes = new Uint8Array(event.payload);
      terminal.write(bytes);
      reportOutput(sessionId, bytes);
    });

    // PTY exit
    unlistenExit = await listen(`pty-exit-${sessionId}`, () => {
      terminal.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
      reportExit(sessionId);
    });

    // Claude Code hook events — instant state updates
    unlistenHook = await listen<{ session_id: string; hook_event_name: string; tool_name?: string; claude_session_id?: string }>(
      'hook-event', (event) => {
        if (event.payload.session_id === sessionId) {
          reportHookEvent(sessionId, event.payload.hook_event_name, event.payload.tool_name, event.payload.claude_session_id);
        }
      }
    );

    // Drag-and-drop: paste file paths into PTY (like iTerm)
    unlistenDrop = await getCurrentWebview().onDragDropEvent(async (event) => {
      if (!visible) return;
      if (event.payload.type === 'drop') {
        const quoted = event.payload.paths.map((p) =>
          p.includes(' ') ? `"${p}"` : p
        );
        if (quoted.length > 0) {
          await invoke('write_to_session', { sessionId, data: quoted.join(', ') });
        }
      }
    });

    // Resize observer for container
    resizeObserver = new ResizeObserver(() => {
      if (visible) {
        reportInput(sessionId); // suppress busy — resize triggers TUI redraw
        doFit();
      }
    });
    resizeObserver.observe(containerEl);
  });

  onDestroy(() => {
    clearTimeout(fitTimer);
    unlistenOutput?.();
    unlistenExit?.();
    unlistenHook?.();
    unlistenDrop?.();
    resizeObserver?.disconnect();
    terminal?.dispose();
  });

  // Re-fit when visibility changes (suppress busy since fit triggers TUI redraw)
  $effect(() => {
    if (visible && fitAddon && terminal) {
      reportInput(sessionId);
      // Force clear and refresh to recover from WebGL context loss
      terminal.clearTextureAtlas();
      // fitAddon.fit() is a no-op when container dimensions haven't changed
      // (e.g. switching projects with same-size container). Nudge the terminal
      // size by 1 col so fit() sees a difference and triggers a full repaint.
      if (terminal.cols > 1) {
        terminal.resize(terminal.cols - 1, terminal.rows);
      }
      scheduleFit();
    }
  });

  // Update terminal theme when app theme or color scheme changes
  $effect(() => {
    const t = $resolvedTheme;
    if (terminal) {
      const theme = getTermTheme(t);
      terminal.options.theme = theme;
      // Sync container background so padding area matches terminal
      if (containerEl) {
        containerEl.style.background = theme.background ?? '';
      }
    }
  });
</script>

<div
  class="terminal-container"
  class:active={visible}
  bind:this={containerEl}
></div>

<button
  class="scroll-bottom"
  class:visible={visible && scrolledUp}
  onclick={() => terminal?.scrollToBottom()}
  title="Scroll to bottom"
>
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 6l4 4 4-4"/>
  </svg>
</button>

<style>
  .terminal-container {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  .terminal-container.active {
    z-index: 1;
    pointer-events: auto;
  }

  .terminal-container :global(.xterm) {
    height: 100%;
    padding-left: 8px;
    background: inherit !important;
  }

  .terminal-container :global(.xterm-viewport) {
    background: inherit !important;
  }

  .scroll-bottom {
    position: absolute;
    bottom: 16px;
    right: 20px;
    z-index: 2;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 50%;
    color: var(--foreground);
    cursor: pointer;
    box-shadow: none;
    transform: translateY(8px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.2s ease, color 0.15s;
  }

  .scroll-bottom.visible {
    opacity: 0.8;
    pointer-events: auto;
    transform: translateY(0);
  }

  .scroll-bottom:hover {
    opacity: 1;
    color: var(--foreground);
  }
</style>
