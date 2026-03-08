# termlings-app

Tauri v2 desktop app for Termlings.

## Current direction

- This repo was extracted from `touchgrass/packages/app`.
- The main goal is a `termlings` desktop shell with tabbed PTY sessions.
- Prefer Termlings-specific behavior over preserving touchgrass compatibility.
- Do not add fallback wrappers back to `touchgrass` unless explicitly requested.

## Stack

- Backend: Rust + Tauri v2
- Frontend: Svelte 5
- Terminal: `portable-pty` + `xterm`

## Working rules

- Keep the primary flow centered on launching `termlings` commands.
- Prefer removing old touchgrass assumptions rather than adding adapters around them.
- Treat old daemon/channel modules as secondary until they are explicitly reworked for Termlings.
- Keep app-owned state in `~/.termlings-app/app-state.json`.

## Verification

- Frontend/type check: `npm run check`
- Rust compile check: `cargo check --manifest-path src-tauri/Cargo.toml`
