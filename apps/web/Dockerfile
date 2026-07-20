# syntax=docker/dockerfile:1
# Build context = repo root:  docker build -f apps/web/Dockerfile .

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS build
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @velo/web...
COPY packages/types packages/types
COPY apps/web apps/web
# Baked into client JS at build time (display/banner only; SSE reads it at
# runtime server-side, so the runtime env var matters too)
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
# Sentry DSN baked into the client bundle at build. Empty = Sentry disabled
# (off by default for self-hosted). Set to your own project DSN to opt in.
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
# App version, baked into the client bundle. Correct to bake — it IS this
# image's immutable tag. Defaults to "dev" for local/untagged builds.
ARG NEXT_PUBLIC_APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
# SENTRY_AUTH_TOKEN intentionally absent — source-map upload is skipped
RUN pnpm --filter @velo/web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S velo && adduser -S velo -G velo
WORKDIR /app
# Monorepo standalone layout: traced output nests the app at apps/web/
COPY --from=build --chown=velo:velo /app/apps/web/.next/standalone ./
COPY --from=build --chown=velo:velo /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=velo:velo /app/apps/web/public ./apps/web/public
USER velo
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
