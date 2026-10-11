# Rhenko in a container.
#
#   docker build -t rhenko .
#   docker run -p 3000:3000 -v rhenko-data:/app/data -v rhenko-backups:/app/backups rhenko
#
# Everything the app keeps (the database, the uploads and the server key) lives in /app/data, so mount a volume
# there. /app/backups is where scripts/backup.mjs writes, so mount that too or the backups go when the container does.
# The app runs as the unprivileged "node" user, which must be able to write to both; docker-compose.yml takes care of
# that for the ./data and ./backups folders. The build downloads the Sora font from Google Fonts, so it needs network access.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && rm -rf .next/cache

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    RHENKO_DATA_DIR=/app/data \
    RHENKO_BACKUP_DIR=/app/backups
RUN mkdir -p /app/data /app/backups && chown node:node /app /app/data /app/backups
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node package.json next.config.ts ./
COPY --chown=node:node scripts ./scripts
USER node
VOLUME ["/app/data", "/app/backups"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
