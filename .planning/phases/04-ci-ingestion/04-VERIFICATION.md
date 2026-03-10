---
phase: 04-ci-ingestion
verified: 2026-03-10T13:40:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 4: CI Ingestion Verification Report

**Phase Goal:** A CI pipeline can push automated test results to Velo via REST API and have them auto-mapped to test cases — supporting JUnit XML (five common CI variants) and Allure JSON — with raw payloads preserved in Cloudflare R2 for debugging.

**Verified:** 2026-03-10T13:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CI pipeline can POST a JUnit XML file and receive a test run with auto-mapped results | VERIFIED | `POST /api/workspaces/:wid/projects/:pid/ingest/junit` exists in ingestion.ts (line 39); 13 integration tests pass including name-match assertions |
| 2 | CI pipeline can POST an Allure JSON report and receive the same result shape | VERIFIED | `POST /api/workspaces/:wid/projects/:pid/ingest/allure` exists in ingestion.ts (line 237); Allure integration test passing |
| 3 | JUnit parser handles all 5 CI variants without error | VERIFIED | `apps/api/src/lib/junit-parser.ts` 124 lines; 13 unit tests covering pytest, Surefire, Gradle, Jest-junit, gotestsum all pass |
| 4 | Raw payloads stored in R2 (not PostgreSQL); presigned URL retrievable | VERIFIED | `uploadToR2` called before parse (ingestion.ts lines 81-88, 291-297); `GET /ingestion-runs/:id/payload` returns presigned URL; r2_key stored in ci_ingestion_runs, not payload bytes |
| 5 | API key auth gates all CI ingestion endpoints | VERIFIED | `verifyApiKey()` called at top of both POST ingest handlers; returns 401 without Bearer, 403 for wrong workspace |
| 6 | Unmatched CI results create orphan run_items (null test_case_id) | VERIFIED | ingestion.ts name-map lookup falls through to `null`; run_items.test_case_id is nullable in schema.ts (line 212) and migration 0004 |
| 7 | User can create, list, and revoke API keys via UI | VERIFIED | ApiKeysPanel.tsx fetches GET/POST/DELETE `/api/backend/workspaces/{wid}/api-keys`; raw key shown once with dismiss pattern |
| 8 | Ingestion history page shows past CI pushes with setup guide | VERIFIED | `apps/web/src/pages/app/[slug]/[projectKey]/ingestion.tsx` renders SetupGuide + IngestionHistory; curl commands present in SetupGuide.tsx |
| 9 | Sidebar shows Ingestion nav item under project context | VERIFIED | sidebar.tsx lines 185-202 render conditional Ingestion link guarded by `effectiveProjectKey` |
| 10 | End-to-end human verification passed | VERIFIED | 04-05-SUMMARY.md documents Task 3 as checkpoint approved with 4 post-UAT fixes applied (commit ed5e4f4) |

**Score:** 10/10 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/drizzle/0004_ci_ingestion_tables.sql` | Migration for api_keys, ci_ingestion_runs, run_items changes | VERIFIED | EXISTS — creates both tables with RLS workspace_isolation policy; alters run_items to nullable test_case_id + source column |
| `apps/api/src/db/schema.ts` | apiKeys and ciIngestionRuns table definitions | VERIFIED | EXISTS — apiKeys (lines 240-252), ciIngestionRuns (lines 256-274), runItems updated with nullable test_case_id + source column (lines 212, 218) |
| `apps/api/src/lib/junit-parser.ts` | parseJUnitXml returning NormalizedTestCase[] | VERIFIED | EXISTS — 124 lines, exports parseJUnitXml and NormalizedTestCase; ALWAYS_ARRAY_PATHS handles isArray pitfall |
| `apps/api/src/lib/__tests__/junit-parser.test.ts` | 13 unit tests covering all 5 variants | VERIFIED | EXISTS — 13 tests pass in <20ms |
| `apps/api/src/lib/allure-parser.ts` | parseAllureJson returning NormalizedTestCase[] | VERIFIED | EXISTS — 87 lines; imports NormalizedTestCase from junit-parser.js (no duplication); ZIP detection; 5-status mapping |
| `apps/api/src/lib/r2.ts` | r2Enabled, getR2Client, uploadToR2, getR2PresignedUrl, buildR2Key | VERIFIED | EXISTS — 118 lines; lazy singleton; all 5 exports present |
| `apps/api/src/routes/api-keys.ts` | CRUD routes for workspace-scoped API keys | VERIFIED | EXISTS — 183 lines; POST/GET/DELETE routes + verifyApiKey export |
| `apps/api/src/routes/ingestion.ts` | POST junit, POST allure, GET payload, GET list | VERIFIED | EXISTS — 511 lines; all 4 endpoints implemented; reply.send() outside withWorkspace per CLAUDE.md rule |
| `apps/web/src/components/settings/ApiKeysPanel.tsx` | API key management UI | VERIFIED | EXISTS — 293 lines; full lifecycle: create (raw key once), list (prefix only), revoke |
| `apps/web/src/pages/app/[slug]/[projectKey]/ingestion.tsx` | Ingestion history page | VERIFIED | EXISTS — 114 lines; getServerSideProps resolves projectId + hasApiKeys server-side |
| `apps/web/src/components/ingestion/SetupGuide.tsx` | curl command templates for CI setup | VERIFIED | EXISTS — 131 lines; JUnit + Allure multipart + Allure JSON body curl commands with copy buttons |
| `apps/web/src/components/ingestion/IngestionHistory.tsx` | Ingestion run history table | VERIFIED | EXISTS — 168 lines; status badges, matched/unmatched counts, run link |
| `apps/api/src/routes/__tests__/fixtures/pytest-report.xml` | pytest-junit fixture | VERIFIED | EXISTS in `apps/api/src/routes/__tests__/fixtures/` |
| `apps/api/src/routes/__tests__/fixtures/surefire-report.xml` | Maven Surefire fixture | VERIFIED | EXISTS |
| `apps/api/src/routes/__tests__/fixtures/gradle-report.xml` | Gradle fixture | VERIFIED | EXISTS |
| `apps/api/src/routes/__tests__/fixtures/jest-junit-report.xml` | Jest-junit fixture | VERIFIED | EXISTS |
| `apps/api/src/routes/__tests__/fixtures/gotestsum-report.xml` | Go gotestsum fixture | VERIFIED | EXISTS |
| `apps/api/src/routes/__tests__/fixtures/allure-result.json` | Allure JSON fixture | VERIFIED | EXISTS |
| `apps/api/src/routes/__tests__/fixtures/single-test-junit.xml` | Single-test isArray edge case fixture | VERIFIED | EXISTS |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ingestion.ts` | `junit-parser.ts` | `import { parseJUnitXml }` | WIRED | Line 4: `import { parseJUnitXml } from "../lib/junit-parser.js"` — called at line 93 |
| `ingestion.ts` | `allure-parser.ts` | `import { parseAllureJson }` | WIRED | Line 5: `import { parseAllureJson } from "../lib/allure-parser.js"` — called at line 302 |
| `ingestion.ts` | `r2.ts` | `import { uploadToR2, buildR2Key, getR2PresignedUrl, r2Enabled }` | WIRED | Line 6 — all 4 imports used: r2Enabled() guard (line 81), uploadToR2 (line 83), buildR2Key (line 78), getR2PresignedUrl (line 465) |
| `ingestion.ts` | `db/tenant.ts` | `import { withWorkspace }` | WIRED | Line 3 — used for test case name map query (line 125), main tx (line 149), list endpoint (line 493) |
| `ingestion.ts` | `api-keys.ts` | `import { verifyApiKey }` | WIRED | Line 7 — called at lines 47 and 245 for both POST ingest handlers |
| `server.ts` | `routes/ingestion.ts` | `fastify.register(ingestionRoutes)` | WIRED | server.ts line 20 import, line 92 register |
| `server.ts` | `routes/api-keys.ts` | `fastify.register(apiKeyRoutes)` | WIRED | server.ts line 19 import, line 91 register |
| `allure-parser.ts` | `junit-parser.ts` | `import { NormalizedTestCase }` | WIRED | Line 1: `import { type NormalizedTestCase } from "./junit-parser.js"` — single source of truth, not duplicated |
| `ApiKeysPanel.tsx` | `/api/backend/workspaces/:wid/api-keys` | `fetch via Next.js gateway` | WIRED | Lines 39, 62, 92 — GET/POST/DELETE all use correct gateway pattern |
| `IngestionHistory.tsx` | `/api/backend/workspaces/:wid/projects/:pid/ingestion-runs` | `fetch via Next.js gateway` | WIRED | Line 71 — correct gateway URL |
| `settings.tsx` | `ApiKeysPanel.tsx` | `import { ApiKeysPanel }` | WIRED | settings.tsx line 4 import, line 16 render with workspaceId prop |
| `ingestion.tsx` | `SetupGuide.tsx` + `IngestionHistory.tsx` | import + render | WIRED | Lines 4-5 imports, lines 38-49 render both components |
| `sidebar.tsx` | `/ingestion` page | conditional nav link | WIRED | Lines 185-202 with href and router.asPath active-state check |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IN-01 | 04-01, 04-04, 04-05 | CI pipeline can push JUnit XML results; results auto-mapped to test cases by name or external ID | SATISFIED | POST /ingest/junit endpoint operational; name-map via title.toLowerCase() lookups; 13 integration tests pass including auto-mapping test |
| IN-02 | 04-01, 04-03, 04-04 | CI pipeline can push Allure JSON results; results auto-mapped | SATISFIED | POST /ingest/allure endpoint operational; same name-map logic; allure-parser.ts with 9 tests; 4-result fixture parsed correctly |
| IN-03 | 04-01, 04-02 | JUnit XML parser handles 5 variants (pytest-junit, Surefire/Maven, Gradle, Jest-junit, Go gotestsum) without error | SATISFIED | junit-parser.ts; ALWAYS_ARRAY_PATHS for isArray pitfall; dual root normalization; failure+error->fail mapping; 13 unit tests all pass |
| IN-04 | 04-01, 04-03, 04-04 | Raw CI payloads stored in Cloudflare R2 (not PostgreSQL); developer can retrieve raw payload | SATISFIED | uploadToR2() called before parse in both handlers; r2_key stored in ci_ingestion_runs; GET /ingestion-runs/:id/payload returns presigned URL |

All 4 Phase 4 requirements satisfied. No orphaned requirements for this phase.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/routes/ingestion.ts` | 84, 112, 135, 319 | `catch {}` empty catch blocks (fire-and-forget) | INFO | Intentional per 04-04-SUMMARY — R2 upload failures and best-effort ingestion records. Non-fatal paths only. No goal impact. |
| `apps/api/src/routes/api-keys.ts` | 88-89 | String interpolation with manual quote-escaping in raw SQL (`replace(/'/g, "''")`) | WARNING | Brittle pattern — names with unusual characters could escape incorrectly. Not a blocker; tests pass and behavior is correct for valid inputs. Project uses postgres.js tagged templates elsewhere — this file uses `.unsafe()`. |

No blocker anti-patterns found.

---

### Human Verification Required

Human verification was already performed as Task 3 (checkpoint:human-verify gate) in plan 04-05. The following items were validated by the user on 2026-03-10:

1. **API key creation and one-time display** — User verified raw key shown once with copy button; prefix only shown after dismiss.
2. **Ingestion page setup guide** — Curl commands with correct API URLs verified in browser.
3. **JUnit XML curl ingestion** — Live curl command executed; 201 response with run_id verified.
4. **Runs page** — "CI: JUnit Import" run appeared after ingestion.
5. **Ingestion history** — Record with success status appeared in history table.
6. **API key revocation** — Revoked key appeared grayed out in settings.

Four bugs were found and fixed in the same session (commit ed5e4f4):
- Duplicate `@fastify/multipart` registration crash
- Sidebar Ingestion link shown without project context
- ApiKeysPanel create response parsing mismatch (flat vs nested shape)
- Missing multipart registration in test buildApp

All were resolved before the checkpoint was marked approved.

---

### Test Suite Status

- **API tests:** 149 passed, 3 todo, 0 failed across 15 test files
- **JUnit parser:** 13 tests pass
- **Allure parser:** 9 tests pass
- **API key routes:** 10 tests pass
- **Ingestion routes:** 13 tests pass
- **TypeScript:** `pnpm --recursive typecheck` passes
- **Lint:** `pnpm --recursive lint` zero errors

---

## Summary

Phase 4 goal is fully achieved. All four requirements (IN-01 through IN-04) are satisfied by working implementations verified against the codebase, not just SUMMARY claims:

- JUnit XML parser exists and handles all 5 CI variants with 13 passing tests
- Allure JSON parser exists with correct 5-status mapping and 9 passing tests
- R2 client uses lazy initialization (safe in test environments) with upload-before-parse flow
- API key auth (verifyApiKey) gates all CI ingestion endpoints
- Frontend management UI (ApiKeysPanel, IngestionHistory, SetupGuide) is wired through the Next.js gateway pattern
- All route modules are registered in server.ts
- 149 total API tests pass; no regressions introduced

The one notable code quality issue is raw SQL string interpolation with manual escaping in api-keys.ts — the rest of the codebase uses postgres.js tagged templates. This is a warning, not a blocker.

---

_Verified: 2026-03-10T13:40:00Z_
_Verifier: Claude (gsd-verifier)_
