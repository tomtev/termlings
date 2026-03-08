# Machines

`termlings machine` is the SSH entrypoint for shared remote workspaces.

Use it when one Termlings project should live on a remote machine and multiple humans need to connect to that same live workspace.

## Connect

```bash
termlings machine connect <name>
```

This opens your own remote Termlings TUI process over SSH:

- same remote project
- same `.termlings/` state
- same agents
- same browser/profile/auth
- your own terminal session

This is the only machine session mode.

## Setup

Add a normal host-based remote machine:

```bash
termlings machine add hetzner \
  --host 1.2.3.4 \
  --user root \
  --dir /srv/acme
```

Add a remote machine where the shared Termlings workspace runs inside Docker:

```bash
termlings machine add prod \
  --host 1.2.3.4 \
  --user root \
  --dir /srv/termlings \
  --mode docker-workspace \
  --docker-shell ./docker-shell \
  --container-dir /workspaces/acme
```

Optional fields:

```bash
termlings machine add hetzner \
  --host 1.2.3.4 \
  --user root \
  --port 2222 \
  --identity ~/.ssh/id_ed25519 \
  --dir /srv/acme \
  --description "shared production workspace"
```

Inspect saved machines:

```bash
termlings machine list
termlings machine show hetzner
```

## Modes

### `host`

Default mode.

Remote command:

```bash
cd <remote-dir> && termlings
```

Use this when `termlings` is installed directly on the remote machine.

### `docker-workspace`

Remote command:

```bash
cd <remote-dir> && ./docker-shell -lc 'cd <container-dir> && termlings'
```

Use this when the remote machine hosts the full Docker workspace and `docker-shell` is the entrypoint into that container.

## Requirements On The Remote Machine

For `host` mode:

- SSH access
- `termlings` installed on the remote machine
- the remote project directory already exists

For `docker-workspace` mode:

- SSH access
- Docker installed on the remote machine
- the remote control directory already exists
- an executable `docker-shell` helper in that directory, unless you set `--docker-shell`
- the Termlings project path inside the container, or the default `/workspaces/<project>`

Termlings does not provision the remote machine for you.

## Example Workflow

1. Put the project on a remote machine.
2. Choose either direct host install or full Docker workspace.
3. Save the machine locally with `termlings machine add ...`.
4. Use `termlings machine connect <name>` whenever you want a remote TUI session into that shared workspace.

## Print The SSH Command

Use `--print` to inspect the exact SSH command instead of executing it:

```bash
termlings machine connect hetzner --print
```

This is useful for debugging SSH flags, identity files, runtime mode, and the remote command Termlings will run.
