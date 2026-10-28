# MillOS SCADA Proxy - Docker Image
# Multi-stage build for minimal image size

# Build stage
FROM node:22.23.4-alpine AS builder

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
FROM node:22.23.4-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

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
