# MillOS SCADA Proxy - Docker Image
# Multi-stage build for minimal image size

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN apk upgrade --no-cache && \
    npm ci --omit=dev && \
    npm cache clean --force && \
    rm -rf \
      /opt/yarn-v* \
      /usr/local/lib/node_modules/corepack \
      /usr/local/lib/node_modules/npm \
      /usr/local/bin/corepack \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/pnpm \
      /usr/local/bin/pnpx \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg

# Copy built files
COPY --from=builder /app/dist ./dist

# Copy configuration files if present
COPY tags.json* ./

# Create non-root user
RUN addgroup -g 1001 -S scada && \
    adduser -S scada -u 1001 -G scada

USER scada

# Expose ports
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Default environment
ENV NODE_ENV=production
ENV PORT=3001
ENV POLL_INTERVAL=1000

# Start the server
CMD ["node", "dist/index.js"]
