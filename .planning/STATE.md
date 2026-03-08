---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 1 — Foundation
current_plan: 04 (plan 03 complete)
status: In progress
last_updated: "2026-03-08T22:05:00Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 6
  completed_plans: 3
  percent: 50
---

# State: Velo

**Project:** Velo QA Test Management Platform
**Last updated:** 2026-03-08
**Session:** Completed 01-02 (Database Schema + Migrations)

---

## Project Reference

**Core value:** A QA engineer can create a test case in under 30 seconds and see run results update in real time — without fighting the tool.

**Current focus:** Phase 1 — Foundation

**Milestone scope:** Phase 1 (Foundation) + Phase 2 (Core MVP). Phases 3-6 are future.

---

## Current Position

**Current phase:** 1 — Foundation
**Current plan:** 04 (plan 03 complete)
**Status:** In progress

**Progress:**
```
Phase 1 [█████     ] 50%  Foundation (3/? plans complete)
Phase 2 [          ] 0%   Test Cases
Phase 3 [          ] 0%   Test Runs and Dashboard
Phase 4 [          ] 0%   CI Ingestion
Phase 5 [          ] 0%   Integrations and API
Phase 6 [          ] 0%   Team and Access Control
```

**Overall:** 5/18 requirements delivered (INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05)

---

## Phase Status

| Phase | Requirements | Plans | Status |
|-------|-------------|-------|--------|
| 1. Foundation | 18 | TBD | In progress (plans 01-03 done) |
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
| Relative imports throughout (not @/ aliases) | tsconfig uses NodeNext resolution without paths; aliases require both tsconfig paths and vitest resolve.alias to work |

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

### Critical Pitfalls to Avoid

| ID | Pitfall | Prevention |
|----|---------|------------|
| C2 | Multi-tenancy isolation breaks silently | RLS setup in Phase 1; integration test in Phase 2 |
| C3 | SSE connections dropped by Railway proxy | Test SSE on Railway URL week 1 of Phase 3; 20s heartbeats |
| C4 | JUnit XML schema variation breaks parser | Build fixture library before writing parser |
| C5 | Auth.js v5 JWT custom fields silently lost | Integration test session persistence before Phase 2 begins |
| M1 | 30-second UX fails from sequential round trips | Optimistic UI, inline editors, no modals |
| M2 | Performance cliff at 1,000+ test cases | Cursor pagination and indexes from first query |
| M5 | Concurrent run status inconsistency | Compute run status from run_items aggregate; never store as writable column |

### Research Flags

| Area | Flag | Action |
|------|------|--------|
| Auth.js v5 + Valkey adapter | MEDIUM | Verify compatibility at authjs.dev before Phase 1 auth plan |
| Railway SSE timeout | MEDIUM | Verify Railway proxy timeout config before Phase 3 SSE plan |
| Jira sync (deferred to v2) | — | Replaced by Linear for MVP |
| Linear OAuth + two-way sync | MEDIUM | Research before Phase 5 integrations plan |
| JUnit XML fixture set | MEDIUM | Collect real-world samples from target CI platforms before Phase 4 |

### Todos

- [ ] Verify Auth.js v5 stable API and Valkey adapter compatibility before Phase 1 plan
- [ ] Verify Railway SSE timeout configuration before Phase 3 plan
- [ ] Collect JUnit XML samples (pytest, Surefire, Gradle, Jest-junit, gotestsum) before Phase 4 plan
- [ ] Research Linear OAuth flow and webhook sync loop prevention before Phase 5 plan

### Blockers

None.

---

## Session Continuity

**Last session:** Completed 01-03 (Valkey + BullMQ) — iovalkey client, BullMQ email queue/worker, Fastify plugin, health endpoint Valkey ping, integration tests.

**To resume work:** Run `/gsd:execute-phase 1` starting from plan 04.

**Context summary:** Phase 1 plans 01-03 complete. iovalkey connected to Valkey via URL-based BullMQ connection options. Email queue and worker stub ready; Resend integration deferred to Plan 4. Health endpoint pings Valkey and reports services.valkey. Integration tests in CI pass against valkey/valkey:7. Railway setup still required before first push (see 01-01-SUMMARY.md User Setup section). Next: plan 04 (Auth.js v5).

---

*State initialized: 2026-03-08*
