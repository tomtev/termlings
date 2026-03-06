/**
 * Browser automation and query patterns commands
 * Browser automation commands
 */

function parseBooleanOption(raw: string | undefined, optionName: string): boolean | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  throw new Error(`Invalid value for --${optionName}: ${raw}. Use true/false.`);
}

function resolveHeadlessMode(flags: Set<string>, opts: Record<string, string>): boolean | undefined {
  const headedFromOpt = parseBooleanOption(opts.headed, "headed");
  const headlessFromOpt = parseBooleanOption(opts.headless, "headless");
  const headed = headedFromOpt ?? (flags.has("headed") ? true : undefined);
  const headless = headlessFromOpt ?? (flags.has("headless") ? true : undefined);

  let resolved: boolean | undefined;
  if (headed !== undefined) {
    resolved = !headed;
  }
  if (headless !== undefined) {
    if (resolved !== undefined && resolved !== headless) {
      throw new Error("Conflicting browser mode options. Use only one of --headed or --headless.");
    }
    resolved = headless;
  }
  return resolved;
}

function isTabActive(tab: { active?: boolean; current?: boolean; selected?: boolean; focused?: boolean }): boolean {
  return Boolean(tab.active || tab.current || tab.selected || tab.focused);
}

export async function handleBrowser(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  const {
    initializeBrowserDirs,
    getOrCreateProfileReference,
    getBrowserConfig,
    startBrowser,
    stopBrowser,
    isBrowserRunning,
    isAgentBrowserAvailable,
    logBrowserActivity,
    readProcessState,
  } = await import("../engine/browser.js");
  const { BrowserClient } = await import("../engine/browser-client.js");

  const subcommand = positional[1];

  // Show help
  if (!subcommand || subcommand === "--help" || subcommand === "help") {
    console.log(`
🌐 Browser Service - Web Automation & Human-in-Loop

SETUP:
  termlings browser init              Initialize profile (creates .termlings/browser/)

SERVER CONTROL:
  termlings browser start [--headed|--headless] Launch Chrome with CDP
  termlings browser stop              Stop Chrome browser process
  termlings browser status            Show running status & uptime

MODE GUIDE:
  Headed (default): login flows, approvals, CAPTCHA/manual intervention
  Headless: CI, scraping, repeatable extraction without human takeover
  Note: both modes use CDP; headless only removes the visible window

NAVIGATION:
  termlings browser navigate <url> [--tab <index>] Go to URL
  termlings browser snapshot [--tab <index>] Get structured page snapshot (JSON)
  termlings browser screenshot [--tab <index>] Capture page (returns base64)
  termlings browser extract [--tab <index>] Get visible page text
  termlings browser tabs list         List open tabs
  termlings browser overview          Show browser + tabs overview
  Note: when --tab is omitted, agent sessions auto-pin to a stable tab and stamp that tab with agent identity

INTERACTION:
  termlings browser type <text> [--tab <index>] Type into focused element
  termlings browser click <selector> [--tab <index>] Click element by CSS selector
  termlings browser focus <selector> [--tab <index>] Focus element by CSS selector
  termlings browser cursor [--tab <index>] Preview optional in-page avatar cursor overlay
  termlings browser cookies list [--tab <index>] List all cookies

HUMAN-IN-LOOP:
  termlings browser check-login [--tab <index>] Exit 1 if login required
  termlings browser request-help <msg> [--tab <index>] Notify operator via DM

QUERY PATTERNS (reusable automation):
  termlings browser patterns list     List available patterns
  termlings browser patterns view <id> Show pattern details
  termlings browser patterns execute <id> Run pattern with args
  termlings browser patterns save <id> Create/update pattern

EXAMPLES:
  termlings browser start --headed
  termlings browser start --headless
  termlings browser navigate "https://example.com"
  termlings browser navigate "https://example.com" --tab 1
  termlings browser snapshot --compact --interactive --depth 2
  termlings browser snapshot --tab 1
  termlings browser screenshot --tab 1 --out /tmp/page.png
  termlings browser type "hello world"
  termlings browser click "button.submit"
  termlings browser focus "input[type='email']"
  termlings browser cursor
  termlings browser extract | jq '.text'

ENVIRONMENT:
  TERMLINGS_AGENT_NAME               Your name (auto-logged)
  TERMLINGS_AGENT_DNA                Your stable ID (auto-logged)
  TERMLINGS_BROWSER_INPAGE_CURSOR    true/false for optional cursor preview (default: true)
  TERMLINGS_BROWSER_PRESERVE_FOCUS   true/false (macOS, default: true for agent sessions)

PROFILES:
  Per-project profiles auto-created in ~/.termlings/chrome-profiles/
  Activity logged to .termlings/browser/history/all.jsonl and .termlings/browser/history/agent/<agent>.jsonl
  Runtime adapter: agent-browser --native --cdp
`);
    return;
  }

  // Control subcommands (no server needed)
  if (subcommand === "init") {
    try {
      await initializeBrowserDirs();
      const profileRef = getOrCreateProfileReference();
      console.log("✓ Browser initialized. Workspace profile prepared.");
      console.log(`Profile: ${profileRef.location}`);
      if (!isAgentBrowserAvailable()) {
        console.log("Install runtime: npm install -g agent-browser && agent-browser install");
      }
      return;
    } catch (e) {
      console.error(`Error initializing browser: ${e}`);
      process.exit(1);
    }
  }

  if (subcommand === "start") {
    try {
      if (!isAgentBrowserAvailable()) {
        console.error("agent-browser CLI is required. Install with:");
        console.error("  npm install -g agent-browser && agent-browser install");
        process.exit(1);
      }

      const headlessMode = resolveHeadlessMode(flags, opts);
      const wasRunning = await isBrowserRunning();
      if (wasRunning) {
        console.log("✓ Browser already running");
        if (headlessMode !== undefined) {
          console.log("  Requested mode ignored. Stop browser first to switch headed/headless mode.");
        }
        return;
      }

      const { pid, port } = await startBrowser(
        headlessMode === undefined
          ? undefined
          : { headless: headlessMode }
      );
      const effectiveHeadless = headlessMode === true;
      const profileRef = getOrCreateProfileReference();
      console.log(`✓ Browser started (PID ${pid}, port ${port})`);
      console.log(`Mode: ${effectiveHeadless ? "headless" : "headed"}`);
      console.log(`Profile: ${profileRef.location}`);
      console.log(`CDP endpoint: http://127.0.0.1:${port}`);
      console.log(`Runtime: agent-browser --native --cdp ${port}`);
      return;
    } catch (e) {
      console.error(`Error starting browser: ${e}`);
      process.exit(1);
    }
  }

  if (subcommand === "stop") {
    try {
      const wasRunning = await isBrowserRunning();
      await stopBrowser();
      if (!wasRunning) {
        console.log("Browser not running");
      } else {
        console.log("✓ Browser stopped");
      }
      return;
    } catch (e) {
      console.error(`Error stopping browser: ${e}`);
      process.exit(1);
    }
  }

  if (subcommand === "status") {
    try {
      const running = await isBrowserRunning();
      const state = readProcessState();
      const config = getBrowserConfig();

      if (!running) {
        console.log("Browser: stopped");
        console.log(`  Profile: ${config.profilePath}`);
        return;
      }

      const uptime = state?.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
      console.log(`Browser: running`);
      console.log(`  Port: ${state?.port}`);
      console.log(`  PID: ${state?.pid}`);
      console.log(`  Uptime: ${uptime}s`);
      if (state?.url) {
        console.log(`  URL: ${state.url}`);
      }
      if (state?.profilePath || config.profilePath) {
        console.log(`  Profile: ${state?.profilePath || config.profilePath}`);
      }
      console.log(`  Runtime: agent-browser --native --cdp ${state?.port}`);

      // Show active agents
      const { readAgentBrowserStates } = await import("../engine/browser.js");
      const agentStates = readAgentBrowserStates();
      if (agentStates.length > 0) {
        console.log(`\n  Active agents:`);
        for (const a of agentStates) {
          const name = a.agentName || a.sessionId;
          const slug = a.agentSlug ? ` (agent:${a.agentSlug})` : "";
          const ago = Math.floor((Date.now() - a.lastActionAt) / 1000);
          const url = a.url ? ` @ ${a.url}` : "";
          const tab = a.tabId ? ` [tab ${a.tabId}]` : "";
          console.log(`    ${name}${slug}: ${a.lastAction}${tab} ${ago}s ago${url}`);
        }
      }
      return;
    } catch (e) {
      console.error(`Error checking status: ${e}`);
      process.exit(1);
    }
  }

  // Special commands that work without running server
  if (subcommand === "request-help") {
    const { requestOperatorIntervention } = await import("../engine/browser.js");
    const message = positional.slice(2).join(" ");
    if (!message) {
      console.error("Usage: termlings browser request-help <message> [--tab <index>]");
      process.exit(1);
    }
    const explicitTabId = opts.tab ?? opts["tab-id"] ?? opts.tabId;
    await requestOperatorIntervention(message, explicitTabId);
    return;
  }

  // Browser interaction subcommands (requires running server)
  const state = readProcessState();
  if (!state || !state.pid) {
    console.error("Browser not running. Use: termlings browser start");
    process.exit(1);
  }
  if (!isAgentBrowserAvailable()) {
    console.error("agent-browser CLI is required. Install with:");
    console.error("  npm install -g agent-browser && agent-browser install");
    process.exit(1);
  }

  const client = new BrowserClient(state.cdpWsUrl || state.port);
  const tabIdRaw = opts.tab ?? opts["tab-id"] ?? opts.tabId;
  const tabId = typeof tabIdRaw === "string" && tabIdRaw.trim().length > 0
    ? tabIdRaw.trim()
    : undefined;

  const resolveEffectiveTabId = (): string | undefined => {
    if (tabId) return tabId;
    const selected = client.getLastSelectedTabId();
    if (typeof selected === "string" && selected.trim().length > 0) {
      return selected.trim();
    }
    return undefined;
  };

  const appendEffectiveTabArg = (args: string[], effectiveTabId: string | undefined): string[] => {
    if (!effectiveTabId) return args;
    const hasTabArg = args.some((arg) => arg === "--tab" || arg.startsWith("--tab="));
    if (hasTabArg) return args;
    return [...args, `--tab=${effectiveTabId}`];
  };

  const logActivity = async (
    command: string,
    args: string[],
    result: "success" | "error" | "timeout" = "success",
    error?: string
  ) => {
    const effectiveTabId = resolveEffectiveTabId();
    const payloadArgs = appendEffectiveTabArg(args, effectiveTabId);
    await logBrowserActivity(command, payloadArgs, result, error, effectiveTabId);
  };

  try {
    if (subcommand === "overview") {
      const tabs = await client.getTabs();
      let extractedText = "";
      try {
        extractedText = await client.extractText();
      } catch {
        // Keep overview resilient if extract fails.
      }
      await logActivity("overview", []);

      const stateSnapshot = readProcessState();
      const uptime = stateSnapshot?.startedAt ? Math.floor((Date.now() - stateSnapshot.startedAt) / 1000) : 0;
      console.log(`Browser: running`);
      console.log(`  Port: ${stateSnapshot?.port ?? state?.port}`);
      console.log(`  PID: ${stateSnapshot?.pid ?? state?.pid}`);
      console.log(`  Uptime: ${uptime}s`);
      if (stateSnapshot?.url) {
        console.log(`  URL: ${stateSnapshot.url}`);
      }

      console.log(`\nTabs (${tabs.length}):`);
      if (tabs.length === 0) {
        console.log("  (none)");
      } else {
        const activeTab = tabs.find((tab) => isTabActive(tab));
        tabs.forEach((tab, index) => {
          const marker = activeTab && activeTab.id === tab.id ? " *" : "";
          console.log(`  ${index + 1}. ${tab.title || "(untitled)"}${marker}`);
          console.log(`     id: ${tab.id}`);
          if (tab.url) {
            console.log(`     url: ${tab.url}`);
          }
        });
      }

      if (extractedText.trim().length > 0) {
        const oneLine = extractedText.replace(/\s+/g, " ").trim();
        const preview = oneLine.length > 220 ? `${oneLine.slice(0, 220)}...` : oneLine;
        console.log(`\nActive tab text preview:`);
        console.log(`  ${preview}`);
      }
      return;
    }

    if (subcommand === "snapshot") {
      const compactFromOpt = parseBooleanOption(opts.compact, "compact");
      const interactiveFromOpt = parseBooleanOption(opts.interactive, "interactive");
      const compact = compactFromOpt ?? flags.has("compact");
      const interactive = interactiveFromOpt ?? flags.has("interactive");

      let depth: number | undefined;
      if (opts.depth !== undefined) {
        depth = Number.parseInt(opts.depth, 10);
        if (Number.isNaN(depth) || depth < 0) {
          console.error("Invalid --depth value. Use a non-negative integer.");
          process.exit(1);
        }
      }

      const maxTokensRaw = opts["max-tokens"] ?? opts.maxTokens;
      let maxTokens: number | undefined;
      if (maxTokensRaw !== undefined) {
        maxTokens = Number.parseInt(maxTokensRaw, 10);
        if (Number.isNaN(maxTokens) || maxTokens <= 0) {
          console.error("Invalid --max-tokens value. Use a positive integer.");
          process.exit(1);
        }
      }

      const snapshot = await client.snapshot({
        compact,
        interactive,
        depth,
        maxTokens,
        tabId,
      });
      await logActivity("snapshot", positional.slice(2));

      const outPath = opts.out;
      const output = JSON.stringify(snapshot, null, 2);
      if (outPath) {
        const { writeFileSync } = await import("fs");
        writeFileSync(outPath, output + "\n");
        console.log(`✓ Snapshot saved: ${outPath}`);
        return;
      }

      console.log(output);
      return;
    }

    if (subcommand === "tabs") {
      const action = positional[2] || "list";
      if (action !== "list") {
        console.error("Usage: termlings browser tabs list");
        process.exit(1);
      }
      const tabs = await client.getTabs();
      await logActivity("tabs", [action]);

      if (tabs.length === 0) {
        console.log("No open tabs.");
        return;
      }

      console.log(`Open tabs (${tabs.length}):`);
      const activeTab = tabs.find((tab) => isTabActive(tab));
      tabs.forEach((tab, index) => {
        const marker = activeTab && activeTab.id === tab.id ? " *" : "";
        console.log(`${index + 1}. ${tab.title || "(untitled)"}${marker}`);
        console.log(`   id: ${tab.id}`);
        if (tab.url) {
          console.log(`   url: ${tab.url}`);
        }
      });
      return;
    }

    if (subcommand === "navigate") {
      const url = positional[2];
      if (!url) {
        console.error("Usage: termlings browser navigate <url> [--tab <index>]");
        process.exit(1);
      }
      await client.navigate(url, { tabId });
      await logActivity("navigate", tabId ? [url, `--tab=${tabId}`] : [url]);
      console.log(`✓ Navigated to ${url}`);
      return;
    }

    if (subcommand === "screenshot") {
      const base64 = await client.screenshot({ tabId });
      await logActivity("screenshot", tabId ? [`--tab=${tabId}`] : []);
      const outPath = opts.out;
      if (outPath) {
        const { writeFileSync } = await import("fs");
        const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
        writeFileSync(outPath, bytes);
        console.log(`✓ Screenshot saved: ${outPath} (${bytes.length} bytes)`);
        return;
      }

      if (process.stdout.isTTY) {
        console.log("✓ Screenshot captured. Pipe output or use --out <path>.");
        return;
      }

      process.stdout.write(base64);
      if (!base64.endsWith("\n")) {
        process.stdout.write("\n");
      }
      return;
    }

    if (subcommand === "type") {
      const text = positional.slice(2).join(" ");
      if (!text) {
        console.error("Usage: termlings browser type <text> [--tab <index>]");
        process.exit(1);
      }
      await client.typeText(text, { tabId });
      await logActivity("type", tabId ? [text, `--tab=${tabId}`] : [text]);
      console.log(`✓ Typed: ${text}`);
      return;
    }

    if (subcommand === "click") {
      const selector = positional[2];
      if (!selector) {
        console.error("Usage: termlings browser click <selector> [--tab <index>]");
        process.exit(1);
      }
      await client.clickSelector(selector, { tabId });
      await logActivity("click", tabId ? [selector, `--tab=${tabId}`] : [selector]);
      console.log(`✓ Clicked: ${selector}`);
      return;
    }

    if (subcommand === "focus") {
      const selector = positional[2];
      if (!selector) {
        console.error("Usage: termlings browser focus <selector> [--tab <index>]");
        process.exit(1);
      }
      await client.focusSelector(selector, { tabId });
      await logActivity("focus", tabId ? [selector, `--tab=${tabId}`] : [selector]);
      console.log(`✓ Focused: ${selector}`);
      return;
    }

    if (subcommand === "cursor") {
      await client.ensureAvatarCursor({ tabId, force: true });
      await logActivity("cursor", tabId ? [`--tab=${tabId}`] : []);
      console.log("✓ In-page avatar cursor preview active");
      return;
    }

    if (subcommand === "extract") {
      const text = await client.extractText({ tabId });
      await logActivity("extract", tabId ? [`--tab=${tabId}`] : []);
      console.log(text);
      return;
    }

    if (subcommand === "cookies") {
      const action = positional[2] || "list";
      if (action === "list") {
        const cookies = await client.getCookies({ tabId });
        await logActivity("cookies", tabId ? ["list", `--tab=${tabId}`] : ["list"]);
        console.log(JSON.stringify(cookies, null, 2));
        return;
      }
      console.error("Usage: termlings browser cookies list [--tab <index>]");
      process.exit(1);
    }

    if (subcommand === "check-login") {
      const { checkIfLoginRequired } = await import("../engine/browser.js");
      const needsLogin = await checkIfLoginRequired(client, tabId);
      await logActivity("check-login", tabId ? [`--tab=${tabId}`] : []);
      if (needsLogin) {
        console.log("⚠️  Login required on current page");
        process.exit(1);
      } else {
        console.log("✓ Page does not appear to require login");
        return;
      }
    }

    // Patterns subcommand
    if (subcommand === "patterns") {
      const {
        initializeQueryPatterns,
        listPatterns,
        getPattern,
        savePattern,
        resolvePattern,
      } = await import("../engine/query-patterns.js");

      const action = positional[2];

      // Show help
      if (!action || action === "--help" || action === "help") {
        console.log(`
📋 Query Patterns - Reusable Automation (90%+ token reduction)

Patterns capture: navigate URL, wait time, snapshot options, jq filters
Save once, execute many times with different arguments.

COMMANDS:
  termlings browser patterns list                         List all saved patterns
  termlings browser patterns view <pattern-id>           Show pattern details (JSON)
  termlings browser patterns execute <id> [k=v ...]      Run pattern with args
  termlings browser patterns save <id> --navigate=...    Create/update pattern

SAVE EXAMPLE:
  termlings browser patterns save example \\
    --name=\"Example Domain\" \\
    --sites=\"example.com\" \\
    --navigate=\"https://example.com\" \\
    --wait-ms=1200 \\
    --filters='[{\"name\":\"title\",\"jq\":\".title\"}]'

EXECUTE EXAMPLE:
  termlings browser patterns execute example
  termlings browser patterns execute github-issues owner=foo repo=bar
`);
        return;
      }

      if (action === "list") {
        initializeQueryPatterns();
        const patterns = listPatterns();
        if (patterns.length === 0) {
          console.log("📁 No patterns yet. Create one with: termlings browser patterns save");
          return;
        }
        console.log(`📋 ${patterns.length} patterns available:\n`);
        patterns.forEach((p) => {
          console.log(`  ${p.id.padEnd(20)} - ${p.name}`);
          console.log(`    Sites: ${p.sites.join(", ")}`);
          if (p.added_by) {
            console.log(`    Added by: ${p.added_by}`);
          }
        });
        return;
      }

      if (action === "view") {
        const patternId = positional[3];
        if (!patternId) {
          console.error("Usage: termlings browser patterns view <pattern-id>");
          process.exit(1);
        }
        const pattern = getPattern(patternId);
        if (!pattern) {
          console.error(`Pattern not found: ${patternId}`);
          process.exit(1);
        }
        console.log(JSON.stringify(pattern, null, 2));
        return;
      }

      if (action === "save") {
        initializeQueryPatterns();
        const patternId = positional[3];
        if (!patternId) {
          console.error("Usage: termlings browser patterns save <id> --navigate=<url-template> [--name=...] [--sites=a,b] [--wait-ms=2000] [--filters='[...]']");
          process.exit(1);
        }

        const navigateTemplate = opts.navigate;
        if (!navigateTemplate) {
          console.error("Missing required option: --navigate=<url-template>");
          process.exit(1);
        }

        const waitMsRaw = opts["wait-ms"] ?? opts.wait_ms;
        const waitMs = waitMsRaw ? Number.parseInt(waitMsRaw, 10) : 2000;
        if (Number.isNaN(waitMs) || waitMs < 0) {
          console.error("Invalid --wait-ms value. Use a non-negative integer.");
          process.exit(1);
        }

        const sites = (opts.sites || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        let filters: Array<{ name: string; jq: string }> = [];
        if (opts.filters) {
          try {
            const parsed = JSON.parse(opts.filters) as unknown;
            if (!Array.isArray(parsed)) {
              throw new Error("--filters must be a JSON array");
            }
            filters = parsed
              .filter((entry) => Boolean(entry?.jq))
              .map((entry, index) => ({
                name: entry.name || `filter-${index + 1}`,
                jq: entry.jq!,
              }));
          } catch (error) {
            console.error(`Invalid --filters JSON: ${error}`);
            process.exit(1);
          }
        }

        let snapshotOptions: Record<string, unknown> | undefined;
        const snapshotOptionsRaw = opts["snapshot-options"] ?? opts.snapshot_options;
        if (snapshotOptionsRaw) {
          try {
            snapshotOptions = JSON.parse(snapshotOptionsRaw) as Record<string, unknown>;
          } catch (error) {
            console.error(`Invalid --snapshot-options JSON: ${error}`);
            process.exit(1);
          }
        }

        const pattern = {
          id: patternId,
          name: opts.name || patternId,
          sites,
          description: opts.description || `Pattern for ${patternId}`,
          pattern: {
            navigate: navigateTemplate,
            wait_ms: waitMs,
            ...(snapshotOptions ? { snapshot_options: snapshotOptions } : {}),
            filters,
          },
          usage: opts.usage,
          added_by: process.env.TERMLINGS_AGENT_NAME || "unknown",
          created_at: new Date().toISOString(),
        };

        savePattern(pattern);
        await logActivity("patterns-save", [patternId]);
        console.log(`✓ Saved pattern: ${patternId}`);
        return;
      }

      if (action === "execute") {
        initializeQueryPatterns();
        const patternId = positional[3];
        if (!patternId) {
          console.error("Usage: termlings browser patterns execute <pattern-id> [k=v ...]");
          process.exit(1);
        }

        const pattern = getPattern(patternId);
        if (!pattern) {
          console.error(`Pattern not found: ${patternId}`);
          process.exit(1);
        }

        const reservedOptKeys = new Set([
          "tab", "tab-id", "tabId",
          "out", "compact", "interactive", "depth", "max-tokens", "maxTokens",
          "headed", "headless",
          "name", "description", "sites", "navigate", "wait-ms", "wait_ms", "filters", "snapshot-options", "snapshot_options", "usage",
        ]);

        const params: Record<string, string> = {};
        for (const [key, value] of Object.entries(opts)) {
          if (!reservedOptKeys.has(key)) {
            params[key] = value;
          }
        }
        for (const token of positional.slice(4)) {
          const eqIndex = token.indexOf("=");
          if (eqIndex > 0) {
            const key = token.slice(0, eqIndex).replace(/^--/, "");
            const value = token.slice(eqIndex + 1);
            if (key.length > 0) {
              params[key] = value;
            }
          }
        }

        const navigateUrl = resolvePattern(pattern.pattern.navigate, params);
        await client.navigate(navigateUrl, { tabId });

        const waitMs = Math.max(0, Number(pattern.pattern.wait_ms || 0));
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }

        const rawSnapshotOptions = pattern.pattern.snapshot_options || {};
        const maxTokensFromPattern =
          typeof rawSnapshotOptions.maxTokens === "number"
            ? rawSnapshotOptions.maxTokens
            : typeof (rawSnapshotOptions as { max_tokens?: unknown }).max_tokens === "number"
              ? ((rawSnapshotOptions as { max_tokens: number }).max_tokens)
              : undefined;
        const snapshotOptions = {
          tabId,
          compact: rawSnapshotOptions.compact === true,
          interactive: rawSnapshotOptions.interactive === true,
          depth: typeof rawSnapshotOptions.depth === "number" ? rawSnapshotOptions.depth : undefined,
          maxTokens: maxTokensFromPattern,
          selector: typeof rawSnapshotOptions.selector === "string" ? rawSnapshotOptions.selector : undefined,
        };

        const snapshot = await client.snapshot(snapshotOptions);
        const snapshotJson = JSON.stringify(snapshot, null, 2);

        const filterOutputs: Array<{ name: string; jq: string; output?: string; error?: string }> = [];
        const patternFilters = Array.isArray(pattern.pattern.filters) ? pattern.pattern.filters : [];
        if (patternFilters.length > 0) {
          const { spawnSync } = await import("child_process");
          for (const filter of patternFilters) {
            const run = spawnSync("jq", [filter.jq], {
              input: snapshotJson,
              encoding: "utf8",
            });
            if (run.error) {
              filterOutputs.push({
                name: filter.name,
                jq: filter.jq,
                error: `jq execution failed: ${run.error.message}`,
              });
              continue;
            }
            if (run.status !== 0) {
              filterOutputs.push({
                name: filter.name,
                jq: filter.jq,
                error: run.stderr?.trim() || `jq exited with status ${run.status}`,
              });
              continue;
            }
            filterOutputs.push({
              name: filter.name,
              jq: filter.jq,
              output: run.stdout.trim(),
            });
          }
        }

        const resultPayload = {
          pattern: pattern.id,
          resolvedUrl: navigateUrl,
          params,
          snapshot,
          filters: filterOutputs,
        };

        await logActivity("patterns-execute", [pattern.id, navigateUrl]);

        const outPath = opts.out;
        if (outPath) {
          const { writeFileSync } = await import("fs");
          writeFileSync(outPath, JSON.stringify(resultPayload, null, 2) + "\n");
          console.log(`✓ Pattern result saved: ${outPath}`);
          return;
        }

        console.log(JSON.stringify(resultPayload, null, 2));
        return;
      }

      console.error(`Unknown patterns action: ${action}`);
      console.error("Usage: termlings browser patterns <list|view|execute|save>");
      process.exit(1);
    }

    console.error(`Unknown browser command: ${subcommand}`);
    console.error("Usage: termlings browser <init|start|stop|status|overview|tabs|navigate|snapshot|screenshot|type|click|focus|cursor|extract|cookies|check-login|request-help|patterns>");
    process.exit(1);
  } catch (e) {
    await logActivity(subcommand, positional.slice(2), "error", String(e));
    console.error(`Error: ${e}`);
    process.exit(1);
  }
}
