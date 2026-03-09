/**
 * Scheduler command
 */

export async function handleScheduler(flags: Set<string>, positional: string[]) {
  if (flags.has("help")) {
    console.log(`
⏰ Scheduler - Run scheduled work

Automatically execute scheduled work when it's due.

USAGE:
  termlings scheduler              Check once and execute due work
  termlings scheduler --daemon     Run continuously in background

DAEMON MODE:
  • Checks every 60 seconds
  • Runs due calendar events, scheduled messages, task reminders, app sync jobs, scheduled social posts, and scheduled CMS publishes
  • Keeps running until Ctrl+C
  • Good for production workflows

EXAMPLES:
  # One-time check
  $ termlings scheduler
  ✓ Executed scheduled work

  # Background daemon (for production)
  $ termlings scheduler --daemon
  📅 Starting scheduler daemon (calendar + message + task + app + social + cms checks, press Ctrl+C to stop)
  ✓ 09:00 Standup started
  ✓ Scheduled DM -> agent:ceo
  ✓ Task reminder: task_... due now

USE WHEN:
  • Need to auto-start meetings/tasks on schedule
  • Need one-time, hourly, daily, or weekly DMs
  • Need due/overdue task reminders
  • Want analytics, finance, or ads syncs to run on a schedule
  • Want queued social posts to auto-publish when due
  • Want scheduled CMS entries to publish when due
  • Running a 24/7 agent team
  • Want hands-off calendar execution
`);
    return;
  }

  const { executeScheduledCalendarEvents, formatExecutionResults } =
    await import("../engine/calendar-scheduler.js");
  const { executeScheduledMessages } =
    await import("../engine/message-scheduler.js");
  const { executeScheduledTaskChecks, formatTaskScheduleExecutionResults } =
    await import("../engine/task-scheduler.js");
  const { executeScheduledAppJobs, formatAppScheduleExecutionResults } =
    await import("../engine/app-scheduler.js");
  const { executeScheduledSocialPosts } =
    await import("../engine/social.js");
  const { executeScheduledCmsPublishes } =
    await import("../engine/cms.js");

  if (flags.has("daemon")) {
    const { appendWorkspaceMessage } = await import("../workspace/state.js");
    appendWorkspaceMessage({
      kind: "system",
      from: "system:scheduler",
      fromName: "Scheduler",
      text: "scheduler daemon started",
    });

    // Run as background daemon (keeps running)
    console.log("📅 Starting scheduler daemon (calendar + message + task + app + social + cms checks, press Ctrl+C to stop)");

    const runTick = async () => {
      const calendarResults = executeScheduledCalendarEvents();
      if (calendarResults.length > 0) {
        for (const result of calendarResults) {
          if (!result.executed) continue;
          const agentList = result.agentsNotified.join(", ");
          console.log(`✓ Calendar "${result.title}" -> ${result.agentsNotified.length} agent(s): ${agentList}`);
        }
      }

      const messageResults = executeScheduledMessages();
      if (messageResults.length > 0) {
        for (const result of messageResults) {
          if (!result.executed) continue;
          console.log(`✓ Scheduled message (${result.recurrence}) -> ${result.target}`);
        }
      }

      const taskResults = executeScheduledTaskChecks();
      if (taskResults.length > 0) {
        for (const result of taskResults) {
          const targets = result.targets.join(", ");
          console.log(`✓ Task ${result.stage}: ${result.taskId} (${result.title}) -> ${targets}`);
        }
      }

      const appResults = await executeScheduledAppJobs();
      if (appResults.length > 0) {
        for (const result of appResults) {
          const status = result.success ? "✓" : "✗";
          const provider = result.provider || result.app;
          const detail = result.error ? ` (${result.error})` : "";
          console.log(`${status} ${result.app} ${result.action}${result.window ? ` ${result.window}` : ""} -> ${provider}${detail}`);
        }
      }

      const socialResults = await executeScheduledSocialPosts();
      if (socialResults.length > 0) {
        for (const result of socialResults) {
          const status = result.success ? "✓" : "✗";
          const detail = result.error ? ` (${result.error})` : "";
          console.log(`${status} social publish -> ${result.platform} ${result.postId}${detail}`);
        }
      }

      const cmsResults = executeScheduledCmsPublishes();
      if (cmsResults.length > 0) {
        for (const result of cmsResults) {
          const status = result.success ? "✓" : "✗";
          const detail = result.error ? ` (${result.error})` : "";
          console.log(`${status} cms publish -> ${result.collection}/${result.slug}${detail}`);
        }
      }
    };

    void runTick();
    const interval = setInterval(() => { void runTick(); }, 60 * 1000);

    let stopping = false;
    const stopDaemon = () => {
      if (stopping) return;
      stopping = true;
      appendWorkspaceMessage({
        kind: "system",
        from: "system:scheduler",
        fromName: "Scheduler",
        text: "scheduler daemon stopped",
      });
      console.log("\n📅 Stopping scheduler daemon");
      clearInterval(interval);
      process.exit(0);
    };

    // Handle graceful shutdown
    process.on("SIGINT", stopDaemon);
    process.on("SIGTERM", stopDaemon);
    process.on("SIGHUP", stopDaemon);
  } else {
    // Single check
    const calendarResults = executeScheduledCalendarEvents();
    const messageResults = executeScheduledMessages();
    const taskResults = executeScheduledTaskChecks();
    const appResults = await executeScheduledAppJobs();
    const socialResults = await executeScheduledSocialPosts();
    const cmsResults = executeScheduledCmsPublishes();

    if (calendarResults.length > 0) {
      console.log(formatExecutionResults(calendarResults));
    }

    if (messageResults.length > 0) {
      if (calendarResults.length > 0) {
        console.log("");
      }
      for (const result of messageResults) {
        console.log(`Scheduled message (${result.recurrence}) -> ${result.target}`);
      }
    }

    if (taskResults.length > 0) {
      if (calendarResults.length > 0 || messageResults.length > 0) {
        console.log("");
      }
      console.log(formatTaskScheduleExecutionResults(taskResults));
    }

    if (appResults.length > 0) {
      if (calendarResults.length > 0 || messageResults.length > 0 || taskResults.length > 0) {
        console.log("");
      }
      console.log(formatAppScheduleExecutionResults(appResults));
    }

    if (socialResults.length > 0) {
      if (calendarResults.length > 0 || messageResults.length > 0 || taskResults.length > 0 || appResults.length > 0) {
        console.log("");
      }
      for (const result of socialResults) {
        const status = result.success ? "✓" : "✗";
        const detail = result.error ? ` (${result.error})` : "";
        console.log(`${status} social publish -> ${result.platform} ${result.postId}${detail}`);
      }
    }

    if (cmsResults.length > 0) {
      if (calendarResults.length > 0 || messageResults.length > 0 || taskResults.length > 0 || appResults.length > 0 || socialResults.length > 0) {
        console.log("");
      }
      for (const result of cmsResults) {
        const status = result.success ? "✓" : "✗";
        const detail = result.error ? ` (${result.error})` : "";
        console.log(`${status} cms publish -> ${result.collection}/${result.slug}${detail}`);
      }
    }

    if (calendarResults.length === 0 && messageResults.length === 0 && taskResults.length === 0 && appResults.length === 0 && socialResults.length === 0 && cmsResults.length === 0) {
      console.log("No scheduled work to execute");
    }
    process.exit(0);
  }
}
