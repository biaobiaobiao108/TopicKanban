# syntax=docker/dockerfile:1.10
# Multi-stage Dockerfile for Topic Kanban Studio (Optimized Multi-Platform Build)

ARG BUN_VERSION=1.4.2
ARG BUN_IMAGE_DIGEST=sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f

# Stage 1: Build Frontend, Bun server bundle and assets on host platform
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION}-alpine@${BUN_IMAGE_DIGEST} AS builder
WORKDIR /app

# Install dependencies with a persistent BuildKit cache. The lockfile and
# package manifest stay in an earlier layer so source edits do not invalidate
# dependency installation.
COPY --link package.json bun.lock .npmrc ./
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
  bun install --frozen-lockfile --ignore-scripts

# Copy only production build inputs. The .dockerignore provides the matching
# context allowlist so docs, tests, and development artifacts never enter the
# image build.
COPY --link bunfig.toml tsconfig.json index.html tailwind.config.js postcss.config.js ./
COPY --link public ./public
COPY --link src ./src
COPY --link scripts ./scripts
COPY --link drizzle ./drizzle
RUN bun run build

# Stage 2: Ultra-slim Production Runner
FROM oven/bun:${BUN_VERSION}-alpine@${BUN_IMAGE_DIGEST} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3030
ENV DATA_DIR=/app/data

# Copy compiled SPA static files, bundled server, and database migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# Persistent data directory
VOLUME ["/app/data"]

# Keep the image's default user (root) so SQLite can write to bind-mounted data directories.

EXPOSE 3030

# Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3030/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["bun", "dist/server.js"]
