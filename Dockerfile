# Rhenko in a container. The app keeps no state of its own: the data is in Postgres and the uploads are in Cloudflare R2.
# docker-compose.yml runs it with Postgres, Caddy for HTTPS and the database backups. To run the image alone:
#
#   docker build -t rhenko .
#   docker run --env-file .env -p 3000:3000 rhenko
#
# /app/data holds the server key only when RHENKO_SECRET is not set, so it is a volume. The build needs network access
# only to install packages; the Sora font is in the repository.

FROM node:22.22.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.22.0-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22.22.0-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && rm -rf .next/cache

FROM node:22.22.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    RHENKO_DATA_DIR=/app/data \
    NODE_OPTIONS=--max-semi-space-size=64
# ffmpeg rewrites each uploaded video without its location, device and time details, and cuts a trimmed one down to the part
# chosen, with ffprobe from the same package (lib/video-metadata.ts). A video is refused when they are missing.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /app/data && chown node:node /app /app/data
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node package.json next.config.ts server.mjs ./
COPY --chown=node:node scripts ./scripts
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.mjs"]
