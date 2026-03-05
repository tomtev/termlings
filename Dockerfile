FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
  bash \
  ca-certificates \
  chromium \
  curl \
  git \
  gosu \
  less \
  procps \
  ripgrep \
  unzip \
  xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash termlings

ENV HOME=/home/termlings
ENV TERM=xterm-256color
ENV COLORTERM=truecolor
ENV BUN_INSTALL=/opt/bun
ENV NPM_CONFIG_PREFIX=/home/termlings/.npm-global
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PATH=/home/termlings/.local/bin:/home/termlings/.npm-global/bin:/opt/bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN curl -fsSL https://bun.sh/install | env BUN_INSTALL=/opt/bun bash \
  && ln -sf /opt/bun/bin/bun /usr/local/bin/bun \
  && ln -sf /opt/bun/bin/bunx /usr/local/bin/bunx

WORKDIR /opt/termlings
COPY --chown=termlings:termlings package.json bun.lock /opt/termlings/
COPY --chown=termlings:termlings bin /opt/termlings/bin
COPY --chown=termlings:termlings src /opt/termlings/src
COPY --chown=termlings:termlings templates /opt/termlings/templates
COPY --chown=termlings:termlings scripts /opt/termlings/scripts
RUN chown -R termlings:termlings /opt/termlings

USER termlings
RUN mkdir -p /home/termlings/.npm-global /home/termlings/.local/bin
RUN npm install -g @openai/codex agent-browser
RUN curl -fsSL https://claude.ai/install.sh | bash
RUN bun install --frozen-lockfile

USER root
RUN printf '%s\n' '#!/bin/sh' 'exec bun /opt/termlings/bin/termlings.js "$@"' > /usr/local/bin/termlings \
  && chmod +x /usr/local/bin/termlings
RUN chmod +x /opt/termlings/scripts/docker-entrypoint.sh /opt/termlings/scripts/docker-shell

WORKDIR /workspaces

ENTRYPOINT ["/opt/termlings/scripts/docker-entrypoint.sh"]
CMD ["sleep", "infinity"]
