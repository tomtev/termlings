# App Activity

This plan describes the shared activity output system for Termlings apps.

## Goal

Make app output a first-class platform primitive instead of a browser-only special case.

That means any app should be able to emit structured activity to:

- `All activity`
- a specific agent thread
- both surfaces

This is the basis for a future App API where custom apps can participate in the CLI, TUI, storage, and system context without hardcoded TUI logic for each app.

## Core Idea

Every app emits structured activity entries into a shared file-based store.

Canonical storage:

```text
.termlings/store/activity/
  all.jsonl
  thread/
    agent:developer.jsonl
    agent:growth.jsonl
    human:default.jsonl
```

Each entry should keep a stable envelope:

```json
{
  "ts": 1772861400000,
  "app": "browser",
  "kind": "click",
  "text": "clicked button.publish",
  "level": "summary",
  "surface": "both",
  "threadId": "agent:developer",
  "actorSessionId": "tl-dev-1",
  "actorName": "Developer",
  "actorSlug": "developer",
  "actorDna": "abc1234",
  "result": "success",
  "meta": {
    "tabId": "A1B2C3"
  }
}
```

## Why This Matters

Without a shared activity system, each app becomes a TUI special case:

- browser has its own history parser
- tasks would need separate feed logic
- requests would need separate feed logic
- scheduled messages would need separate feed logic

That does not scale to custom apps.

With a shared activity system:

- apps write one canonical output format
- TUI reads one canonical activity format
- agent threads can merge app events with DMs
- custom apps can output to shared surfaces later without changing TUI internals

## Surfaces

Use `surface` to control where an activity event appears:

- `feed`
  Show only in `All activity`
- `thread`
  Show only in the target thread
- `both`
  Show in both places

This should stay explicit in the event itself.

## Levels

Use `level` so output volume can be configured later without changing the storage format.

- `summary`
  High-signal events that are useful in normal operation
- `detail`
  Noisier events useful for debugging or close operator oversight

Future settings can use this to control how much each app emits or how much the TUI shows.

Possible future controls:

- workspace default activity level
- per-app activity level
- per-thread activity level
- hide/show detail events in `All activity`
- custom app defaults

## Current Core App Shape

This model fits core apps like:

- `browser`
- `task`
- `requests`
- `messaging` (scheduled messages, scheduler output)
- later `calendar`, `crm`, `workflows`, `plans`

Examples:

- browser:
  `visited https://example.com`
  `clicked button.submit`
  `requested browser help`
- task:
  `created task task_123: Ship onboarding`
  `set task task_123: Ship onboarding to in-progress`
- requests:
  `created request req-ab12cd34 (API_KEY)`
  `resolved request req-ab12cd34 (API_KEY)`
- messaging:
  `scheduled message to agent:developer (daily at 09:00 Europe/Oslo)`

## Custom App API Direction

A future custom app should be able to emit activity with a small API like:

```ts
appendAppActivity({
  app: "market-research",
  kind: "report-generated",
  text: "generated competitor summary for Stripe",
  level: "summary",
  surface: "both",
  threadId: "agent:growth",
  actorSlug: "growth",
  meta: {
    reportId: "report_123"
  }
})
```

That gives a custom app:

- shared visibility in `All activity`
- optional visibility in one agent thread
- stable JSONL storage
- no need to patch the TUI directly for basic output

## Important Rules

- Store rendered human-readable `text`, not only raw machine payloads.
- Keep top-level fields stable and small.
- Put app-specific payload in `meta`.
- Do not log secrets or raw sensitive typed values.
- Prefer `summary` by default; reserve `detail` for noisier events.
- Use thread output only when the event clearly belongs to a specific agent thread.

## Non-Goals

This is not meant to replace:

- DM conversations
- task notes
- full audit logs for a specific app

Apps can still keep their own deeper storage. The shared activity feed is the cross-app output layer.

## Future Extensions

- per-app renderers in the TUI
- richer activity cards with icons/colors by app
- operator filters by app/kind/level
- API endpoints for recent app activity
- app-defined actions from activity entries
- mobile/web operator inbox based on the same activity log

## Status

This is the intended direction for the App API.

The important architectural rule is:

App output should flow through a shared file-based activity system, not through bespoke per-app TUI logic.
