# ==============================================================================
# Build Stage: Compile TypeScript into optimized Node.js distribution
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma/ ./prisma/
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx prisma generate
RUN npm run build

# ==============================================================================
# Production Runtime Stage: Minimized footprint for AWS ECS Fargate
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=8080

RUN apk add --no-cache wget curl

COPY package*.json ./
COPY prisma/ ./prisma/
RUN npm ci --only=production && npm cache clean --force
RUN npx prisma generate

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
