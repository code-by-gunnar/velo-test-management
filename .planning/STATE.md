---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 4 — CI Ingestion
current_plan: 04-05 complete
status: planning
stopped_at: Completed 05-02-PLAN.md and 05-03-PLAN.md
last_updated: "2026-03-10T16:32:00.000Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 29
  completed_plans: 25
  percent: 86
---

# State: Velo

**Project:** Velo QA Test Management Platform
**Last updated:** 2026-03-09
**Session:** Completed 02-01 (Wave 0 Foundation: deps + migration + test stubs)

---

## Project Reference

**Core value:** A QA engineer can create a test case in under 30 seconds and see run results update in real time — without fighting the tool.

**Current focus:** Phase 3 — Test Runs and Dashboard

**Milestone scope:** Phase 1 (Foundation) + Phase 2 (Core MVP). Phases 3-6 are future.

---

## Current Position

**Current phase:** 4 — CI Ingestion
**Current plan:** 04-05 complete
**Status:** Ready to plan

**Progress:**
[████████░░] 86%
Phase 3 [██████████] 100% Test Runs and Dashboard (6/6 plans complete)
Phase 4 [██████████] 100% CI Ingestion (5/5 plans complete, UAT verified)
Phase 5 [███░░░░░░░] 33%  Integrations and API (2/6 plans complete)
Phase 6 [          ] 0%   Team and Access Control

**Overall:** 23/23 plans complete (Phase 4 fully delivered)

---

## Phase Status

| Phase | Requirements | Plans | Status |
|-------|-------------|-------|--------|
| 1. Foundation | 18 | 6 | Complete (all 18 requirements delivered) |
| 2. Test Cases | 6 | 6 | Complete (all 6 plans delivered) |
| 3. Test Runs and Dashboard | 10 | 6 | Complete (all 6 plans delivered) |
| 4. CI Ingestion | 4 | 5 | In progress (04-01 Wave 0 complete) |
| 5. Integrations and API | 4 | 6 | In progress (05-02, 05-03 complete) |
| 6. Team and Access Control | 6 | TBD | Not started |

---

## Accumulated Context

### Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| Next.js 16 Pages Router (not App Router) | CVE-2025-55182 (CVSS 10.0 RCE) in App Router |
| Auth.js v5 (not Clerk) | Full control over auth; avoid paid dependency at MVP stage |
| Railway (not Fly.io) | Simpler for solo MVP; Fly.io available if multi-region needed |
| Valkey (not Redis) | Redis SSPL licence change March 2024 |
| postgres.js raw SQL (not Drizzle ORM at runtime) | Recursive CTEs and aggregate queries are hot paths; Drizzle fights you |
| SSE (not WebSocket) for real-time | Use case is server-to-client only; SSE simpler, proxy-compatible |
| Normalized test_case_steps table (not JSONB steps[]) | Enables step-level CI mapping, search, attachments |
| App-layer + RLS defense-in-depth multi-tenancy | Neither alone is sufficient; both layers required |
| eslint-config-next v16 flat config via direct import (not FlatCompat) | FlatCompat causes circular JSON serialization error in ESLint 9 config validator |
| vitest passWithNoTests=true on all apps | CI must pass before any test files are written in later plans |
| jsdom explicit devDependency in apps/web | pnpm strict isolation requires it listed; vitest jsdom environment does not auto-install it |
| drizzle-orm as dev-only dependency | Used only for schema definition and migrator; postgres.js handles runtime queries |
| uuidv7 npm package for UUID v7 PKs | PostgreSQL 16 lacks native uuidv7() (added in PG 18+); app-layer generation required |
| Migration files committed to git (not gitignored) | Enables deterministic CI and Railway deploy; removed erroneous drizzle/ entry from .gitignore |
| Phase 2/3 tables defined in Plan 2 schema | Avoids mid-phase migrations during sample data seeding in Plan 6 |
| URL-based BullMQ connection options (not iovalkey instance) | BullMQ uses ioredis types internally; iovalkey instance causes TS2322 type mismatch that cannot be resolved without unsafe casts |
| Relative imports throughout (not @/ aliases) in API | tsconfig uses NodeNext resolution without paths; aliases require both tsconfig paths and vitest resolve.alias to work |
| @auth/core@0.41.0 pinned directly in apps/web | pnpm resolves to v0.34.3 (latest stable) but next-auth@beta.30 needs v0.41.0 — TypeScript module augmentation must point to the same version |
| Auth.js credential verification delegated to Fastify | All bcrypt logic and DB queries in one place (apps/api); Auth.js authorize() is a thin HTTP client |
| postgres.js TransactionSql cast to Sql for template tags | TypeScript Omit<> does not preserve call signatures; cast (tx as unknown as Sql) is required workaround |
| WorkspaceSql brands postgres.Sql (not TransactionSql) | TransactionSql Omit<> strips call signatures — brand on Sql, cast tx as unknown as WorkspaceSql inside withWorkspace |
| RLS migration manually authored in drizzle journal | drizzle-kit cannot generate ENABLE/FORCE ROW LEVEL SECURITY or CREATE POLICY DDL |
| Session plugin forwards Auth.js cookie to WEB_URL/api/auth/session | Avoids reimplementing JWE decryption with jose in Fastify; stays in sync with Auth.js internals |
| Free tier limits enforced at API layer (not DB constraints) | 1 project max returns 403 TIER_LIMIT_EXCEEDED; easier to tune per-plan without migrations |
| CVA (class-variance-authority) for Button variant management | Avoids manual className string concatenation; type-safe variant/size combinations |
| Design tokens as both CSS custom properties and Tailwind aliases | CSS vars for non-Tailwind use cases; Tailwind aliases for utility classes in components |
| session.update() after workspace creation to refresh JWT | Prevents onboarding redirect loop — workspace_slug in JWT is required by requireAuth redirect logic |
| React 19 createRef<T>() returns RefObject<T|null> | StepRow props typed as RefObject<HTMLTextAreaElement|null>; use createRef not {current:null} cast |
| Tab on Expected always calls onAddAfter (not just last row) | Consistent keyboard flow — Tab always advances to new step regardless of row position |
| N key for new case handled at CasesPage level | Avoids conflict with SuiteTree's own N key handler for new suite creation |
| Partial index on test_cases (project_id, suite_id, position) WHERE deleted_at IS NULL added at schema creation | Phase 3 list queries use this index heavily; deferring it requires an exclusive lock on a potentially large table |
| @fastify/multipart + exceljs for CSV/XLSX import (TC-06) | multipart handles file upload stream; exceljs provides XLSX read/write without native bindings |
| dnd-kit (not react-beautiful-dnd) for drag-drop (TC-04) | react-beautiful-dnd is deprecated; dnd-kit is maintained and has better touch/keyboard support |
| tx.unsafe() with UUID-validated params for CTE queries | current_setting('app.workspace_id', true)::uuid cannot be parameterized in recursive CTE; UUIDs validated by regex before interpolation |
| Placeholder 404 handlers for /cases/position and /cases/bulk before :caseId wildcard | Prevents Fastify routing conflict between static TC-04/TC-05 paths and dynamic :caseId wildcard |
| position=-1 sentinel signals gap collapse to server (TC-04) | Avoids extra round-trip; UI computes gap collapse, sends -1; server renumbers all siblings at 1000-increments |
| Nested DndContext per parent in SuiteTreeItem (TC-04) | dnd-kit within-parent constraint: each parent's children have their own context; no cross-parent drag possible |
| setCases exposed from useTestCases (TC-04) | CaseList needs arrayMove for optimistic reorder; exposing setter is minimal change without lifting state |
| POST /cases/bulk registered before /cases/:caseId wildcard (TC-05) | Fastify static-before-wildcard rule; bulk and position static segments must precede :caseId param route |
| Bulk copy uses app-layer UUID mapping for steps (TC-05) | INSERT INTO ... SELECT without ID remapping causes steps to reference old case IDs — explicit loop with uuidv7() per step prevents orphaned refs (Pitfall 5) |
| BulkActionBar as fixed-position overlay (TC-05) | fixed bottom-0 does not shift page content; z-30 ensures it renders above table rows and DnD drag previews |
| result=null sentinel from withWorkspace signals 400 for no-cases case (03-02) | Checked after transaction to avoid reply.send() inside withWorkspace |
| RLS isolation tested via route-level 403 guard in dev (03-02) | Dev velo role is superuser which bypasses RLS at DB layer; route guard is testable |
| Rerun-failures snapshots case_title from live test_cases at creation time (03-02) | Consistent with original run creation behavior |
| Valkey publish is fire-and-forget (.catch(() => {})) after withWorkspace (03-03) | Client response must not block on pub/sub latency; SSE fan-out is best-effort |
| defects.external_id and external_url are NULL at creation (03-03) | Linear integration deferred to Phase 5; no external_url field at defect filing time |
| Valkey mock typed as unknown as Redis in test files (03-03) | Avoids full iovalkey instantiation in tests; only publish() is exercised |
| Dedicated iovalkey subscriber per SSE connection (03-04) | iovalkey enters subscriber mode on subscribe(); shared connection cannot be reused for pub/get/set |
| reply.hijack() for Fastify SSE endpoint (03-04) | Prevents Fastify from finalizing response after the async handler returns; required for long-lived SSE connections |
| ?token= query param accepted by session plugin for EventSource auth (03-04) | EventSource API cannot set custom headers; JWT must be passed via query string for SSE routes |
| X-Accel-Buffering: no sent per-request via res.writeHead() for SSE (03-04) | Prevents Railway/nginx proxy from buffering SSE frames; must be per-request since Fastify CORS plugin does not set it globally |
| useRunSSE subscribes one EventSource per runId; dependency key is runIds.join(',') (03-05) | Avoids per-render reconnects while reacting to run list changes |
| Dashboard = runs page; Reports nav also points to /runs (03-05) | No separate dashboard route — runs list IS the live dashboard per DA-01 |
| Assignees list defaults to [] in RunFilters/RunCreateModal (03-05) | No /members endpoint yet; Phase 6 RBAC will add it; UI degrades gracefully |
| useCallback wraps fetchHistory to avoid react-hooks/set-state-in-effect (03-06) | ESLint rule forbids setState synchronously in effect body; useCallback + void fetchHistory() pattern is compliant |
| keyboardEnabled=false when defect prompt open OR comment textarea focused (03-06) | Prevents accidental verdict submission while user types |
| Linear integration button rendered but disabled in DefectPrompt (03-06) | Per CONTEXT.md locked decision: deferred to Phase 5; placeholder keeps UX intention visible |
| Case steps fetched per-item on index change with cache to avoid refetch (03-06) | Each test_case_id is fetched once and cached in caseDetailCache; navigation does not re-fetch |
| api_keys uses key_prefix (8 chars) + key_hash (SHA-256 hex) pattern (04-01) | Prefix enables fast partial index lookup on active keys; hash enables constant-time comparison without storing raw key |
| run_items.test_case_id made nullable (04-01) | CI-ingested run items may not map to an existing manual test case; orphan items stored with NULL test_case_id |
| source VARCHAR(10) DEFAULT 'manual' added to run_items (04-01) | Distinguishes human-executed items from CI-ingested ones for filtering and display |
| test_cases.external_id added nullable (04-01) | Set when CI parser matches a case by name for future auto-mapping; deferred to plan 04-02 |
| single-test-junit.xml fixture created for isArray edge case (04-01) | fast-xml-parser does not auto-wrap single child nodes in arrays; explicit isArray config required in parser |
| ALWAYS_ARRAY_PATHS covers both bare testsuite.testcase and wrapped testsuites.testsuite.testcase (04-02) | Both forms needed: Surefire/Gradle use bare root, pytest/Jest/gotestsum use testsuites wrapper |
| durationMs returns null (not 0) when time attribute absent (04-02) | Distinguishes "no timing data" from "ran in 0ms" for accurate CI result display |
| Allure parser imports NormalizedTestCase from junit-parser.js (04-03) | Single source of truth for interface — allure-parser does not duplicate the type definition |
| R2 client uses lazy initialization — getR2Client() throws only on first call if env vars missing (04-03) | Safe to import r2.ts in test environments without R2 credentials configured |
| r2Enabled() exported as explicit guard (04-03) | Ingestion routes can degrade gracefully when R2 not configured in local dev |
| Allure classname is null (04-03) | Allure has no direct classname field; fullName carries the qualified test name |
| verifyApiKey uses bare sql (not withWorkspace) for api_keys lookup (04-04) | api_keys lookup is pre-authentication — workspace_id is a filter not enforced by RLS; avoids invalid UUID error when workspaceId not yet known |
| Empty catch{} (ES2019 optional catch binding) for fire-and-forget blocks (04-04) | ESLint no-unused-vars flags _ prefixed catch bindings; bare catch{} is cleaner and supported in Node 22 |
| R2 upload before parse in ingestion routes (04-04) | Raw payload stored even if parse fails; aligns with anti-pattern guidance to always persist CI payloads before destructive processing |
| Raw API key shown once in dismissable highlighted box (04-05) | No localStorage persistence — security requirement; user must copy during creation |
| hasApiKeys check done server-side in getServerSideProps (04-05) | Avoids client-side flash in setup guide warning banner; slightly more accurate than client fetch |
| Ingestion nav item is standalone project-scoped link above Settings (not in NAV_ITEMS) (04-05) | Shows only when projectKey is available; avoids # fallback state that occurs with NAV_ITEMS when project context is absent |
| ingestion.test.ts registers @fastify/multipart in buildApp() (04-05) | Missing registration caused 415 on all multipart test routes — bare Fastify() has no content-type parsers |
| Native fetch for Linear API — no @linear/sdk (05-03) | Node 22 built-in fetch sufficient; zero dependencies for GraphQL client |
| AES-256-GCM encryption for OAuth tokens with ENCRYPTION_KEY env var (05-03) | Tokens must never be stored in plaintext; env-based key allows rotation |
| Linear auto-filing after defect commit — graceful degradation (05-03) | Linear API call happens AFTER withWorkspace transaction; defect never lost due to Linear failure |
| CSRF state in Valkey with 10-min TTL for OAuth flows (05-03) | One-time use state tokens prevent OAuth replay attacks |
| exactOptionalPropertyTypes requires `| undefined` on optional interface props (05-03) | TS strict mode rejects `string | undefined` assigned to `description?: string` |
| Unified auth: requireAuth is named preHandler not global hook (05-02) | Routes opt in explicitly; avoids breaking auth routes that must work unauthenticated |
| Rate limiter: fixed-window counter per API key with fail-open (05-02) | Simplest correct implementation; fail-open avoids blocking requests on Valkey failure |
| v1 routes: onRoute hook rewrites /api/ to /api/v1/ (05-02) | Avoids path duplication; routes registered once, URL rewritten at registration time |
| Project soft-delete via deleted_at column (05-02) | Preserves test cases and runs; idempotent fixup in runFixups() |

### Architecture Patterns Locked In

- UUID v7 primary keys (time-ordered) — `uuid('id').primaryKey().$defaultFn(() => uuidv7())`
- workspace_id on every tenant-scoped table (denormalized FK)
- Soft deletes on TestCase, Suite, TestRun; hard deletes on RunItem, Defect
- Gap-based integer position column (increments of 1000) for drag-drop ordering
- Recursive CTE for suite tree queries
- SSE per-run-id subscribes to Valkey channel; stateless from API server
- Workspace membership cached in Valkey (60s TTL)
- BullMQ for async ingestion, Jira sync, webhook fanout (Queue/Worker use URL-based connection options — not iovalkey instances — to satisfy BullMQ ioredis type requirements)
- SET LOCAL (not SET) for RLS transaction-scoped workspace context — withWorkspace() wrapper enforces this on every tenant query
- All tenant-scoped routes use withWorkspace(id, fn) — bare sql only for non-tenant queries (workspaces slug uniqueness, membership verification)
- RLS workspace_isolation policy: current_setting('app.workspace_id', true)::uuid — missing_ok=true fails closed (no rows if SET LOCAL not called)
- Programmatic migrate() runs on every Fastify startup (idempotent, safe in CI)
- Separate single-connection migration client from app pool client (max: 10)
- Auth.js v5 JWT session: `session.user.{ id, workspace_id, workspace_slug, role }` — all protected pages and API requests use this shape
- requireAuth(context) / requireUnauthed(context) helpers for all getServerSideProps
- Fastify auth routes: bcrypt 12 rounds for passwords, 10 rounds for OTP/reset tokens

### Critical Pitfalls to Avoid

| ID | Pitfall | Prevention |
|----|---------|------------|
| C2 | Multi-tenancy isolation breaks silently | RESOLVED — RLS policies active on all 8 tenant tables; withWorkspace wrapper enforced at compile time via WorkspaceSql brand |
| C3 | SSE connections dropped by Railway proxy | Test SSE on Railway URL week 1 of Phase 3; 20s heartbeats |
| C4 | JUnit XML schema variation breaks parser | Build fixture library before writing parser |
| C5 | Auth.js v5 JWT custom fields silently lost | RESOLVED — integration test in CI verifies AUTH-05 |
| M1 | 30-second UX fails from sequential round trips | Optimistic UI, inline editors, no modals |
| M2 | Performance cliff at 1,000+ test cases | Cursor pagination and indexes from first query |
| M5 | Concurrent run status inconsistency | Compute run status from run_items aggregate; never store as writable column |

### Research Flags

| Area | Flag | Action |
|------|------|--------|
| Auth.js v5 + Valkey adapter | RESOLVED | Used JWT strategy (no Valkey adapter needed) |
| Railway SSE timeout | MEDIUM | Verify Railway proxy timeout config before Phase 3 SSE plan |
| Jira sync (deferred to v2) | — | Replaced by Linear for MVP |
| Linear OAuth + two-way sync | MEDIUM | Research before Phase 5 integrations plan |
| JUnit XML fixture set | MEDIUM | Collect real-world samples from target CI platforms before Phase 4 |

### Todos

- [ ] Verify Railway SSE timeout configuration before Phase 3 plan
- [ ] Collect JUnit XML samples (pytest, Surefire, Gradle, Jest-junit, gotestsum) before Phase 4 plan
- [ ] Research Linear OAuth flow and webhook sync loop prevention before Phase 5 plan
- [ ] Add RESEND_API_KEY to Railway environment before first user-facing deploy

### Blockers

None.

---

## Session Continuity

**Last session:** 2026-03-10T16:32:00.000Z

**Stopped at:** Completed 05-02-PLAN.md and 05-03-PLAN.md

**To resume work:** Continue Phase 5 plans 05-04 through 05-06 (webhooks, frontend integrations).

**Context summary:** Phase 5 in progress. Plans 05-02 (unified auth + v1 routes + CRUD gaps + rate limiting) and 05-03 (Linear OAuth + API client) complete. All API routes now accessible via /api/v1/ with API key auth. Rate limiting at 100 req/min per API key. CRUD gaps closed (PATCH project, DELETE project, GET members, PATCH workspace).

---

*State initialized: 2026-03-08*
