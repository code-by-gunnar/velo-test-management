---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 1 — Foundation
current_plan: Phase 1 complete — begin Phase 2
status: In progress
last_updated: "2026-03-08T22:38:16.017Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 6
  completed_plans: 6
  percent: 100
---

# State: Velo

**Project:** Velo QA Test Management Platform
**Last updated:** 2026-03-08
**Session:** Completed 01-06 (Design System + Onboarding) — Phase 1 Foundation complete

---

## Project Reference

**Core value:** A QA engineer can create a test case in under 30 seconds and see run results update in real time — without fighting the tool.

**Current focus:** Phase 1 — Foundation

**Milestone scope:** Phase 1 (Foundation) + Phase 2 (Core MVP). Phases 3-6 are future.

---

## Current Position

**Current phase:** 2 — Test Cases (Phase 1 complete)
**Current plan:** 01 (Phase 1 all 6 plans complete)
**Status:** In progress

**Progress:**
[██████████] 100% Phase 1 complete
Phase 1 [██████████] 100% Foundation (6/6 plans complete)
Phase 2 [          ] 0%   Test Cases
Phase 3 [          ] 0%   Test Runs and Dashboard
Phase 4 [          ] 0%   CI Ingestion
Phase 5 [          ] 0%   Integrations and API
Phase 6 [          ] 0%   Team and Access Control
```

**Overall:** 18/18 Phase 1 requirements delivered (INFRA-01–06, AUTH-01–05, WORK-01–03, DS-01–04)

---

## Phase Status

| Phase | Requirements | Plans | Status |
|-------|-------------|-------|--------|
| 1. Foundation | 18 | 6 | Complete (all 18 requirements delivered) |
| 2. Test Cases | 6 | TBD | Not started |
| 3. Test Runs and Dashboard | 10 | TBD | Not started |
| 4. CI Ingestion | 4 | TBD | Not started |
| 5. Integrations and API | 4 | TBD | Not started |
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

**Last session:** 2026-03-08T22:38:16.008Z

**To resume work:** Run `/gsd:execute-phase 2` to begin Phase 2 (Test Cases).

**Context summary:** Phase 1 Foundation complete — all 18 requirements delivered across 6 plans. Design system with CSS custom properties and Tailwind aliases. Base component library (Button/Card/Input/StatusBadge). Collapsible sidebar with localStorage persistence. 3-step onboarding wizard with session JWT refresh. Home dashboard shell. Full auth flow: signup -> verify OTP -> onboarding wizard -> dashboard. Multi-tenancy enforced at compile time via WorkspaceSql branded type + RLS. Workspace/project CRUD API with free tier enforcement.

---

*State initialized: 2026-03-08*
