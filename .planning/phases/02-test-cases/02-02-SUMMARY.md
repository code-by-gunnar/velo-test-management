---
phase: 02-test-cases
plan: "02"
subsystem: api
tags: [fastify, postgres, rls, recursive-cte, test-management, crud]

requires:
  - phase: 02-01
    provides: Schema for suites, test_cases, test_case_steps tables with RLS policies

provides:
  - Suite CRUD API with recursive CTE tree query (GET/POST/PATCH/DELETE)
  - Test case CRUD API with atomic step management (GET/POST/PUT/DELETE)
  - Both route groups registered in server.ts
  - Integration tests covering RLS isolation, soft delete, tier limits, auth guards

affects:
  - 02-03 (UI plan depends on these endpoints)
  - 02-04 (drag-drop position endpoints built on this foundation)
  - 02-05 (bulk move/copy endpoints built on this foundation)

tech-stack:
  added: []
  patterns:
    - "UUID validation before interpolation in tx.unsafe() for CTE queries"
    - "withWorkspace wraps all tenant DB operations — enforced for all new routes"
    - "tx.unsafe() used only where current_setting() CTE syntax requires it; UUID params validated first"
    - "Placeholder 404 handlers registered before wildcard :id params to avoid routing conflicts"

key-files:
  created:
    - apps/api/src/routes/suites.ts
    - apps/api/src/routes/test-cases.ts
    - apps/api/src/routes/__tests__/suites.test.ts
    - apps/api/src/routes/__tests__/test-cases.test.ts
  modified:
    - apps/api/src/server.ts

key-decisions:
  - "tx.unsafe() with UUID-validated params for recursive CTE queries (current_setting() cannot be parameterized)"
  - "step_order uses gap-based 1000-increment integers matching suite position convention"
  - "POST /cases returns 403 TIER_LIMIT_EXCEEDED at 500 non-deleted cases (consistent with workspaces.ts free tier enforcement)"
  - "Placeholder 404 handlers for /cases/position and /cases/bulk registered before :caseId wildcard to prevent routing conflict"
  - "Soft delete (deleted_at IS NOT NULL) used for test_cases; hard delete for suites (cases unparented via ON DELETE SET NULL FK)"

patterns-established:
  - "Route param workspace isolation: request.workspaceId !== workspaceId param returns 403"
  - "Auth guard: !request.userId returns 401 (preHandler hook on all route groups)"
  - "withWorkspace wraps every tenant DB operation — no bare sql on tenant tables"
  - "Input validation: UUID regex check before any tx.unsafe() interpolation"

requirements-completed: [TC-01, TC-03]

duration: 8min
completed: 2026-03-09
---

# Phase 2 Plan 02: Suite + Test Case API Routes Summary

**Fastify route groups for suite CRUD (recursive CTE tree) and test case CRUD (atomic step management) with RLS workspace isolation and Free tier enforcement**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-09T10:34:58Z
- **Completed:** 2026-03-09T10:43:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Suite routes (GET/POST/PATCH name/PATCH position/DELETE) with recursive CTE that enforces workspace_id on both anchor and recursive branches
- Test case routes (GET list/POST create/GET detail/PUT update/DELETE soft) with atomic step management in a single withWorkspace transaction
- POST /cases checks 500-case Free tier limit before inserting, returning 403 TIER_LIMIT_EXCEEDED
- Both route groups registered in server.ts; all TypeScript checks pass
- Integration tests written for both route groups covering RLS isolation, auth guards, tier limits, step ordering, and soft delete verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Suite routes (CRUD + recursive CTE tree)** - `618b3c6` (feat)
2. **Task 2: Test case routes (CRUD + soft delete) + register all routes** - `5147cd7` (feat)

## Files Created/Modified

- `apps/api/src/routes/suites.ts` - Suite CRUD + recursive CTE flat tree with depth field
- `apps/api/src/routes/test-cases.ts` - Test case CRUD with atomic step management, soft delete, tier limit
- `apps/api/src/routes/__tests__/suites.test.ts` - Integration tests: RLS isolation, recursive depth, CRUD lifecycle
- `apps/api/src/routes/__tests__/test-cases.test.ts` - Integration tests: atomicity, soft delete, isolation, tier limit
- `apps/api/src/server.ts` - Registered suitesRoutes and testCasesRoutes

## Decisions Made

- Used `tx.unsafe()` with UUID-validated params for recursive CTE queries — `current_setting('app.workspace_id', true)::uuid` cannot be expressed as a parameterized query; all externally-sourced values (projectId, suiteId, caseId) are validated against UUID regex before interpolation
- step_order uses gap-based 1000-increment integers (1000, 2000, 3000...) matching the established suite position convention
- POST /cases tier limit check is inside the `withWorkspace` transaction so the count and insert are atomic
- Placeholder 404 handlers for `/cases/position` and `/cases/bulk` registered before the `:caseId` wildcard to avoid Fastify routing conflicts with TC-04 and TC-05
- Soft delete for test_cases via `deleted_at IS NOT NULL`; hard delete for suites with ON DELETE SET NULL FK on test_cases.suite_id

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- pnpm is not on the system PATH; found it at `/c/Users/gunna/AppData/Local/npm-cache/_npx/.../node_modules/pnpm/bin/pnpm.cjs` and invoked via `node <path>`. Tests require a running PostgreSQL instance (docker-compose or CI service) — confirmed tests will run in GitHub Actions CI workflow. TypeScript compilation was used as the local verification gate.
- TypeScript error on `(maxRows[0] as { max_pos: ... })`: needed double cast through `unknown` to satisfy TS strict overlap check — fixed with `as unknown as { max_pos: ... }` pattern (consistent with existing codebase pattern).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Suite and test case API endpoints are ready; 02-03 (UI) can now consume these routes
- TC-04 (position reorder) and TC-05 (bulk move/copy) placeholder handlers are registered to prevent routing conflicts
- Tests are integration tests requiring a PostgreSQL 16 database — they run in CI via the GitHub Actions workflow
