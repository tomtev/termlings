import { basename } from "path";
import { maybeHandleCommandSchema, type CommandSchemaContract } from "./command-schema.js";

const BRIEF_SCHEMA: CommandSchemaContract = {
  command: "brief",
  title: "Brief",
  summary: "Full workspace snapshot for context recovery",
  notes: [
    "Run this first at session start or before replying when context is unclear.",
    "Use --json when another tool or agent should consume the snapshot programmatically.",
  ],
  actions: {
    run: {
      summary: "Render the current workspace snapshot",
      usage: "termlings brief [--json]",
      options: {
        json: "Output structured snapshot JSON instead of formatted text",
      },
      examples: [
        "termlings brief",
        "termlings brief --json",
      ],
    },
  },
}

function cleanFrontmatterValue(input?: string): string {
  if (!input) return "";
  return input.trim().replace(/^['"]|['"]$/g, "");
}

function formatRelativeAge(ts: number, now: number): string {
  const delta = Math.max(0, now - ts);
  const seconds = Math.floor(delta / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimeUntil(ts: number, now: number): string {
  const delta = ts - now;
  if (Math.abs(delta) < 60_000) return delta >= 0 ? "in <1m" : "<1m ago";

  const absSeconds = Math.floor(Math.abs(delta) / 1000);
  const minutes = Math.floor(absSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let body = "";
  if (days > 0) {
    body = `${days}d`;
  } else if (hours > 0) {
    body = `${hours}h ${minutes % 60}m`;
  } else {
    body = `${minutes}m`;
  }

  return delta >= 0 ? `in ${body}` : `${body} ago`;
}

function truncate(input: string, max = 90): string {
  if (input.length <= max) return input;
  if (max <= 3) return input.slice(0, max);
  return `${input.slice(0, max - 3)}...`;
}

export async function handleBrief(flags: Set<string>, _positional: string[]): Promise<void> {
  if (maybeHandleCommandSchema(BRIEF_SCHEMA, _positional)) {
    return;
  }

  if (flags.has("help")) {
    console.log(`
📎 Brief - Full workspace snapshot

USAGE:
  termlings brief
  termlings brief --json

INCLUDES:
  - Current session identity
  - Org structure + online status
  - Workflow summary
  - Task status summary
  - Calendar event summary
  - Brand profile summary
  - Pending operator requests
  - Message/channel activity
`);
    return;
  }

  const now = Date.now();
  const cwd = process.cwd();
  const { resolveWorkspaceAppsForAgent } = await import("../engine/apps.js")

  const [
    { discoverLocalAgents },
    { discoverLocalHumans },
    { listSessions },
    { getAllTasks },
    { getAgentWorkflowRuns, getAllWorkflowRuns, getAllWorkflows, getOrgWorkflows, workflowRunCompleted, workflowRunProgress },
    { getAllCalendarEvents, getAgentCalendarEvents },
    { readBrand },
    { listRequests },
    { getMessageIndex },
  ] = await Promise.all([
    import("../agents/discover.js"),
    import("../humans/discover.js"),
    import("../workspace/state.js"),
    import("../engine/tasks.js"),
    import("../engine/workflows.js"),
    import("../engine/calendar.js"),
    import("../engine/brand.js"),
    import("../engine/requests.js"),
    import("../workspace/message-storage.js"),
  ]);

  const sessions = listSessions();
  const agents = discoverLocalAgents();
  const humans = discoverLocalHumans();
  const tasks = getAllTasks();
  const workflowDefinitions = getAllWorkflows();
  const orgWorkflows = getOrgWorkflows();
  const allWorkflowRuns = getAllWorkflowRuns();
  const events = getAllCalendarEvents();
  const brand = readBrand(cwd);
  const pendingRequests = listRequests("pending");
  const messageIndex = getMessageIndex(cwd);

  const activeSessionId = process.env.TERMLINGS_SESSION_ID || "";
  const activeSession = sessions.find((session) => session.sessionId === activeSessionId) || null;
  const activeAgentSlug = process.env.TERMLINGS_AGENT_SLUG || "";
  const activeAgentName = process.env.TERMLINGS_AGENT_NAME || "";
  const resolvedApps = resolveWorkspaceAppsForAgent(activeAgentSlug || undefined, cwd)

  const sessionsByDna = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const existing = sessionsByDna.get(session.dna) || [];
    existing.push(session);
    sessionsByDna.set(session.dna, existing);
  }
  for (const group of sessionsByDna.values()) {
    group.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  const humanNodes = humans.map((human) => {
    const soul = human.soul;
    const name = cleanFrontmatterValue(soul?.name) || human.name;
    const title = cleanFrontmatterValue(soul?.title) || "-";
    const role = cleanFrontmatterValue(soul?.role) || "-";
    const team = cleanFrontmatterValue(soul?.team) || "-";
    const reportsTo = cleanFrontmatterValue(soul?.reports_to) || "-";

    return {
      id: `human:${human.name}`,
      slug: human.name,
      name,
      title,
      role,
      team,
      reportsTo,
    };
  });

  const agentNodes = agents.map((agent) => {
    const soul = agent.soul;
    const dna = cleanFrontmatterValue(soul?.dna);
    const sessionsForAgent = dna ? sessionsByDna.get(dna) || [] : [];
    const online = sessionsForAgent.length > 0;
    const name = cleanFrontmatterValue(soul?.name) || agent.name;
    const title =
      cleanFrontmatterValue(soul?.title_short)
      || cleanFrontmatterValue(soul?.title)
      || "-";
    const role = cleanFrontmatterValue(soul?.role) || "-";
    const team = cleanFrontmatterValue(soul?.team) || "-";
    const reportsTo = cleanFrontmatterValue(soul?.reports_to) || "-";

    return {
      id: `agent:${agent.name}`,
      slug: agent.name,
      name,
      title,
      role,
      team,
      reportsTo,
      dna,
      online,
      sessionIds: sessionsForAgent.map((session) => session.sessionId),
      lastSeenAt: sessionsForAgent[0]?.lastSeenAt || 0,
      isCurrentSession: sessionsForAgent.some((session) => session.sessionId === activeSessionId),
    };
  });

  const onlineAgents = agentNodes.filter((node) => node.online);
  const offlineAgents = agentNodes.filter((node) => !node.online);

  const tasksByStatus: Record<"open" | "claimed" | "in-progress" | "completed" | "blocked", number> = {
    open: 0,
    claimed: 0,
    "in-progress": 0,
    completed: 0,
    blocked: 0,
  };

  for (const task of tasks) {
    if (Object.prototype.hasOwnProperty.call(tasksByStatus, task.status)) {
      tasksByStatus[task.status] += 1;
    }
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const unresolvedDependencyCount = (task: (typeof tasks)[number]): number => {
    if (!task.blockedBy || task.blockedBy.length === 0) return 0;
    return task.blockedBy.filter((depId: string) => {
      const dep = taskById.get(depId);
      return !dep || dep.status !== "completed";
    }).length;
  };

  const myTasks = activeAgentSlug ? tasks.filter((task) => task.assignedTo === activeAgentSlug) : [];
  const myActiveTasks = myTasks.filter((task) => task.status !== "completed");
  const openTasks = tasks.filter((task) => task.status === "open");
  const blockedTasks = tasks
    .filter((task) => task.status === "blocked" || unresolvedDependencyCount(task) > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const recentTasks = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);

  const myWorkflowRuns = activeAgentSlug ? getAgentWorkflowRuns(activeAgentSlug) : [];
  const activeWorkflowRuns = allWorkflowRuns.filter((run) => !workflowRunCompleted(run));
  const completedWorkflowRuns = allWorkflowRuns.filter((run) => workflowRunCompleted(run));
  const myActiveWorkflowRuns = myWorkflowRuns.filter((run) => !workflowRunCompleted(run));
  const myCompletedWorkflowRuns = myWorkflowRuns.filter((run) => workflowRunCompleted(run));

  const enabledEvents = events.filter((event) => event.enabled);
  const getEventNextTs = (event: (typeof events)[number]): number => {
    if (typeof event.nextNotification === "number" && Number.isFinite(event.nextNotification)) {
      return event.nextNotification;
    }
    return event.startTime;
  };

  const upcomingEvents = enabledEvents
    .filter((event) => getEventNextTs(event) >= now)
    .sort((a, b) => getEventNextTs(a) - getEventNextTs(b));
  const upcoming24hCount = enabledEvents.filter((event) => {
    const ts = getEventNextTs(event);
    return ts >= now && ts <= now + 24 * 60 * 60 * 1000;
  }).length;
  const ongoingEvents = enabledEvents.filter((event) => event.startTime <= now && event.endTime >= now);

  const myEvents = activeAgentSlug ? getAgentCalendarEvents(activeAgentSlug) : [];
  const myUpcomingEvents = myEvents
    .filter((event) => event.enabled && getEventNextTs(event) >= now)
    .sort((a, b) => getEventNextTs(a) - getEventNextTs(b))
    .slice(0, 5);

  const channels = [...messageIndex.channels].sort((a, b) => b.lastTs - a.lastTs);
  const dmThreads = [...messageIndex.dms].sort((a, b) => b.lastTs - a.lastTs);
  const totalChannelMessages = channels.reduce((sum, channel) => sum + channel.count, 0);
  const totalDmMessages = dmThreads.reduce((sum, thread) => sum + thread.count, 0);
  const latestMessageTs = Math.max(
    ...channels.map((channel) => channel.lastTs),
    ...dmThreads.map((thread) => thread.lastTs),
    0,
  );

  const brief = {
    generatedAt: now,
    workspace: {
      root: cwd,
      project: basename(cwd),
    },
    session: {
      sessionId: activeSessionId || null,
      agentSlug: activeAgentSlug || null,
      agentName: activeAgentName || null,
      sessionName: activeSession?.name || null,
      activeSessionOnline: Boolean(activeSession),
    },
    apps: resolvedApps,
    ...(resolvedApps["org-chart"] ? { org: {
      humans: humanNodes,
      agents: agentNodes,
      totalHumans: humanNodes.length,
      totalAgents: agentNodes.length,
      onlineAgents: onlineAgents.length,
      offlineAgents: offlineAgents.length,
      activeSessions: sessions.length,
    } } : {}),
    ...(resolvedApps["task"] ? { tasks: {
      total: tasks.length,
      byStatus: tasksByStatus,
      myTasks: myTasks.length,
      myActiveTasks: myActiveTasks.length,
      openTasks: openTasks.length,
      blockedOrWaiting: blockedTasks.length,
      recentTasks: recentTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        assignedTo: task.assignedTo || null,
        updatedAt: task.updatedAt,
        unresolvedDependencies: unresolvedDependencyCount(task),
      })),
    } } : {}),
    ...(resolvedApps["workflows"] ? { workflows: {
      totalDefinitions: workflowDefinitions.length,
      orgDefinitions: orgWorkflows.length,
      activeRuns: activeWorkflowRuns.length,
      completedRuns: completedWorkflowRuns.length,
      myActiveRuns: myActiveWorkflowRuns.length,
      myCompletedRuns: myCompletedWorkflowRuns.length,
      recentMine: myWorkflowRuns.slice(0, 5).map((run) => {
        const progress = workflowRunProgress(run);
        return {
          ref: run.workflowRef,
          title: run.workflowTitle,
          updatedAt: run.updatedAt,
          done: progress.done,
          total: progress.total,
          status: run.status,
        };
      }),
    } } : {}),
    ...(resolvedApps["calendar"] ? { calendar: {
      totalEvents: events.length,
      enabledEvents: enabledEvents.length,
      ongoingNow: ongoingEvents.length,
      upcoming24h: upcoming24hCount,
      nextEvents: upcomingEvents.slice(0, 5).map((event) => ({
        id: event.id,
        title: event.title,
        recurrence: event.recurrence,
        nextAt: getEventNextTs(event),
        assignedAgents: event.assignedAgents,
      })),
      myUpcomingEvents: myUpcomingEvents.map((event) => ({
        id: event.id,
        title: event.title,
        recurrence: event.recurrence,
        nextAt: getEventNextTs(event),
      })),
    } } : {}),
    ...(resolvedApps["brand"] ? { brand: {
      available: Boolean(brand),
      name: brand?.name || null,
      voice: brand?.voice || null,
      primaryColor: brand?.colors.primary || null,
      secondaryColor: brand?.colors.secondary || null,
      logo: brand?.logos.main || null,
      domain: brand?.identity.domain.primary || null,
      website: brand?.identity.domain.website || null,
      updatedAt: brand?.updatedAt || null,
    } } : {}),
    ...(resolvedApps["requests"] ? { requests: {
      pending: pendingRequests.length,
      latestPending: pendingRequests.slice(0, 5).map((req) => ({
        id: req.id,
        type: req.type,
        fromSlug: req.fromSlug || null,
        fromName: req.fromName,
        createdAt: req.ts,
      })),
    } } : {}),
    ...(resolvedApps["messaging"] ? { messaging: {
      channels: channels.length,
      channelMessages: totalChannelMessages,
      dmThreads: dmThreads.length,
      dmMessages: totalDmMessages,
      latestActivityAt: latestMessageTs || null,
      hottestChannels: channels.slice(0, 3),
      hottestThreads: dmThreads.slice(0, 3),
    } } : {}),
  };

  if (flags.has("json")) {
    console.log(JSON.stringify(brief, null, 2));
    return;
  }

  console.log("Termlings Brief");
  console.log(`Project: ${brief.workspace.project}`);
  console.log(`Root: ${brief.workspace.root}`);
  console.log(`Generated: ${new Date(now).toLocaleString()}`);
  console.log("");

  console.log("Session");
  if (brief.session.sessionId) {
    const slugPart = brief.session.agentSlug ? `agent:${brief.session.agentSlug}` : "agent:unknown";
    const namePart = brief.session.agentName || brief.session.sessionName || "unknown";
    const status = brief.session.activeSessionOnline ? "online" : "not in active sessions";
    console.log(`- ${namePart} (${slugPart}) · ${brief.session.sessionId} · ${status}`);
  } else {
    console.log("- No TERMLINGS_SESSION_ID set (running outside agent runtime)");
  }
  console.log("");

  if (resolvedApps["org-chart"]) {
    console.log("Org");
    console.log(
      `- Humans: ${brief.org.totalHumans} · Agents: ${brief.org.totalAgents} · Online agents: ${brief.org.onlineAgents} · Active sessions: ${brief.org.activeSessions}`
    );

    if (humanNodes.length > 0) {
      for (const human of humanNodes) {
        console.log(`- ${human.id} · ${human.name} · ${human.title} · team:${human.team} · reports_to:${human.reportsTo}`);
      }
    }

    if (agentNodes.length > 0) {
      for (const agent of agentNodes) {
        const status = agent.online
          ? `online${agent.isCurrentSession ? " (you)" : ""}`
          : "offline";
        const sessionLabel = agent.sessionIds.length > 0
          ? ` · sessions:${agent.sessionIds.join(",")}`
          : "";
        const seen = agent.lastSeenAt > 0
          ? ` · seen ${formatRelativeAge(agent.lastSeenAt, now)}`
          : "";
        console.log(
          `- ${agent.id} · ${agent.name} · ${agent.title} · ${status}${seen}${sessionLabel} · team:${agent.team} · reports_to:${agent.reportsTo}`
        );
      }
    }
    if (humanNodes.length === 0 && agentNodes.length === 0) {
      console.log("- No humans or agents found in .termlings");
    }
    console.log("");
  }

  if (resolvedApps["task"]) {
    console.log("Tasks");
    console.log(
      `- Total: ${brief.tasks.total} · Open: ${brief.tasks.byStatus.open} · Claimed: ${brief.tasks.byStatus.claimed} · In-progress: ${brief.tasks.byStatus["in-progress"]} · Blocked: ${brief.tasks.byStatus.blocked} · Completed: ${brief.tasks.byStatus.completed}`
    );
    if (activeAgentSlug) {
      console.log(`- Your tasks (${activeAgentSlug}): ${brief.tasks.myTasks} total, ${brief.tasks.myActiveTasks} active`);
    }

    if (blockedTasks.length > 0) {
      console.log("- Blocked / waiting:");
      for (const task of blockedTasks.slice(0, 5)) {
        const waitingOn = unresolvedDependencyCount(task);
        const waitingText = waitingOn > 0 ? ` · waiting on ${waitingOn} dep${waitingOn > 1 ? "s" : ""}` : "";
        console.log(`  [${task.id}] ${truncate(task.title, 70)} · ${task.status}${waitingText}`);
      }
    }

    if (recentTasks.length > 0) {
      console.log("- Recently updated:");
      for (const task of recentTasks) {
        const owner = task.assignedTo ? ` · ${task.assignedTo}` : "";
        console.log(
          `  [${task.id}] ${truncate(task.title, 70)} · ${task.status}${owner} · ${formatRelativeAge(task.updatedAt, now)}`
        );
      }
    }
    if (tasks.length === 0) {
      console.log("- No tasks found");
    }
    console.log("");
  }

  if (resolvedApps["workflows"]) {
    console.log("Workflows");
    console.log(`- Definitions: ${brief.workflows.totalDefinitions} · Org definitions: ${brief.workflows.orgDefinitions} · Active runs: ${brief.workflows.activeRuns} · Completed runs: ${brief.workflows.completedRuns}`);
    if (activeAgentSlug) {
      console.log(`- Your workflow runs (${activeAgentSlug}): ${brief.workflows.myActiveRuns} active, ${brief.workflows.myCompletedRuns} completed`);
    }

    if (brief.workflows.recentMine.length > 0) {
      console.log("- Your running workflows:");
      for (const workflow of brief.workflows.recentMine) {
        console.log(
          `  [${workflow.ref}] ${truncate(workflow.title, 70)} · ${workflow.done}/${workflow.total} done · ${workflow.status} · ${formatRelativeAge(workflow.updatedAt, now)}`
        );
      }
    } else if (activeAgentSlug) {
      console.log("- No running workflows for your agent");
    }
    console.log("");
  }

  if (resolvedApps["calendar"]) {
    console.log("Calendar");
    console.log(
      `- Total events: ${brief.calendar.totalEvents} · Enabled: ${brief.calendar.enabledEvents} · Ongoing now: ${brief.calendar.ongoingNow} · Upcoming 24h: ${brief.calendar.upcoming24h}`
    );
    if (activeAgentSlug) {
      console.log(`- Your upcoming events: ${brief.calendar.myUpcomingEvents.length}`);
    }

    if (upcomingEvents.length > 0) {
      console.log("- Next events:");
      for (const event of upcomingEvents.slice(0, 5)) {
        const nextAt = getEventNextTs(event);
        const agentCount = event.assignedAgents.length;
        console.log(
          `  [${event.id}] ${truncate(event.title, 70)} · ${new Date(nextAt).toLocaleString()} (${formatTimeUntil(nextAt, now)}) · ${event.recurrence} · ${agentCount} agent${agentCount === 1 ? "" : "s"}`
        );
      }
    }
    if (events.length === 0) {
      console.log("- No calendar events found");
    }
    console.log("");
  }

  if (resolvedApps["brand"]) {
    console.log("Brand");
    if (!brief.brand.available) {
      console.log("- No brand profile found (run: termlings brand init)");
    } else {
      const domainLabel = brief.brand.domain || "-";
      const websiteLabel = brief.brand.website || "-";
      const primaryLabel = brief.brand.primaryColor || "-";
      const secondaryLabel = brief.brand.secondaryColor || "-";
      const logoLabel = brief.brand.logo || "-";
      console.log(
        `- ${brief.brand.name || "-"} · domain:${domainLabel} · website:${websiteLabel} · primary:${primaryLabel} · secondary:${secondaryLabel} · logo:${logoLabel}`
      );
      if (brief.brand.voice) {
        console.log(`- Voice: ${truncate(brief.brand.voice, 120)}`);
      }
      if (brief.brand.updatedAt) {
        const updatedTs = Date.parse(brief.brand.updatedAt);
        if (Number.isFinite(updatedTs)) {
          console.log(`- Updated: ${formatRelativeAge(updatedTs, now)}`);
        } else {
          console.log(`- Updated: ${brief.brand.updatedAt}`);
        }
      }
    }
    console.log("");
  }

  if (resolvedApps["requests"]) {
    console.log("Requests");
    console.log(`- Pending operator requests: ${brief.requests.pending}`);
    if (pendingRequests.length > 0) {
      for (const req of pendingRequests.slice(0, 5)) {
        const from = req.fromSlug ? `agent:${req.fromSlug}` : req.fromName;
        console.log(`  [${req.id}] ${req.type} from ${from} · ${formatRelativeAge(req.ts, now)}`);
      }
    }
    console.log("");
  }

  if (resolvedApps["messaging"]) {
    console.log("Messaging");
    console.log(
      `- Channels: ${brief.messaging.channels} (${brief.messaging.channelMessages} msgs) · DM threads: ${brief.messaging.dmThreads} (${brief.messaging.dmMessages} msgs)`
    );
    if (latestMessageTs > 0) {
      console.log(`- Last activity: ${new Date(latestMessageTs).toLocaleString()} (${formatRelativeAge(latestMessageTs, now)})`);
    }
    if (channels.length > 0) {
      console.log("- Top channels:");
      for (const channel of channels.slice(0, 3)) {
        console.log(`  #${channel.name} · ${channel.count} msgs · ${formatRelativeAge(channel.lastTs, now)}`);
      }
    }
    if (dmThreads.length > 0) {
      console.log("- Top DM threads:");
      for (const thread of dmThreads.slice(0, 3)) {
        console.log(`  ${thread.target} · ${thread.count} msgs · ${formatRelativeAge(thread.lastTs, now)}`);
      }
    }
    console.log("");
  }

  console.log("Startup Routine");
  console.log("- Run this command first in new sessions: termlings brief");
  if (resolvedApps["task"]) console.log("- Then pick work: termlings task list");
  if (resolvedApps["workflows"]) console.log("- Check your active workflow runs: termlings workflow list --active");
  if (resolvedApps["calendar"]) console.log("- Check timing: termlings calendar list");
  if (resolvedApps["messaging"]) console.log("- Coordinate: termlings message <target> <text>");
}
