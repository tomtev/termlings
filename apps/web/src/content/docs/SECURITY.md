# Security

This page describes the safest practical ways to run Termlings today.

Short version:

- The safest current Termlings setup is a dedicated remote machine or VM, plus a full Docker workspace.
- The best low-friction local hardening is `termlings --spawn --docker`.
- Running default YOLO-style spawn presets directly on your host is convenient, but it is not a strong security boundary.

## Trust Boundaries

Termlings is a coordination layer. The real security boundary comes from:

1. the runtime sandbox of Claude Code or Codex
2. the outer OS / container / VM boundary around the runtime
3. your credential handling and browser profile isolation

If you run agents directly on your host with full autonomy, assume those agents can affect the host environment available to them.

## Recommended Modes

From strongest to weakest:

### 1. Dedicated Remote Machine + Docker Workspace

Best current option for serious use.

- Put the whole workspace on a separate machine, VM, or cloud box.
- Run the full [DOCKER.md](DOCKER.md) workflow there.
- Connect with `termlings machine connect <name>` or SSH directly.
- Keep your personal laptop browser, SSH keys, and day-to-day shell outside that machine.

This is the best current Termlings deployment because filesystem access, browser state, and long-lived auth all stay off your normal machine.

### 2. Local Full Docker Workspace

Good when you want strong local isolation without moving to a remote machine.

- Use the full Docker workspace from [DOCKER.md](DOCKER.md).
- Keep projects, browser state, and runtime auth inside Docker volumes.
- Prefer this over host-native YOLO sessions.

### 3. Host Workspace + Docker-Isolated Agent Spawn

Best low-friction hardening path.

```bash
termlings --spawn --docker
```

or:

```bash
termlings spawn --all --docker
```

This keeps the operator TUI on the host, but runs spawned agents inside Docker with:

- the project mounted as `/workspace`
- an isolated runtime home under `~/.termlings/docker-spawn/...`
- a small host env allowlist
- copied Claude/Codex auth into that isolated runtime home

This is substantially safer than host-native spawn, but it is still not as strong as a dedicated remote machine or a full Docker workspace.

### 4. Host-Native Spawn

Least secure mode.

```bash
termlings --spawn
```

This is still useful, but it should be treated as convenience mode, not hardened mode.

Termlings now asks for confirmation before starting host-native routes that include dangerous YOLO flags. Use `--allow-host-yolo` only when you intentionally want to bypass that confirmation.

## Runtime Guidance

### Claude Code

Anthropic’s sandboxing guidance is clear: strong sandboxing needs both filesystem and network isolation, enforced at the OS level, and write exceptions should be granted narrowly with `sandbox.filesystem.allowWrite` rather than broad exclusions.

Official docs:
- https://code.claude.com/docs/en/sandboxing

Important implications for Termlings:

- If your Claude preset uses `--dangerously-skip-permissions`, Claude’s own prompt-level permission checks are bypassed.
- In that case, the outer boundary matters much more than the runtime.
- If you want the strongest Claude setup, combine Termlings with either:
  - Claude sandboxing in a carefully configured environment, or
  - Docker / VM / remote-machine isolation around the session

### Codex

Codex exposes explicit sandbox and approval controls. OpenAI documents the common modes as:

- `read-only`
- `workspace-write`
- `danger-full-access`

and approval policies like:

- `untrusted`
- `on-request`
- `never`

Official docs:
- https://developers.openai.com/codex/concepts/sandboxing

Important implications for Termlings:

- `danger-full-access` + `never` is effectively full autonomy with no runtime boundary.
- `workspace-write` + `on-request` is a much safer default when you do not need YOLO mode.
- If you create custom Termlings spawn routes, prefer narrower Codex presets unless you are already isolating the session with Docker or a remote machine.

## Credential Handling

The biggest real-world risk is usually not code edits. It is ambient credentials.

Use these rules:

- Do not run Termlings from a shell stuffed with personal secrets if you can avoid it.
- Prefer scoped project credentials over reusing personal credentials.
- Prefer operator-mediated secret release through requests over broad persistent env exposure.
- Rotate any credentials that were exposed to a risky host-native session.

### Docker Spawn Auth Reuse

`termlings spawn --docker` currently seeds:

- `~/.claude/.credentials.json`
- `~/.codex/auth.json`

into an isolated Docker runtime home on first use.

That is convenient, but remember:

- it is a copy into the sandbox runtime home
- it is not a live sync layer
- those credentials are still sensitive and should be treated like secrets

If you want the strongest setup, use separate project-specific accounts or a dedicated machine for those logins.

## Browser Security

The shared Termlings browser is sensitive because it can hold:

- active cookies
- logged-in sessions
- MFA-completed states
- persistent app access

Current guidance:

- Treat the browser workspace as sensitive state.
- Prefer a dedicated workspace or remote machine for high-value logins.
- Do not use your personal default Chrome profile for Termlings browsing.
- Let agents request human help for logins instead of giving them broad standalone access.

Termlings already uses a dedicated browser profile path and explicitly avoids the normal default Chrome user-data directory.

## Network Security

Today, Docker hardening in Termlings focuses more on filesystem and credential isolation than on strict egress control.

That means:

- `--docker` is useful and worthwhile
- but it is not a full “no exfiltration possible” design

If you want the strongest current setup, use a dedicated remote machine or VM and treat that machine as the network trust boundary.

## API Server

For `termlings --server`:

- keep it on loopback unless you explicitly need remote access
- set `TERMLINGS_API_TOKEN` before any non-loopback bind
- do not use wildcard CORS with token auth

See [SERVER.md](SERVER.md) for the current API auth model.

## Multi-Human / Remote Access

If multiple humans need the same project:

- prefer one remote workspace
- connect to that workspace over SSH
- if possible, run that remote workspace inside Docker

This is safer than sharing one host-local workspace across multiple laptops because it centralizes:

- browser state
- auth state
- agent runtime state
- audit and filesystem boundaries

See [MACHINES.md](MACHINES.md).

## Hardening Checklist

If you want the strongest setup currently available in Termlings:

1. Use a dedicated remote machine or VM.
2. Run the full Docker workspace there.
3. Connect via SSH with `termlings machine connect`.
4. Use separate project-scoped accounts when possible.
5. Keep personal SSH keys, browser profiles, and shell history off that machine.
6. Use `termlings request ...` for sensitive human actions instead of giving agents ambient access.
7. Keep `termlings --server` loopback-only unless you have token auth and a reason to expose it.
8. Treat host-native YOLO spawn as convenience mode, not secure mode.

## Current Limitations

Be explicit about what Termlings does not guarantee today:

- `termlings --spawn` without `--docker` is not a hardened sandbox.
- `termlings --spawn --docker` improves isolation, but it does not yet implement strict outbound network allowlists.
- Docker convenience features like auth seeding are helpful, but they still move sensitive credentials into the runtime environment.
- Security posture still depends heavily on where you run the workspace and how you manage credentials.

## Related

- [DOCKER.md](DOCKER.md)
- [SPAWN.md](SPAWN.md)
- [MACHINES.md](MACHINES.md)
- [SERVER.md](SERVER.md)
- https://code.claude.com/docs/en/sandboxing
- https://developers.openai.com/codex/concepts/sandboxing
