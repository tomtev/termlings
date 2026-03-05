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

## `settings` fields

- `avatarSize`: `"large" | "small" | "tiny"`
- `showBrowserActivity`: `true | false`

If a setting is missing or invalid, Termlings falls back to defaults:

- `avatarSize`: `small`
- `showBrowserActivity`: `true`

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

- [browser.md](browser.md)
- [LIFECYCLE.md](LIFECYCLE.md)
