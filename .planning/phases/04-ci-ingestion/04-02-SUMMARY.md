---
phase: 04-ci-ingestion
plan: 02
subsystem: lib
tags: [junit, xml-parser, fast-xml-parser, tdd, ci-ingestion]
provides:
  - "parseJUnitXml function that parses all 5 JUnit XML variants into NormalizedTestCase[]"
  - "NormalizedTestCase interface exported for use by ingestion routes"
affects: [04-ci-ingestion, IN-03]
tech-stack:
  added: []
  patterns:
    - "isArray config in fast-xml-parser to prevent single-element array collapse"
    - "Dual root normalization (testsuites wrapper vs bare testsuite)"
    - "failure+error element dual-mapping to fail status"
    - "TDD: RED test commit then GREEN implementation commit then REFACTOR commit"
key-files:
  created:
    - apps/api/src/lib/junit-parser.ts
  modified:
    - apps/api/src/lib/__tests__/junit-parser.test.ts
key-decisions:
  - "findCase() test helper used to safely narrow .find() result for TypeScript strict mode compliance"
  - "ALWAYS_ARRAY_PATHS includes testsuite.testcase for bare-root Surefire/Gradle and testsuites.testsuite.testcase for wrapped pytest/Jest/gotestsum"
  - "durationMs returns null when time attribute absent (not 0) to distinguish measured-zero from unmeasured"
  - "failureBody reads from #text first, then __cdata for CDATA section compatibility"
duration: 4min
completed: 2026-03-10
---

# Phase 4 Plan 02: JUnit XML Parser (5 Variants) Summary

**Defensive JUnit XML parser using fast-xml-parser that handles pytest-junit, Maven Surefire, Gradle, Jest-junit, and Go gotestsum without error across all real-world structural differences.**

## Performance
- **Duration:** ~4 minutes
- **Tasks:** 3 TDD commits (RED + GREEN + REFACTOR)
- **Files modified:** 2

## Accomplishments
- Implemented `parseJUnitXml(raw: string): NormalizedTestCase[]` with full 5-variant coverage
- Exported `NormalizedTestCase` interface for downstream use by ingestion routes
- Handled all 3 critical JUnit pitfalls: single-element array collapse, root element variance, failure vs error distinction
- 13 tests passing in under 20ms
- Zero lint errors, zero TypeScript errors in junit-parser files

## Task Commits
1. **RED phase: failing tests** - `aa874df`
2. **GREEN phase: implementation** - `845afdd`
3. **REFACTOR phase: TypeScript strict compliance** - `cfecf9b`

## Files Created/Modified
- `apps/api/src/lib/junit-parser.ts` — Defensive JUnit XML parser, 123 lines, exports parseJUnitXml + NormalizedTestCase
- `apps/api/src/lib/__tests__/junit-parser.test.ts` — 13 tests covering all 5 variants + 5 edge cases

## Decisions & Deviations

**Key decisions:**
- `findCase()` helper pattern added to satisfy TypeScript's strict null checks on `.find()` results without using non-null assertions in test assertions
- `ALWAYS_ARRAY_PATHS` includes both `testsuite.testcase` (Surefire/Gradle bare root) and `testsuites.testsuite.testcase` (pytest/Jest/gotestsum wrapped) to handle all structural variants
- `durationMs` returns `null` when `time` attribute is absent — distinguishes "no timing data" from "ran in 0ms"

**Deviations from plan:**

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict null checks in test file**
- **Found during:** REFACTOR phase (typecheck run)
- **Issue:** `results[0]` and `.find()` results flagged as possibly undefined under TypeScript strict mode
- **Fix:** Added `findCase()` helper that throws descriptively if test case not found; cast `results[0]` as `NormalizedTestCase` in tests that assert length first
- **Files modified:** `apps/api/src/lib/__tests__/junit-parser.test.ts`
- **Commit:** cfecf9b

**Pre-existing issue (out of scope):**
- `apps/api/src/lib/__tests__/allure-parser.test.ts` has been pre-expanded from Wave 0 stubs to full tests (working tree, uncommitted) but `allure-parser.ts` doesn't exist yet — causes full suite failure on `pnpm test`. This is a pre-existing working tree state from plan 04-01 scope. Will be resolved when plan 04-03 implements allure-parser.

## Next Phase Readiness
- `parseJUnitXml` and `NormalizedTestCase` are ready for import by `apps/api/src/routes/ingestion.ts` (plan 04-03)
- All 5 JUnit variants handled; IN-03 requirement delivered
- Parser is synchronous and fast (<20ms for all fixtures combined)

## Self-Check: PASSED
- `apps/api/src/lib/junit-parser.ts` — EXISTS
- `apps/api/src/lib/__tests__/junit-parser.test.ts` — EXISTS
- Commits aa874df, 845afdd, cfecf9b — all verified in git log
