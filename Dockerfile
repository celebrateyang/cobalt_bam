FROM node:20-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

FROM base AS build
WORKDIR /app
COPY . /app

RUN corepack enable
RUN apt-get update && \
    apt-get install -y python3 build-essential

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile

RUN pnpm deploy --filter=@imput/cobalt-api --prod /prod/api

FROM base AS api
WORKDIR /app
ARG YTDLP_VERSION=2026.8.19
ENV PATH="/opt/yt-dlp/bin:$PATH"

# 安装 curl
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        fontconfig \
        fonts-noto-core \
        fonts-noto-cjk \
        python3 \
        python3-venv \
        unzip \
        vim && \
    python3 -m venv /opt/yt-dlp && \
    /opt/yt-dlp/bin/pip install --no-cache-dir "yt-dlp==${YTDLP_VERSION}" && \
    fc-cache -f && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /prod/api /app
COPY --from=build /app/.git /app/.git

EXPOSE 80
CMD [ "node", "src/cobalt" ]
