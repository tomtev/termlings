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
    },
    "agents": {
      "growth": {
        "crm": true
      }
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
- `crm`

Resolution order:

1. built-in defaults in code
2. `apps.defaults`
3. `apps.agents.<slug>`

If `workspace.json` has no `apps` object, all toggleable core apps default to `true`.

Required app rule:

- `messaging` is always enabled
- `workspace.json.apps.defaults.messaging = false` is ignored
- `workspace.json.apps.agents.<slug>.messaging = false` is ignored

Example:

```json
{
  "apps": {
    "defaults": {
      "crm": false
    },
    "agents": {
      "growth": {
        "crm": true
      }
    }
  }
}
```

That means:

- CRM is disabled for everyone by default
- CRM is re-enabled only for agent slug `growth`

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
