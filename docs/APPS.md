# Apps

Termlings apps are agent-native file-based CLI command surfaces. They extend agent capabilities, inject app-specific system context, and give agents CLI access to the matching `termlings` commands.

They also control which capability areas appear in agent system context, top-level CLI help, the TUI, slash commands, and agent-facing runtime access.

This is not markdown-tag parsing. The app model is structured and code-driven.

## Mental Model

There are three layers:

1. Built-in core apps in JSON-backed code manifests.
2. Workspace overrides in `.termlings/workspace.json.apps`.
3. Agent-specific app allowlists in `.termlings/agents/<slug>/SOUL.md`.

The launcher resolves the final app set for the current agent before building the injected system context.

If `.termlings/workspace.json` has no `apps` key, every toggleable core app defaults to `true`.

## Core Apps

Current core app keys:

- `messaging`
- `requests`
- `org-chart`
- `brief`
- `task`
- `workflows`
- `calendar`
- `browser`
- `skills`
- `brand`
- `social`
- `ads`
- `memory`
- `cms`
- `crm`
- `media`
- `analytics`
- `finance`
- `eval`

These are built-in apps, not arbitrary markdown sections.

`messaging` is required. It cannot be disabled in `workspace.json`.

## Workspace Config

Global app availability still lives in `.termlings/workspace.json`:

```json
{
  "version": 1,
  "projectName": "my-project",
  "createdAt": 1772790000000,
  "updatedAt": 1772790000000,
  "settings": {
    "avatarSize": "large"
  },
  "apps": {
    "defaults": {
      "crm": false,
      "browser": true,
      "ads": false
    }
  }
}
```

Resolution order:

1. Built-in defaults
2. `apps.defaults`
3. Agent SOUL frontmatter `apps:` allowlist, if present

Example behavior:

- no `apps` object: all core apps enabled
- `apps.defaults.crm = false`: CRM disabled for everyone
- `apps.defaults.ads = false`: Ads disabled for everyone

## Agent SOUL App Allowlist

Per-agent app access now comes from `SOUL.md`.

If an agent has no `apps:` frontmatter field, it keeps access to all globally-enabled apps.

If `apps:` is present, that list becomes the agent allowlist.

Canonical example:

```yaml
---
name: Growth
dna: 80bf40
apps:
  - messaging
  - brief
  - task
  - social
  - ads
  - analytics
  - finance
---
```

Important rules:

- `messaging` is still forced on even if omitted
- invalid app keys are ignored
- SOUL `apps:` narrows access; it does not override a workspace default that disabled an app globally
- no `apps:` key means full access to all globally-enabled apps
- `eval` is operator-only and is always hidden from normal agent sessions

## Injection Path

App-aware context injection works like this:

1. `termlings spawn` resolves the target agent and runtime.
2. The launcher reads identity from `.termlings/agents/<slug>/SOUL.md`.
3. The launcher resolves workspace defaults, then applies the agent SOUL `apps:` allowlist if present.
4. The launcher renders the system context from structured code sections.
5. Disabled apps are omitted from the rendered prompt.
6. The final prompt is injected into the runtime:
   - Claude: `--append-system-prompt "<context>"`
   - Codex: trailing injected prompt argument
7. `.termlings/VISION.md` is appended after the generated system context if present.

Current implementation points:

- core app manifests: `src/apps/core-apps.json`
- core app registry: `src/apps/registry.ts`
- app resolution: `src/engine/apps.ts`
- workspace app storage: `src/workspace/state.ts`
- system context rendering: `src/system-context.ts`
- runtime injection: `src/agents/launcher.ts`

## What Gets Hidden

When an app is disabled for an agent:

- the corresponding capability guidance is omitted from injected system context
- related command examples are omitted from quick reference sections
- `termlings --help` omits the disabled top-level commands when the current agent slug is available in `TERMLINGS_AGENT_SLUG`
- direct CLI commands for that app are blocked at runtime
- TUI tabs contributed by that app are omitted
- slash commands contributed by that app are omitted
- app-specific activity feed entries can be omitted
- `termlings brief` omits app-backed sections the current agent does not have access to

Current enforced example:

- `crm` is hidden from context, help, and runtime access when disabled
- `requests`, `task`, and `calendar` tabs disappear from the TUI when disabled
- `browser` activity entries are hidden from the activity feed when the browser app is disabled
- `messaging` always stays enabled because it is a required app

## Why Apps

This design avoids:

- parsing markdown for app sections
- custom `<tags>` inside docs
- prompt-only hiding without runtime enforcement

It keeps app availability:

- structured
- testable
- workspace-configurable
- agent-specific

This also leaves room for future per-app feature flags later without overloading the meaning of "app" now.

## Related Files

- [SPAWN.md](SPAWN.md)
- [MESSAGING.md](MESSAGING.md)
- [REQUESTS.md](REQUESTS.md)
- [LIFECYCLE.md](LIFECYCLE.md)
