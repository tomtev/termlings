/**
 * Calendar scheduler command
 */

export async function handleScheduler(flags: Set<string>, positional: string[]) {
  if (flags.has("help")) {
    console.log(`
⏰ Scheduler - Run scheduled calendar events

Automatically execute calendar events when they're due.

USAGE:
  termlings scheduler              Check once and execute due events
  termlings scheduler --daemon     Run continuously in background

DAEMON MODE:
  • Checks every 60 seconds
  • Runs due events automatically
  • Keeps running until Ctrl+C
  • Good for production workflows

EXAMPLES:
  # One-time check
  $ termlings scheduler
  ✓ Executed 2 events

  # Background daemon (for production)
  $ termlings scheduler --daemon
  📅 Starting calendar scheduler daemon (press Ctrl+C to stop)
  ✓ 09:00 Standup started
  ✓ 14:00 Planning started

USE WHEN:
  • Need to auto-start meetings/tasks on schedule
  • Running a 24/7 agent team
  • Want hands-off calendar execution
`);
    return;
  }

  const { executeScheduledCalendarEvents, formatExecutionResults, startScheduler } =
    await import("../engine/calendar-scheduler.js");

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
