import type { RequestHandler } from './$types';
import { getLatestTermlingsVersion } from '$lib/server/termlings-version';

function buildDockerScript(termlingsVersion: string): string {
  return `#!/bin/sh
set -eu

INSTALL_DIR="\${TERMLINGS_DOCKER_DIR:-$HOME/termlings-docker}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd docker

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

seed_file() {
  src="$1"
  dest="$2"
  label="$3"

  if [ ! -f "$src" ]; then
    return 1
  fi

  docker compose exec -T --user root termlings sh -lc \
    "mkdir -p \"$(dirname "$dest")\" && cat > \"$dest\" && chown termlings:termlings \"$dest\" && chmod 600 \"$dest\"" \
    < "$src"

  echo "Seeded $label auth into Docker workspace."
  return 0
}

cat > Dockerfile <<'EOF'
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \\
  bash \\
  ca-certificates \\
  chromium \\
  curl \\
  git \\
  gosu \\
  less \\
  procps \\
  ripgrep \\
  unzip \\
  xz-utils \\
  && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash termlings

ENV HOME=/home/termlings
ENV TERM=xterm-256color
ENV COLORTERM=truecolor
ENV BUN_INSTALL=/opt/bun
ENV NPM_CONFIG_PREFIX=/home/termlings/.npm-global
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PATH=/home/termlings/.local/bin:/home/termlings/.npm-global/bin:/opt/bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN curl -fsSL https://bun.sh/install | env BUN_INSTALL=/opt/bun bash \\
  && ln -sf /opt/bun/bin/bun /usr/local/bin/bun \\
  && ln -sf /opt/bun/bin/bunx /usr/local/bin/bunx

USER termlings
RUN mkdir -p /home/termlings/.npm-global /home/termlings/.local/bin
RUN npm install -g @openai/codex agent-browser termlings@${termlingsVersion}
RUN curl -fsSL https://claude.ai/install.sh | bash

USER root
WORKDIR /workspace
COPY docker-entrypoint.sh /usr/local/bin/termlings-docker-entrypoint
RUN chmod +x /usr/local/bin/termlings-docker-entrypoint

ENTRYPOINT ["termlings-docker-entrypoint"]
CMD ["sleep", "infinity"]
EOF

cat > docker-compose.yml <<'EOF'
services:
  termlings:
    build:
      context: .
      dockerfile: Dockerfile
    init: true
    stdin_open: true
    tty: true
    working_dir: /workspaces
    command: ["sleep", "infinity"]
    environment:
      HOME: /home/termlings
      TERM: xterm-256color
      COLORTERM: truecolor
      BUN_INSTALL: /opt/bun
      NPM_CONFIG_PREFIX: /home/termlings/.npm-global
      AGENT_BROWSER_EXECUTABLE_PATH: /usr/bin/chromium
    volumes:
      - termlings-workspaces:/workspaces
      - termlings-claude:/home/termlings/.claude
      - termlings-codex:/home/termlings/.codex
      - termlings-agent-browser:/home/termlings/.agent-browser
    shm_size: "2gb"

volumes:
  termlings-workspaces:
  termlings-claude:
  termlings-codex:
  termlings-agent-browser:
EOF

cat > docker-entrypoint.sh <<'EOF'
#!/bin/sh
set -eu

mkdir -p \\
  "$HOME/.claude" \\
  "$HOME/.codex" \\
  "$HOME/.agent-browser" \\
  /workspaces

chown termlings:termlings \\
  "$HOME/.claude" \\
  "$HOME/.codex" \\
  "$HOME/.agent-browser" \\
  /workspaces

if [ "$#" -eq 0 ]; then
  set -- sleep infinity
fi

exec gosu termlings "$@"
EOF

cat > docker-shell <<'EOF'
#!/bin/sh
set -eu

cd "$(dirname "$0")"
exec docker compose exec --user termlings termlings bash "$@"
EOF

chmod +x docker-entrypoint.sh docker-shell

echo
echo "Writing Docker workspace to: $INSTALL_DIR"
echo "Building image and starting container..."
docker compose up -d --build

if [ "\${TERMLINGS_DOCKER_SKIP_AUTH_SEED:-0}" != "1" ]; then
  seed_file "$HOME/.claude/.credentials.json" "/home/termlings/.claude/.credentials.json" "Claude" || true
  seed_file "$HOME/.codex/auth.json" "/home/termlings/.codex/auth.json" "Codex" || true
fi

echo
echo "Termlings Docker workspace is ready."
echo
echo "Open a shell later with:"
echo "  cd \"$INSTALL_DIR\" && ./docker-shell"
echo
echo "First-time inside the container:"
echo "  claude auth login"
echo "  codex login"
echo "  cd /workspaces"
echo "  mkdir my-project && cd my-project"
echo "  termlings init"
echo

if [ -t 0 ] && [ -t 1 ] && [ "\${TERMLINGS_DOCKER_NO_SHELL:-0}" != "1" ]; then
  echo "Opening Docker shell..."
  exec docker compose exec --user termlings termlings bash
fi
`;
}

export const GET: RequestHandler = async ({ fetch, setHeaders }) => {
  const latestVersion = await getLatestTermlingsVersion(fetch);

  setHeaders({
    'cache-control': 'public, max-age=300'
  });

  return new Response(buildDockerScript(latestVersion), {
    headers: {
      'content-type': 'text/x-shellscript; charset=utf-8'
    }
  });
};
