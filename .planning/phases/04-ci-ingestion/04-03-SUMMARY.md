---
phase: 04-ci-ingestion
plan: "03"
subsystem: api
tags: [allure, r2, cloudflare, aws-sdk, s3, parser, ingestion, ci]

requires:
  - phase: 04-01
    provides: "api_keys + ci_ingestion_runs tables, fixture files, test stubs"
  - phase: 04-02
    provides: "NormalizedTestCase interface exported from junit-parser.ts"

provides:
  - "parseAllureJson function in allure-parser.ts — converts Allure JSON to NormalizedTestCase[]"
  - "R2 storage client in r2.ts — lazy S3Client, upload, presigned URL, key builder"
  - "allure-parser.test.ts — 9 passing tests covering all Allure status mappings, edge cases"

affects:
  - "04-04: ingestion routes consume allure-parser and r2 client"

tech-stack:
  added: []
  patterns:
    - "Lazy S3Client singleton: getR2Client() created on first call, safe to import without env vars"
    - "r2Enabled() guard pattern for optional infrastructure (R2 not required for local dev/tests)"
    - "Allure parser shares NormalizedTestCase via import from junit-parser.js (no duplication)"

key-files:
  created:
    - apps/api/src/lib/allure-parser.ts
    - apps/api/src/lib/r2.ts
  modified:
    - apps/api/src/lib/__tests__/allure-parser.test.ts

key-decisions:
  - "Allure parser imports NormalizedTestCase from junit-parser.js — single source of truth for interface"
  - "R2 client uses lazy initialization: getR2Client() throws only on first call if env vars missing, not at module load"
  - "r2Enabled() exported as an explicit check so callers can degrade gracefully without R2 configured"
  - "Allure classname field is null — Allure has no direct classname equivalent; fullName carries qualified name"
  - "ZIP detection (PK magic bytes) throws descriptive error before JSON.parse — prevents confusing parse errors"

patterns-established:
  - "Optional infrastructure pattern: r2Enabled() + lazy getR2Client() for services not available in all envs"
  - "Status mapping function (mapAllureStatus) isolated for easy extension if new Allure statuses appear"

requirements-completed:
  - IN-02
  - IN-04

duration: 12min
completed: "2026-03-10"
---

# Phase 4 Plan 03: Allure JSON Parser and R2 Storage Client Summary

**Allure JSON parser with full 5-status mapping and lazy-initialized Cloudflare R2 S3 client with upload/presign/buildKey helpers**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-10T12:12:00Z
- **Completed:** 2026-03-10T12:16:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- parseAllureJson() handles both single object and array inputs, maps all 5 Allure statuses (passed/failed/broken/skipped/unknown) to Velo statuses
- ZIP detection rejects binary Allure archives with a descriptive error message before attempting JSON.parse
- R2 client uses lazy initialization — safe to import in test environments without R2 credentials configured
- NormalizedTestCase interface shared via import from junit-parser.js (not duplicated)
- 9 allure-parser tests pass; full 126-test suite green

## Task Commits

1. **Task 1: Allure JSON parser (TDD)** - `f3529f9` (feat)
2. **Task 2: R2 storage client + test type fixes** - `89ecc84` (feat)

## Files Created/Modified

- `apps/api/src/lib/allure-parser.ts` — parseAllureJson function, AllureResult interface, status mapping
- `apps/api/src/lib/r2.ts` — r2Enabled, getR2Client, uploadToR2, getR2PresignedUrl, buildR2Key
- `apps/api/src/lib/__tests__/allure-parser.test.ts` — 9 tests replacing todo stubs

## Decisions Made

- Allure parser imports NormalizedTestCase from junit-parser.js — single source of truth; no interface duplication
- R2 client uses lazy initialization: getR2Client() throws only on first call when env vars are missing, not at module load time
- r2Enabled() is an explicit guard so callers (ingestion routes) can degrade gracefully
- Allure classname is null — Allure has no direct classname equivalent; fullName carries the qualified test name
- ZIP detection precedes JSON.parse to give users a clear actionable error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict null errors in allure-parser.test.ts array indexing**
- **Found during:** Task 2 (tsc --noEmit verification)
- **Issue:** TypeScript strict mode flags array index access as potentially undefined; 22 errors in test file
- **Fix:** Changed `results[N].field` to `results[N]?.field` and `results[0]!.field` where non-null is certain
- **Files modified:** apps/api/src/lib/__tests__/allure-parser.test.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** 89ecc84 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript strict compliance)
**Impact on plan:** Required for type-check to pass per CLAUDE.md pre-push requirements. No scope creep.

## Issues Encountered

None — plan executed cleanly. junit-parser.ts was already implemented (04-02 had been executed before this plan ran), providing the NormalizedTestCase interface as required.

## Next Phase Readiness

- allure-parser.ts and r2.ts ready for consumption by 04-04 ingestion routes
- No blockers

## Self-Check: PASSED

- [x] apps/api/src/lib/allure-parser.ts — FOUND
- [x] apps/api/src/lib/r2.ts — FOUND
- [x] apps/api/src/lib/__tests__/allure-parser.test.ts — FOUND
- [x] .planning/phases/04-ci-ingestion/04-03-SUMMARY.md — FOUND
- [x] Commit f3529f9 — FOUND
- [x] Commit 89ecc84 — FOUND
- [x] 9 allure-parser tests pass
- [x] 126 total tests pass
- [x] TypeScript type-check passes (0 errors)

---
*Phase: 04-ci-ingestion*
*Completed: 2026-03-10*
