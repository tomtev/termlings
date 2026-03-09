# Eval

`termlings eval` is an operator-facing benchmark harness for measuring verified outcomes per token.

It is meant for:

- Termlings maintainers
- power users
- teams tuning prompts, app access, and workflow strategy

It is always hidden from normal agent sessions.

## Commands

```bash
termlings eval list
termlings eval show <task-id>
termlings eval strategies
termlings eval run <task-id> [--strategy <id>]
termlings eval compare <strategy-a> <strategy-b> [--task <task-id>]
termlings eval report [--last 20]
```

## Storage

```text
.termlings/store/evals/
  tasks/
  strategies.json
  runs/
  reports/
```

## What Gets Seeded

The first time you use `eval`, Termlings seeds:

- default strategies
- one runnable smoke task
- a set of editable benchmark templates

Tasks live in:

```text
.termlings/store/evals/tasks/*.json
```

## Strategy Model

Default strategies include:

- `full-brief`
- `concise-app-scoped`
- `pm-with-delegate`

These are exported into each eval run environment so commands and scripts can adapt behavior.

## Run Environment

Eval runs expose useful env vars like:

- `TERMLINGS_EVAL_RUN_ID`
- `TERMLINGS_EVAL_TASK_ID`
- `TERMLINGS_EVAL_STRATEGY_ID`
- `TERMLINGS_EVAL_RUN_DIR`
- `TERMLINGS_EVAL_ARTIFACTS_DIR`
- `TERMLINGS_EVAL_METRICS_PATH`
- `TERMLINGS_EVAL_VERIFICATION_PATH`
- `TERMLINGS_EVAL_BRIEF_MODE`
- `TERMLINGS_EVAL_SYSTEM_CONTEXT`
- `TERMLINGS_EVAL_ACTIVITY_LEVEL`
- `TERMLINGS_EVAL_DELEGATION`
- `TERMLINGS_EVAL_MEMORY_MODE`

If a task command writes JSON metrics to `TERMLINGS_EVAL_METRICS_PATH`, those metrics are folded into the run record.

## Verification Types

V1 supports:

- `script`
- `file`
- `json`
- `manual`

The verification result is the source of truth, not the agent's self-report.

## Example

```bash
termlings eval list
termlings eval run brief-json-smoke --strategy concise-app-scoped
termlings eval compare concise-app-scoped full-brief --task brief-json-smoke
termlings eval report --last 20
```

## Notes

- `eval` is operator-only by design.
- It does not appear in agent app help or system context.
- Seeded templates are intentionally editable.
- V1 is command-driven and file-backed.
