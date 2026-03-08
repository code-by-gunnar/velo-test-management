---
phase: 01-foundation
plan: "03"
subsystem: infra
tags: [valkey, iovalkey, bullmq, redis, queue, fastify-plugin]

# Dependency graph
requires:
  - phase: 01-foundation plan 01
    provides: Fastify scaffold with cors/helmet, pnpm monorepo
  - phase: 01-foundation plan 02
    provides: postgres.js client pattern established
provides:
  - iovalkey Valkey client (shared connection + worker connection factory)
  - BullMQ email queue with exponential backoff (3 attempts)
  - BullMQ email worker stub (Resend integration deferred to Plan 4)
  - Fastify plugin with graceful shutdown hook
  - Health endpoint reporting Valkey connectivity
  - Integration tests for queue ping, add-job, and job-counts
affects:
  - 01-foundation plan 04 (auth — wires Resend into emailWorker)
  - 01-foundation plan 05 (RLS tests — Valkey used for workspace membership cache)
  - 03-test-runs (SSE per-run-id subscribes to Valkey channel)

# Tech tracking
tech-stack:
  added:
    - iovalkey@0.3.3 (official Valkey fork of ioredis)
    - bullmq@5.70.4 (job queue, BullMQ v5 compatible with iovalkey)
    - fastify-plugin@5.1.0 (plugin encapsulation for Fastify decorators)
  patterns:
    - Separate shared connection (maxRetriesPerRequest=3) from worker connection (maxRetriesPerRequest=null)
    - URL-based BullMQ connection options to avoid iovalkey/ioredis type mismatch
    - Fastify plugin pattern with onClose hook for graceful shutdown
    - Worker stub pattern — Resend integration deferred to auth plan

key-files:
  created:
    - apps/api/src/lib/valkey.ts
    - apps/api/src/queues/email.queue.ts
    - apps/api/src/queues/email.worker.ts
    - apps/api/src/plugins/valkey.plugin.ts
    - apps/api/src/queues/__tests__/email.queue.test.ts
  modified:
    - apps/api/src/server.ts (added valkeyPlugin registration + Valkey health check)
    - apps/api/package.json (added iovalkey, bullmq, fastify-plugin)

key-decisions:
  - "Use URL-based BullMQ connection options (not iovalkey instance) — BullMQ uses ioredis types internally; passing iovalkey instance causes TS type mismatch that cannot be cast without unsafe assertions"
  - "Use relative imports throughout (not @/ path aliases) — tsconfig uses NodeNext module resolution without paths; @/ aliases require both tsconfig paths and vitest resolve.alias configuration"
  - "Worker uses getBullMQWorkerConnectionOptions() factory function, not createWorkerConnection() — BullMQ manages its own internal connection lifecycle when given connection options"

patterns-established:
  - "Valkey pattern: shared valkey instance for get/set/pub; separate worker-specific connection options for BullMQ Workers"
  - "Queue pattern: URL-based connection options passed directly to Queue/Worker constructors, not iovalkey instances"
  - "Plugin pattern: fastify.decorate() + onClose hook for resource cleanup"

requirements-completed: [INFRA-04]

# Metrics
duration: 25min
completed: 2026-03-08
---

# Phase 1 Plan 3: Valkey + BullMQ Summary

**iovalkey Valkey client with BullMQ email queue, Fastify plugin with graceful shutdown, and Valkey health check in the /health endpoint**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-08T21:40:00Z
- **Completed:** 2026-03-08T22:05:00Z
- **Tasks:** 5
- **Files modified:** 8

## Accomplishments

- Valkey client module with shared connection (exponential backoff) and worker connection factory
- BullMQ email queue with 3-attempt exponential backoff; worker stub logging jobs (Resend deferred to Plan 4)
- Fastify plugin decorates `fastify.valkey` and `fastify.emailQueue`; onClose hook ensures graceful shutdown
- Health endpoint updated to ping Valkey and return `services.valkey: ok|error`
- Integration tests for ping, add-job, and queue stats (run in CI against `valkey/valkey:7`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies** - `d2e7fb4` (chore)
2. **Task 2: Valkey client module** - `8764107` (feat)
3. **Task 3: Email queue and worker** - `901aa9a` (feat)
4. **Task 4: Fastify plugin + server update** - `6277799` (feat)
5. **Task 5: Integration tests** - `f774ed2` (test)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified

- `apps/api/src/lib/valkey.ts` - Shared iovalkey client + getBullMQConnectionOptions() helpers
- `apps/api/src/queues/email.queue.ts` - BullMQ Queue with EmailJobData interface
- `apps/api/src/queues/email.worker.ts` - BullMQ Worker stub (Resend wired in Plan 4)
- `apps/api/src/plugins/valkey.plugin.ts` - Fastify plugin with decorators and graceful shutdown
- `apps/api/src/queues/__tests__/email.queue.test.ts` - Integration tests (ping, add-job, stats)
- `apps/api/src/server.ts` - Added valkeyPlugin registration and Valkey health check

## Decisions Made

- **URL-based BullMQ connections:** BullMQ uses ioredis types internally; passing an iovalkey instance as `connection` causes TS2322 type errors that cannot be resolved without `as any` casts. The correct approach is to pass URL-based options (`{ url, maxRetriesPerRequest }`) which satisfy BullMQ's `RedisOptions` type.
- **Relative imports over @/ aliases:** The project's tsconfig uses NodeNext module resolution. Path aliases require both `tsconfig.json` `paths` and `vitest.config.ts` `resolve.alias`. To keep configuration minimal and avoid invisible build failures, relative imports are used throughout.
- **Worker connection via helper function:** `getBullMQWorkerConnectionOptions()` returns a plain options object rather than an iovalkey instance. BullMQ manages the worker connection's full lifecycle internally when given options.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed iovalkey import causing TypeScript construct errors**
- **Found during:** Task 2 (Valkey client module)
- **Issue:** Plan used `import Valkey from "iovalkey"` with `new Valkey()` and `Valkey` as a type annotation. iovalkey exports `Redis` as both default and named export; `typeof import(...)` has no construct signatures under NodeNext resolution.
- **Fix:** Changed to `import { Redis as Valkey } from "iovalkey"` and `import type { Redis } from "iovalkey"` for type annotations.
- **Files modified:** `apps/api/src/lib/valkey.ts`
- **Verification:** `tsc --noEmit` passes with zero errors
- **Committed in:** `6277799` (Task 4 commit, after discovering root cause)

**2. [Rule 1 - Bug] Fixed BullMQ connection type mismatch with iovalkey**
- **Found during:** Task 3 (Email queue and worker)
- **Issue:** Plan passed `valkey` (iovalkey `Redis` instance) as BullMQ `connection`. BullMQ's `ConnectionOptions` type is `IORedis.Redis | IORedis.Cluster | RedisOptions | ClusterOptions`. iovalkey's `Redis` class is structurally incompatible with ioredis's `Redis` type (missing internal methods).
- **Fix:** Added `getBullMQConnectionOptions()` and `getBullMQWorkerConnectionOptions()` factory functions in `valkey.ts` that return plain `{ url, ... }` objects satisfying BullMQ's `RedisOptions` type. Updated queue and worker to use these.
- **Files modified:** `apps/api/src/lib/valkey.ts`, `apps/api/src/queues/email.queue.ts`, `apps/api/src/queues/email.worker.ts`
- **Verification:** `tsc --noEmit` passes across full monorepo
- **Committed in:** `6277799` (Task 4 commit)

**3. [Rule 3 - Blocking] Used relative imports instead of @/ path aliases**
- **Found during:** Task 2 (creating queue/plugin files with @/ imports)
- **Issue:** Plan specified `import { valkey } from "@/lib/valkey"` but tsconfig has no `paths` and vitest.config.ts has no `resolve.alias`. NodeNext resolution would fail at runtime.
- **Fix:** All imports use relative paths (e.g., `"../lib/valkey.js"`) with explicit `.js` extensions for NodeNext ESM compliance.
- **Files modified:** All new source files in this plan
- **Verification:** `tsc --noEmit` passes; vitest runs without module resolution errors
- **Committed in:** Each task's individual commit

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes required for TypeScript compilation and runtime correctness. No scope creep — the same functionality was delivered using compatible patterns.

## Issues Encountered

- Integration tests (Task 5) cannot run locally — Valkey not available in dev environment. Tests fail with `MaxRetriesPerRequestError` as expected. They are designed to run in CI where `valkey/valkey:7` is provisioned as a service container. CI already has `VALKEY_URL=redis://localhost:6379` configured in `ci.yml`.

## User Setup Required

None — Valkey is provisioned via Docker in CI. For local development, run:
```bash
docker run -d -p 6379:6379 valkey/valkey:7
```
`VALKEY_URL=redis://localhost:6379` is already present in `apps/api/.env.example`.

## Next Phase Readiness

- Valkey and BullMQ infrastructure ready for Plan 4 (auth) to wire in Resend email sending
- `fastify.emailQueue` available in all route handlers via Fastify decoration
- `fastify.valkey` available for session caching, rate limiting in auth routes
- Integration tests will validate queue health in every CI run

---
*Phase: 01-foundation*
*Completed: 2026-03-08*
