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
    startBrowser,
    stopBrowser,
    isBrowserRunning,
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
  termlings browser start [--headed|--headless] Launch browser instance
  termlings browser stop              Stop browser gracefully
  termlings browser status            Show running status & uptime

NAVIGATION:
  termlings browser navigate <url> [--tab <id>] Go to URL
  termlings browser snapshot [--tab <id>] Get structured page snapshot (JSON)
  termlings browser screenshot [--tab <id>] Capture page (returns base64)
  termlings browser extract [--tab <id>] Get visible page text
  termlings browser tabs list         List open tabs
  termlings browser overview          Show browser + tabs overview

INTERACTION:
  termlings browser type <text> [--tab <id>] Type into focused element
  termlings browser click <selector> [--tab <id>] Click element by CSS selector
  termlings browser cookies list [--tab <id>] List all cookies

HUMAN-IN-LOOP:
  termlings browser check-login [--tab <id>] Exit 1 if login required
  termlings browser request-help <msg> Notify operator via DM

QUERY PATTERNS (reusable automation):
  termlings browser patterns list     List available patterns
  termlings browser patterns view <id> Show pattern details
  termlings browser patterns execute <id> Run pattern with args
  termlings browser patterns save <id> Create/update pattern

EXAMPLES:
  termlings browser start --headed
  termlings browser start --headless
  termlings browser navigate "https://example.com"
  termlings browser navigate "https://example.com" --tab <tab-id>
  termlings browser snapshot --compact --interactive --depth 2
  termlings browser snapshot --tab <tab-id>
  termlings browser screenshot --tab <tab-id> --out /tmp/page.png
  termlings browser type "hello world"
  termlings browser click "button.submit"
  termlings browser extract | jq '.text'

ENVIRONMENT:
  TERMLINGS_AGENT_NAME               Your name (auto-logged)
  TERMLINGS_AGENT_DNA                Your stable ID (auto-logged)
  BRIDGE_HEADLESS=true               Force background/headless mode

PROFILES:
  Per-project profiles auto-created in ~/.pinchtab/profiles/
  Activity logged to .termlings/browser/history.jsonl
  Dashboard: http://localhost:9867/dashboard
`);
    return;
  }

  // Control subcommands (no server needed)
  if (subcommand === "init") {
    try {
      await initializeBrowserDirs();
      console.log("✓ Browser initialized. Profile directory created.");
      console.log("Install PinchTab: npm install -g pinchtab");
      return;
    } catch (e) {
      console.error(`Error initializing browser: ${e}`);
      process.exit(1);
    }
  }

  if (subcommand === "start") {
    try {
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
      const envHeadless = (process.env.BRIDGE_HEADLESS ?? "false").toLowerCase() !== "false";
      const effectiveHeadless = headlessMode ?? envHeadless;
      const profileRef = getOrCreateProfileReference();
      console.log(`✓ Browser started (PID ${pid}, port ${port})`);
      console.log(`Mode: ${effectiveHeadless ? "headless" : "headed"}`);
      console.log(`Profile: ${profileRef.location}`);
      console.log(`Dashboard: http://127.0.0.1:${port}/dashboard`);
      return;
    } catch (e) {
      console.error(`Error starting browser: ${e}`);
      process.exit(1);
    }
  }

  if (subcommand === "stop") {
    try {
      const wasRunning = await isBrowserRunning();
      if (!wasRunning) {
        console.log("Browser not running");
        return;
      }

      await stopBrowser();
      console.log("✓ Browser stopped");
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

      if (!running) {
        console.log("Browser: stopped");
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
          console.log(`    ${name}${slug}: ${a.lastAction} ${ago}s ago${url}`);
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
      console.error("Usage: termlings browser request-help <message>");
      process.exit(1);
    }
    await requestOperatorIntervention(message);
    return;
  }

  // Browser interaction subcommands (requires running server)
  const state = readProcessState();
  if (!state || !state.pid) {
    console.error("Browser not running. Use: termlings browser start");
    process.exit(1);
  }

  const client = new BrowserClient(state.port);
  const tabId = opts.tab ?? opts["tab-id"] ?? opts.tabId;

  try {
    if (subcommand === "overview") {
      const tabs = await client.getTabs();
      let extractedText = "";
      try {
        extractedText = await client.extractText();
      } catch {
        // Keep overview resilient if extract fails.
      }
      await logBrowserActivity("overview", [], "success");

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
      await logBrowserActivity("snapshot", positional.slice(2), "success");

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
      await logBrowserActivity("tabs", [action], "success");

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
        console.error("Usage: termlings browser navigate <url> [--tab <id>]");
        process.exit(1);
      }
      await client.navigate(url, { tabId });
      await logBrowserActivity("navigate", tabId ? [url, `--tab=${tabId}`] : [url], "success");
      console.log(`✓ Navigated to ${url}`);
      return;
    }

    if (subcommand === "screenshot") {
      const base64 = await client.screenshot({ tabId });
      await logBrowserActivity("screenshot", tabId ? [`--tab=${tabId}`] : [], "success");
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
        console.error("Usage: termlings browser type <text> [--tab <id>]");
        process.exit(1);
      }
      await client.typeText(text, { tabId });
      await logBrowserActivity("type", tabId ? [text, `--tab=${tabId}`] : [text], "success");
      console.log(`✓ Typed: ${text}`);
      return;
    }

    if (subcommand === "click") {
      const selector = positional[2];
      if (!selector) {
        console.error("Usage: termlings browser click <selector> [--tab <id>]");
        process.exit(1);
      }
      await client.clickSelector(selector, { tabId });
      await logBrowserActivity("click", tabId ? [selector, `--tab=${tabId}`] : [selector], "success");
      console.log(`✓ Clicked: ${selector}`);
      return;
    }

    if (subcommand === "extract") {
      const text = await client.extractText({ tabId });
      await logBrowserActivity("extract", tabId ? [`--tab=${tabId}`] : [], "success");
      console.log(text);
      return;
    }

    if (subcommand === "cookies") {
      const action = positional[2] || "list";
      if (action === "list") {
        const cookies = await client.getCookies({ tabId });
        await logBrowserActivity("cookies", tabId ? ["list", `--tab=${tabId}`] : ["list"], "success");
        console.log(JSON.stringify(cookies, null, 2));
        return;
      }
      console.error("Usage: termlings browser cookies list [--tab <id>]");
      process.exit(1);
    }

    if (subcommand === "check-login") {
      const { checkIfLoginRequired } = await import("../engine/browser.js");
      const needsLogin = await checkIfLoginRequired(client, tabId);
      await logBrowserActivity("check-login", tabId ? [`--tab=${tabId}`] : [], "success");
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
        await logBrowserActivity("patterns-save", [patternId], "success");
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

        await logBrowserActivity("patterns-execute", [pattern.id, navigateUrl], "success");

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
    console.error("Usage: termlings browser <init|start|stop|status|overview|tabs|navigate|snapshot|screenshot|type|click|extract|cookies|check-login|request-help|patterns>");
    process.exit(1);
  } catch (e) {
    await logBrowserActivity(subcommand, positional.slice(2), "error", String(e));
    console.error(`Error: ${e}`);
    process.exit(1);
  }
}
