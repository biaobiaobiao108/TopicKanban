# syntax=docker/dockerfile:1.10
# Multi-stage Dockerfile for Topic Kanban Studio (Optimized Multi-Platform Build)

ARG BUN_VERSION=1.4.0
ARG BUN_IMAGE_DIGEST=sha256:07235578f79ef8c6f97d94aee7938e76f5cdba5f21ae5dbfdd3d3d38058437eb

# Stage 1: Build Frontend, Bun server bundle and assets on host platform
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION}-alpine@${BUN_IMAGE_DIGEST} AS builder
WORKDIR /app

# Cache dependencies
COPY package.json bun.lock .npmrc* ./
RUN bun install --frozen-lockfile --ignore-scripts

# Copy source code and build production assets
COPY . .
RUN bun run build

# Stage 2: Ultra-slim Production Runner
FROM oven/bun:${BUN_VERSION}-alpine@${BUN_IMAGE_DIGEST} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3030
ENV DATA_DIR=/app/data

# Prepare the persistent data directory for the default root runtime user.
RUN mkdir -p /app/data

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
