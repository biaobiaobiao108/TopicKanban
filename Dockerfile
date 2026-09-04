# syntax=docker/dockerfile:1.10
# Multi-stage Dockerfile for Topic Kanban Studio (Optimized Multi-Platform Build)

ARG BUN_VERSION=1.4.1
ARG BUN_IMAGE_DIGEST=sha256:2ef545220f7a886f22fcb3f2309bbd6bcf1c0aa04b7d79c31765c7aa4a13aac1

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
