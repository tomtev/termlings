/**
 * Calendar management commands - complete implementation
 */

export async function handleCalendar(flags: Set<string>, positional: string[]) {
  const { createCalendarEvent, getAllCalendarEvents, getCalendarEvent, updateCalendarEvent, deleteCalendarEvent, toggleCalendarEvent, formatCalendarEvent, formatCalendarEventList, formatRecurrence, getAgentCalendarEvents } =
    await import("../engine/calendar.js");

  const subcommand = positional[1];

  // Show help
  if (!subcommand || subcommand === "--help" || subcommand === "help") {
    console.log(`
📅 Calendar - Schedule & track team events

Create recurring events, assign to agents, and manage deadlines.

COMMANDS:
  termlings calendar list [--agent <id>]      List events (agent-specific or all)
  termlings calendar show <event-id>          Show event details
  termlings calendar create ...               Create new event
  termlings calendar edit <event-id> ...      Modify event
  termlings calendar delete <event-id>        Remove event
  termlings calendar enable <event-id>        Reactivate event
  termlings calendar disable <event-id>       Disable event

CREATE SYNTAX:
  termlings calendar create <agent-id> [<agent-id> ...] <title> <start-iso> <end-iso> [recurrence]

RECURRENCE:
  none (default), hourly, daily, weekly, monthly

EXAMPLES:
  $ termlings calendar create tl-alice "Daily Standup" "2026-03-02T09:00:00Z" "2026-03-02T09:30:00Z" daily

  $ termlings calendar create tl-alice tl-bob "Sprint Planning" "2026-03-03T14:00:00Z" "2026-03-03T16:00:00Z"

  $ termlings calendar list
  ID          Title              Start                    End                      Agents
  evt-001     Daily Standup      2026-03-02 09:00        2026-03-02 09:30         alice

  $ termlings calendar edit evt-001 --title "Team Standup"

  $ termlings calendar enable evt-001

BEST PRACTICES:
  ✓ Use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)
  ✓ Set recurring events for regular meetings
  ✓ Disable instead of delete to preserve history
  ✓ Check availability before scheduling
  ✓ Update events, don't recreate them
`);
    return;
  }

  if (subcommand === "create") {
    if (positional.length < 6) {
      console.error("Usage: termlings calendar create <agent-id> [<agent-id> ...] <title> <start-iso-time> <end-iso-time> [recurrence]");
      console.error("Recurrence: none (default), hourly, daily, weekly, monthly");
      process.exit(1);
    }

    let agents: string[] = [];
    let titleIdx = 2;

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
      return;
    } catch (e) {
      console.error(`Error creating event: ${e}`);
      process.exit(1);
    }
  }

  if (subcommand === "list") {
    const sessionId = process.env.TERMLINGS_SESSION_ID;
    const agentIdArg = positional[2];

    let agentId: string | null = null;
    if (agentIdArg === "--agent" && positional[3]) {
      agentId = positional[3];
    } else if (sessionId && !agentIdArg) {
      agentId = sessionId;
    }

    const events = agentId
      ? getAgentCalendarEvents(agentId)
      : getAllCalendarEvents();

    console.log(formatCalendarEventList(events));
    return;
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
    return;
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
        i--;
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
    return;
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
    return;
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
    return;
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
    return;
  }

  console.error("Usage: termlings calendar <create|list|show|edit|delete|enable|disable>");
  process.exit(1);
}
