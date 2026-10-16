# ==============================================================================
# Build Stage: Compile TypeScript into optimized Node.js distribution
# ==============================================================================
FROM node:26-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma/ ./prisma/
COPY prisma.config.ts ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev && npm cache clean --force

# ==============================================================================
# Production Runtime Stage: Minimized footprint for AWS ECS Fargate
# ==============================================================================
FROM node:26-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=8080

RUN apk add --no-cache wget curl

COPY package*.json ./
COPY prisma/ ./prisma/
COPY prisma.config.ts ./

# Production deps (including the generated Prisma client) from the builder
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy compiled JavaScript output
COPY --from=builder /usr/src/app/dist ./dist

# Copy SQL migrations required at runtime for tenant provisioning
COPY src/db/migrations ./dist/db/migrations
COPY src/db/migrations ./src/db/migrations

# Create non-root application user for ECS security posture
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/server.js"]
