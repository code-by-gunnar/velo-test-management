---
phase: "03"
plan: "03"
subsystem: api-runs
tags: [run-items, defects, execution, verdicts, valkey, sse, tr-02, tr-04, tr-05]
dependency_graph:
  requires: [03-01, 03-02]
  provides: [run-items-api, defects-api]
  affects: [03-04-sse, 03-05-execution-ui]
tech_stack:
  added: []
  patterns:
    - fire-and-forget Valkey publish after withWorkspace commit
    - iovalkey Redis type cast for test mocks
key_files:
  created:
    - apps/api/src/routes/run-items.ts
    - apps/api/src/routes/defects.ts
    - apps/api/src/routes/__tests__/run-items.test.ts
    - apps/api/src/routes/__tests__/defects.test.ts
  modified:
    - apps/api/src/server.ts
decisions:
  - Valkey publish is fire-and-forget (.catch(() => {})) — client response must not block on pub/sub latency
  - run_item_step_comments uses UUID v7 PK generated in app layer (not gen_random_uuid())
  - defects.external_id and external_url left NULL — Linear integration deferred to Phase 5
  - Valkey mock typed as `unknown as Redis` in tests — avoids full iovalkey instantiation without test infrastructure
metrics:
  duration: "9m"
  completed_date: "2026-03-10"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 1
---

# Phase 3 Plan 03: Run Items and Defects API Summary

Run Items and Defects API delivering verdict execution, case comments, step annotations, and defect filing — with Valkey publish for SSE fan-out after every verdict.

## What Was Built

### Task 1: Run-items route and Defects route

**`apps/api/src/routes/run-items.ts`** — 4 endpoints:

- `PATCH /api/workspaces/:workspaceId/run-items/:itemId` — Execute item (TR-02): updates status to pass/fail/blocked/skipped, sets executed_by + executed_at, recomputes run status via aggregate (untested count = 0 → completed), publishes to `run:{runId}` Valkey channel fire-and-forget.
- `PATCH /api/workspaces/:workspaceId/run-items/:itemId/comment` — Case-level comment (TR-04): 204 No Content.
- `POST /api/workspaces/:workspaceId/run-items/:itemId/step-comments` — Step annotation (TR-04): validates step_order >= 1 and non-empty comment, inserts into run_item_step_comments, returns 201.
- `GET /api/workspaces/:workspaceId/run-items/:itemId/step-comments` — List step annotations (TR-04): ordered by step_order, created_at.

**`apps/api/src/routes/defects.ts`** — 2 endpoints:

- `POST /api/workspaces/:workspaceId/defects` — File defect (TR-05): validates run_item_id (UUID), title (1-500 chars), inserts with external_id/external_url = NULL (Linear is Phase 5).
- `GET /api/workspaces/:workspaceId/defects` — List defects (TR-05): optional `run_item_id` filter, ordered by created_at DESC.

**`apps/api/src/server.ts`** — Registered both routes after runsRoutes.

### Task 2: Integration tests

**`run-items.test.ts`** — 12 tests covering TR-02 (all 4 verdicts, auto-complete on last untested, invalid status → 400, Valkey publish mock verification) and TR-04 (case comment, step comments CRUD, step_order validation).

**`defects.test.ts`** — 7 tests covering TR-05 (file defect, missing fields → 400, invalid UUID → 400, list all, filter by run_item_id, workspace isolation).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] runs.ts pre-existed from earlier work**

- **Found during:** Task 2 (test setup — run-items tests require creating a run first)
- **Issue:** Plan 03-02 (which creates runs.ts) had already been executed before plan 03-03 was run. The file existed with full implementation.
- **Fix:** Used the existing runs.ts as-is; registered runItemsRoutes + defectsRoutes alongside it.
- **Files modified:** apps/api/src/server.ts

**2. [Rule 3 - Blocking] run_item_step_comments table missing from dev DB**

- **Found during:** Task 2 (test run)
- **Issue:** Migration 0003 was registered in the Drizzle journal but the hash didn't match applied migrations, so `run_item_step_comments` table didn't exist in the dev DB.
- **Fix:** Manually applied the 0003 migration SQL to the dev DB. The migration file is correct; this is a dev-environment-only issue. The fixup in runFixups() in server.ts already handles `case_title` column; the `run_item_step_comments` table is created by the migration itself when it runs fresh.
- **Commit:** Local DB fixup only, not a code change.

**3. [Rule 1 - TypeScript] Valkey mock type cast**

- **Found during:** Typecheck after Task 2
- **Issue:** `app.decorate("valkey", { publish: vi.fn() })` fails typecheck — Fastify's decorate overload expects the full `Redis` type matching the existing decoration.
- **Fix:** Added `import type { Redis } from "iovalkey"` and cast mock as `unknown as Redis`.
- **Files modified:** run-items.test.ts, defects.test.ts

## Self-Check: PASSED

All created files exist on disk. Both task commits verified in git log.

| Check | Result |
|-------|--------|
| apps/api/src/routes/run-items.ts | FOUND |
| apps/api/src/routes/defects.ts | FOUND |
| apps/api/src/routes/__tests__/run-items.test.ts | FOUND |
| apps/api/src/routes/__tests__/defects.test.ts | FOUND |
| Commit 055a774 (task 1) | FOUND |
| Commit f08c8b5 (task 2) | FOUND |
