# Multi-stage Dockerfile for Topic Kanban Studio (Optimized Multi-Platform Build)

# Stage 1: Build Frontend, Bun server bundle and assets on host platform
FROM --platform=$BUILDPLATFORM oven/bun:1.4.0-alpine AS builder
WORKDIR /app

# Cache dependencies
COPY package.json bun.lock .npmrc* ./
RUN bun install --frozen-lockfile --ignore-scripts

# Copy source code and build production assets
COPY . .
RUN bun run build

# Stage 2: Install production dependencies for the target architecture
FROM oven/bun:1.4.0-alpine AS prod-deps
WORKDIR /app

# Install only production dependencies
COPY package.json bun.lock .npmrc* ./
RUN bun install --production --frozen-lockfile

# Stage 3: Ultra-slim Production Runner
FROM oven/bun:1.4.0-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json

# Copy compiled SPA static files, bundled server, and database migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# Persistent data directory
VOLUME ["/app/data"]

EXPOSE 3000

# Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["bun", "dist/server.js"]
