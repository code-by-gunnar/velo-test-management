---
phase: 11
plan: "01"
subsystem: api
tags: [gwt, bdd, schema, migration, api]
dependency_graph:
  requires: []
  provides: [GWT-01, GWT-02, GWT-03, GWT-04, GWT-05, GWT-06]
  affects: [projects, test_case_steps, workspaces-routes, test-cases-routes]
tech_stack:
  added: []
  patterns: [backwards-compatible ALTER TABLE with DEFAULT, Drizzle migration journal timestamp ordering]
key_files:
  created:
    - apps/api/drizzle/0010_gwt_support.sql
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/routes/workspaces.ts
    - apps/api/src/routes/test-cases.ts
    - apps/api/drizzle/meta/_journal.json
decisions:
  - "Migration journal 'when' timestamp must be greater than the last applied migration's created_at — Drizzle skips entries where when <= last DB created_at"
metrics:
  duration_minutes: 25
  completed_date: "2026-03-13"
  tasks_completed: 8
  files_modified: 5
---

# Phase 11 Plan 01: GWT Schema & API Foundation Summary

**One-liner:** Backwards-compatible SQL migration adding `test_format` to projects and `step_type` to test_case_steps, with full CRUD endpoint support for both fields.

## What Was Built

Added GWT (Given-When-Then) data layer support to the Velo API without breaking existing data or behavior:

1. **Migration `0010_gwt_support.sql`** — Two `ALTER TABLE ... ADD COLUMN` statements with `NOT NULL DEFAULT` values so existing rows are automatically unaffected.

2. **`schema.ts` updates** — Added `test_format` to the `projects` Drizzle table definition and `step_type` to `testCaseSteps`, mirroring the migration columns.

3. **Project creation (`POST /projects`)** — Now accepts `test_format` field with enum validation (`"steps"` | `"gwt"`). Defaults to `"steps"` when omitted. Returns `test_format` in the 201 response.

4. **Project GET endpoints** — Both `GET /projects` (list) and `GET /projects/by-key/:key` now include `test_format` in the SELECT query and return it in the response.

5. **Test case POST endpoint** — Step items now accept optional `step_type` with enum validation (`"action"` | `"given"` | `"when"` | `"then"` | `"and"` | `"but"`). Defaults to `"action"` when omitted. Inserted into `test_case_steps`.

6. **Test case PUT endpoint** — Same `step_type` acceptance as POST — replaces all steps with the new values including `step_type`.

7. **Test case GET detail** — `json_build_object` in the `json_agg` steps query now includes `step_type`, so `GET /cases/:id` returns `step_type` on each step in the `steps` array.

8. **Drizzle journal** — Entry for `0010_gwt_support` registered with `idx: 10` and a `when` timestamp (`1773444000000`) greater than the last applied migration.

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| Migration adds `test_format VARCHAR(10) NOT NULL DEFAULT 'steps'` | PASS |
| Migration adds `step_type VARCHAR(10) NOT NULL DEFAULT 'action'` | PASS |
| `POST /projects` accepts `test_format`, defaults to `'steps'` | PASS |
| `GET /projects` and `GET /projects/by-key/:key` return `test_format` | PASS |
| `POST /cases` and `PUT /cases/:id` accept `step_type`, default `'action'` | PASS |
| `GET /cases/:id` returns `step_type` on each step | PASS |
| All existing tests pass | PASS (193 passed, 0 failed) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Drizzle migration journal timestamp**
- **Found during:** Task 8 verification (tests failed with 500 after implementation)
- **Issue:** Drizzle's `migrate()` function only applies a migration entry if its `folderMillis` (journal `when`) is strictly greater than the last applied migration's `created_at`. The initial `when: 1741900800000` was less than `0009_social_auth`'s `1773357530000`, so Drizzle silently skipped the new migration without error.
- **Fix:** Updated `when` to `1773444000000` (greater than 1773357530000). Migration then applied correctly.
- **Files modified:** `apps/api/drizzle/meta/_journal.json`
- **Commit:** `72cb746`

## Commits

| Hash | Message |
|------|---------|
| `208f975` | chore(11-01): add GWT migration — test_format and step_type columns |
| `1a28b61` | feat(11-01): add test_format to projects and step_type to testCaseSteps in schema |
| `9197c0e` | feat(11-01): accept test_format on project creation endpoint |
| `db9b61e` | feat(11-01): return test_format in project GET endpoints |
| `685b810` | feat(11-01): accept step_type in test case POST endpoint |
| `6428013` | feat(11-01): accept step_type in test case PUT endpoint |
| `8fc1440` | feat(11-01): return step_type on test case GET detail endpoint |
| `70a9979` | chore(11-01): register 0010_gwt_support in drizzle migration journal |
| `72cb746` | fix(11-01): correct migration timestamp in journal entry for 0010_gwt_support |

## Self-Check: PASSED

All files created/modified exist on disk. All 9 commits verified in git log.
