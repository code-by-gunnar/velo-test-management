---
phase: 01-foundation
plan: "01"
subsystem: infra
tags: [pnpm, monorepo, nextjs, fastify, github-actions, railway, typescript, tailwind, vitest]

# Dependency graph
requires: []
provides:
  - pnpm monorepo with apps/web (Next.js 16 Pages Router) and apps/api (Fastify 5)
  - packages/types shared TypeScript type stubs
  - GitHub Actions CI with lint/typecheck/test on every PR
  - PostgreSQL 16 + Valkey 7 service containers in CI
  - velo_app non-superuser role pre-created for RLS tests in CI
  - Railway autodeploy gated on CI via "Wait for CI" setting
affects: [02-test-cases, 03-test-runs, 04-ci-ingestion, 05-integrations, 06-team-access]

# Tech tracking
tech-stack:
  added:
    - pnpm 9 workspaces
    - Next.js 16 (Pages Router only)
    - React 19
    - Fastify 5 with @fastify/cors and @fastify/helmet
    - TypeScript 5.7
    - Tailwind CSS 3.4
    - Vitest 2
    - eslint-config-next 16 flat config
    - @typescript-eslint 8
  patterns:
    - "All apps extend tsconfig.base.json (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)"
    - "Fastify bound to host '::' for Railway dual-stack IPv4/IPv6 compatibility"
    - "vitest passWithNoTests=true so CI passes before tests are written"
    - "eslint-config-next v16 exports flat config array directly — no FlatCompat needed"

key-files:
  created:
    - pnpm-workspace.yaml
    - package.json (root)
    - tsconfig.base.json
    - .gitignore
    - .npmrc
    - packages/types/src/index.ts
    - apps/web/package.json
    - apps/web/next.config.ts
    - apps/web/eslint.config.mjs
    - apps/web/vitest.config.ts
    - apps/web/src/pages/_app.tsx
    - apps/web/src/pages/index.tsx
    - apps/api/package.json
    - apps/api/src/server.ts
    - apps/api/vitest.config.ts
    - apps/api/eslint.config.mjs
    - .github/workflows/ci.yml
    - pnpm-lock.yaml
  modified: []

key-decisions:
  - "eslint-config-next v16 flat config imported directly (no FlatCompat) — FlatCompat causes circular JSON error with ESLint 9"
  - "vitest passWithNoTests=true on both apps — CI must pass before test files are written in later plans"
  - "jsdom added as explicit devDependency in apps/web — vitest jsdom environment requires it installed separately"

patterns-established:
  - "Monorepo pattern: apps/* for deployable services, packages/* for shared code"
  - "tsconfig inheritance: all apps extend tsconfig.base.json"
  - "Railway compatibility: Fastify host='::' dual-stack binding"

requirements-completed: [INFRA-01, INFRA-02]

# Metrics
duration: 5min
completed: 2026-03-08
---

# Phase 1 Plan 1: Monorepo + CI/CD Summary

**pnpm monorepo with Next.js 16 Pages Router (apps/web), Fastify 5 (apps/api), shared @velo/types package, and GitHub Actions CI with PostgreSQL 16 + Valkey 7 service containers gated to Railway autodeploy**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-08T21:23:47Z
- **Completed:** 2026-03-08T21:28:54Z
- **Tasks:** 5
- **Files modified:** 18 created + 1 pnpm-lock.yaml

## Accomplishments
- Bootable pnpm monorepo with three workspace packages (apps/web, apps/api, packages/types)
- Next.js 16 Pages Router with Tailwind CSS, ESLint flat config, and Vitest jsdom
- Fastify 5 backend with /health endpoint, CORS, helmet, dual-stack binding for Railway
- GitHub Actions CI: lint/typecheck/test jobs with PostgreSQL 16 + Valkey 7 services and velo_app non-superuser role pre-created for future RLS tests
- All three checks pass locally: pnpm typecheck, pnpm lint, pnpm test

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold pnpm monorepo root + packages/types** - `2371835` (chore)
2. **Task 2: Scaffold Next.js 16 frontend (apps/web)** - `e73ea26` (feat)
3. **Task 3: Scaffold Fastify 5 backend (apps/api)** - `01b0e44` (feat)
4. **Task 4: GitHub Actions CI workflow** - `ae8a52b` (feat)
5. **Task 5: Smoke-test fixes** - `6a0a514` (fix)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified
- `pnpm-workspace.yaml` - workspace globs for apps/* and packages/*
- `package.json` (root) - recursive lint/typecheck/test scripts
- `tsconfig.base.json` - strict TypeScript base all apps extend
- `packages/types/src/index.ts` - PlanTier, WorkspaceRole, ApiError stubs
- `apps/web/package.json` - Next.js 16, React 19, Tailwind, Vitest, jsdom, eslint-config-next
- `apps/web/next.config.ts` - Pages Router only (App Router disabled)
- `apps/web/eslint.config.mjs` - flat config via eslint-config-next v16 direct import
- `apps/web/src/pages/_app.tsx` - minimal App wrapper
- `apps/api/package.json` - Fastify 5, @fastify/cors, @fastify/helmet, Vitest
- `apps/api/src/server.ts` - /health endpoint, dual-stack host "::"
- `.github/workflows/ci.yml` - lint-typecheck + test jobs, velo_app role creation
- `pnpm-lock.yaml` - lockfile

## Decisions Made
- Used eslint-config-next v16 flat config via direct import (not FlatCompat) — FlatCompat with ESLint 9 triggers circular JSON serialization error in the config validator
- Added `passWithNoTests: true` to both vitest configs — CI pipeline must pass before any test files are written; avoids false failure
- Added jsdom as explicit devDependency in apps/web — vitest jsdom environment requires the package installed separately in pnpm's strict isolation mode

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] apps/web ESLint config: FlatCompat circular JSON error**
- **Found during:** Task 5 (smoke-test)
- **Issue:** `eslint.config.mjs` used `FlatCompat` to extend `next/core-web-vitals`, which caused `TypeError: Converting circular structure to JSON` in ESLint 9's config validator
- **Fix:** Replaced `FlatCompat` usage with direct `import nextConfig from "eslint-config-next/core-web-vitals"` — the package already ships a flat config array in v16
- **Files modified:** `apps/web/eslint.config.mjs`, `apps/web/package.json` (removed @eslint/eslintrc)
- **Verification:** `pnpm lint` passes with exit code 0
- **Committed in:** `6a0a514`

**2. [Rule 3 - Blocking] apps/web: missing jsdom dependency**
- **Found during:** Task 5 (smoke-test)
- **Issue:** vitest jsdom environment requires `jsdom` package installed; pnpm strict isolation means it must be explicitly listed
- **Fix:** Added `"jsdom": "^25.0.0"` to `apps/web` devDependencies
- **Files modified:** `apps/web/package.json`
- **Verification:** `pnpm test` passes with exit code 0
- **Committed in:** `6a0a514`

**3. [Rule 3 - Blocking] Both vitest configs: exit code 1 with no test files**
- **Found during:** Task 5 (smoke-test)
- **Issue:** `vitest run` exits with code 1 when no test files found — would fail CI on every PR until tests are written
- **Fix:** Added `passWithNoTests: true` to both `apps/api/vitest.config.ts` and `apps/web/vitest.config.ts`
- **Files modified:** `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`
- **Verification:** `pnpm test` passes with exit code 0
- **Committed in:** `6a0a514`

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking)
**Impact on plan:** All three auto-fixes were necessary for CI to pass. No scope creep — all changes are within the scaffold configuration.

## Issues Encountered
None beyond the three auto-fixed deviations above.

## User Setup Required

**Railway and GitHub require manual one-time setup before first push:**

1. Create GitHub repository and push this branch
2. Create two Railway services:
   - `velo-web`: root dir = `apps/web`, watch path = `apps/web/**`
   - `velo-api`: root dir = `apps/api`, watch path = `apps/api/**,packages/**`
3. Enable "Wait for CI" in each Railway service Settings > Deploy tab
4. Set Railway env vars: `DATABASE_URL`, `VALKEY_URL`, `AUTH_SECRET`, `AUTH_URL`, `RESEND_API_KEY`, `NODE_ENV=production`
5. Open a PR targeting main — confirm "Lint and Type-check" and "Test" jobs appear in GitHub Actions
6. Merge — confirm Railway autodeploy fires
7. Hit Railway API URL `/health` — expect `{"status":"ok"}`

## Next Phase Readiness
- Monorepo scaffold is complete and all local checks pass
- CI pipeline is defined and ready to run on first PR push
- Railway autodeploy is configured (pending manual Railway/GitHub setup above)
- Ready for Plan 02: PostgreSQL schema + Drizzle migrations

## Self-Check: PASSED

All key files present. All 5 task commits verified.

---
*Phase: 01-foundation*
*Completed: 2026-03-08*
