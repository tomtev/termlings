/**
 * Browser automation and query patterns commands
 * Complete implementation with all logic extracted from cli.ts
 */

export async function handleBrowser(flags: Set<string>, positional: string[], opts: Record<string, string>) {
  const {
    initializeBrowserDirs,
    getBrowserConfig,
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
  termlings browser start             Launch browser instance
  termlings browser stop              Stop browser gracefully
  termlings browser status            Show running status & uptime

NAVIGATION:
  termlings browser navigate <url>    Go to URL
  termlings browser screenshot        Capture page (returns base64)
  termlings browser extract           Get visible page text

INTERACTION:
  termlings browser type <text>       Type into focused element
  termlings browser click <selector>  Click element by CSS selector
  termlings browser cookies list      List all cookies

HUMAN-IN-LOOP:
  termlings browser check-login       Exit 1 if login required
  termlings browser request-help <msg> Notify operator via DM

QUERY PATTERNS (reusable automation):
  termlings browser patterns list     List available patterns
  termlings browser patterns view <id> Show pattern details
  termlings browser patterns execute <id> Run pattern with args

EXAMPLES:
  termlings browser navigate "https://example.com"
  termlings browser type "hello world"
  termlings browser click "button.submit"
  termlings browser extract | jq '.text'

ENVIRONMENT:
  TERMLINGS_AGENT_NAME               Your name (auto-logged)
  TERMLINGS_AGENT_DNA                Your stable ID (auto-logged)
  BRIDGE_HEADLESS=false              Run with visible UI

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
      const wasRunning = await isBrowserRunning();
      if (wasRunning) {
        console.log("✓ Browser already running");
        return;
      }

      const { pid, port } = await startBrowser();
      console.log(`✓ Browser started (PID ${pid}, port ${port})`);
      console.log(`Profile: .termlings/browser/profile/`);
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

  try {
    if (subcommand === "navigate") {
      const url = positional[2];
      if (!url) {
        console.error("Usage: termlings browser navigate <url>");
        process.exit(1);
      }
      await client.navigate(url);
      await logBrowserActivity("navigate", [url], "success");
      console.log(`✓ Navigated to ${url}`);
      return;
    }

    if (subcommand === "screenshot") {
      const base64 = await client.screenshot();
      await logBrowserActivity("screenshot", [], "success");
      console.log(base64.slice(0, 100) + "...");
      return;
    }

    if (subcommand === "type") {
      const text = positional.slice(2).join(" ");
      if (!text) {
        console.error("Usage: termlings browser type <text>");
        process.exit(1);
      }
      await client.typeText(text);
      await logBrowserActivity("type", [text], "success");
      console.log(`✓ Typed: ${text}`);
      return;
    }

    if (subcommand === "click") {
      const selector = positional[2];
      if (!selector) {
        console.error("Usage: termlings browser click <selector>");
        process.exit(1);
      }
      await client.clickSelector(selector);
      await logBrowserActivity("click", [selector], "success");
      console.log(`✓ Clicked: ${selector}`);
      return;
    }

    if (subcommand === "extract") {
      const text = await client.extractText();
      await logBrowserActivity("extract", [], "success");
      console.log(text);
      return;
    }

    if (subcommand === "cookies") {
      const action = positional[2] || "list";
      if (action === "list") {
        const cookies = await client.getCookies();
        await logBrowserActivity("cookies", ["list"], "success");
        console.log(JSON.stringify(cookies, null, 2));
        return;
      }
      console.error("Usage: termlings browser cookies list");
      process.exit(1);
    }

    if (subcommand === "check-login") {
      const { checkIfLoginRequired } = await import("../engine/browser.js");
      const needsLogin = await checkIfLoginRequired(client);
      await logBrowserActivity("check-login", [], "success");
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

Patterns capture: navigate URL, wait time, CSS selectors, jq filters
Save once, execute many times with different arguments.

COMMANDS:
  termlings browser patterns list                List all saved patterns
  termlings browser patterns view <pattern-id>  Show pattern details (JSON)
  termlings browser patterns execute <id> ...   Run pattern with args
  termlings browser patterns save <name>        Create new pattern

PATTERN FORMAT:
  {
    "id": "github-issues",
    "name": "GitHub Issues Search",
    "sites": ["github.com"],
    "navigate": "https://github.com/search?q=:query",
    "wait_ms": 2000,
    "filters": [".issue-title | text"],
    "added_by": "alice",
    "created_at": 1234567890
  }

EXAMPLES:
  List patterns:
    $ termlings browser patterns list

  View pattern details:
    $ termlings browser patterns view github-issues

  Execute pattern:
    $ termlings browser patterns execute github-issues

WHY USE PATTERNS?
  • Save tokens: Navigate + wait + extract once, reuse forever
  • Share knowledge: Save patterns other agents discover
  • Consistency: Same selectors & timing across team
  • Quick reference: Common workflows at fingertips

YOUR AGENT CONTEXT IS SAVED:
  • Pattern includes your name
  • Created timestamp recorded
  • Reusable across projects & sessions
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

      console.error(`Unknown patterns action: ${action}`);
      console.error("Usage: termlings browser patterns <list|view|execute|save>");
      process.exit(1);
    }

    console.error(`Unknown browser command: ${subcommand}`);
    console.error("Usage: termlings browser <init|start|stop|status|navigate|screenshot|type|click|extract|cookies|check-login|request-help|patterns>");
    process.exit(1);
  } catch (e) {
    await logBrowserActivity(subcommand, positional.slice(2), "error", String(e));
    console.error(`Error: ${e}`);
    process.exit(1);
  }
}
