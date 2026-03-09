# Eval App PRD

Status: planned

`eval` should be a separate Termlings app for measuring real agent performance inside real Termlings workflows.

It should optimize for one core metric:

- verified outcome per token

This app should help Termlings answer:

- which context strategy works best?
- which app mix produces the best outcomes?
- which workflow burns too many tokens?
- when does a second agent improve quality vs just add cost?
- what is the smallest amount of context needed to achieve the goal?

## Goal

Termlings should let operators and agents:

1. define reproducible benchmark tasks
2. run those tasks through real Termlings agents
3. capture tokens, time, commands, and app usage
4. verify outcomes with scripts or structured checks
5. compare strategies by verified success, not by vibe

## Why Separate From Tasks And Workflows

`eval` should not be folded into `task` or `workflows`.

Reasons:

- tasks track execution work
- workflows track repeatable task sequences
- evals measure quality, cost, and reliability of those systems

The clean split should be:

- `task`
  work to be done
- `workflows`
  reusable execution patterns
- `eval`
  benchmark harness and scoring layer

## Product Goals

V1 should make it easy to answer:

- did the agent complete the task correctly?
- how many tokens did it spend?
- how long did it take?
- which commands and apps did it use?
- did a smaller context strategy still pass?
- did a multi-agent strategy improve results enough to justify the cost?

## Non-Goals

V1 should not try to be:

- a hosted LLM eval platform
- a model fine-tuning system
- a benchmark leaderboard for public models
- a synthetic-only prompt test harness
- a full academic evaluation framework

## Design Principle

The primary metric should be:

- `verified_success / total_tokens`

Secondary metrics should be:

- time to verified success
- operator interventions
- failed runs
- retries
- token cost per useful edit
- token cost per browser action

The app should reward:

- short useful context
- strong command/app surfaces
- early verification
- small targeted retrieval

The app should penalize:

- huge prompts
- repeated file rereads
- unnecessary browser thrashing
- verbose tool chatter without verified outcomes

## Storage Layout

```text
.termlings/
  store/
    evals/
      tasks/
        research-brief-smoke.json
        browser-login-help.json
      strategies.json
      runs/
        run_2026-03-09T12-00-00Z_pm-concise/
          run.json
          events.jsonl
          artifacts/
          verification.json
      reports/
        report_2026-03-09_last-20.json
      baselines.json
```

This should stay file-based and inspectable.

## Canonical Models

### Eval Task

```json
{
  "id": "research-brief-smoke",
  "title": "Research smoke test",
  "kind": "research",
  "description": "Investigate a market question and return a short verified summary.",
  "entry": {
    "agent": "pm",
    "message": "Research the top 3 alternatives and summarize risks."
  },
  "apps": ["messaging", "brief", "browser", "memory"],
  "fixtures": {
    "workspace": "fixtures/research-smoke"
  },
  "verification": {
    "type": "script",
    "command": "bun verify/research-smoke.ts"
  },
  "budgets": {
    "maxTotalTokens": 40000,
    "maxMinutes": 20
  },
  "tags": ["token-efficiency", "research", "browser"]
}
```

### Eval Strategy

```json
{
  "id": "concise-app-scoped",
  "description": "App-scoped brief, concise system context, one primary agent.",
  "settings": {
    "brief": "scoped",
    "activityLevel": "summary",
    "systemContext": "app-scoped",
    "delegation": "single-agent",
    "memoryMode": "targeted"
  }
}
```

### Eval Run

```json
{
  "id": "run_2026-03-09T12-00-00Z_pm-concise",
  "taskId": "research-brief-smoke",
  "strategyId": "concise-app-scoped",
  "status": "completed",
  "startedAt": 1770000000000,
  "endedAt": 1770000540000,
  "entryAgent": "pm",
  "result": {
    "verified": true,
    "score": 0.92
  },
  "metrics": {
    "inputTokens": 14230,
    "outputTokens": 3110,
    "totalTokens": 17340,
    "durationMs": 540000,
    "commands": 18,
    "filesRead": 7,
    "filesWritten": 3,
    "browserActions": 4,
    "operatorInterventions": 0
  },
  "appsUsed": ["brief", "browser", "memory", "messaging"],
  "artifacts": {
    "summary": "artifacts/summary.md",
    "verification": "verification.json"
  }
}
```

### Eval Event

```json
{
  "ts": 1770000012000,
  "runId": "run_2026-03-09T12-00-00Z_pm-concise",
  "kind": "command.executed",
  "app": "browser",
  "agent": "pm",
  "data": {
    "command": "termlings browser extract",
    "tokensSoFar": 3200
  }
}
```

## CLI Shape

```bash
termlings eval list
termlings eval show <task-id>
termlings eval strategies
termlings eval run <task-id>
termlings eval run <task-id> --strategy <id>
termlings eval compare <strategy-a> <strategy-b> --task <task-id>
termlings eval report
termlings eval report --last 20
termlings eval baselines
```

Useful flags:

```bash
--strategy <id>
--agent <slug>
--json
--last <window>
--limit <n>
--open
```

## Examples

```bash
termlings eval list
termlings eval run research-brief-smoke --strategy concise-app-scoped
termlings eval compare concise-app-scoped full-brief --task research-brief-smoke
termlings eval report --last 20
```

## Run Model

`eval` should run real Termlings behavior, not fake prompt-only simulations.

That means a run should:

1. load the benchmark task
2. prepare the workspace fixture or sandbox snapshot
3. choose the configured strategy
4. launch the entry agent through the normal runtime path
5. capture Termlings activity, commands, and app usage
6. run verification at the end
7. store a durable run record and event log

V1 can start with local runs and scripted verification.

## Verification Model

Verification should support a small set of explicit types:

- `script`
  run a command and read exit code + JSON output
- `file`
  verify a file exists and matches conditions
- `json`
  verify structured output against required fields
- `manual`
  operator-scored fallback for early experiments

The canonical source of truth should be the verification result, not the agent's self-report.

## Strategies To Compare

V1 should support simple strategy variants like:

- `full-brief`
- `concise-app-scoped`
- `single-agent`
- `pm-with-delegate`
- `browser-heavy`
- `memory-first`

Each strategy should change Termlings-owned settings like:

- brief scope
- activity verbosity
- enabled apps
- delegation policy
- memory retrieval behavior

## Token Efficiency Levers

The eval app should make it easy to test:

- app-scoped system context vs full system context
- SOUL `apps:` allowlists vs broad app access
- summary activity vs detailed activity
- memory retrieval vs repeated file reads
- workflows/patterns vs raw browser command chains
- single-agent vs delegated execution

The design goal is not maximum raw capability.

It is:

- minimum tokens for maximum verified progress

## First 10 Benchmark Tasks

V1 should ship with a small, practical corpus:

1. `research-brief-smoke`
   short market research + summary verification
2. `browser-login-help`
   human-in-loop browser task with manual checkpoint
3. `docs-edit-small`
   small docs change with content verification
4. `task-handoff`
   one agent creates work, another agent finishes it
5. `crm-followup-summary`
   read CRM state and produce a follow-up recommendation
6. `social-draft-schedule`
   create a social draft and schedule it correctly
7. `analytics-report-30d`
   generate a 30-day analytics summary from synced data
8. `finance-report-mrr`
   generate a basic revenue summary from synced finance data
9. `ads-performance-review`
   summarize campaign performance and suggest one action
10. `cms-create-publish`
    create, schedule, and publish a CMS entry

These tasks should deliberately mix:

- read-heavy work
- write-heavy work
- browser work
- app-specific state access
- multi-step coordination

## Reports

`eval report` should generate file-backed summaries like:

- last 10 runs
- last 20 runs
- by task
- by strategy
- by agent

Reports should summarize:

- pass rate
- average total tokens
- average duration
- average operator interventions
- best strategy by verified outcome per token
- worst regressions vs baseline

## Activity Feed

`eval` should emit shared app activity like:

- `eval.run.started`
- `eval.run.completed`
- `eval.run.failed`
- `eval.report.generated`
- `eval.regression.detected`
- `eval.baseline.updated`

These should use the shared activity system under `.termlings/store/activity/`.

## Integrations

`eval` should connect naturally to:

- `brief`
  for scoped startup context strategies
- `memory`
  for retrieval-vs-reread comparisons
- `browser`
  for browser-heavy benchmarks
- `task`
  for coordination benchmarks
- `crm`, `social`, `ads`, `analytics`, `finance`, `cms`
  for app-specific benchmark tasks

## Human-in-the-Loop

Some evals should deliberately include operator involvement.

Examples:

- browser login handoff
- request/approval checkpoint
- manual quality check for generated media

But operator touch should be explicitly counted and reported as a metric.

## Future Extensions

Later, `eval` can expand with:

- remote sandbox backends
- Docker-vs-host strategy comparison
- baseline regression alerts in CI
- artifact diffing
- cost estimation by provider/runtime
- automatic corpus generation from past tasks

V1 should stay narrow:

- real task corpus
- real Termlings runs
- explicit verification
- token-aware scoring
- simple strategy comparisons
