---
phase: 04-notifications-verification
plan: 02
subsystem: lifecycle-notifications
tags: [email, lifecycle, bullmq, fire-and-forget]
dependency_graph:
  requires: [04-01]
  provides: [lifecycle-email-wiring]
  affects: [lifecycle-routes, erasure-routes, lifecycle-worker]
tech_stack:
  added: []
  patterns: [fire-and-forget-async, pre-cascade-email-collection]
key_files:
  modified:
    - apps/api/src/queues/lifecycle.queue.ts
    - apps/api/src/routes/lifecycle.ts
    - apps/api/src/routes/erasure.ts
    - apps/api/src/queues/lifecycle.worker.ts
decisions:
  - Completion emails sent synchronously in worker (not fire-and-forget) since worker can tolerate the latency
  - Warning jobs use entityId (workspaceId or userId) to generalize the lifecycle-warning type
  - Removed unused WEB_URL from workspace-delete completion block (lint compliance)
metrics:
  duration: 5m
  completed: 2026-03-12
---

# Phase 04 Plan 02: Lifecycle Email Notification Wiring Summary

Wire lifecycle email notifications into request routes and worker completion handlers -- three touchpoints per event (acknowledged, warning, completion) using sendLifecycleEmails and delayed BullMQ warning jobs.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Add lifecycle-warning job type | 44949c5 | Extended LifecycleJobData union type |
| 2 | Workspace deletion notifications | 133feac | Fire-and-forget member emails + warning job enqueue + cancel cleanup |
| 3 | User erasure notifications | cd8d8f8 | Fire-and-forget erasure ack email + warning job enqueue + cancel cleanup |
| 4 | Worker warning + completion handlers | cc35f9c | Completion emails before destructive ops + lifecycle-warning case handler |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed postgres.js Row type inference in lifecycle.ts**
- **Found during:** Task 2
- **Issue:** Inline type annotation `(m: { email: string })` not assignable to postgres.js `Row` type in `.map()` callback
- **Fix:** Used generic `sql<{ email: string }[]>` syntax on the query instead of inline assertion
- **Files modified:** apps/api/src/routes/lifecycle.ts
- **Commit:** 133feac

**2. [Rule 1 - Bug] Removed unused WEB_URL in workspace-delete completion block**
- **Found during:** Task 4 (lint)
- **Issue:** `WEB_URL` declared but not used in workspace-deletion-completed email payload (only needs workspaceName)
- **Fix:** Removed the unused variable declaration
- **Files modified:** apps/api/src/queues/lifecycle.worker.ts
- **Commit:** cc35f9c

## Verification

- `pnpm typecheck` passes (zero errors)
- `eslint --max-warnings 0` passes (zero errors/warnings)
- `sendLifecycleEmails` present in lifecycle.ts, erasure.ts, lifecycle.worker.ts
- `lifecycle-warning` type present in lifecycle.queue.ts
- Warning job enqueued and removed in both lifecycle.ts and erasure.ts

## Self-Check: PASSED
