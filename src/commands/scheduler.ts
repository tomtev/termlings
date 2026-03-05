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
  • Runs due calendar events and task reminders
  • Keeps running until Ctrl+C
  • Good for production workflows

EXAMPLES:
  # One-time check
  $ termlings scheduler
  ✓ Executed scheduled work

  # Background daemon (for production)
  $ termlings scheduler --daemon
  📅 Starting scheduler daemon (calendar + task checks, press Ctrl+C to stop)
  ✓ 09:00 Standup started
  ✓ Task reminder: task_... due now

USE WHEN:
  • Need to auto-start meetings/tasks on schedule
  • Need due/overdue task reminders
  • Running a 24/7 agent team
  • Want hands-off calendar execution
`);
    return;
  }

  const { executeScheduledCalendarEvents, formatExecutionResults } =
    await import("../engine/calendar-scheduler.js");
  const { executeScheduledTaskChecks, formatTaskScheduleExecutionResults } =
    await import("../engine/task-scheduler.js");

  if (flags.has("daemon")) {
    const { appendWorkspaceMessage } = await import("../workspace/state.js");
    appendWorkspaceMessage({
      kind: "system",
      from: "system:scheduler",
      fromName: "Scheduler",
      text: "scheduler daemon started",
    });

    // Run as background daemon (keeps running)
    console.log("📅 Starting scheduler daemon (calendar + task checks, press Ctrl+C to stop)");

    const runTick = () => {
      const calendarResults = executeScheduledCalendarEvents();
      if (calendarResults.length > 0) {
        for (const result of calendarResults) {
          if (!result.executed) continue;
          const agentList = result.agentsNotified.join(", ");
          console.log(`✓ Calendar "${result.title}" -> ${result.agentsNotified.length} agent(s): ${agentList}`);
        }
      }

      const taskResults = executeScheduledTaskChecks();
      if (taskResults.length > 0) {
        for (const result of taskResults) {
          const targets = result.targets.join(", ");
          console.log(`✓ Task ${result.stage}: ${result.taskId} (${result.title}) -> ${targets}`);
        }
      }
    };

    runTick();
    const interval = setInterval(runTick, 60 * 1000);

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
    const taskResults = executeScheduledTaskChecks();

    if (calendarResults.length > 0) {
      console.log(formatExecutionResults(calendarResults));
    }

    if (taskResults.length > 0) {
      if (calendarResults.length > 0) {
        console.log("");
      }
      console.log(formatTaskScheduleExecutionResults(taskResults));
    }

    if (calendarResults.length === 0 && taskResults.length === 0) {
      console.log("No scheduled work to execute");
    }
    process.exit(0);
  }
}
