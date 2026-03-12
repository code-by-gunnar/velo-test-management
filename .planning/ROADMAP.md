# Roadmap: v1.1 GDPR & Data Lifecycle

## Overview

Add GDPR data rights and workspace lifecycle management to Velo before launch. Four phases: lay the schema and infrastructure foundation (queue, audit log, privacy page), build the core lifecycle workers and API routes (workspace deletion + user erasure), add workspace export and the frontend UI for all lifecycle features, then wire up email notifications and run integration tests. Zero new npm packages -- everything builds on existing BullMQ, postgres.js, Resend, and R2 primitives.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Schema & Foundation** - Migrations, lifecycle queue, daily sweep, audit log table, and privacy policy page
- [ ] **Phase 2: Lifecycle Workers & API** - Workspace deletion, user erasure, R2 cleanup, session invalidation, and request/cancel API routes
- [ ] **Phase 3: Export & Frontend** - Workspace data export (JSON/CSV), deletion/erasure UI in settings and profile, status banners
- [ ] **Phase 4: Notifications & Verification** - Lifecycle email notifications, member deletion alerts, and integration tests

## Phase Details

### Phase 1: Schema & Foundation
**Goal**: All database tables, columns, queue infrastructure, and the privacy policy page exist -- ready for workers and API routes to build on top
**Depends on**: Nothing (first phase)
**Requirements**: INF-01, INF-02, INF-03, INF-04, TRN-01
**Success Criteria** (what must be TRUE):
  1. Migration adds deletion columns to `workspaces` table and creates `user_erasure_requests` and `erasure_audit_log` tables -- verified by running the migration and inspecting the schema
  2. BullMQ `lifecycle` queue exists (separate from `email` queue) and accepts delayed jobs with deterministic `jobId` for cancellation
  3. Daily sweep repeatable job is registered at 3 AM and queries for expired grace periods in both `workspaces` and `user_erasure_requests`
  4. `/privacy` page renders without authentication and contains data controller identity, processing purposes, legal basis, retention periods, and user rights
**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md -- GDPR lifecycle database migration (workspace deletion columns, erasure requests table, audit log table)
- [ ] 01-02-PLAN.md -- BullMQ lifecycle queue, worker skeleton with daily sweep, audit log helper
- [ ] 01-03-PLAN.md -- Public privacy policy page (/privacy)

### Phase 2: Lifecycle Workers & API
**Goal**: Admins can request and cancel workspace deletion, users can request and cancel personal erasure, and expired grace periods execute the correct cleanup (hard-delete workspace data, anonymize user PII, purge R2 objects)
**Depends on**: Phase 1
**Requirements**: WLC-01, WLC-02, WLC-03, WLC-04, UER-01, UER-02, UER-03, UER-04, UER-05
**Success Criteria** (what must be TRUE):
  1. Admin can request workspace deletion -- system records `deletion_requested_at`, `deletion_scheduled_at` (now + 30 days), enqueues a BullMQ delayed job with `jobId: ws-delete:{workspaceId}`
  2. Admin can cancel workspace deletion during the 30-day grace period -- BullMQ job is removed, all `deletion_*` columns are cleared
  3. When workspace grace period expires, worker collects R2 keys BEFORE cascade, batch-deletes R2 objects, then hard-deletes the workspace row (CASCADE handles child tables), with atomic status claim preventing concurrent execution
  4. User can request erasure -- system creates `user_erasure_requests` row, enqueues delayed job, and immediately writes `deactivated:{workspaceId}:{userId}` to Valkey blocklist (existing session plugin returns 401)
  5. When user erasure grace period expires, worker anonymizes all PII fields (name, email via `deleted-{uuid}@deleted.invalid`, password_hash, avatar_url after R2 delete, pending_email) and the user row is preserved so `created_by` references resolve to "Deleted User"
**Plans**: TBD

### Phase 3: Export & Frontend
**Goal**: Admins can export all workspace data, and all lifecycle status (pending deletion, pending erasure, scheduled dates, cancel buttons) is visible in the appropriate settings pages
**Depends on**: Phase 2
**Requirements**: WEX-01, WEX-02, WEX-03, TRN-02
**Success Criteria** (what must be TRUE):
  1. Workspace admin can trigger a full export from settings and download a ZIP containing test cases with steps, suites (hierarchy preserved), test runs with results, and workspace settings -- each entity type as a separate file
  2. Export format choice (JSON or CSV) works correctly -- JSON preserves nested structure, CSV flattens for spreadsheet compatibility
  3. Pending workspace deletion status is visible in workspace settings showing scheduled date, time remaining, and a cancel button
  4. Pending user erasure status is visible in profile settings showing scheduled date, time remaining, and a cancel button
**Plans**: TBD

### Phase 4: Notifications & Verification
**Goal**: All lifecycle events trigger the correct email notifications, and integration tests verify idempotent deletion, cancellation, sweep recovery, and the full request-to-completion lifecycle
**Depends on**: Phase 3
**Requirements**: WLC-05, TRN-03
**Success Criteria** (what must be TRUE):
  1. All active workspace members receive an email when an admin requests workspace deletion, including the scheduled deletion date and advice to export data
  2. Three email touchpoints fire per lifecycle event: request acknowledged (with scheduled date), warning before grace period expires, and completion confirmation
  3. `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test` passes with zero errors, including new integration tests for lifecycle workers
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema & Foundation | 0/3 | Not started | - |
| 2. Lifecycle Workers & API | 0/? | Not started | - |
| 3. Export & Frontend | 0/? | Not started | - |
| 4. Notifications & Verification | 0/? | Not started | - |

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| INF-01 | Phase 1 |
| INF-02 | Phase 1 |
| INF-03 | Phase 1 |
| INF-04 | Phase 1 |
| TRN-01 | Phase 1 |
| WLC-01 | Phase 2 |
| WLC-02 | Phase 2 |
| WLC-03 | Phase 2 |
| WLC-04 | Phase 2 |
| UER-01 | Phase 2 |
| UER-02 | Phase 2 |
| UER-03 | Phase 2 |
| UER-04 | Phase 2 |
| UER-05 | Phase 2 |
| WEX-01 | Phase 3 |
| WEX-02 | Phase 3 |
| WEX-03 | Phase 3 |
| TRN-02 | Phase 3 |
| WLC-05 | Phase 4 |
| TRN-03 | Phase 4 |

**Total: 20/20 requirements mapped. No orphans.**

---
*Roadmap created: 2026-03-12*
*Last updated: 2026-03-12*
