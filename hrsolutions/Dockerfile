# -----------------------------------------------------------------------------
# Stage 1: Dependency Installation Stage
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Install libc6-compat for Alpine compatibility
RUN apk add --no-cache libc6-compat

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install dependencies strictly from lockfile
RUN npm ci

# -----------------------------------------------------------------------------
# Stage 2: Build Stage
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment during build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Compile Next.js standalone application
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Production Runtime Stage
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Production environment configuration
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: Add non-root system user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set correct ownership for prerender cache
RUN mkdir .next && chown nextjs:nodejs .next

# Copy standalone build artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose web service port
EXPOSE 3000

# Health check instruction for container orchestration
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start Next.js standalone production server
CMD ["node", "server.js"]
