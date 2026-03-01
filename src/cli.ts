#!/usr/bin/env node
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import {
  renderTerminal,
  renderTerminalSmall,
  renderSVG,
  renderLayeredSVG,
  getAvatarCSS,
  getTraitColors,
  decodeDNA,
  encodeDNA,
  generateRandomDNA,
  traitsFromName,
  generateGrid,
  hslToRgb,
  LEGS,
} from "./index.js";
import type { Pixel } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flags = new Set<string>();
const opts: Record<string, string> = {};
let input: string | undefined;
const positional: string[] = [];
let agentPassthrough: string[] = [];

// Known flags that take a space-separated value (--name Foo, --dna abc123, etc.)
const VALUE_FLAGS = new Set([
  "name",
  "dna",
  "owner",
  "purpose",
  "dangerous-skip-confirmation",
  "port",
  "host",
]);

// Check if first arg is an agent name — if so, pass everything after it through raw
const { agents: _agentRegistry } = await import("./agents/index.js");
if (args[0] && _agentRegistry[args[0]]) {
  positional.push(args[0]);
  agentPassthrough = args.slice(1);

  // Parse --name, --dna for the launcher (strip them from passthrough)
  const filtered: string[] = [];
  for (let i = 0; i < agentPassthrough.length; i++) {
    const a = agentPassthrough[i]!;
    if (a.startsWith("--name=")) {
      opts.name = a.slice(7);
    } else if (a.startsWith("--dna=")) {
      opts.dna = a.slice(6);
    } else if (a === "--name" && i + 1 < agentPassthrough.length) {
      opts.name = agentPassthrough[++i]!;
    } else if (a === "--dna" && i + 1 < agentPassthrough.length) {
      opts.dna = agentPassthrough[++i]!;
    } else {
      filtered.push(a);
    }
  }
  agentPassthrough = filtered;
} else {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        opts[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
        flags.add(arg.slice(2, eqIdx));
      } else {
        const key = arg.slice(2);
        if (VALUE_FLAGS.has(key) && i + 1 < args.length && !args[i + 1]!.startsWith("-")) {
          opts[key] = args[++i]!;
          flags.add(key);
        } else {
          flags.add(key);
        }
      }
    } else if (arg === "-h") {
      flags.add("help");
    } else {
      positional.push(arg);
      if (!input) input = arg;
    }
  }
}

// --- Routing ---

if (flags.has("with") || args.some((arg) => arg === "--with" || arg.startsWith("--with="))) {
  console.error("The --with option has been removed. Termlings now supports Claude only.")
  process.exit(1)
}

if (positional[0] === "codex" || positional[0] === "pi") {
  console.error(`'${positional[0]}' support has been removed. Use: termlings claude`)
  process.exit(1)
}

// 0. Clear command: termlings --clear
if (flags.has("clear")) {
  const { clearWorkspaceRuntime, ensureWorkspaceDirs } = await import("./workspace/state.js");
  ensureWorkspaceDirs();
  clearWorkspaceRuntime();
  console.log(`✓ Cleared runtime session + IPC state`);
  console.log(`✓ Kept saved agents and persistent workspace data`);
  process.exit(0);
}

// 1. Agent launcher: termlings <cli> [flags...]
// If there are local agents, show picker. Otherwise launch CLI directly.
let agentAdapter = _agentRegistry[positional[0] ?? ""];

if (agentAdapter) {
  const { ensureWorkspaceDirs } = await import("./workspace/state.js");
  ensureWorkspaceDirs();

  const { discoverLocalAgents } = await import("./agents/discover.js");
  const localAgents = discoverLocalAgents();

  // If we have agents, show picker. Otherwise launch CLI directly.
  if (localAgents.length > 0) {
    const { selectLocalAgentWithRoom } = await import("./agents/discover.js");
    const selected = await selectLocalAgentWithRoom(localAgents);

    if (selected === "create-random") {
      // Generate random agent
      const { generateRandomDNA } = await import("./index.js");
      const randomDna = generateRandomDNA();
      const randomNames = ["Pixel", "Sprout", "Ember", "Nimbus", "Glitch", "Ziggy", "Quill", "Cosmo", "Maple", "Flint", "Wren", "Dusk", "Byte", "Fern", "Spark", "Nova", "Haze", "Basil", "Reef", "Orbit", "Sage", "Rusty", "Coral", "Luna", "Cinder", "Pip", "Storm", "Ivy", "Blaze", "Mochi"];
      const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];

      opts.name = opts.name || randomName;
      opts.dna = opts.dna || randomDna;

      const { launchAgent } = await import("./agents/launcher.js");
      await launchAgent(agentAdapter, agentPassthrough, opts);
    } else if (selected) {
      process.env.TERMLINGS_AGENT_NAME = opts.name || selected.soul?.name;
      process.env.TERMLINGS_AGENT_DNA = opts.dna || selected.soul?.dna;
      const { launchLocalAgent } = await import("./agents/launcher.js");
      await launchLocalAgent(selected, agentPassthrough, opts);
      process.exit(0);
    }
  } else {
    // No agents, just launch the CLI directly
    const { launchAgent } = await import("./agents/launcher.js");
    await launchAgent(agentAdapter, agentPassthrough, opts);
  }
}

// Helper function to send messages
async function sendMessage(
  target: string,
  text: string,
  sessionId: string,
  agentName: string,
  agentDna: string
) {
  const { writeMessages } = await import("./engine/ipc.js");
  const { appendWorkspaceMessage, readSession, upsertSession, listSessions } = await import("./workspace/state.js");

  const rawTarget = target;
  const resolvedTarget =
    rawTarget === "owner" || rawTarget === "operator"
      ? "human:default"
      : rawTarget;
  const fromName = agentName || "agent";
  const fromDna = agentDna || "0000000";
  const isHumanTarget = resolvedTarget.startsWith("human:");
  let targetSession = isHumanTarget ? null : readSession(resolvedTarget);
  let targetDna = targetSession?.dna;
  let finalTarget = resolvedTarget;

  if (!isHumanTarget && resolvedTarget.startsWith("agent:")) {
    const dna = resolvedTarget.slice("agent:".length);
    if (dna.length > 0) {
      const candidates = listSessions()
        .filter((session) => session.dna === dna)
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
      targetSession = candidates[0] ?? null;
      targetDna = dna;
      finalTarget = targetSession?.sessionId ?? resolvedTarget;
    }
  }

  if (!isHumanTarget && !targetSession) {
    console.error(`Unknown target: ${resolvedTarget}`);
    console.error("Use `termlings list-agents` to discover agent IDs, `agent:<dna>` for stable threads, or `human:<id>` for a human operator.");
    process.exit(1);
  }

  // Keep sender fresh in session listing while chatting.
  upsertSession(sessionId, {
    name: fromName,
    dna: fromDna,
  });

  if (targetSession) {
    writeMessages(finalTarget, [{
      from: sessionId,
      fromName,
      text,
      ts: Date.now(),
    }]);
  }

  appendWorkspaceMessage({
    kind: "dm",
    from: sessionId,
    fromName,
    fromDna,
    target: finalTarget,
    targetName: targetSession?.name ?? (isHumanTarget ? "Human Operator" : undefined),
    targetDna,
    text,
  });

  console.log(`Sent to ${resolvedTarget}: "${text}"`);
}

// 2. Agent session discovery: termlings list-agents
if (positional[0] === "list-agents") {
  if (flags.has("help")) {
    console.log(`
👥 List Agents - See who's online

Shows all active agent sessions in the workspace.

USAGE:
  termlings list-agents

OUTPUT:
  Session ID (16 chars)  Agent Name  [DNA]  Last Seen
  tl-abc123def456    Alice         [2c5f423] last-seen 5s ago (you)
  tl-xyz789pqr012    Bob           [1b4e312] last-seen 120s ago

NOTES:
  • (you) = Current session
  • Last seen: Time since last activity
  • DNA: Stable agent identity (persists across restarts)

USE WHEN:
  • Starting work (check who's active)
  • Coordinating with teammates
  • Finding agent DNAs to message
`);
    process.exit(0);
  }

  const { listSessions } = await import("./workspace/state.js");
  const sessions = listSessions();
  if (sessions.length === 0) {
    console.log("No active sessions");
    process.exit(0);
  }

  const sessionId = process.env.TERMLINGS_SESSION_ID;
  for (const s of sessions) {
    const ageSeconds = Math.max(0, Math.floor((Date.now() - s.lastSeenAt) / 1000));
    const you = s.sessionId === sessionId ? " (you)" : "";
    console.log(`${s.sessionId.padEnd(16)} ${s.name.padEnd(14)} [${s.dna}] last-seen ${ageSeconds}s ago${you}`);
  }
  process.exit(0);
}

// 2. Deprecated: termlings action (kept for backward compat, just show error)
if (positional[0] === "action") {
  const verb = positional[1];
  const helpText = `'action' command is deprecated. Use top-level commands instead:
  termlings list-agents              List active agent sessions
  termlings message <target> <text>  Send direct message
  termlings task <cmd>               Task management
  termlings calendar <cmd>           Calendar management`;

  if (!verb || verb === "--help" || verb === "-h") {
    console.error(helpText);
    process.exit(1);
  }

  // Common env vars for agent commands
  const _agentName = process.env.TERMLINGS_AGENT_NAME || undefined;
  const _agentDna = process.env.TERMLINGS_AGENT_DNA || undefined;
  const sessionId = process.env.TERMLINGS_SESSION_ID;

  const removedVerbs = new Set([
    "walk",
    "map",
    "chat",
    "place",
    "destroy",
    "inspect-object",
    "create-object",
    "create-sign",
    "edit-sign",
    "list-objects",
  ]);

  if (removedVerbs.has(verb)) {
    if (verb === "chat") {
      console.error(`'chat' is no longer available. Use direct messages only.`);
      console.error(`Use: termlings message human:<id> "<message>"`);
    } else {
      console.error(`'${verb}' is no longer available. The terminal sim/map engine has been removed.`);
      console.error(`Use the web workspace and messaging/task commands instead.`);
    }
    process.exit(1);
  }

  console.error(helpText);
  console.error("\nNote: Use 'termlings list-agents' instead for agent discovery.");
  process.exit(1);
}

// 2a. Direct messaging: termlings message <target> <text>
if (positional[0] === "message") {
  if (flags.has("help")) {
    console.log(`
💬 Message - Send DMs to agents & operators

Send direct messages to other agents, operators, or back to human handlers.

USAGE:
  termlings message <target> <text>

TARGETS:
  <session-id>          A specific live session (from termlings list-agents)
  agent:<dna>           Stable agent identity (works across restarts) ← PREFERRED
  human:<id>            Human operator inbox
    human:default       Owner/operator shortcut
    human:operator      Alias for operator
    human:owner         Alias for owner

EXAMPLES:
  # Message another agent
  termlings message agent:2c5f423 "I'm starting the data validation task"

  # Message the operator (high priority)
  termlings message human:default "Task completed, results in /tmp/output.json"

  # Message a specific live session
  termlings message tl-abc123def456 "Quick question about the API key"

BEST PRACTICES:
  ✓ Use agent:<dna> for persistent threads (survives restarts)
  ✓ Message human:default for blockers or status updates
  ✓ Keep messages concise (timestamps auto-added)
  ✓ Include concrete next steps
  ✓ Use for coordination, not logging

OPERATOR EXPECTATIONS:
  1. Acknowledge quickly
  2. Give next step + ETA
  3. State blockers clearly if stuck
  4. High priority: human messages get immediate attention
`);
    process.exit(0);
  }

  const sessionId = process.env.TERMLINGS_SESSION_ID;
  const _agentName = process.env.TERMLINGS_AGENT_NAME || undefined;
  const _agentDna = process.env.TERMLINGS_AGENT_DNA || undefined;

  if (!sessionId) {
    console.error("Error: TERMLINGS_SESSION_ID env var not set");
    process.exit(1);
  }

  const target = positional[1];
  const text = positional.slice(2).join(" ");

  if (!target || !text) {
    console.error("Usage: termlings message <target> <text>");
    console.error("Targets: <session-id> | agent:<dna> | human:<id> (aliases: operator, owner)");
    process.exit(1);
  }

  await sendMessage(target, text, sessionId, _agentName || "agent", _agentDna || "0000000");
  process.exit(0);
}

// 2a. Agent task management: termlings task <list|show|claim|status|note>
if (positional[0] === "task") {
  const { getTask, getAllTasks, claimTask, updateTaskStatus, addTaskNote, formatTask, formatAgentTaskList } = await import("./engine/tasks.js");
  const sessionId = process.env.TERMLINGS_SESSION_ID;
  const agentName = process.env.TERMLINGS_AGENT_NAME || "Agent";

  if (!sessionId) {
    console.error("Error: TERMLINGS_SESSION_ID env var not set");
    process.exit(1);
  }

  const subcommand = positional[1];
  const taskId = positional[2];

  if (subcommand === "list") {
    const tasks = getAllTasks();
    console.log(formatAgentTaskList(tasks, sessionId));
    process.exit(0);
  }

  if (subcommand === "show") {
    if (!taskId) {
      console.error("Usage: termlings task show <task-id>");
      process.exit(1);
    }
    const task = getTask(taskId);
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    console.log(formatTask(task));
    process.exit(0);
  }

  if (subcommand === "claim") {
    if (!taskId) {
      console.error("Usage: termlings task claim <task-id>");
      process.exit(1);
    }
    const task = claimTask(taskId, sessionId, agentName, "default");
    if (!task) {
      console.error(`Cannot claim task: ${taskId} (not found or already claimed)`);
      process.exit(1);
    }
    console.log(`✓ Task claimed: ${task.title}`);
    process.exit(0);
  }

  if (subcommand === "status") {
    const newStatus = positional[3];
    const note = positional.slice(4).join(" ");
    if (!taskId || !newStatus) {
      console.error("Usage: termlings task status <task-id> <open|claimed|in-progress|completed|blocked> [note]");
      process.exit(1);
    }
    const task = updateTaskStatus(taskId, newStatus as any, sessionId, agentName, note || undefined, "default");
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    console.log(`✓ Status updated: ${newStatus}`);
    process.exit(0);
  }

  if (subcommand === "note") {
    const text = positional.slice(3).join(" ");
    if (!taskId || !text) {
      console.error("Usage: termlings task note <task-id> <note...>");
      process.exit(1);
    }
    const task = addTaskNote(taskId, text, sessionId, agentName, "default");
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    console.log(`✓ Note added`);
    process.exit(0);
  }

  console.error("Usage: termlings task <list|show|claim|status|note>");
  process.exit(1);
}

// 2b. Agent calendar view + Owner calendar management: termlings calendar <list|show|create|...>
if (positional[0] === "calendar") {
  const { createCalendarEvent, getAllCalendarEvents, getCalendarEvent, updateCalendarEvent, deleteCalendarEvent, toggleCalendarEvent, formatCalendarEvent, formatCalendarEventList, formatRecurrence } = await import("./engine/calendar.js");

  const subcommand = positional[1];

  if (subcommand === "create") {
    // Usage: termlings calendar create <agent-id> [<agent-id> ...] <title> <start-iso-time> <end-iso-time> [recurrence]
    // We need at least: agent-id, title, start, end
    if (positional.length < 6) {
      console.error("Usage: termlings calendar create <agent-id> [<agent-id> ...] <title> <start-iso-time> <end-iso-time> [recurrence]");
      console.error("Recurrence: none (default), hourly, daily, weekly, monthly");
      console.error("Examples:");
      console.error("  termlings calendar create tl-alice \"Team Standup\" \"2026-03-01T09:00:00Z\" \"2026-03-01T10:00:00Z\" daily");
      console.error("  termlings calendar create tl-alice tl-bob \"Planning\" \"2026-03-01T14:00:00Z\" \"2026-03-01T15:30:00Z\"");
      process.exit(1);
    }

    // Parse positional args: [create, ...agents, title, start, end, [recurrence]]
    let agents: string[] = [];
    let titleIdx = 2;

    // Collect agent IDs (they start with "tl-")
    while (titleIdx < positional.length && positional[titleIdx]?.startsWith("tl-")) {
      agents.push(positional[titleIdx]);
      titleIdx++;
    }

    if (agents.length === 0) {
      console.error("Error: At least one agent ID required (e.g., tl-alice)");
      process.exit(1);
    }

    const title = positional[titleIdx];
    const startIso = positional[titleIdx + 1];
    const endIso = positional[titleIdx + 2];
    const recurrence = (positional[titleIdx + 3] || "none") as any;

    if (!title || !startIso || !endIso) {
      console.error("Error: Missing title, start time, or end time");
      process.exit(1);
    }

    try {
      const startTime = new Date(startIso).getTime();
      const endTime = new Date(endIso).getTime();

      if (isNaN(startTime) || isNaN(endTime)) {
        console.error("Error: Invalid date format (use ISO format like 2026-03-01T09:00:00Z)");
        process.exit(1);
      }

      const event = createCalendarEvent(title, "", agents, startTime, endTime, recurrence);
      console.log(`✓ Calendar event created: ${event.id}`);
      console.log(`Title: ${title}`);
      console.log(`Assigned to: ${agents.join(", ")}`);
      console.log(`Recurrence: ${formatRecurrence(event.recurrence)}`);
      console.log(`Starts: ${new Date(startTime).toLocaleString()}`);
      process.exit(0);
    } catch (e) {
      console.error(`Error creating event: ${e}`);
      process.exit(1);
    }
  }

  if (subcommand === "list") {
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    const agentIdArg = positional[2];

    // If agent has a session ID and no explicit agent arg, show their calendar
    let agentId: string | null = null;
    if (agentIdArg === "--agent" && positional[3]) {
      agentId = positional[3];
    } else if (sessionId && !agentIdArg) {
      agentId = sessionId;
    }

    const events = agentId
      ? (await import("./engine/calendar.js")).getAgentCalendarEvents(agentId)
      : getAllCalendarEvents();

    console.log(formatCalendarEventList(events));
    process.exit(0);
  }

  if (subcommand === "show") {
    const eventId = positional[2];
    if (!eventId) {
      console.error("Usage: termlings calendar show <event-id>");
      process.exit(1);
    }

    const event = getCalendarEvent(eventId);
    if (!event) {
      console.error(`Calendar event not found: ${eventId}`);
      process.exit(1);
    }

    console.log(formatCalendarEvent(event));
    process.exit(0);
  }

  if (subcommand === "edit") {
    const eventId = positional[2];
    if (!eventId) {
      console.error("Usage: termlings calendar edit <event-id> [--title TITLE] [--description DESC] [--recurrence REC] [--agents AGENT...]");
      process.exit(1);
    }

    const updates: any = {};
    for (let i = 3; i < positional.length; i++) {
      if (positional[i] === "--title" && i + 1 < positional.length) {
        updates.title = positional[++i];
      } else if (positional[i] === "--description" && i + 1 < positional.length) {
        updates.description = positional[++i];
      } else if (positional[i] === "--recurrence" && i + 1 < positional.length) {
        updates.recurrence = positional[++i];
      } else if (positional[i] === "--agents") {
        const agents: string[] = [];
        i++;
        while (i < positional.length && !positional[i]?.startsWith("--")) {
          agents.push(positional[i]);
          i++;
        }
        i--; // Back up one since the loop will increment
        updates.assignedAgents = agents;
      }
    }

    const event = updateCalendarEvent(eventId, updates);
    if (!event) {
      console.error(`Calendar event not found: ${eventId}`);
      process.exit(1);
    }

    console.log(`✓ Calendar event updated`);
    console.log(formatCalendarEvent(event));
    process.exit(0);
  }

  if (subcommand === "delete") {
    const eventId = positional[2];
    if (!eventId) {
      console.error("Usage: termlings calendar delete <event-id>");
      process.exit(1);
    }

    if (deleteCalendarEvent(eventId)) {
      console.log(`✓ Calendar event deleted`);
    } else {
      console.error(`Calendar event not found: ${eventId}`);
      process.exit(1);
    }
    process.exit(0);
  }

  if (subcommand === "enable") {
    const eventId = positional[2];
    if (!eventId) {
      console.error("Usage: termlings calendar enable <event-id>");
      process.exit(1);
    }

    const event = toggleCalendarEvent(eventId, true);
    if (!event) {
      console.error(`Calendar event not found: ${eventId}`);
      process.exit(1);
    }

    console.log(`✓ Calendar event enabled`);
    process.exit(0);
  }

  if (subcommand === "disable") {
    const eventId = positional[2];
    if (!eventId) {
      console.error("Usage: termlings calendar disable <event-id>");
      process.exit(1);
    }

    const event = toggleCalendarEvent(eventId, false);
    if (!event) {
      console.error(`Calendar event not found: ${eventId}`);
      process.exit(1);
    }

    console.log(`✓ Calendar event disabled`);
    process.exit(0);
  }

  console.error("Usage: termlings calendar <create|list|show|edit|delete|enable|disable>");
  process.exit(1);
}

// 2b. Owner task management: termlings task <create|list|show|assign|delete>
if (positional[0] === "task") {
  const { createTask, getAllTasks, getTask, assignTask, deleteTask, formatTask, formatTaskList } = await import("./engine/tasks.js");

  const subcommand = positional[1];

  if (subcommand === "create") {
    const title = positional[2];
    const description = positional[3];
    const priority = (positional[4] || "medium") as any;

    if (!title || !description) {
      console.error("Usage: termlings task create <title> <description> [priority]");
      console.error("Priority: low, medium (default), high");
      process.exit(1);
    }

    const task = createTask(title, description, priority, undefined, "default");
    console.log(`✓ Task created: ${task.id}`);
    console.log(formatTask(task));
    process.exit(0);
  }

  if (subcommand === "list") {
    const tasks = getAllTasks();
    console.log(formatTaskList(tasks));
    process.exit(0);
  }

  if (subcommand === "show") {
    const taskId = positional[2];
    if (!taskId) {
      console.error("Usage: termlings task show <task-id>");
      process.exit(1);
    }
    const task = getTask(taskId);
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    console.log(formatTask(task));
    process.exit(0);
  }

  if (subcommand === "assign") {
    const taskId = positional[2];
    const agentId = positional[3];
    const agentName = positional[4];

    if (!taskId || !agentId || !agentName) {
      console.error("Usage: termlings task assign <task-id> <agent-id> <agent-name>");
      process.exit(1);
    }

    const task = assignTask(taskId, agentId, agentName, "default");
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    console.log(`✓ Task assigned to ${agentName}`);
    process.exit(0);
  }

  if (subcommand === "delete") {
    const taskId = positional[2];
    if (!taskId) {
      console.error("Usage: termlings task delete <task-id>");
      process.exit(1);
    }
    if (deleteTask(taskId, "default")) {
      console.log(`✓ Task deleted`);
    } else {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    process.exit(0);
  }

  console.error("Usage: termlings task <create|list|show|assign|delete>");
  process.exit(1);
}

// 2b-scheduler. Run calendar scheduler: termlings scheduler [--daemon]
if (positional[0] === "scheduler") {
  const { executeScheduledCalendarEvents, formatExecutionResults, startScheduler } = await import("./engine/calendar-scheduler.js");

  if (flags.has("daemon")) {
    // Run as background daemon (keeps running)
    console.log("📅 Starting calendar scheduler daemon (press Ctrl+C to stop)");
    const interval = startScheduler(60); // Check every 60 seconds

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n📅 Stopping calendar scheduler");
      clearInterval(interval);
      process.exit(0);
    });
  } else {
    // Single check
    const results = executeScheduledCalendarEvents();
    if (results.length > 0) {
      console.log(formatExecutionResults(results));
    } else {
      console.log("No calendar events to execute");
    }
    process.exit(0);
  }
}

// 2c. Browser management: termlings browser <subcommand>
if (positional[0] === "browser") {
  const {
    initializeBrowserDirs,
    getBrowserConfig,
    startBrowser,
    stopBrowser,
    isBrowserRunning,
    logBrowserActivity,
    readProcessState,
  } = await import("./engine/browser.js");
  const { BrowserClient } = await import("./engine/browser-client.js");

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
    process.exit(0);
  }

  // Control subcommands (no server needed)
  if (subcommand === "init") {
    try {
      initializeBrowserDirs();
      console.log("✓ Browser initialized. Profile directory created.");
      console.log("Install PinchTab: npm install -g pinchtab");
      process.exit(0);
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
        process.exit(0);
      }

      const { pid, port } = await startBrowser();
      console.log(`✓ Browser started (PID ${pid}, port ${port})`);
      console.log(`Profile: .termlings/browser/profile/`);
      process.exit(0);
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
        process.exit(0);
      }

      await stopBrowser();
      console.log("✓ Browser stopped");
      process.exit(0);
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
        process.exit(0);
      }

      const uptime = state?.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
      console.log(`Browser: running`);
      console.log(`  Port: ${state?.port}`);
      console.log(`  PID: ${state?.pid}`);
      console.log(`  Uptime: ${uptime}s`);
      if (state?.url) {
        console.log(`  URL: ${state.url}`);
      }
      process.exit(0);
    } catch (e) {
      console.error(`Error checking status: ${e}`);
      process.exit(1);
    }
  }

  // Special commands that work without running server
  if (subcommand === "request-help") {
    const { requestOperatorIntervention } = await import("./engine/browser.js");
    const message = positional.slice(2).join(" ");
    if (!message) {
      console.error("Usage: termlings browser request-help <message>");
      process.exit(1);
    }
    await requestOperatorIntervention(message);
    process.exit(0);
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
      process.exit(0);
    }

    if (subcommand === "screenshot") {
      const base64 = await client.screenshot();
      await logBrowserActivity("screenshot", [], "success");
      console.log(base64.slice(0, 100) + "...");
      process.exit(0);
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
      process.exit(0);
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
      process.exit(0);
    }

    if (subcommand === "extract") {
      const text = await client.extractText();
      await logBrowserActivity("extract", [], "success");
      console.log(text);
      process.exit(0);
    }

    if (subcommand === "cookies") {
      const action = positional[2] || "list";
      if (action === "list") {
        const cookies = await client.getCookies();
        await logBrowserActivity("cookies", ["list"], "success");
        console.log(JSON.stringify(cookies, null, 2));
        process.exit(0);
      }
      console.error("Usage: termlings browser cookies list");
      process.exit(1);
    }

    if (subcommand === "check-login") {
      const { checkIfLoginRequired } = await import("./engine/browser.js");
      const needsLogin = await checkIfLoginRequired(client);
      await logBrowserActivity("check-login", [], "success");
      if (needsLogin) {
        console.log("⚠️  Login required on current page");
        process.exit(1);
      } else {
        console.log("✓ Page does not appear to require login");
        process.exit(0);
      }
    }

    if (subcommand === "patterns") {
      const {
        initializeQueryPatterns,
        listPatterns,
        getPattern,
        savePattern,
        resolvePattern,
      } = await import("./engine/query-patterns.js");

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

  Execute pattern (navigates URL, waits, extracts via jq):
    $ termlings browser patterns execute github-issues

  Create pattern interactively:
    $ termlings browser patterns save search-github
    Name: GitHub Issues Search
    Sites (comma-separated): github.com, github.dev
    Navigate URL: https://github.com/search?q=:query
    Wait (ms): 2000
    Filters (jq expressions): .issue-title | text

WHY USE PATTERNS?
  • Save tokens: Navigate + wait + extract once, reuse forever
  • Share knowledge: Save patterns other agents discover
  • Consistency: Same selectors & timing across team
  • Quick reference: Common workflows at fingertips

YOUR AGENT CONTEXT IS SAVED:
  • Pattern includes your name (\$TERMLINGS_AGENT_NAME)
  • Created timestamp recorded
  • Reusable across projects & sessions
`);
        process.exit(0);
      }

      if (action === "list") {
        initializeQueryPatterns();
        const patterns = listPatterns();
        if (patterns.length === 0) {
          console.log("📁 No patterns yet. Create one with: termlings browser patterns save");
          process.exit(0);
        }
        console.log(`📋 ${patterns.length} patterns available:\n`);
        patterns.forEach((p) => {
          console.log(`  ${p.id.padEnd(20)} - ${p.name}`);
          console.log(`    Sites: ${p.sites.join(", ")}`);
          if (p.added_by) {
            console.log(`    Added by: ${p.added_by}`);
          }
        });
        process.exit(0);
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
        process.exit(0);
      }

      console.error(`Unknown patterns action: ${action}`);
      console.error("Usage: termlings browser patterns <list|view|execute|save>");
      process.exit(1);
    }

    console.error(`Unknown browser command: ${subcommand}`);
    console.error(
      "Usage: termlings browser <init|start|stop|status|navigate|screenshot|type|click|extract|cookies|check-login|request-help|patterns>"
    );
    process.exit(1);
  } catch (e) {
    await logBrowserActivity(subcommand, positional.slice(2), "error", String(e));
    console.error(`Error: ${e}`);
    process.exit(1);
  }
}


// 3. Render subcommand: termlings render [avatar|object] [dna|name|type] [options]
if (positional[0] === "render") {
  const { OBJECT_DEFS, renderObjectToTerminal } = await import("./engine/objects.js");

  // Check if rendering object or avatar
  let renderType = positional[1] === "object" ? "object" : "avatar";
  let renderInput = renderType === "object" ? positional[2] : positional[1];

  // Handle object rendering
  if (renderType === "object") {
    if (flags.has("list")) {
      const { loadCustomObjects } = await import("./engine/object-loader.js");
      const customObjects = loadCustomObjects("default");
      const allObjects = { ...OBJECT_DEFS, ...customObjects };

      console.log("\nAvailable object types:\n");
      if (Object.keys(allObjects).length === 0) {
        console.log("No objects yet. Create custom objects with:");
        console.log("  termlings action create-object <name> '<json>'");
      } else {
        for (const [name, def] of Object.entries(allObjects)) {
          console.log(`  • ${name.padEnd(15)} (${def.width}×${def.height})`);
        }
      }
      console.log();
      process.exit(0);
    }

    const objectType = renderInput;
    const color = opts.color
      ? opts.color.split(",").map((c: string) => parseInt(c.trim(), 10)) as [number, number, number]
      : undefined;

    const { loadCustomObjects } = await import("./engine/object-loader.js");
    const customObjects = loadCustomObjects("default");
    const allObjects = { ...OBJECT_DEFS, ...customObjects };

    if (!allObjects[objectType]) {
      console.error(`Unknown object type: ${objectType}`);
      const available = Object.keys(allObjects);
      if (available.length > 0) {
        console.error(`Available types: ${available.join(", ")}`);
      }
      process.exit(1);
    }

    const debugCollision = flags.has("debug-collision");
    const debugLabel = debugCollision ? " [collision debug]" : "";
    console.log(`\n${objectType}${color ? ` [color: rgb(${color.join(", ")})]` : ""}${debugLabel}\n`);

    if (debugCollision) {
      console.log("Collision legend:");
      console.log("  · = transparent");
      console.log("  █ = blocking");
      console.log("  ░ = walkable");
      console.log();
    }

    console.log(renderObjectToTerminal(objectType, color, allObjects, debugCollision));
    console.log();
    process.exit(0);
  }

  // Avatar rendering (existing code)
  input = renderInput;

  if (flags.has("random") || !input) {
    input = generateRandomDNA();
  }

  // Resolve DNA: hex string or name
  const isDNA = /^[0-9a-f]{6,7}$/i.test(input);
  const dna = isDNA ? input : encodeDNA(traitsFromName(input));

  const DIM = "\x1b[2m";
  const RESET = "\x1b[0m";

  if (!isDNA) {
    console.log(`${DIM}"${input}" → dna: ${dna}${RESET}\n`);
  } else {
    console.log(`${DIM}dna: ${dna}${RESET}\n`);
  }

  const bw = flags.has("bw");

  if (flags.has("info")) {
    const traits = decodeDNA(dna);
    console.log("Traits:", JSON.stringify(traits, null, 2));
    console.log();
  }

  if (flags.has("svg")) {
    const size = opts.size ? parseInt(opts.size, 10) : 10;
    const padding = opts.padding !== undefined ? parseInt(opts.padding, 10) : 1;
    const bg = opts.bg === "none" || !opts.bg ? null : opts.bg;

    if (flags.has("animated")) {
      // Animated SVG with embedded CSS keyframes
      const { svg, legFrames } = renderLayeredSVG(dna, size, bw);
      const css = getAvatarCSS();
      const classes = ["tg-avatar"];
      if (flags.has("walk")) classes.push("walking");
      if (flags.has("talk")) classes.push("talking");
      if (flags.has("wave")) classes.push("waving");
      if (legFrames === 3) classes.push("walk-3f");
      if (legFrames === 4) classes.push("walk-4f");
      if (!flags.has("walk") && !flags.has("talk") && !flags.has("wave")) classes.push("idle");

      // Wrap SVG in a container with animation classes and inject CSS
      const animated = svg
        .replace("<svg ", `<svg class="${classes.join(" ")}" `)
        .replace("</svg>", `<style>${css}</style></svg>`);

      if (bg) {
        // Insert background rect after opening tag
        const insertIdx = animated.indexOf(">") + 1;
        const widthMatch = animated.match(/width="(\d+)"/);
        const heightMatch = animated.match(/height="(\d+)"/);
        const w = widthMatch?.[1] ?? "90";
        const h = heightMatch?.[1] ?? "90";
        console.log(
          animated.slice(0, insertIdx) +
          `<rect width="${w}" height="${h}" fill="${bg}"/>` +
          animated.slice(insertIdx)
        );
      } else {
        console.log(animated);
      }
    } else {
      // Static SVG
      console.log(renderSVG(dna, size, 0, bg, padding, bw));
    }
    process.exit(0);
  }

  if (flags.has("mp4")) {
    // Export animated MP4 — requires ffmpeg
    const { execSync, execFileSync } = await import("child_process");
    const { mkdirSync, writeFileSync, rmSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    // Check ffmpeg
    try {
      execSync("ffmpeg -version", { stdio: "ignore" });
    } catch {
      console.error("Error: ffmpeg is required for --mp4. Install it: https://ffmpeg.org/download.html");
      process.exit(1);
    }

    const mp4Traits = decodeDNA(dna);
    const mp4LegFrames = LEGS[mp4Traits.legs].length;
    const fps = opts.fps ? parseInt(opts.fps, 10) : 4;
    const duration = opts.duration ? parseInt(opts.duration, 10) : 3;
    const totalFrames = fps * duration;
    const outFile = opts.out || "termling.mp4";
    const size = opts.size ? parseInt(opts.size, 10) : 10;
    const padding = opts.padding !== undefined ? parseInt(opts.padding, 10) : 1;
    const bg = opts.bg === "none" ? null : opts.bg || "#000";

    const doWalk = flags.has("walk");
    const doTalk = flags.has("talk");
    const doWave = flags.has("wave");

    const { faceRgb: faceRgbMp4, darkRgb: darkRgbMp4, hatRgb: hatRgbMp4 } = getTraitColors(mp4Traits, bw);

    const cols = 9;
    const half = Math.round(size / 2);
    const quarter = Math.round(size / 4);

    // Parse hex color to RGB
    function hexToRgb(hex: string): [number, number, number] {
      const h = hex.replace("#", "");
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }

    const bgRgb: [number, number, number] = bg ? hexToRgb(bg) : [0, 0, 0];

    function gridToPPM(grid: typeof generateGrid extends (...a: any[]) => infer R ? R : never): Buffer {
      const rows = grid.length;
      const w = (cols + padding * 2) * size;
      const h = (rows + padding * 2) * size;
      const pixels = Buffer.alloc(w * h * 3);

      // Fill background
      for (let i = 0; i < w * h; i++) {
        if (bg) {
          pixels[i * 3] = bgRgb[0];
          pixels[i * 3 + 1] = bgRgb[1];
          pixels[i * 3 + 2] = bgRgb[2];
        }
      }

      function fillRect(rx: number, ry: number, rw: number, rh: number, r: number, g: number, b: number) {
        for (let py = ry; py < ry + rh && py < h; py++) {
          for (let px = rx; px < rx + rw && px < w; px++) {
            const idx = (py * w + px) * 3;
            pixels[idx] = r;
            pixels[idx + 1] = g;
            pixels[idx + 2] = b;
          }
        }
      }

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const cell = grid[y][x];
          const rx = (x + padding) * size;
          const ry = (y + padding) * size;
          const [fR, fG, fB] = faceRgbMp4;
          const [dR, dG, dB] = darkRgbMp4;
          const [hR, hG, hB] = hatRgbMp4;

          if (cell === "f") fillRect(rx, ry, size, size, fR, fG, fB);
          else if (cell === "l") fillRect(rx, ry, half, size, fR, fG, fB);
          else if (cell === "a") fillRect(rx, ry + half, size, half, fR, fG, fB);
          else if (cell === "e" || cell === "d") fillRect(rx, ry, size, size, dR, dG, dB);
          else if (cell === "s") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx, ry + half, size, half, dR, dG, dB); }
          else if (cell === "n") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx + quarter, ry, half, size, dR, dG, dB); }
          else if (cell === "m") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx, ry, size, half, dR, dG, dB); }
          else if (cell === "q") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx + half, ry + half, half, half, dR, dG, dB); }
          else if (cell === "r") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx, ry + half, half, half, dR, dG, dB); }
          else if (cell === "h") fillRect(rx, ry, size, size, hR, hG, hB);
          else if (cell === "k") { fillRect(rx, ry, size, size, fR, fG, fB); fillRect(rx + quarter, ry, half, size, hR, hG, hB); }
        }
      }

      const header = `P6\n${w} ${h}\n255\n`;
      return Buffer.concat([Buffer.from(header), pixels]);
    }

    const tmpDir = join(tmpdir(), `termlings-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    console.log(`Generating ${totalFrames} frames...`);
    for (let f = 0; f < totalFrames; f++) {
      const walkF = doWalk ? f % mp4LegFrames : 0;
      const talkF = doTalk ? f % 2 : 0;
      const waveF = doWave ? (f % 2) + 1 : 0;
      const grid = generateGrid(mp4Traits, walkF, talkF, waveF);
      const ppm = gridToPPM(grid);
      writeFileSync(join(tmpDir, `frame-${String(f).padStart(4, "0")}.ppm`), ppm);
    }

    console.log(`Encoding ${outFile}...`);
    execSync(
      `ffmpeg -y -framerate ${fps} -i "${tmpDir}/frame-%04d.ppm" -c:v libx264 -pix_fmt yuv420p -crf 18 -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" "${outFile}"`,
      { stdio: "inherit" }
    );

    rmSync(tmpDir, { recursive: true, force: true });
    console.log(`Done: ${outFile}`);
    process.exit(0);
  }

  const animate = flags.has("walk") || flags.has("talk") || flags.has("wave");
  const compact = flags.has("compact");

  if (!animate) {
    // Static render
    const output = compact
      ? renderTerminalSmall(dna, 0, bw)
      : renderTerminal(dna, 0, bw);
    console.log(output);
    process.exit(0);
  }

  // --- Animated render with ANSI escape codes ---
  const traits = decodeDNA(dna);
  const legFrameCount = LEGS[traits.legs].length;
  const { faceRgb, darkRgb, hatRgb } = getTraitColors(traits, bw);

  let walkFrame = 0;
  let talkFrame = 0;
  let waveFrame = 0;
  let tick = 0;

  // Hide cursor
  process.stdout.write("\x1b[?25l");

  function cleanup() {
    process.stdout.write("\x1b[?25h\n");
    process.exit(0);
  }
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Draw first frame
  const firstGrid = generateGrid(traits, 0, 0, 0);
  const firstOutput = compact
    ? renderSmallFromGrid(firstGrid, faceRgb, darkRgb, hatRgb)
    : renderFromGrid(firstGrid, faceRgb, darkRgb, hatRgb);
  const lineCount = firstOutput.split("\n").length;
  process.stdout.write(firstOutput + "\n");

  setInterval(() => {
    tick++;

    if (flags.has("walk")) walkFrame = tick % legFrameCount;
    if (flags.has("talk")) talkFrame = tick % 2;
    if (flags.has("wave")) waveFrame = (tick % 2) + 1;

    const grid = generateGrid(traits, walkFrame, talkFrame, waveFrame);
    const output = compact
      ? renderSmallFromGrid(grid, faceRgb, darkRgb, hatRgb)
      : renderFromGrid(grid, faceRgb, darkRgb, hatRgb);

    // Move cursor up to overwrite previous frame
    process.stdout.write(`\x1b[${lineCount}A`);
    process.stdout.write(output + "\n");
  }, 300);

  // Keep alive
  await new Promise(() => {});
}

// 4. Create agent scaffold: termlings create [folder]
if (positional[0] === "create") {
  const { runCreate } = await import("./create.js");
  await runCreate();
  process.exit(0);
}

// 5. List agents: termlings list-agents [--saved|--online|--full]
if (positional[0] === "list-agents") {
  const { discoverLocalAgents } = await import("./agents/discover.js");
  const { mergeSavedWithOnline, formatAgentListCompact, formatAgentListFull } = await import("./engine/agent-listing.js");
  const { listSessions } = await import("./workspace/state.js");

  const saved = discoverLocalAgents();
  const online = listSessions();

  const merged = mergeSavedWithOnline(saved, online);

  const isFull = flags.has("full");
  const filterSaved = flags.has("saved");
  const filterOnline = flags.has("online");

  const output = isFull
    ? formatAgentListFull(merged, { filterSaved, filterOnline })
    : formatAgentListCompact(merged, { filterSaved, filterOnline });

  console.log(output);
  process.exit(0);
}

// 5b. Initialize workspace folder manually: termlings init [--force]
if (positional[0] === "init") {
  const forceSetup = flags.has("force");
  if (!forceSetup) {
    const { existsSync } = await import("fs");
    const { join } = await import("path");
    if (existsSync(join(process.cwd(), ".termlings"))) {
      console.log("Workspace already exists at .termlings");
      console.log("Run `termlings init --force` to re-run setup and template selection.");
      process.exit(0);
    }
  }

  const ready = await ensureWorkspaceInitializedForLaunch(forceSetup);
  if (ready) {
    console.log("Workspace is initialized.");
  }
  process.exit(0);
}

// 6. Help
if (flags.has("help") || flags.has("h")) {
  console.log(`Usage: termlings [options]
       termlings render [dna|name] [options]
       termlings <agent> [options]

Workspace (default):
  termlings                Start the web workspace
  workspace                Alias for web workspace startup
  init                     Initialize .termlings in this project
  init --force             Re-run setup wizard even if .termlings exists

Workspace management:
  --clear                  Clear runtime IPC/session state

Scheduler:
  scheduler                Run calendar scheduler (check for due events)
  scheduler --daemon       Run scheduler in background (checks every 60 seconds)

Spectator (owner commands):
  calendar create <agent-id> [<agent-id> ...] <title> <start-iso> <end-iso> [recurrence]  Create calendar event
  calendar list [--agent <id>]  List calendar events
  calendar show <id>           Show calendar event details
  calendar edit <id> [--title] [--recurrence] [--agents]  Edit calendar event
  calendar delete <id>         Delete calendar event
  calendar enable <id>         Enable a calendar event
  calendar disable <id>        Disable a calendar event
  task create <title> <description> [priority]  Create a new task
  task list                List all project tasks
  task show <id>           Show task details and updates
  task assign <id> <session-id> <name>  Assign task to an agent
  task delete <id>         Delete a task

Agents (shared task system):
  claude [flags...]        Start Claude Code as an agent
  <name> [flags...]        Launch saved agent (e.g., "termlings my-agent")
  --name <name>            Agent display name
  --dna <hex>              Agent avatar DNA

Create:
  create [folder]          Interactive avatar builder for new agent
  create --name <name>     Create with specific name
  create --dna <hex>       Create with specific DNA

List agents:
  list-agents              List all agents (saved + online)
  list-agents --saved      Show only saved agents
  list-agents --online     Show only online agents
  list-agents --full       Show detailed information

Render:
  render [dna|name]                          Render a termling in the terminal
  render object <type>                       Render an object
  render object <type> --color R,G,B         Render object with custom color
  render object <type> --debug-collision     Show collision boundaries
  render --svg                               Output SVG
  render --mp4                               Export animated MP4
  render --walk/--talk/--wave                Animate
  render --compact                           Half-height
  render --info                              Show DNA traits
  render --bw                                Black & white
  render --random                            Random termling
  render --animated                          SVG with CSS animation
  render --size=<px>                         SVG pixel size (default: 10)
  render --bg=<color>                        SVG background (hex or "none")
  render --padding=<n>                       SVG padding in pixels (default: 1)
  render --out=<file>                        MP4 output path (default: termling.mp4)
  render object --list                       List all object types
  render --fps=<n>         MP4 frame rate (default: 4)
  render --duration=<n>    MP4 duration in seconds (default: 3)

Commands:
  list-agents              List active agent sessions
  message <target> <text>  Direct message (target: <session-id>|agent:<dna>|human:<id>)
  task <cmd> [args]        Task management (list, show, claim, status, note)
  calendar <cmd> [args]    Calendar management (list, show, create, ...)

Options:
  --host <host>            Workspace host (default: 127.0.0.1)
  --port <port>            Workspace port (default: 4173)
  --help, -h               Show this help`);
  process.exit(0);
}

async function ensureWorkspaceInitializedForLaunch(forceSetup = false): Promise<boolean> {
  const { existsSync } = await import("fs")
  const { join } = await import("path")
  const { ensureWorkspaceDirs } = await import("./workspace/state.js")
  const { listWorkspaceTemplates, initializeWorkspaceFromTemplate } = await import("./workspace/setup.js")

  const termlingsDir = join(process.cwd(), ".termlings")
  const workspaceExists = existsSync(termlingsDir)
  if (!forceSetup && workspaceExists) {
    ensureWorkspaceDirs()
    return true
  }

  const templates = listWorkspaceTemplates()
  const templateOptions = templates.length > 0 ? templates : ["office"]
  const defaultTemplate = templateOptions[0] || "office"

  // Non-interactive shells still get initialized automatically with the default template.
  // This makes `npx termlings` work in environments where stdin isn't a TTY.
  if (!process.stdout.isTTY) {
    const result = initializeWorkspaceFromTemplate(defaultTemplate)
    console.log(`Initialized .termlings with template: ${result.templateName}`)
    console.log(`Run 'termlings init' in an interactive terminal to choose a different template.`)
    return true
  }

  const { createInterface } = await import("readline/promises")
  const { createReadStream, createWriteStream } = await import("fs")

  let rlInput: NodeJS.ReadableStream = process.stdin
  let rlOutput: NodeJS.WritableStream = process.stdout
  let ttyFd: number | null = null

  // Some launchers expose a TTY on /dev/tty even when process.stdin.isTTY is false.
  if (!process.stdin.isTTY) {
    try {
      const { openSync } = await import("fs")
      ttyFd = openSync("/dev/tty", "r+")
      rlInput = createReadStream("/dev/tty", { fd: ttyFd, autoClose: false })
      rlOutput = createWriteStream("/dev/tty", { fd: ttyFd, autoClose: false })
    } catch {
      const result = initializeWorkspaceFromTemplate(defaultTemplate)
      console.log(`Initialized .termlings with template: ${result.templateName}`)
      console.log(`No interactive TTY detected. Run 'termlings init' later to choose a template manually.`)
      return true
    }
  }

  const rl = createInterface({
    input: rlInput,
    output: rlOutput,
  })

  try {
    const setupPrompt = workspaceExists
      ? ".termlings already exists. Re-run setup and template selection? [Y/n] "
      : "No .termlings folder found. Set up Termlings in this project? [Y/n] "
    const setupAnswer = (await rl.question(setupPrompt)).trim().toLowerCase()
    if (setupAnswer === "n" || setupAnswer === "no") {
      console.log("Setup cancelled.")
      return false
    }

    console.log("")
    console.log("Available templates:")
    templateOptions.forEach((template, index) => {
      console.log(`  ${index + 1}. ${template}`)
    })

    const templateAnswer = (await rl.question(`Select template [1]: `)).trim()
    let template = defaultTemplate
    if (templateAnswer.length > 0) {
      const idx = Number.parseInt(templateAnswer, 10)
      if (!Number.isNaN(idx) && idx >= 1 && idx <= templateOptions.length) {
        template = templateOptions[idx - 1]!
      } else if (templateOptions.includes(templateAnswer)) {
        template = templateAnswer
      } else {
        console.log(`Unknown template "${templateAnswer}". Using "${defaultTemplate}".`)
      }
    }

    const result = initializeWorkspaceFromTemplate(template)
    console.log(`✓ Initialized .termlings using template: ${result.templateName}`)
    return true
  } finally {
    rl.close()
    if (ttyFd !== null) {
      try {
        const { closeSync } = await import("fs")
        closeSync(ttyFd)
      } catch {}
    }
  }
}

async function launchWorkspaceWeb(opts: Record<string, string>): Promise<never> {
  const workspaceReady = await ensureWorkspaceInitializedForLaunch()
  if (!workspaceReady) {
    process.exit(0)
  }

  const { existsSync } = await import("fs")
  const { join } = await import("path")
  const { spawn, spawnSync } = await import("child_process")
  const {
    clearHubServer,
    isHubServerRunning,
    readHubServer,
    registerProject,
    workspaceUrl,
    writeHubServer,
  } = await import("./workspace/hub.js")

  const webRoot = join(__dirname, "..", "web")
  if (!existsSync(webRoot)) {
    console.error("Web workspace is missing. Expected ./web directory.")
    process.exit(1)
  }

  const requestedHost = opts.host || "127.0.0.1"
  const requestedPort = opts.port ? parseInt(opts.port, 10) : 4173
  if (Number.isNaN(requestedPort) || requestedPort <= 0) {
    console.error("Invalid --port value")
    process.exit(1)
  }

  const project = registerProject(process.cwd())
  const existingServer = readHubServer()
  if (existingServer && await isHubServerRunning(existingServer)) {
    if ((opts.host && requestedHost !== existingServer.host) || (opts.port && requestedPort !== existingServer.port)) {
      console.warn(
        `Workspace server already running at ${existingServer.host}:${existingServer.port}; ignoring requested ${requestedHost}:${requestedPort}.`,
      )
    }
    console.log(`Registered project "${project.projectName}" with running workspace server.`)
    console.log(`Open: ${workspaceUrl(existingServer.host, existingServer.port, project.projectId)}`)
    process.exit(0)
  }

  const nodeModulesPath = join(webRoot, "node_modules")
  if (!existsSync(nodeModulesPath)) {
    console.log("Installing web workspace dependencies...")
    const install = spawnSync("bun", ["install"], {
      cwd: webRoot,
      stdio: "inherit",
      env: process.env,
    })
    if (install.status !== 0) {
      process.exit(install.status ?? 1)
    }
  }

  const startedAt = Date.now()
  writeHubServer({
    host: requestedHost,
    port: requestedPort,
    pid: 0,
    startedAt,
    updatedAt: startedAt,
  })

  console.log(`Starting Termlings web workspace on http://${requestedHost}:${requestedPort}`)
  console.log(`Project tab: ${workspaceUrl(requestedHost, requestedPort, project.projectId)}`)
  const child = spawn("bun", ["run", "dev", "--", "--host", requestedHost, "--port", String(requestedPort)], {
    cwd: webRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      TERMLINGS_PROJECT_ROOT: process.cwd(),
    },
  })

  writeHubServer({
    host: requestedHost,
    port: requestedPort,
    pid: child.pid ?? 0,
    startedAt,
    updatedAt: Date.now(),
  })

  child.on("error", (err) => {
    clearHubServer()
    console.error(`Failed to start web workspace: ${err}`)
    process.exit(1)
  })

  child.on("exit", (code) => {
    const registered = readHubServer()
    if (
      registered &&
      registered.host === requestedHost &&
      registered.port === requestedPort &&
      (registered.pid === 0 || registered.pid === child.pid)
    ) {
      clearHubServer()
    }
    process.exit(code ?? 0)
  })

  await new Promise(() => {})
}

// 7. Default: launch web workspace (or explicit `termlings workspace`)
if (!positional[0] || positional[0] === "workspace") {
  await launchWorkspaceWeb(opts)
  process.exit(0)
}

console.error(`Unknown command: ${positional[0]}`)
console.error("Run `termlings --help` for available commands.")
process.exit(1)

// --- Render helper functions (used by render subcommand) ---

function renderFromGrid(grid: Pixel[][], faceRgb: [number, number, number], darkRgb: [number, number, number], hatRgb: [number, number, number]): string {
  const faceAnsi = `\x1b[38;2;${faceRgb[0]};${faceRgb[1]};${faceRgb[2]}m`;
  const darkAnsi = `\x1b[38;2;${darkRgb[0]};${darkRgb[1]};${darkRgb[2]}m`;
  const hatAnsi = `\x1b[38;2;${hatRgb[0]};${hatRgb[1]};${hatRgb[2]}m`;
  const reset = "\x1b[0m";
  const faceBg = `\x1b[48;2;${faceRgb[0]};${faceRgb[1]};${faceRgb[2]}m`;

  const lines: string[] = [];
  for (const row of grid) {
    let line = "";
    for (const cell of row) {
      if (cell === "_") line += "  ";
      else if (cell === "f") line += `${faceAnsi}██${reset}`;
      else if (cell === "l") line += `${faceAnsi}▌${reset} `;
      else if (cell === "e" || cell === "d") line += `${darkAnsi}██${reset}`;
      else if (cell === "s") line += `${darkAnsi}${faceBg}▄▄${reset}`;
      else if (cell === "n") line += `${darkAnsi}${faceBg}▐▌${reset}`;
      else if (cell === "m") line += `${darkAnsi}${faceBg}▀▀${reset}`;
      else if (cell === "q") line += `${darkAnsi}${faceBg} ▗${reset}`;
      else if (cell === "r") line += `${darkAnsi}${faceBg}▖ ${reset}`;
      else if (cell === "a") line += `${faceAnsi}▄▄${reset}`;
      else if (cell === "h") line += `${hatAnsi}██${reset}`;
      else if (cell === "k") line += `${hatAnsi}▐▌${reset}`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function renderSmallFromGrid(grid: Pixel[][], faceRgb: [number, number, number], darkRgb: [number, number, number], hatRgb: [number, number, number]): string {
  const reset = "\x1b[0m";

  function cellRgb(cell: Pixel): [number, number, number] | null {
    if (cell === "f" || cell === "l" || cell === "a" || cell === "q" || cell === "r") return faceRgb;
    if (cell === "e" || cell === "s" || cell === "n" || cell === "d" || cell === "m") return darkRgb;
    if (cell === "h" || cell === "k") return hatRgb;
    return null;
  }

  const lines: string[] = [];
  for (let r = 0; r < grid.length; r += 2) {
    const topRow = grid[r];
    const botRow = r + 1 < grid.length ? grid[r + 1] : null;
    let line = "";
    for (let c = 0; c < topRow.length; c++) {
      const top = cellRgb(topRow[c]);
      const bot = botRow ? cellRgb(botRow[c]) : null;
      if (top && bot) {
        line += `\x1b[38;2;${top[0]};${top[1]};${top[2]}m\x1b[48;2;${bot[0]};${bot[1]};${bot[2]}m▀${reset}`;
      } else if (top) {
        line += `\x1b[38;2;${top[0]};${top[1]};${top[2]}m▀${reset}`;
      } else if (bot) {
        line += `\x1b[38;2;${bot[0]};${bot[1]};${bot[2]}m▄${reset}`;
      } else {
        line += " ";
      }
    }
    lines.push(line);
  }
  return lines.join("\n");
}
