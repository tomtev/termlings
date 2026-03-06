# Docker Workspace

Run Termlings as a full Docker-native workspace with its own shell, auth, browser runtime, and project workspaces.

## Hosted Bootstrap

```bash
bash <(curl -fsSL https://termlings.com/docker.sh)
```

This writes a local control directory at `~/termlings-docker`, builds the image, starts the container, and opens a shell inside it.

If you already have host auth on your machine, the hosted bootstrap will also seed:

- `~/.claude/.credentials.json`
- `~/.codex/auth.json`

into the container volumes automatically when those files exist.

## Repo-Local Bootstrap

From this repo:

```bash
docker compose up -d --build
./scripts/docker-seed-auth.sh
./scripts/docker-shell
```

Use the repo-local setup when you want to validate the checked-in Docker files directly.

## Included Tools

The Docker workspace installs the real CLIs directly:

- `termlings`
- `claude`
- `codex`
- `agent-browser`
- system `chromium`
- Bun
- Node.js / npm
- Git and common terminal tools

It does not depend on host-side wrapper scripts such as `.superset/bin/*`.

## Persisted State

State is kept in Docker volumes instead of bind-mounting your host repo by default.

Persisted paths:

- `/workspaces`
- `/home/termlings/.claude`
- `/home/termlings/.codex`
- `/home/termlings/.agent-browser`

This keeps projects, auth, and browser state inside Docker.

## First-Time Setup

Inside the container:

```bash
claude auth login
codex login
cd /workspaces
mkdir my-project
cd my-project
termlings init
termlings --spawn
```

`termlings init` requires at least one installed and authenticated coding runtime. The Docker image preinstalls both `claude` and `codex`, so only login is needed.

If interactive `claude auth login` hangs inside Docker after you finish auth in the browser, seed host auth instead:

```bash
./scripts/docker-seed-auth.sh
```

That copies your existing host Claude and Codex auth files into the container volumes.

## Browser Runtime

The Termlings browser CLI uses `agent-browser`, so the Docker image includes it and points it at system Chromium:

```bash
AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
```

That avoids downloading a second bundled browser into the image.

## Runtime Scope

Managed Termlings agent spawning remains Claude-only. Codex is included in the container for manual/operator use and future workflows, not as a spawned Termlings runtime.

## Reopen The Workspace

Hosted bootstrap:

```bash
cd ~/termlings-docker
./docker-shell
```

Repo-local bootstrap:

```bash
./scripts/docker-shell
```

## Optional Overrides

Change the hosted bootstrap control directory:

```bash
TERMLINGS_DOCKER_DIR=/path/to/termlings-docker bash <(curl -fsSL https://termlings.com/docker.sh)
```

Skip auto-opening a shell after the hosted bootstrap finishes:

```bash
TERMLINGS_DOCKER_NO_SHELL=1 bash <(curl -fsSL https://termlings.com/docker.sh)
```

Skip automatic auth seeding from host credentials during the hosted bootstrap:

```bash
TERMLINGS_DOCKER_SKIP_AUTH_SEED=1 bash <(curl -fsSL https://termlings.com/docker.sh)
```

## Stop Or Remove

Stop the repo-local or hosted workspace from its control directory:

```bash
docker compose down
```

Remove the workspace and persisted Docker state:

```bash
docker compose down -v
```
