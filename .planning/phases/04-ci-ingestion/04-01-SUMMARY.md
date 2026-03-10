---
phase: 04-ci-ingestion
plan: "01"
subsystem: ci-ingestion
tags: [migration, schema, fixtures, test-stubs, dependencies]
dependency_graph:
  requires: []
  provides: [api_keys-table, ci_ingestion_runs-table, junit-fixtures, allure-fixture, parser-test-stubs, ingestion-test-stubs]
  affects: [run_items, test_cases]
tech_stack:
  added: [fast-xml-parser, "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"]
  patterns: [rls-workspace-isolation, drizzle-migration-journal]
key_files:
  created:
    - apps/api/drizzle/0004_ci_ingestion_tables.sql
    - apps/api/src/lib/__tests__/junit-parser.test.ts
    - apps/api/src/lib/__tests__/allure-parser.test.ts
    - apps/api/src/routes/__tests__/ingestion.test.ts
    - apps/api/src/routes/__tests__/api-keys.test.ts
    - apps/api/src/routes/__tests__/fixtures/pytest-report.xml
    - apps/api/src/routes/__tests__/fixtures/surefire-report.xml
    - apps/api/src/routes/__tests__/fixtures/gradle-report.xml
    - apps/api/src/routes/__tests__/fixtures/jest-junit-report.xml
    - apps/api/src/routes/__tests__/fixtures/gotestsum-report.xml
    - apps/api/src/routes/__tests__/fixtures/allure-result.json
    - apps/api/src/routes/__tests__/fixtures/single-test-junit.xml
  modified:
    - apps/api/package.json
    - pnpm-lock.yaml
    - apps/api/drizzle/meta/_journal.json
    - apps/api/src/db/schema.ts
decisions:
  - "api_keys uses key_prefix (8 chars) + key_hash (SHA-256 hex) pattern — prefix enables fast indexed lookup, hash enables constant-time comparison without storing raw key"
  - "run_items.test_case_id made nullable to support CI-ingested orphan items with no matching manual test case"
  - "source VARCHAR(10) DEFAULT 'manual' added to run_items — distinguishes human-executed items from CI-ingested ones"
  - "test_cases.external_id added nullable — set when CI parser matches a case by name for future auto-mapping"
  - "single-test-junit.xml fixture added specifically for fast-xml-parser isArray pitfall (single child not wrapped in array)"
metrics:
  duration_seconds: 244
  completed_date: "2026-03-10"
  tasks_completed: 3
  tasks_total: 3
  files_created: 12
  files_modified: 4
---

# Phase 4 Plan 1: CI Ingestion Foundation Summary

**One-liner:** Wave 0 foundation for CI ingestion — fast-xml-parser + AWS S3 SDK installed, api_keys and ci_ingestion_runs migration created with RLS, run_items made nullable with source column, 7 fixture files covering all 5 JUnit variants + Allure JSON, 4 test stub files defining the IN-01 through IN-04 test contract.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install deps, create migration, update schema.ts | 451e9e3 | package.json, pnpm-lock.yaml, 0004_ci_ingestion_tables.sql, _journal.json, schema.ts |
| 2 | Create JUnit XML fixtures and Allure JSON fixture | be4ffa9 | 7 fixture files in src/routes/__tests__/fixtures/ |
| 3 | Create test stub files for parsers, routes, and API keys | 63a5f3d | junit-parser.test.ts, allure-parser.test.ts, ingestion.test.ts, api-keys.test.ts |

---

## Verification Results

- `npx tsc --noEmit` — passes cleanly with new table definitions
- `pnpm test` — 104 tests pass, 32 todo stubs skipped (not failures)
- All 7 fixture files verified to exist in `src/routes/__tests__/fixtures/`
- Migration `0004_ci_ingestion_tables.sql` creates both tables with RLS + alters run_items + alters test_cases

---

## Decisions Made

### api_keys table design — prefix + hash pattern

The raw API key is never stored. Only the first 8 characters (key_prefix) are stored in plaintext to enable a fast `WHERE key_prefix = $1` indexed lookup before the constant-time hash comparison. This avoids full-table scans while still protecting the key.

### run_items.test_case_id nullable

CI-ingested results often don't have corresponding manual test cases in the system. Orphan run items (source='ci', test_case_id=NULL) allow the ingestion to complete and report unmatched tests without blocking on matching.

### single-test-junit.xml fixture

fast-xml-parser does not automatically wrap single child nodes in arrays. A testsuite with exactly one `<testcase>` will parse as an object rather than an array. This edge case fixture ensures the parser is tested against the isArray option in plan 04-02.

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Self-Check

### Files exist
- [x] `apps/api/drizzle/0004_ci_ingestion_tables.sql`
- [x] `apps/api/src/lib/__tests__/junit-parser.test.ts`
- [x] `apps/api/src/lib/__tests__/allure-parser.test.ts`
- [x] `apps/api/src/routes/__tests__/ingestion.test.ts`
- [x] `apps/api/src/routes/__tests__/api-keys.test.ts`
- [x] All 7 fixture files in `src/routes/__tests__/fixtures/`

### Commits exist
- [x] 451e9e3 — feat(04-01): install CI deps, migration 0004, update schema
- [x] be4ffa9 — feat(04-01): create JUnit XML and Allure JSON fixture files
- [x] 63a5f3d — test(04-01): create test stub files for CI ingestion parsers and routes

## Self-Check: PASSED
