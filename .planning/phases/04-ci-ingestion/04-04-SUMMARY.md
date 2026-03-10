---
phase: 04-ci-ingestion
plan: 04
subsystem: api-ingestion
tags: [api-keys, ingestion, junit, allure, r2, auth, ci]
dependency_graph:
  requires: [04-02, 04-03]
  provides: [ingestion-endpoints, api-key-auth]
  affects: [server.ts]
tech_stack:
  added: []
  patterns:
    - API key auth via SHA-256 hash + prefix lookup (verifyApiKey)
    - R2 upload before parse (raw payload always stored before destructive parse step)
    - Name-map auto-matching: fullName then name, case-insensitive
    - Orphan run_items (null test_case_id) for unmatched CI results
    - reply.send() outside withWorkspace (CLAUDE.md rule enforced)
key_files:
  created:
    - apps/api/src/routes/api-keys.ts
    - apps/api/src/routes/ingestion.ts
  modified:
    - apps/api/src/server.ts
    - apps/api/src/routes/__tests__/api-keys.test.ts
    - apps/api/src/routes/__tests__/ingestion.test.ts
    - apps/api/src/lib/__tests__/allure-parser.test.ts
decisions:
  - verifyApiKey uses bare sql (not withWorkspace) — api_keys lookup is non-tenant scoped; workspace_id is a filter, not enforced by RLS
  - Empty catch{} used for fire-and-forget error suppression (R2 upload failures, best-effort ingestion record insert)
  - r2Enabled() guard skips R2 upload in test/local environments without crashing
  - api keys listed with key_prefix aliased as prefix for cleaner API surface
  - Ingestion list endpoint requires session auth, not API key (human-facing, not CI-facing)
metrics:
  duration_minutes: 25
  tasks_completed: 2
  files_created: 2
  files_modified: 4
  tests_added: 23
  completed_date: "2026-03-10"
requirements: [IN-01, IN-02, IN-04]
---

# Phase 4 Plan 4: API Key Auth and CI Ingestion Endpoints Summary

API key CRUD with SHA-256 hash auth, JUnit XML and Allure JSON ingestion routes creating test runs with auto-mapped items and R2 payload storage.

## What Was Built

### Task 1: API key routes and verifyApiKey helper

`apps/api/src/routes/api-keys.ts` — Fastify plugin providing:

- **POST /api/workspaces/:workspaceId/api-keys**: Creates `velo_` + 32-byte hex key. Stores SHA-256 hash + first-8-char prefix. Returns raw key once only.
- **GET /api/workspaces/:workspaceId/api-keys**: Lists keys with id, name, prefix, timestamps. Never exposes key_hash.
- **DELETE /api/workspaces/:workspaceId/api-keys/:keyId**: Soft revoke via revoked_at timestamp.
- **verifyApiKey(rawKey)**: Standalone export (not inside plugin). Recomputes prefix + hash, queries api_keys WHERE revoked_at IS NULL AND expires_at not exceeded. Returns `{ workspaceId, keyId }` or null.

10 integration tests covering all CRUD operations, revocation, and verifyApiKey behavior.

### Task 2: Ingestion routes

`apps/api/src/routes/ingestion.ts` — Fastify plugin providing:

- **POST /api/workspaces/:workspaceId/projects/:projectId/ingest/junit**: Multipart file upload, R2 upload before parse, JUnit XML parse, test_cases name map, withWorkspace transaction inserting test_runs + run_items (source='ci') + ci_ingestion_runs. Returns `{ ingestion_id, run_id, total_tests, matched_tests, unmatched_tests }`.
- **POST /api/workspaces/:workspaceId/projects/:projectId/ingest/allure**: Same flow but accepts JSON body or multipart file. Allure JSON parse.
- **GET /api/workspaces/:workspaceId/ingestion-runs/:ingestionId/payload**: Session auth (human debugging). Returns presigned R2 URL.
- **GET /api/workspaces/:workspaceId/projects/:projectId/ingestion-runs**: Lists ingestion history for project.

13 integration tests covering JUnit ingestion, auto-mapping, orphan items, auth rejections (401/403), malformed XML (422), Allure ingestion, status mapping, payload retrieval, and list endpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing validation] Empty catch{} for fire-and-forget blocks**
- **Found during:** Task 2 lint pass
- **Issue:** ESLint @typescript-eslint/no-unused-vars flagged `_err` and `_dbErr` catch bindings despite underscore prefix convention
- **Fix:** Used bare `catch {}` (ES2019 optional catch binding) for all error-suppression blocks
- **Files modified:** apps/api/src/routes/ingestion.ts

**2. [Rule 1 - Bug] Stale eslint-disable directives in allure-parser.test.ts**
- **Found during:** Task 2 lint pass
- **Issue:** Two `eslint-disable-next-line @typescript-eslint/no-non-null-assertion` directives were no longer needed (TypeScript now infers non-null correctly)
- **Fix:** Removed the two stale directive comments
- **Files modified:** apps/api/src/lib/__tests__/allure-parser.test.ts

**3. [Rule 1 - Bug] Type cast needed for rows[0] in payload endpoint**
- **Found during:** Task 2 typecheck pass
- **Issue:** `rows[0] as { id: string; r2_key: string }` TypeScript error — postgres.js Row type doesn't overlap structurally
- **Fix:** Used `rows[0] as unknown as { id: string; r2_key: string }` (established project pattern)
- **Files modified:** apps/api/src/routes/ingestion.ts

## Verification Results

- `cd apps/api && pnpm test` — 149 tests pass, 3 todo (all green)
- `pnpm --recursive lint` — zero errors
- `pnpm --recursive typecheck` — zero errors
- API key creation returns raw key starting with `velo_`, 69 chars total
- GET /api-keys never includes key_hash or raw key
- POST /ingest/junit with pytest XML fixture returns 201 with run_id, total_tests=3
- Auto-mapping correctly links matched case by fullName (case-insensitive)
- Unmatched names create orphan run_items with null test_case_id and populated case_title
- POST /ingest/allure with 4-result fixture returns 201 with correct status mapping
- 401 returned for missing API key, 403 for wrong workspace, 422 for parse errors

## Self-Check: PASSED

- apps/api/src/routes/api-keys.ts — FOUND
- apps/api/src/routes/ingestion.ts — FOUND
- Commit 32d13f8 (Task 1: API keys) — FOUND
- Commit 95b5051 (Task 2: Ingestion routes) — FOUND
