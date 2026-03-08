# Research Summary: Velo QA Test Management Platform

**Synthesized:** 2026-03-08
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
**Consuming agent:** gsd-roadmapper

---

## Executive Summary

Velo is a keyboard-first, real-time QA test management SaaS targeting startups with 20-200 employees — a segment underserved by TestRail (slow, click-heavy) and over-served by enterprise tools. The research confirms this is a well-understood product category with stable patterns. The correct architecture is a monolith: one Next.js frontend, one Fastify API, one PostgreSQL database, one Valkey cache. No microservices. The solo-founder constraint makes splitting services before PMF a velocity killer.

The core differentiator — live run dashboard with no page refresh — is achievable and genuinely gaps the market. Real-time is powered by SSE + Valkey pub/sub, not WebSocket (see conflict resolution below). The table-stakes feature set is large but well-defined: test case CRUD, suite hierarchy, run execution, JUnit XML ingestion, Jira integration, REST API, and RBAC. These must all land before the product is saleable at even 20-person companies. The critical risk is not technical complexity but sequencing: auth and multi-tenancy isolation must be correct in Phase 1 before a single feature is built on top — both are company-ending if wrong.

The stack fills are largely resolved. Drizzle ORM is rejected in favour of raw SQL via postgres.js (recursive CTEs and aggregate queries are the hot paths; ORMs fight you here). SSE is correct for the use case. Multi-tenancy is enforced at the application layer with workspace_id on every row. Steps are stored in a normalized table, not JSONB. These four conflict resolutions, detailed below, are the most consequential decisions the research produced.

---

## Conflict Resolutions

Four conflicts were identified across researchers. Each resolution is stated with rationale.

### Conflict 1: Real-Time Transport — WebSocket vs SSE

**STACK.md recommends:** @fastify/websocket (WebSocket, bidirectional)
**ARCHITECTURE.md recommends:** SSE (EventSource, unidirectional)

**Resolution: SSE**

The use case is server-to-client only. Browsers submit P/F/B/S status changes via REST PATCH — not via a WebSocket stream. There is no bidirectional requirement at Phase 1 or 2. SSE is unidirectional, auto-reconnects via the native EventSource API, passes through Railway's reverse proxy more reliably than WebSocket upgrades (Pitfall C3), and requires no Fastify plugin. The ARCHITECTURE.md reasoning is correct, and PITFALLS.md independently supports SSE for proxy compatibility. WebSocket should be reconsidered only if Phase 3+ adds collaborative test case editing (multiple editors in the same document simultaneously).

Implementation note: emit a `:ping` SSE comment every 20 seconds to keep connections alive through Railway's proxy. Test SSE connections through the Railway URL (not localhost) in week 1 of Phase 2.

### Conflict 2: Data Access — Drizzle ORM vs postgres.js Raw SQL

**STACK.md recommends:** Drizzle ORM 0.36.x
**ARCHITECTURE.md recommends:** postgres.js with raw SQL

**Resolution: postgres.js with raw SQL**

The two hottest read paths in Velo are the suite tree (recursive CTE with `WITH RECURSIVE`) and run dashboard aggregates (GROUP BY across run_items). ORMs — including Drizzle — cannot express recursive CTEs cleanly and generate N+1 queries or require raw SQL escape hatches anyway. ARCHITECTURE.md's reasoning is correct: postgres.js tagged template literals are type-safe enough, have zero magic, and give direct control over query shape. Use Drizzle only for schema definition and drizzle-kit for migration generation. All runtime queries go through the repository layer using postgres.js directly.

### Conflict 3: Multi-Tenancy — App-Level workspace_id vs PostgreSQL RLS

**ARCHITECTURE.md recommends:** Application-level workspace_id enforcement (avoid RLS due to connection pooling bugs)
**PITFALLS.md recommends:** RLS as mandatory (missing workspace_id filter leaks customer data)

**Resolution: Both — defense in depth**

The framing is a false choice. PITFALLS.md is correct that missing a WHERE clause is a company-ending bug. ARCHITECTURE.md is correct that RLS with connection pooling has sharp edges. The resolution is to use both, layered:

1. **Primary enforcement:** Repository layer pattern — every repository function requires a `WorkspaceContext` parameter; TypeScript makes omission a compile error. Every SQL query has `WHERE workspace_id = $1` as its first condition.
2. **Defense in depth:** Enable PostgreSQL RLS on all tenant-scoped tables using `SET LOCAL app.current_workspace_id` at the start of each database transaction (not session-level SET — this avoids the pooling bug). RLS fires as a second check if application code fails.
3. **Verification:** Integration test at Phase 2 completion — create two workspaces, populate both, assert workspace A's user cannot retrieve workspace B's data via any API endpoint.

The ARCHITECTURE.md concern about `session-level SET` is valid; solve it with `SET LOCAL` (transaction-scoped). This adds ~2 hours of schema setup in Phase 1 and prevents a catastrophic data leak.

### Conflict 4: steps[] Storage — JSONB vs Normalized Table

**ARCHITECTURE.md recommends:** JSONB column on test_cases (steps have no independent lifecycle)
**PITFALLS.md recommends:** Normalized test_case_steps table (JSONB causes rewrite risk)

**Resolution: Normalized table (test_case_steps)**

PITFALLS.md's case is stronger. The stated reasons for JSONB ("steps have no independent lifecycle") underestimates future needs: Allure JSON supports step-level CI result mapping, step-level attachments are a common user request, step search is needed for bulk operations, and a suite with 200 cases where each has 15 steps fetches 15x more data than necessary from a JSONB column on list queries. The normalized table adds one JOIN on single-case reads (cheap) and enables all future features. JSONB remains appropriate for metadata blobs, CI report raw payloads, and custom fields.

Correct schema: `test_case_steps(id, test_case_id, order_index, action, expected_result, created_at)`.

---

## Key Findings by Research Area

### From STACK.md

| Layer | Decision | Rationale |
|-------|----------|-----------|
| ORM | Drizzle schema + drizzle-kit migrations only | Schema definition and migration generation; runtime queries via postgres.js |
| Real-time | SSE via native Fastify response stream | Overridden by conflict resolution; see above |
| Job queue | BullMQ 5.x + Valkey | Async JUnit/Allure ingestion, Jira sync, webhook fanout |
| Email | Resend SDK 4.x + React Email | Auth magic links, team invites, run notifications |
| Validation | Zod 3.x + @fastify/type-provider-zod | Type-safe REST API, request body validation, env validation |
| Testing | Vitest 2.x + Playwright 1.48.x + testcontainers | Full coverage: unit, integration, E2E |
| Drag-and-drop | @dnd-kit/core + @dnd-kit/sortable | Suite tree reordering; react-beautiful-dnd deprecated |
| HTTP client | Node.js 22 native fetch | Jira API calls; no axios dependency needed |

Version verification required before pinning: drizzle-orm, bullmq (Valkey 8.x protocol compatibility), resend, testcontainers (Node.js 22 compatibility), @playwright/test.

### From FEATURES.md

**Table stakes (must ship at launch — absence = product feels incomplete):**
- Test case CRUD with keyboard-first editor (under 30 seconds from blank to saved)
- Suite and folder hierarchy (4+ levels deep, drag-drop reorder)
- Manual execution with P/F/B/S statuses (blocked and skip are required — pass/fail only feels half-finished)
- Run creation from suite, filter, or "rerun failures from previous run"
- Execution result history per test case
- Basic reporting (pass rate, run summary)
- RBAC: Owner, Admin, Editor, Viewer (4 named roles — no full permission matrix)
- Team management (invite by email, deactivate)
- Full-text search and filter on test cases
- Bulk operations (move, tag, delete)
- JUnit XML ingestion (CI/CD lingua franca)
- Jira integration (one-way create-bug minimum, two-way is differentiating)
- REST API with webhook support
- Attachment support (screenshots, logs)

**Differentiators (drive purchase decisions and retention):**
- Real-time run dashboard — the primary differentiator; ship at launch, not as an add-on
- Keyboard-first test case editor — tab through fields, Enter to add step, no modals
- CSV/Excel import that preserves step structure (most tools flatten to a single description field)
- Allure JSON ingestion (TestRail does not support this; targets engineering-led teams)
- AI test case generation from spec (P1 — do not ship half-baked)

**Defer to v2+:**
- Flakiness detection (needs 90+ days of run history to be meaningful)
- Custom fields (gather data from first 20 customers first)
- Test plans / milestones (only for formal release sign-off processes)
- GitHub/GitLab integration (P1 — needs OAuth + webhook receiver)
- AI failure analysis (P2)

**Anti-features (deliberately not building):**
- Visual/screenshot testing (separate product category)
- Test execution scheduling (CI/CD tools own this)
- No-code test recorder (specialist product category)
- Full requirement management (Jira owns this for the ICP)
- Custom workflow states beyond P/F/B/S/Retest

### From ARCHITECTURE.md

**Architecture style:** Monolith-first, vertically sliced. One frontend, one API, one database, one cache. No microservices before PMF.

**Critical patterns:**
- UUID v7 primary keys (time-ordered, safe to expose in URLs)
- workspace_id denormalized on every tenant-owned table (not just top-level)
- Soft deletes on TestCase, Suite, TestRun (hard deletes on RunItem, Defect)
- gap-based integer position column for ordering (increments of 1000, avoiding full-table rewrites on drag-drop)
- Recursive CTE for suite tree (WITH RECURSIVE; index on project_id, parent_suite_id)
- SSE publisher subscribes to Valkey channel per run_id; stateless from API server perspective
- Workspace membership verified per request against DB, cached in Valkey (60s TTL)

**Build order dependency:** Repository setup and CI/CD → schema + migrations → Valkey + sessions → auth → workspace middleware → design system. Everything in Phase 2 depends on Phase 1 being stable.

### From PITFALLS.md

**Critical pitfalls (rewrites or company-ending):**

| ID | Pitfall | Prevention |
|----|---------|------------|
| C1 | JSONB steps[] becomes a query dead-end | Normalize to test_case_steps table (resolved above) |
| C2 | Multi-tenancy isolation breaks silently | App-layer + RLS defense-in-depth (resolved above) |
| C3 | SSE connections dropped by Railway proxy | SSE over WebSocket + 20s heartbeats + test on Railway URL week 1 of Phase 2 |
| C4 | JUnit XML schema variation breaks ingestion parser | Build fixture library (pytest, Surefire, Gradle, Jest-junit, Go) before writing parser; store raw payloads in R2 |
| C5 | Auth.js v5 JWT custom fields silently lost | Integration test session persistence before building any feature on top |

**Moderate pitfalls (significant rework):**

| ID | Pitfall | Prevention |
|----|---------|------------|
| M1 | 30-second creation UX fails from sequential round trips | Optimistic UI, inline editors (no modals), pre-select current suite context |
| M2 | Performance cliff at 1,000+ test cases | Cursor pagination and indexes from first query; EXPLAIN ANALYZE every query |
| M3 | Flat pricing breaks without seat counting rules | Define seat counting rules in schema comments before building billing |
| M4 | Valkey pub/sub breaks across multiple API processes | Per-run Valkey channel, not in-process EventEmitter — correct even for single process |
| M5 | Concurrent run status inconsistency | Compute run status from run_items aggregate, do not store as directly writable column |

---

## Implications for Roadmap

### Suggested Phase Structure

**Phase 1: Foundation (sequential — each step unblocks the next)**

Rationale: Auth and multi-tenancy isolation must be correct before a single feature is built. A bug here requires rework of everything above it. The design system runs in parallel.

Delivers: Deployable skeleton with auth, workspace scoping, CI/CD, and base UI components.

Features: None user-visible yet. Engineering infrastructure only.

Must avoid: C2 (RLS setup in this phase), C5 (Auth.js session test before Phase 2 begins), Mi3 (Railway Always On configured immediately).

Research flag: Low need for additional research — these are well-documented patterns. Verify Auth.js v5 + Valkey adapter compatibility against current authjs.dev docs before starting.

**Phase 2: Core MVP (parallelisable by domain after Phase 1)**

Rationale: Delivers the minimum viable product. The four domains (test cases, runs, ingestion, integrations) can proceed in parallel after Phase 1 is stable. Access control is woven in as features land.

Delivers: Everything needed for a startup QA team to adopt and pay for the product.

Features from FEATURES.md:
- TC-01 + TC-02: Keyboard-first test case editor, suite hierarchy, drag-drop reorder
- TR-01 + TR-02: Run creation (including "rerun failures"), execution interface (P/F/B/S keyboard shortcuts)
- DA-01: Live run dashboard (SSE + Valkey pub/sub)
- IN-01: JUnit XML ingestion + Allure JSON ingestion
- INT-01: Jira integration (one-way create-bug minimum)
- API-01: REST API with webhook support
- USR-01: RBAC, team management, plan tier enforcement

Must avoid: C3 (test SSE on Railway URL week 1 of Phase 2), C4 (fixture library before parser), M1 (optimistic UI, no modal creation), M2 (cursor pagination from first query), M4 (Valkey pub/sub architecture, not in-process), M5 (computed run status), Mi4 (keyboard shortcut conflict testing).

Research flag: Phase 2 has the most unknowns. Recommend /gsd:research-phase for: SSE implementation on Railway (verify timeout configuration), Jira OAuth + two-way sync (sync loop prevention), JUnit XML parser strategy (fixture set verification).

**Phase 3: Growth Features**

Rationale: Once the core loop (write test → run test → see results) is validated by paying customers, add features that drive expansion revenue and retention.

Delivers: AI generation, GitHub/GitLab integration, Slack notifications, trend reporting, coverage reports.

Features from FEATURES.md:
- AI test case generation (from spec or description) — do not ship half-baked
- GitHub/GitLab integration (trigger runs on PR, link failure to commit)
- Slack notifications (run complete, new failure)
- Trend charts (flakiness detection setup — needs 90+ days of run history)
- Coverage reports (requires Jira issue links from Phase 2 INT-01)

Must avoid: Shipping AI generation before the test case editor (Phase 2) is stable — AI output is a test case; the editor API must be stable first.

Research flag: Recommend /gsd:research-phase for AI generation UX patterns and Claude API integration strategy (prompt design for test case generation from spec text).

**Phase 4: Enterprise Tier**

Rationale: Add compliance and data isolation guarantees required for enterprise procurement. Add RLS as a defense-in-depth layer on top of the application-layer enforcement built in Phase 1.

Delivers: SOC 2 audit readiness, cryptographic data isolation, SSO, audit logs.

Features: RLS enforcement layer, SSO (SAML/OIDC), full audit log, AI failure analysis (P2).

Research flag: Standard patterns — low research need. SAML integration may require additional library evaluation.

### Feature Dependencies (Critical Path)

```
Phase 1: Auth + Workspace middleware
  └── Gates: everything in Phase 2

Phase 2 Domain A: TC-02 Suite structure → TC-01 Test cases
  └── Gates: TR-01 Run creation (cases must exist)
       └── Gates: TR-02 Execution → DA-01 Live dashboard

Phase 2 Domain B: API-01 REST API
  └── Gates: IN-01 Ingestion (ingestion is an API endpoint)
  └── Gates: INT-01 Jira (calls Jira API, receives webhooks)

Phase 2 Domain C: IN-01 Ingestion
  └── Enables: DA-01 (automated results show in dashboard)

Phase 3: AI Generation
  └── Requires: TC-01 stable editor API (output is a test case)

Phase 3: Coverage Reports
  └── Requires: INT-01 Jira links on test cases (Phase 2)

Phase 3: Trend/Flakiness
  └── Requires: 90+ days of TR-02 run history from paying customers
```

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (gap fills) | MEDIUM-HIGH | Vitest, Playwright, Zod, dnd-kit: HIGH. Drizzle-kit, BullMQ Valkey compatibility, Resend, testcontainers: MEDIUM — verify versions at integration time |
| Features | MEDIUM-HIGH | Table stakes and anti-features: HIGH (stable domain knowledge). Differentiator gap analysis (especially Qase real-time status): MEDIUM — verify competitor feature pages before finalising roadmap |
| Architecture | HIGH | Monolith-first, SSE, postgres.js, multi-tenancy patterns are established and well-documented |
| Pitfalls | HIGH | C1-C2, M2-M5, Mi4: HIGH confidence (well-documented traps). C3 (Railway proxy), C5 (Auth.js v5), Mi3 (Railway cold starts): MEDIUM — verify against current Railway and Auth.js docs |

**Overall confidence: MEDIUM-HIGH**

**Known gaps requiring validation before roadmap finalization:**
1. Auth.js v5 stable API surface — verify Valkey session adapter compatibility at https://authjs.dev
2. Railway SSE timeout configuration — verify whether it is configurable on the target plan tier
3. Qase real-time feature status — verify before using "no competitor has real-time" in marketing
4. BullMQ 5.x Valkey 8.x protocol compatibility — verify in BullMQ release notes at time of integration

---

## Research Flags for Roadmapper

| Phase | Research Flag | Reason |
|-------|---------------|--------|
| Phase 1 | LOW — proceed with standard patterns | Auth, multi-tenancy, schema are well-documented |
| Phase 2 (SSE/Railway) | MEDIUM — verify before building | Railway proxy timeout behavior for SSE |
| Phase 2 (Jira integration) | MEDIUM — recommend /gsd:research-phase | Two-way sync loop prevention, Jira field schema discovery |
| Phase 2 (JUnit parser) | MEDIUM — fixture library research needed | Collect real-world JUnit XML samples from target CI platforms |
| Phase 3 (AI generation) | HIGH — recommend /gsd:research-phase | Prompt design, Claude API integration patterns, UX for AI-assisted test writing |
| Phase 4 (Enterprise/SSO) | LOW-MEDIUM | Standard SAML/OIDC patterns; library evaluation needed |

---

## Sources (Aggregated)

- Training knowledge cutoff: August 2025. External verification recommended for version-sensitive items.
- TestRail, Qase, PractiTest, Xray, qTest, Zephyr, Allure TestOps feature sets
- PostgreSQL 16 documentation (recursive CTEs, JSONB, RLS)
- Fastify 5 official docs (fastify.dev)
- Auth.js v5 (authjs.dev — verify current stable API)
- BullMQ docs (docs.bullmq.io)
- Playwright (playwright.dev)
- Drizzle ORM (orm.drizzle.team)
- Resend (resend.com/docs)
- dnd-kit (dndkit.com)
- Railway networking and deployment docs (verify current timeout and sleep behavior)
- JUnit XML schema variants (Apache Surefire, pytest-junit, Jest-junit, Go gotestsum, Playwright documentation)
- Allure JSON schema versions (allure-framework/allure2 releases)
