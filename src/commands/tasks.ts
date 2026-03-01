/**
 * Task management commands
 */

export async function handleTask(flags: Set<string>, positional: string[]) {
  const { getTask, getAllTasks, claimTask, updateTaskStatus, addTaskNote, formatTask, formatAgentTaskList } =
    await import("../engine/tasks.js");
  const sessionId = process.env.TERMLINGS_SESSION_ID;
  const agentName = process.env.TERMLINGS_AGENT_NAME || "Agent";

  const subcommand = positional[1];

  if (!subcommand || subcommand === "--help" || subcommand === "help") {
    console.log(`
📋 Task Management

Track work across the team. Claim tasks, update status, and leave notes.

COMMANDS:
  termlings task list                          List all available tasks
  termlings task show <task-id>                Show task details
  termlings task claim <task-id>               Claim a task to work on
  termlings task status <task-id> <status>    Update task status
  termlings task note <task-id> <note...>     Add progress note

STATUSES:
  open          Available for anyone to claim
  claimed       You're working on it
  in-progress   Work started
  completed     Work done
  blocked       Waiting for something

EXAMPLES:
  $ termlings task list
  ID          Title                           Status      Assigned
  task-001    Fix API rate limiting          open        -
  task-002    Update database schema         claimed     Alice

  $ termlings task claim task-001
  ✓ Task claimed: Fix API rate limiting

  $ termlings task status task-001 in-progress "Started investigation"
  ✓ Status updated: in-progress

  $ termlings task note task-001 "Found issue in auth handler, 50% done"
  ✓ Note added

WORKFLOW:
  1. termlings task list          # See what needs doing
  2. termlings task claim <id>    # Lock in your task
  3. termlings task status <id> in-progress  # Tell team you started
  4. termlings task note <id> "Progress: ..."  # Update every 15-30 min
  5. termlings task status <id> completed "Done"  # Mark when finished

BEST PRACTICES:
  ✓ Claim before starting (prevents conflicts)
  ✓ Update status to reality (in-progress, blocked, completed)
  ✓ Add notes frequently (every 15-30 min on long tasks)
  ✓ Include ETA in notes when blocked
  ✓ Message team if you need help
  ✗ Don't leave tasks in "in-progress" without updates
  ✗ Don't silently abandon tasks
`);
    return;
  }

  if (!sessionId) {
    console.error("Error: TERMLINGS_SESSION_ID env var not set");
    process.exit(1);
  }

  const taskId = positional[2];

  if (subcommand === "list") {
    const tasks = getAllTasks();
    console.log(formatAgentTaskList(tasks, sessionId));
    return;
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
    return;
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
    return;
  }

  if (subcommand === "status") {
    const newStatus = positional[3];
    const note = positional.slice(4).join(" ");
    if (!taskId || !newStatus) {
      console.error(
        "Usage: termlings task status <task-id> <open|claimed|in-progress|completed|blocked> [note]"
      );
      process.exit(1);
    }
    const task = updateTaskStatus(taskId, newStatus as any, sessionId, agentName, note || undefined, "default");
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    console.log(`✓ Status updated: ${newStatus}`);
    return;
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
    return;
  }

  console.error("Usage: termlings task <list|show|claim|status|note>");
  process.exit(1);
}
