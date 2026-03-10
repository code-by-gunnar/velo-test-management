---
phase: 03-test-runs-and-dashboard
plan: "02"
subsystem: api
tags: [runs, crud, snapshot, integration-tests, TR-01, TR-06, TR-07, DA-03]
dependency_graph:
  requires: [03-01]
  provides: [runs-crud-api, execution-history, rerun-failures]
  affects: [03-03, 03-04, 03-05]
tech_stack:
  added: []
  patterns:
    - withWorkspace for all tenant-scoped run queries
    - reply.send() after withWorkspace (never inside)
    - tx.unsafe() with UUID-validated params for all run queries
    - case_title snapshot on run_items at creation time (Pitfall 6 prevention)
key_files:
  created:
    - apps/api/src/routes/runs.ts
    - apps/api/src/routes/__tests__/runs.test.ts
  modified:
    - apps/api/src/server.ts
decisions:
  - "result=null sentinel from withWorkspace signals 400 (no cases found), checked after transaction"
  - "POST /runs returns item_count in response body for immediate UI feedback"
  - "Abort endpoint returns {status: aborted} not 204 for client confirmation"
  - "RLS isolation test uses route-level 403 guard (URL workspace mismatch) — dev velo role is superuser and bypasses RLS at DB layer"
  - "Rerun-failures snapshots case_title from live test_cases at rerun creation time"
metrics:
  duration_minutes: 25
  completed_date: "2026-03-10"
  tasks_total: 2
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 3 Plan 02: Runs CRUD API Summary

Runs CRUD API with case snapshot on creation, stats aggregation on list/detail, abort flow, rerun-failures, and execution history. Integration tests for TR-01, DA-03, TR-06, TR-07.

## What Was Built

`apps/api/src/routes/runs.ts` — a FastifyPluginAsync with 6 endpoints:

| Endpoint | Requirement | Status |
|----------|-------------|--------|
| POST /api/workspaces/:wid/runs | TR-01 | Done |
| GET /api/workspaces/:wid/runs | DA-03 | Done |
| GET /api/workspaces/:wid/runs/:runId | DA-03 | Done |
| PATCH /api/workspaces/:wid/runs/:runId/abort | TR-01 | Done |
| POST /api/workspaces/:wid/runs/:runId/rerun-failures | TR-07 | Done |
| GET /api/workspaces/:wid/test-cases/:caseId/history | TR-06 | Done |

All endpoints follow the architecture rules: withWorkspace for every tenant query, reply.send() after withWorkspace, UUID-validated params for tx.unsafe() interpolation.

## Decisions Made

- **result=null sentinel**: `withWorkspace` returns null when no cases match scope. Checked after the transaction to send 400. Follows the established pattern from test-cases.ts.
- **item_count in response**: POST /runs response includes item_count for immediate UI feedback without a second request.
- **Abort returns body**: PATCH /runs/:id/abort returns `{ status: "aborted" }` rather than 204 — clearer for client confirmation.
- **RLS isolation test approach**: Dev `velo` DB role is a superuser which bypasses RLS policies. Integration tests verify isolation via the route-level 403 guard (URL workspace mismatch) rather than expecting RLS to filter queries — consistent with suites.test.ts pattern.
- **Rerun-failures case_title**: Snapshots case_title from live test_cases at rerun creation time (matches the original creation behavior).

## Test Coverage

19 integration tests passing, 3 todo (SSE — deferred to plan 03-04):

- TR-01: create run active/status, suite scoping, all-cases fallback, case_title snapshot, 400 on empty scope
- DA-03: list with stats, status filter, assigned_to filter, missing project_id 400
- Run detail: GET with items and stats, PATCH abort, 400 on double-abort
- TR-07: rerun-failures creates run from fail items only, 400 on no failures
- TR-06: history across runs, empty for unexecuted case
- Auth/isolation: 401 no session, 403 workspace mismatch

## Deviations from Plan

### Pre-existing Type Errors (Out of Scope)

`defects.test.ts` and `run-items.test.ts` have pre-existing TypeScript errors from Wave 0 (03-01) where the mock Valkey object `{ publish: Mock<Procedure> }` doesn't satisfy the full `Redis` type. These existed before this plan and are not caused by changes here. Deferred to plan 03-03 or 03-04 when those routes are implemented.

### Auto-fixed Issues

None.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| apps/api/src/routes/runs.ts | FOUND |
| apps/api/src/routes/__tests__/runs.test.ts | FOUND |
| .planning/phases/03-test-runs-and-dashboard/03-02-SUMMARY.md | FOUND |
| feat(03-02) commit 6c96295 | FOUND |
| test(03-02) commit 1693377 | FOUND |
