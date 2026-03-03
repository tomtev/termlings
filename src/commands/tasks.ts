/**
 * Task management commands
 */

export async function handleTask(flags: Set<string>, positional: string[]) {
  const { createTask, getTask, getAllTasks, claimTask, updateTaskStatus, addTaskNote, addTaskDependency, removeTaskDependency, getUnresolvedDeps, formatTask, formatAgentTaskList } =
    await import("../engine/tasks.js");
  const sessionId = process.env.TERMLINGS_SESSION_ID;
  const agentSlug = process.env.TERMLINGS_AGENT_SLUG || process.env.TERMLINGS_SESSION_ID || "";
  const agentName = process.env.TERMLINGS_AGENT_NAME || "Agent";

  const subcommand = positional[1];

  if (!subcommand || subcommand === "--help" || subcommand === "help") {
    console.log(`
📋 Task Management

Track work across the team. Claim tasks, update status, and leave notes.

COMMANDS:
  termlings task create <title> [description] [priority]  Create a new task
  termlings task list                          List all available tasks
  termlings task show <task-id>                Show task details
  termlings task claim <task-id>               Claim a task to work on
  termlings task status <task-id> <status>    Update task status
  termlings task note <task-id> <note...>     Add progress note
  termlings task depends <id> <dep-id>        Add dependency (id blocked by dep-id)
  termlings task depends <id> --remove <dep>  Remove dependency

STATUSES:
  open          Available for anyone to claim
  claimed       You're working on it
  in-progress   Work started
  completed     Work done
  blocked       Waiting for something

EXAMPLES:
  $ termlings task create "Fix flaky tests" "Stabilize browser test suite" high
  ✓ Task created: task_... (Fix flaky tests)

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

DEPENDENCIES:
  Tasks can depend on other tasks. A task with unresolved dependencies
  cannot be claimed until all dependencies are completed.

  $ termlings task depends task-002 task-001
  ✓ task-002 now depends on Fix API rate limiting

  $ termlings task claim task-002
  Cannot claim: waiting on 1 dependency task(s):
    ⏳ Fix API rate limiting (task-001) — in-progress

  $ termlings task depends task-002 --remove task-001
  ✓ Dependency removed

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

  const requiresSession = subcommand === "claim" || subcommand === "status" || subcommand === "note";
  if (requiresSession && !sessionId) {
    console.error("Error: TERMLINGS_SESSION_ID env var not set");
    process.exit(1);
  }

  const taskId = positional[2];

  if (subcommand === "list") {
    const tasks = getAllTasks();
    console.log(formatAgentTaskList(tasks, agentSlug));
    return;
  }

  if (subcommand === "create") {
    const title = positional[2];
    const description = positional[3];
    const priorityInput = positional[4];
    const priority =
      priorityInput === "low" || priorityInput === "medium" || priorityInput === "high"
        ? priorityInput
        : undefined;

    if (!title) {
      console.error("Usage: termlings task create <title> [description] [low|medium|high]");
      process.exit(1);
    }

    if (priorityInput && !priority) {
      console.error(`Invalid priority: ${priorityInput}`);
      console.error("Expected one of: low, medium, high");
      process.exit(1);
    }

    const task = createTask(title, description || "", priority || "medium");
    console.log(`✓ Task created: ${task.id} (${task.title})`);
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
    // Check for unresolved deps before trying to claim
    const checkTask = getTask(taskId);
    if (checkTask) {
      const unresolved = getUnresolvedDeps(checkTask);
      if (unresolved.length > 0) {
        console.error(`Cannot claim: waiting on ${unresolved.length} dependency task(s):`);
        const allTasks = getAllTasks();
        for (const depId of unresolved) {
          const dep = allTasks.find((t: any) => t.id === depId);
          console.error(`  ⏳ ${dep?.title || depId} (${depId}) — ${dep?.status || "unknown"}`);
        }
        process.exit(1);
      }
    }
    const task = claimTask(taskId, agentSlug, agentName);
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
    const task = updateTaskStatus(taskId, newStatus as any, agentSlug, agentName, note || undefined, "default");
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
    const task = addTaskNote(taskId, text, agentSlug, agentName, "default");
    if (!task) {
      console.error(`Task not found: ${taskId}`);
      process.exit(1);
    }
    console.log(`✓ Note added`);
    return;
  }

  if (subcommand === "depends") {
    const depTaskId = positional[3];
    if (!taskId || !depTaskId) {
      console.error("Usage: termlings task depends <task-id> <depends-on-task-id>");
      console.error("       termlings task depends <task-id> --remove <dep-task-id>");
      process.exit(1);
    }

    if (taskId === depTaskId) {
      console.error("A task cannot depend on itself");
      process.exit(1);
    }

    // Check for --remove flag
    if (depTaskId === "--remove") {
      const removeId = positional[4];
      if (!removeId) {
        console.error("Usage: termlings task depends <task-id> --remove <dep-task-id>");
        process.exit(1);
      }
      const task = removeTaskDependency(taskId, removeId);
      if (!task) {
        console.error(`Task not found: ${taskId}`);
        process.exit(1);
      }
      console.log(`✓ Dependency removed`);
      return;
    }

    const task = addTaskDependency(taskId, depTaskId);
    if (!task) {
      console.error(`Task not found: ${taskId} or ${depTaskId}`);
      process.exit(1);
    }
    const dep = getTask(depTaskId);
    console.log(`✓ ${task.title} now depends on ${dep?.title || depTaskId}`);
    return;
  }

  console.error("Usage: termlings task <create|list|show|claim|status|note|depends>");
  process.exit(1);
}
