/**
 * Calendar management commands - complete implementation
 */

import { maybeHandleCommandSchema, type CommandSchemaContract } from "./command-schema.js";

const CALENDAR_SCHEMA: CommandSchemaContract = {
  command: "calendar",
  title: "Calendar",
  summary: "Event scheduling, assignment, recurrence, and visibility",
  notes: [
    "Use ISO 8601 timestamps for create flows.",
    "Disable recurring events instead of deleting them when you want to preserve history.",
  ],
  actions: {
    list: {
      summary: "List events for the current agent or an explicit target",
      usage: "termlings calendar list [--agent <slug>]",
      options: {
        agent: "Show events assigned to a specific agent slug",
      },
      examples: [
        "termlings calendar list",
        "termlings calendar list --agent developer",
      ],
    },
    show: {
      summary: "Show one event",
      usage: "termlings calendar show <event-id>",
      examples: [
        "termlings calendar show evt-001",
      ],
    },
    create: {
      summary: "Create a new event assigned to one or more agents",
      usage: "termlings calendar create <agent-slug> [<agent-slug> ...] <title> <start-iso> <end-iso> [none|hourly|daily|weekly|monthly]",
      notes: [
        "Use ISO 8601 timestamps such as 2026-03-02T09:00:00Z.",
      ],
      examples: [
        "termlings calendar create developer \"Daily Standup\" \"2026-03-02T09:00:00Z\" \"2026-03-02T09:30:00Z\" daily",
      ],
    },
    edit: {
      summary: "Edit an existing event",
      usage: "termlings calendar edit <event-id> [--title TITLE] [--description DESC] [--recurrence REC] [--agents AGENT...]",
      options: {
        title: "Replace the event title",
        description: "Replace the event description",
        recurrence: "Set none|hourly|daily|weekly|monthly",
        agents: "Replace the assigned agent slug list",
      },
      examples: [
        "termlings calendar edit evt-001 --title \"Team Standup\" --agents developer designer",
      ],
    },
    delete: {
      summary: "Delete an event",
      usage: "termlings calendar delete <event-id>",
      examples: [
        "termlings calendar delete evt-001",
      ],
    },
    enable: {
      summary: "Enable an event",
      usage: "termlings calendar enable <event-id>",
      examples: [
        "termlings calendar enable evt-001",
      ],
    },
    disable: {
      summary: "Disable an event",
      usage: "termlings calendar disable <event-id>",
      examples: [
        "termlings calendar disable evt-001",
      ],
    },
  },
}

export async function handleCalendar(flags: Set<string>, positional: string[], opts: Record<string, string> = {}) {
  if (maybeHandleCommandSchema(CALENDAR_SCHEMA, positional)) {
    return;
  }

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
  termlings calendar edit <event-id> ...      Modify title/description/recurrence/agents
  termlings calendar delete <event-id>        Remove event
  termlings calendar enable <event-id>        Reactivate event
  termlings calendar disable <event-id>       Disable event

CREATE SYNTAX:
  termlings calendar create <agent-slug> [<agent-slug> ...] <title> <start-iso> <end-iso> [recurrence]

RECURRENCE:
  none (default), hourly, daily, weekly, monthly

EXAMPLES:
  $ termlings calendar create alice "Daily Standup" "2026-03-02T09:00:00Z" "2026-03-02T09:30:00Z" daily

  $ termlings calendar create alice bob "Sprint Planning" "2026-03-03T14:00:00Z" "2026-03-03T16:00:00Z"

  $ termlings calendar list
  ID          Title              Start                    End                      Agents
  evt-001     Daily Standup      2026-03-02 09:00        2026-03-02 09:30         alice

  $ termlings calendar edit evt-001 --title "Team Standup" --agents alice,bob

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

    const recurrenceValues = new Set(["none", "hourly", "daily", "weekly", "monthly"]);
    const trailingToken = positional[positional.length - 1] || "";
    const hasExplicitRecurrence = recurrenceValues.has(trailingToken);
    const titleIdx = positional.length - (hasExplicitRecurrence ? 4 : 3);
    const agents = positional.slice(2, titleIdx);

    if (agents.length === 0) {
      console.error("Error: At least one agent slug required (e.g., alice, developer)");
      process.exit(1);
    }

    const title = positional[titleIdx];
    const startIso = positional[titleIdx + 1];
    const endIso = positional[titleIdx + 2];
    const recurrence = (hasExplicitRecurrence ? trailingToken : "none") as any;

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
      const agentSlug = process.env.TERMLINGS_AGENT_SLUG || "";
      const agentId = (opts.agent || "").trim() || (agentSlug && positional.length <= 2 ? agentSlug : null);

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
        console.error("Usage: termlings calendar edit <event-id> [--title TITLE] [--description DESC] [--recurrence REC] [--agents AGENT[,AGENT...]]");
        process.exit(1);
      }

      const updates: any = {};
      if (opts.title) updates.title = opts.title;
      if (opts.description) updates.description = opts.description;
      if (opts.recurrence) updates.recurrence = opts.recurrence;
      if (flags.has("agents")) {
        const inlineAgents = (opts.agents || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        const trailingAgents = positional.slice(3).map((value) => value.trim()).filter(Boolean);
        const assignedAgents = Array.from(new Set([...inlineAgents, ...trailingAgents]));
        updates.assignedAgents = assignedAgents;
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
