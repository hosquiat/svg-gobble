# Build stage for client
FROM node:20-alpine AS client-builder

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./

# Install client dependencies
RUN npm install

# Copy client source files
COPY client/ ./

# Build client
RUN npm run build

# Build stage for server
FROM node:20-alpine AS server-builder

WORKDIR /app

# Copy server package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy server source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy server package files
COPY package*.json ./

# Install production dependencies + Prisma CLI (needed for migrations)
RUN npm install --omit=dev && \
    npm install prisma && \
    npm cache clean --force

# Copy Prisma schema and seed
COPY prisma ./prisma

# Generate Prisma client in runtime
RUN npx prisma generate

# Copy compiled server JavaScript from builder
COPY --from=server-builder /app/dist ./dist

# Copy client build from client-builder
COPY --from=client-builder /app/client/dist ./client/dist

# Copy entrypoint script
COPY scripts/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create data and backup directories and set permissions
RUN mkdir -p /app/prisma/data /app/backups && \
    chown -R nodejs:nodejs /app

# Volumes for persistent data
VOLUME /app/prisma/data
VOLUME /app/backups

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:./data/svg-gobble.db"

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]
