# syntax=docker/dockerfile:1
# Build context = repo root:  docker build -f apps/api/Dockerfile .

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS build
# Manifests first — install layer is cached until a dependency changes
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @velo/api...
COPY packages/types packages/types
COPY apps/api apps/api
RUN pnpm --filter @velo/api build
# Pruned prod node_modules only. pnpm deploy packs per .gitignore, which
# excludes dist/ — build output and migrations are copied explicitly below.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm --filter @velo/api deploy --prod /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S velo && adduser -S velo -G velo
WORKDIR /app
COPY --from=build --chown=velo:velo /out/node_modules ./node_modules
COPY --from=build --chown=velo:velo /out/package.json ./package.json
# server.js resolves migrations at ../drizzle relative to dist/ — keep siblings
COPY --from=build --chown=velo:velo /app/apps/api/dist ./dist
COPY --from=build --chown=velo:velo /app/apps/api/drizzle ./drizzle
USER velo
EXPOSE 3001
CMD ["node", "--import", "./dist/instrument.js", "dist/server.js"]
