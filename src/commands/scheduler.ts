/**
 * Calendar scheduler command
 */

export async function handleScheduler(flags: Set<string>, positional: string[]) {
  if (flags.has("help")) {
    console.log(`
⏰ Scheduler - Run scheduled calendar events

Automatically execute scheduled work when it's due.

USAGE:
  termlings scheduler              Check once and execute due events
  termlings scheduler --daemon     Run continuously in background

DAEMON MODE:
  • Checks every 60 seconds
  • Runs due calendar events and scheduled emails automatically
  • Keeps running until Ctrl+C
  • Good for production workflows

EXAMPLES:
  # One-time check
  $ termlings scheduler
  ✓ Executed 2 events

  # Background daemon (for production)
  $ termlings scheduler --daemon
  📅 Starting scheduler daemon (calendar + email, press Ctrl+C to stop)
  ✓ 09:00 Standup started
  ✓ 14:00 Planning started

USE WHEN:
  • Need to auto-start meetings/tasks on schedule
  • Need to auto-send scheduled email drafts
  • Running a 24/7 agent team
  • Want hands-off calendar execution
`);
    return;
  }

  const { executeScheduledCalendarEvents, formatExecutionResults } =
    await import("../engine/calendar-scheduler.js");
  const { executeScheduledEmailDrafts } = await import("../engine/email-scheduler.js");

  if (flags.has("daemon")) {
    const { appendWorkspaceMessage } = await import("../workspace/state.js");
    appendWorkspaceMessage({
      kind: "system",
      from: "system:scheduler",
      fromName: "Scheduler",
      text: "scheduler daemon started",
    });

    // Run as background daemon (keeps running)
    console.log("📅 Starting scheduler daemon (calendar + email, press Ctrl+C to stop)");
    const interval = setInterval(() => {
      const calendarResults = executeScheduledCalendarEvents();
      if (calendarResults.length > 0) {
        for (const result of calendarResults) {
          if (!result.executed) continue;
          const agentList = result.agentsNotified.join(", ");
          console.log(`✓ Calendar "${result.title}" -> ${result.agentsNotified.length} agent(s): ${agentList}`);
        }
      }

      const emailResults = executeScheduledEmailDrafts();
      if (emailResults.length > 0) {
        for (const result of emailResults) {
          if (result.executed) {
            console.log(`✓ Email draft sent: ${result.draftId} (${result.title})`);
          } else {
            console.log(`! Email draft failed: ${result.draftId} (${result.title}) - ${result.error || "unknown error"}`);
          }
        }
      }
    }, 60 * 1000);

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
      console.log("\n📅 Stopping calendar scheduler");
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
    const emailResults = executeScheduledEmailDrafts();

    if (calendarResults.length > 0) {
      console.log(formatExecutionResults(calendarResults));
    }

    if (emailResults.length > 0) {
      if (calendarResults.length > 0) {
        console.log("");
      }
      console.log(`Processed ${emailResults.length} scheduled email draft(s):`);
      for (const result of emailResults) {
        if (result.executed) {
          console.log(`✓ [${new Date(result.timestamp).toLocaleTimeString()}] ${result.draftId} (${result.title})`);
        } else {
          console.log(`! [${new Date(result.timestamp).toLocaleTimeString()}] ${result.draftId} (${result.title}) - ${result.error || "unknown error"}`);
        }
      }
    }

    if (calendarResults.length === 0 && emailResults.length === 0) {
      console.log("No scheduled work to execute");
    }
    process.exit(0);
  }
}
