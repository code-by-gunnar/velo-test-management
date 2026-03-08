---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 1 — Foundation
current_plan: "02 (plan 01 complete)"
status: In progress
last_updated: "2026-03-08T21:29:00Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 6
  completed_plans: 1
  percent: 17
---

# State: Velo

**Project:** Velo QA Test Management Platform
**Last updated:** 2026-03-08
**Session:** Roadmap created

---

## Project Reference

**Core value:** A QA engineer can create a test case in under 30 seconds and see run results update in real time — without fighting the tool.

**Current focus:** Phase 1 — Foundation

**Milestone scope:** Phase 1 (Foundation) + Phase 2 (Core MVP). Phases 3-6 are future.

---

## Current Position

**Current phase:** 1 — Foundation
**Current plan:** 02 (plan 01 complete)
**Status:** In progress

**Progress:**
```
Phase 1 [██        ] 17%  Foundation (1/? plans complete)
Phase 2 [          ] 0%   Test Cases
Phase 3 [          ] 0%   Test Runs and Dashboard
Phase 4 [          ] 0%   CI Ingestion
Phase 5 [          ] 0%   Integrations and API
Phase 6 [          ] 0%   Team and Access Control
```

**Overall:** 2/18 requirements delivered (INFRA-01, INFRA-02)

---

## Phase Status

| Phase | Requirements | Plans | Status |
|-------|-------------|-------|--------|
| 1. Foundation | 18 | TBD | In progress (plan 01 done) |
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

### Architecture Patterns Locked In

- UUID v7 primary keys (time-ordered)
- workspace_id on every tenant-scoped table (denormalized)
- Soft deletes on TestCase, Suite, TestRun; hard deletes on RunItem, Defect
- Gap-based integer position column (increments of 1000) for drag-drop ordering
- Recursive CTE for suite tree queries
- SSE per-run-id subscribes to Valkey channel; stateless from API server
- Workspace membership cached in Valkey (60s TTL)
- BullMQ for async ingestion, Jira sync, webhook fanout
- SET LOCAL (not SET) for RLS transaction-scoped workspace context

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

**Last session:** Completed 01-01 (Monorepo + CI/CD) — pnpm monorepo scaffold with Next.js 16, Fastify 5, GitHub Actions CI.

**To resume work:** Run `/gsd:execute-phase 1` starting from plan 02.

**Context summary:** Phase 1 plan 01 complete. pnpm monorepo scaffold (apps/web, apps/api, packages/types) is bootable with lint/typecheck/test passing. GitHub Actions CI defined with PostgreSQL 16 + Valkey 7. Railway manual setup required before first push (see 01-01-SUMMARY.md User Setup section). Next: plan 02 (PostgreSQL schema + Drizzle migrations).

---

*State initialized: 2026-03-08*
