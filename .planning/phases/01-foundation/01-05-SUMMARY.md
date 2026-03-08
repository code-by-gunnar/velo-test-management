---
phase: 01-foundation
plan: "05"
subsystem: api
tags: [postgres, rls, multitenancy, fastify, typescript, workspace]

requires:
  - phase: 01-foundation-plan-02
    provides: Schema with workspace_id on all tenant tables and migration ran
  - phase: 01-foundation-plan-04
    provides: Auth.js v5 session with userId/workspaceId/role in JWT

provides:
  - WorkspaceSql branded type for compile-time tenant query enforcement
  - withWorkspace() helper — opens postgres.js transaction, SET LOCAL app.workspace_id
  - PostgreSQL RLS policies on all tenant tables (workspace_isolation)
  - POST /api/workspaces — create workspace + admin membership
  - GET /api/workspaces/:slug — fetch workspace
  - PATCH /api/workspaces/:id/slug — rename slug once (admin only)
  - POST /api/workspaces/:workspaceId/projects — create project with Free tier limit
  - GET /api/workspaces/:workspaceId/projects — list projects
  - POST /api/workspaces/:workspaceId/seed — idempotent sample data seeder
  - session.plugin.ts — decodes Auth.js cookie, decorates request with userId/workspaceId/userRole
  - Integration tests for SET LOCAL runtime behaviour and RLS cross-workspace isolation

affects:
  - All future phases using tenant-scoped queries (must use withWorkspace)
  - Phase 2 (Test Cases) — project routes consumed immediately
  - Phase 6 (Team and Access) — workspace membership routes build on this

tech-stack:
  added:
    - "@fastify/cookie ^10" — reads authjs.session-token cookie in session plugin
  patterns:
    - withWorkspace(id, fn) wraps ALL tenant queries — never query tenant tables with bare sql
    - WorkspaceSql brand enforced at TypeScript compile time via unique symbol
    - SET LOCAL app.workspace_id scoped to transaction — cleared on commit/rollback
    - RLS policies use current_setting('app.workspace_id', true)::uuid — missing_ok=true fails closed
    - sql.begin() tx cast through unknown to Sql type (TransactionSql Omit<> strips call signatures)

key-files:
  created:
    - apps/api/src/db/tenant.ts
    - apps/api/src/db/__tests__/tenant-type.test.ts
    - apps/api/src/db/__tests__/rls.test.ts
    - apps/api/drizzle/0001_rls_policies.sql
    - apps/api/src/routes/workspaces.ts
    - apps/api/src/plugins/session.plugin.ts
  modified:
    - apps/api/src/server.ts
    - apps/api/package.json
    - apps/api/drizzle/meta/_journal.json
    - pnpm-lock.yaml

key-decisions:
  - "WorkspaceSql brands postgres.Sql (not TransactionSql) because TypeScript Omit<> strips call signatures from TransactionSql — tx cast through unknown to WorkspaceSql in withWorkspace"
  - "RLS migration 0001_rls_policies.sql manually added to drizzle journal — drizzle-kit cannot generate RLS DDL; this is a one-time DDL file picked up by programmatic migrator"
  - "Session plugin forwards Auth.js cookie to WEB_URL/api/auth/session for decryption — avoids reimplementing JWE in Fastify with jose"
  - "Free tier limits enforced at API layer (not DB constraints) — 1 project max returns 403 with TIER_LIMIT_EXCEEDED code"
  - "FORCE ROW LEVEL SECURITY on all tenant tables — even table owner is filtered; safe-fail when SET LOCAL not called"

patterns-established:
  - "withWorkspace pattern: ALL tenant-scoped routes use withWorkspace(); bare sql only for non-tenant queries (workspaces table slug check, session membership verification)"
  - "Fail-closed RLS: missing_ok=true means no SET LOCAL = NULL workspace_id = no rows returned"
  - "RLS test requires non-superuser role: document test note that DATABASE_URL_APP must be velo_app (not postgres superuser)"

requirements-completed: [INFRA-05, INFRA-06, WORK-01, WORK-02, WORK-03]

duration: 9min
completed: "2026-03-08"
---

# Phase 1 Plan 5: Multi-tenancy + Workspace Scaffold Summary

**WorkspaceSql branded type + withWorkspace() helper enforce tenant isolation at compile time, PostgreSQL RLS policies (FORCE) on all tenant tables, and workspace/project CRUD API with Free tier limits**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-08T22:16:10Z
- **Completed:** 2026-03-08T22:25:57Z
- **Tasks:** 4 completed
- **Files modified:** 9

## Accomplishments

- WorkspaceSql branded type prevents bare `sql` connection from being passed to tenant functions — TypeScript compile-time enforcement (INFRA-05)
- withWorkspace() opens a postgres.js transaction, calls `SET LOCAL app.workspace_id`, and casts the tx to WorkspaceSql — all tenant queries guaranteed to run inside the correct workspace context
- RLS policies on all 8 tenant tables with FORCE ROW LEVEL SECURITY — fail-closed when SET LOCAL not called (missing_ok=true returns NULL which never matches a workspace_id)
- Workspace + project API routes with Free tier enforcement: POST/GET workspaces, PATCH slug (once), POST/GET projects with 1-project Free tier limit returning 403 TIER_LIMIT_EXCEEDED
- session.plugin.ts decodes Auth.js JWE cookie by forwarding to WEB_URL/api/auth/session, decorating every Fastify request with userId/workspaceId/userRole
- Integration tests: 3 tests for withWorkspace runtime behaviour + 3 tests for RLS cross-workspace isolation

## Task Commits

Each task was committed atomically:

1. **Task 1: WorkspaceSql branded type and withWorkspace helper** - `f8863c8` (feat)
2. **Task 2: PostgreSQL RLS policies migration** - `80033ee` (feat)
3. **Task 3: Workspace/project API routes and session plugin** - `adcaf0f` (feat)
4. **Task 4: RLS cross-workspace isolation integration test** - `752f373` (test)

**Plan metadata:** (docs commit hash — see below)

## Files Created/Modified

- `apps/api/src/db/tenant.ts` — WorkspaceSql branded type and withWorkspace() helper
- `apps/api/src/db/__tests__/tenant-type.test.ts` — Runtime tests for SET LOCAL, post-transaction clearing, invalid UUID rejection
- `apps/api/src/db/__tests__/rls.test.ts` — Cross-workspace isolation integration tests (INFRA-06)
- `apps/api/drizzle/0001_rls_policies.sql` — ENABLE/FORCE RLS + workspace_isolation policies on all 8 tenant tables
- `apps/api/drizzle/meta/_journal.json` — Added 0001_rls_policies entry for programmatic migrator
- `apps/api/src/routes/workspaces.ts` — All workspace and project routes (WORK-01, WORK-02, WORK-03)
- `apps/api/src/plugins/session.plugin.ts` — Auth.js session forwarding plugin
- `apps/api/src/server.ts` — Registered @fastify/cookie, sessionPlugin, workspaceRoutes
- `apps/api/package.json` — Added @fastify/cookie dependency
- `pnpm-lock.yaml` — Updated lockfile

## Decisions Made

- WorkspaceSql brands `postgres.Sql` (not `TransactionSql`) because TypeScript's `Omit<>` strips the template-tag call signature from `TransactionSql`. The cast is `tx as unknown as WorkspaceSql` to satisfy the type system while preserving correct runtime behaviour.
- RLS migration is a manually-authored SQL file registered in the drizzle journal — drizzle-kit cannot generate `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` statements.
- Session plugin forwards the Auth.js JWE cookie to `WEB_URL/api/auth/session` rather than reimplementing JWE decryption with jose — simpler and stays in sync with Auth.js internals automatically.
- FORCE ROW LEVEL SECURITY applied to all tenant tables so the table owner role (used during setup) is also filtered — prevents accidental data leaks during dev.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript WorkspaceSql cast — `TransactionSql` lacks template tag call signatures**
- **Found during:** Task 1 (withWorkspace helper)
- **Issue:** Plan showed `tx as WorkspaceSql` but `TransactionSql` uses `Omit<Sql, ...>` which strips the template literal call signature — TypeScript error TS2349 on `tx\`...\``
- **Fix:** Brand on `postgres.Sql` (not `TransactionSql`); cast inside withWorkspace as `tx as unknown as WorkspaceSql`; cast bare `sql.begin()` tx in workspaces.ts as `rawTx as unknown as Sql`
- **Files modified:** `apps/api/src/db/tenant.ts`, `apps/api/src/routes/workspaces.ts`
- **Verification:** `tsc --noEmit` passes with zero errors
- **Committed in:** `f8863c8` (Task 1), `adcaf0f` (Task 3)

**2. [Rule 1 - Bug] Fixed postgres.js RowList type assertion in rls.test.ts**
- **Found during:** Task 4 (RLS integration test)
- **Issue:** `projects.map((p: { id: string }) => ...)` fails because postgres.js returns `RowList<Row[]>` — `Row` type doesn't expose named fields in TypeScript
- **Fix:** Cast `projects as unknown as Array<{ id: string }>`
- **Files modified:** `apps/api/src/db/__tests__/rls.test.ts`
- **Verification:** `tsc --noEmit` passes
- **Committed in:** `752f373` (Task 4)

**3. [Rule 3 - Blocking] Added drizzle journal entry for RLS migration**
- **Found during:** Task 2 (RLS migration)
- **Issue:** Manually-created SQL files are not auto-picked up by drizzle programmatic migrator without a journal entry
- **Fix:** Added `0001_rls_policies` entry to `drizzle/meta/_journal.json`
- **Files modified:** `apps/api/drizzle/meta/_journal.json`
- **Verification:** Journal updated; migrator will apply in order on next startup
- **Committed in:** `80033ee` (Task 2)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes necessary for correct TypeScript compilation and migration execution. No scope creep.

## Issues Encountered

- pnpm CLI not on PATH — used `npx pnpm@9` to install `@fastify/cookie`. pnpm install recreated the virtual store first, then added the package. Added 3 minutes to execution.

## User Setup Required

**Database role:** The RLS integration tests and production app require a non-superuser database role. Superusers bypass RLS — tests with a superuser connection give false positives. Create the `velo_app` role using the SQL in `0001_rls_policies.sql` comments, and set `DATABASE_URL_APP` to use that role for RLS tests.

## Next Phase Readiness

- Multi-tenancy foundation complete: compile-time enforcement (WorkspaceSql) + runtime enforcement (RLS + withWorkspace) both active
- Workspace and project APIs ready for Phase 2 (Test Cases) to consume
- All 5 requirements for this plan delivered: INFRA-05, INFRA-06, WORK-01, WORK-02, WORK-03
- RLS tests require `velo_app` non-superuser role for meaningful coverage — document in CI setup

---
*Phase: 01-foundation*
*Completed: 2026-03-08*
