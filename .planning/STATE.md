---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 1 — Foundation
current_plan: 05 (plan 04 complete)
status: In progress
last_updated: "2026-03-08T22:15:00Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 6
  completed_plans: 4
  percent: 67
---

# State: Velo

**Project:** Velo QA Test Management Platform
**Last updated:** 2026-03-08
**Session:** Completed 01-04 (Auth.js v5 + OTP)

---

## Project Reference

**Core value:** A QA engineer can create a test case in under 30 seconds and see run results update in real time — without fighting the tool.

**Current focus:** Phase 1 — Foundation

**Milestone scope:** Phase 1 (Foundation) + Phase 2 (Core MVP). Phases 3-6 are future.

---

## Current Position

**Current phase:** 1 — Foundation
**Current plan:** 05 (plan 04 complete)
**Status:** In progress

**Progress:**
```
Phase 1 [███████   ] 67%  Foundation (4/? plans complete)
Phase 2 [          ] 0%   Test Cases
Phase 3 [          ] 0%   Test Runs and Dashboard
Phase 4 [          ] 0%   CI Ingestion
Phase 5 [          ] 0%   Integrations and API
Phase 6 [          ] 0%   Team and Access Control
```

**Overall:** 10/18 requirements delivered (INFRA-01–05, AUTH-01–05)

---

## Phase Status

| Phase | Requirements | Plans | Status |
|-------|-------------|-------|--------|
| 1. Foundation | 18 | TBD | In progress (plans 01-04 done) |
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

### Architecture Patterns Locked In

- UUID v7 primary keys (time-ordered) — `uuid('id').primaryKey().$defaultFn(() => uuidv7())`
- workspace_id on every tenant-scoped table (denormalized FK)
- Soft deletes on TestCase, Suite, TestRun; hard deletes on RunItem, Defect
- Gap-based integer position column (increments of 1000) for drag-drop ordering
- Recursive CTE for suite tree queries
- SSE per-run-id subscribes to Valkey channel; stateless from API server
- Workspace membership cached in Valkey (60s TTL)
- BullMQ for async ingestion, Jira sync, webhook fanout (Queue/Worker use URL-based connection options — not iovalkey instances — to satisfy BullMQ ioredis type requirements)
- SET LOCAL (not SET) for RLS transaction-scoped workspace context
- Programmatic migrate() runs on every Fastify startup (idempotent, safe in CI)
- Separate single-connection migration client from app pool client (max: 10)
- Auth.js v5 JWT session: `session.user.{ id, workspace_id, workspace_slug, role }` — all protected pages and API requests use this shape
- requireAuth(context) / requireUnauthed(context) helpers for all getServerSideProps
- Fastify auth routes: bcrypt 12 rounds for passwords, 10 rounds for OTP/reset tokens

### Critical Pitfalls to Avoid

| ID | Pitfall | Prevention |
|----|---------|------------|
| C2 | Multi-tenancy isolation breaks silently | RLS setup in Phase 1; integration test in Phase 2 |
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

**Last session:** Completed 01-04 (Auth.js v5 + OTP) — Credentials provider, JWT callback chain, OTP email verification, password reset, 5 auth pages, 5+6 tests.

**To resume work:** Run `/gsd:execute-phase 1` starting from plan 05.

**Context summary:** Phase 1 plans 01-04 complete. Auth fully implemented: sign-up → OTP → sign-in → session → sign-out → password reset. JWT carries workspace_id/role (AUTH-05 verified). session.user shape locked in for all future phases. Integration tests for auth routes require CI PostgreSQL. Resend requires real API key for email delivery. Next: plan 05 (likely workspace onboarding or remaining foundation items).

---

*State initialized: 2026-03-08*
