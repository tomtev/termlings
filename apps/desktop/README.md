# termlings-app

Extracted Tauri desktop shell for running `termlings` in tabbed PTY sessions.

## Status

- The app scaffold was copied from `Dev/touchgrass/packages/app`.
- The primary flow is now `termlings`-first:
  - setup checks for `termlings`
  - default presets launch `termlings` commands
  - PTY sessions run the selected command directly instead of wrapping through `touchgrass`
  - app state lives under `~/.termlings-app/app-state.json`
- Some secondary modules still come from the original app and are not fully converted yet, especially old daemon/channel integration.

## Development

```bash
npm install
npm run check
cargo check --manifest-path src-tauri/Cargo.toml
```

To run the app locally:

```bash
npm run tauri dev
```

## Current intent

This app is meant to become a desktop wrapper around Termlings, not a generic clone of touchgrass.
