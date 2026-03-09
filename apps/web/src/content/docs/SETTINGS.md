# Workspace Settings

Termlings workspace settings are stored in:

```text
.termlings/workspace.json
```

There is no Settings tab in the TUI. Edit this file directly when you need to change workspace-level UI behavior.

## Schema

```json
{
  "version": 1,
  "projectName": "your-project",
  "createdAt": 1772720000000,
  "updatedAt": 1772723600000,
  "settings": {
    "avatarSize": "small",
    "showBrowserActivity": true
  }
}
```

App availability can also live in the same file:

```json
{
  "apps": {
    "defaults": {
      "crm": false,
      "browser": true
    }
  }
}
```

## `settings` fields

- `avatarSize`: `"large" | "small" | "tiny"`
- `showBrowserActivity`: `true | false`

If a setting is missing or invalid, Termlings falls back to defaults:

- `avatarSize`: `small`
- `showBrowserActivity`: `true`

## `apps` fields

Apps control which agent-native file-based app surfaces are injected into agent system context and which agent-facing commands and TUI surfaces are available at runtime.

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

Resolution order:

1. built-in defaults in code
2. `apps.defaults`
3. agent SOUL frontmatter `apps:` allowlist, if present

If `workspace.json` has no `apps` object, all toggleable core apps default to `true`.

Required app rule:

- `messaging` is always enabled
- `workspace.json.apps.defaults.messaging = false` is ignored
- agent SOUL cannot disable `messaging`
- `eval` is operator-only and is always hidden from normal agent sessions

Example:

```json
{
  "apps": {
    "defaults": {
      "crm": false,
      "ads": false
    }
  }
}
```

That means:

- CRM is disabled for everyone by default
- Ads are disabled for everyone by default

Per-agent allowlists now live in `.termlings/agents/<slug>/SOUL.md`:

```yaml
---
name: Growth
dna: 80bf40
apps:
  - messaging
  - brief
  - task
  - social
  - analytics
---
```

That means the `growth` agent only gets those globally-enabled apps.

When an app is disabled, it is removed from injected context, top-level `termlings --help`, and any TUI tabs owned by that app.

## Examples

Hide browser events in the activity feed:

```json
{
  "settings": {
    "showBrowserActivity": false
  }
}
```

Use tiny avatar mode in the TUI:

```json
{
  "settings": {
    "avatarSize": "tiny"
  }
}
```

## Related

- [APPS.md](APPS.md)
- [browser.md](browser.md)
- [LIFECYCLE.md](LIFECYCLE.md)
