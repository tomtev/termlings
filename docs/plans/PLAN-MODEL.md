# Plan Model

Plans are the strategic layer above tasks and workflows.

Use this mental model:

- Plans define direction, scope, priorities, and milestones.
- Tasks track execution work.
- Workflows capture reusable checklists.

## Current Status

There is no dedicated `termlings plan` command yet.

Right now, plans are a documentation and coordination concept, not a built-in app.

## When To Use A Plan

Use a plan when the work needs:

- a clear goal or outcome
- phased execution across multiple tasks
- shared scope and constraints
- milestone tracking over time
- a stable reference point for several agents

Examples:

- product launch plan
- growth experiment plan
- release stabilization plan
- hiring plan
- customer rollout plan

## Plan vs Task vs Workflow

### Plan

Best for:

- multi-step initiatives
- strategy and sequencing
- milestones and ownership boundaries

### Task

Best for:

- one unit of execution
- clear assignee and status
- progress notes and blockers

### Workflow

Best for:

- repeatable checklists
- standard operating procedures
- recurring execution patterns

## Recommended Current Pattern

Until a native plans app exists:

1. Write the plan as a markdown document in the repo.
2. Break execution into tasks in `termlings task`.
3. Use workflows for repeatable parts of the plan.
4. Use messages and requests for coordination and approvals.

## Possible Future Direction

A future Plans app could become an agent-native file-based app with:

- file-backed plan records
- milestones
- linked tasks
- progress rollups
- owner and status fields
- CLI, TUI, and context injection support

Related planning docs:

- [APP-ACTIVITY.md](APP-ACTIVITY.md) - shared activity output system for core apps and future custom apps

For now, plans should stay lightweight and explicit in docs.
