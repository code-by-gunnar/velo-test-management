# Requirements: v1.1 GDPR & Data Lifecycle

**Milestone:** v1.1
**Created:** 2026-03-12
**Status:** Approved

---

## Workspace Lifecycle

### WLC-01 — Request Workspace Deletion
Admin can request workspace deletion from workspace settings. System records `deletion_requested_at`, `deletion_scheduled_at` (now + 30 days), `deletion_requested_by`, and sets `deletion_status = 'pending_deletion'`. A BullMQ delayed job is enqueued with deterministic `jobId: ws-delete:{workspaceId}`.

### WLC-02 — Cancel Workspace Deletion
Admin can cancel a pending deletion during the 30-day grace period. System removes the BullMQ job by `jobId`, clears all `deletion_*` columns. Cancellation is independent of any member's individual erasure request (GM1).

### WLC-03 — Hard-Delete Workspace
When the grace period expires, the lifecycle worker: (1) collects all R2 keys by workspace prefix, (2) batch-deletes R2 objects, (3) cleans up Valkey keys by workspace pattern, (4) hard-deletes the workspace row (CASCADE handles all child tables). Uses atomic status claim to prevent concurrent execution (GC4).

### WLC-04 — R2 Cleanup Before CASCADE
R2 object keys (avatars, CI payloads) are enumerated BEFORE the DB CASCADE fires. After CASCADE, FK references are gone and key paths cannot be reconstructed (GC2).

### WLC-05 — Member Deletion Notifications
All active workspace members receive an email notification when an admin requests workspace deletion. Notification includes the scheduled deletion date and advises members to export data if needed.

---

## User Erasure

### UER-01 — Request User Erasure
User can request erasure of their personal data from profile settings. System creates a `user_erasure_requests` row with `status = 'pending'` and `scheduled_at = now + 7 days`. A BullMQ delayed job is enqueued with `jobId: user-erase:{userId}`.

### UER-02 — Cancel User Erasure
User can cancel a pending erasure during the 7-day grace period. System removes the BullMQ job, sets erasure request `status = 'cancelled'`. Independent of workspace deletion lifecycle (GM1).

### UER-03 — Anonymize PII
When the grace period expires, the lifecycle worker anonymizes all PII fields: `name → 'Deleted User'`, `email → 'deleted-{uuid}@deleted.invalid'`, `password_hash → NULL`, `avatar_url → NULL` (after R2 delete), `pending_email → NULL`. The `deleted-{uuid}@deleted.invalid` pattern frees the original email for re-registration (GC5). Covers ALL PII-bearing columns (GC3).

### UER-04 — Immediate Session Invalidation
At erasure REQUEST time (not grace period end), write `deactivated:{workspaceId}:{userId}` to Valkey blocklist. Existing session plugin returns 401 immediately. JWT tokens are functionally dead even though they still exist (GC1).

### UER-05 — Preserved References
User row is anonymized, not deleted. `created_by` UUIDs in `test_cases`, `run_items`, `run_item_step_comments`, and `defects` still resolve via JOIN — but now display "Deleted User" instead of the real name.

---

## Workspace Export

### WEX-01 — Export Workspace Data
Workspace admin can trigger a full workspace export from settings. System generates a ZIP file containing workspace data in the user's chosen format.

### WEX-02 — Export Content
Export includes: test cases with steps, suites (hierarchy preserved), test runs with results, and workspace/project settings. Each entity type is a separate file within the ZIP.

### WEX-03 — Format Options
User chooses between JSON and CSV format at export time. JSON preserves nested structure (steps within cases). CSV flattens for spreadsheet compatibility.

---

## Transparency

### TRN-01 — Privacy Policy Page
Static `/privacy` page with data controller identity, processing purposes, legal basis (contract performance), retention periods, and user rights (Articles 13/14). Accessible without authentication.

### TRN-02 — Erasure Status UI
Pending deletion/erasure status is visible in workspace settings and profile settings respectively. Shows scheduled date, time remaining, and cancel button. Article 12 transparency compliance.

### TRN-03 — Confirmation Emails
Three email touchpoints per lifecycle event: (1) request acknowledged with scheduled date, (2) warning before grace period expires, (3) completion confirmation. Uses existing Resend integration.

---

## Infrastructure

### INF-01 — Lifecycle Queue
New BullMQ `lifecycle` queue (separate from `email` queue). Handles `workspace-delete`, `user-erasure`, and `sweep-expired` job types. Delayed jobs with deterministic `jobId` for cancellation.

### INF-02 — Idempotent Workers
Every worker step uses check-then-act pattern. Atomic status claim (`UPDATE ... SET status = 'processing' WHERE status = 'pending_deletion' RETURNING id`) prevents concurrent execution. Each step is independently retryable (GC4).

### INF-03 — Daily Sweep
Repeatable job at 3 AM daily. Catches expired grace periods where the delayed job failed. Queries `workspaces WHERE deletion_scheduled_at < NOW() AND deletion_status = 'pending_deletion'` and `user_erasure_requests WHERE scheduled_at < NOW() AND status = 'pending'`.

### INF-04 — Erasure Audit Log
`erasure_audit_log` table records all lifecycle events. Stores UUIDs and timestamps only — never PII (GM2). Entries have a 2-year TTL. Supports ICO audit if questioned.

---

## Schema Additions

### Workspace Deletion Columns (on `workspaces` table)
- `deletion_requested_at TIMESTAMPTZ`
- `deletion_scheduled_at TIMESTAMPTZ`
- `deletion_requested_by UUID REFERENCES users(id) ON DELETE SET NULL`
- `deletion_job_id TEXT`
- `deletion_status TEXT` — NULL | 'pending_deletion' | 'processing' | 'completed'

### New Tables
- `user_erasure_requests` — tracks individual erasure lifecycle
- `erasure_audit_log` — non-PII audit trail

---

## Pitfall Cross-References

| Req | Pitfall | Mitigation |
|-----|---------|------------|
| WLC-03, INF-02 | GC4 (non-idempotent jobs) | Atomic status claim, check-then-act |
| WLC-04 | GC2 (R2 orphans) | Enumerate keys BEFORE CASCADE |
| UER-03 | GC3 (weak anonymization) | All PII fields covered |
| UER-03 | GC5 (email UNIQUE) | `deleted-{uuid}@deleted.invalid` pattern |
| UER-04 | GC1 (JWT sessions) | Valkey blocklist at request time |
| UER-02, WLC-02 | GM1 (restore vs erasure) | Independent lifecycle tracking |
| INF-04 | GM2 (audit log PII) | UUIDs only, 2-year TTL |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INF-01 | Phase 1 | Pending |
| INF-02 | Phase 1 | Pending |
| INF-03 | Phase 1 | Pending |
| INF-04 | Phase 1 | Pending |
| TRN-01 | Phase 1 | Pending |
| WLC-01 | Phase 2 | Pending |
| WLC-02 | Phase 2 | Pending |
| WLC-03 | Phase 2 | Pending |
| WLC-04 | Phase 2 | Pending |
| UER-01 | Phase 2 | Pending |
| UER-02 | Phase 2 | Pending |
| UER-03 | Phase 2 | Pending |
| UER-04 | Phase 2 | Pending |
| UER-05 | Phase 2 | Pending |
| WEX-01 | Phase 3 | Pending |
| WEX-02 | Phase 3 | Pending |
| WEX-03 | Phase 3 | Pending |
| TRN-02 | Phase 3 | Complete |
| WLC-05 | Phase 4 | Pending |
| TRN-03 | Phase 4 | Complete |

---

*Sources: ARCHITECTURE.md, FEATURES.md, PITFALLS.md, SUMMARY.md*
