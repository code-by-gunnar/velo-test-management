# Pitfalls: GDPR & Data Lifecycle

**Project:** Velo v1.1
**Researched:** 2026-03-12
**Scope:** Common mistakes when adding GDPR data deletion to multi-tenant SaaS

---

## Critical Pitfalls

### GC1 — JWT Sessions Survive User Erasure
**Risk:** Deleted/anonymized users remain authenticated until JWT token expires. Auth.js v5 JWE tokens are stateless — they don't check the DB on every request.
**Warning signs:** User reports they can still access the app after requesting erasure.
**Prevention:** Write `deactivated:{workspaceId}:{userId}` to Valkey blocklist at erasure REQUEST time (not grace period end). Existing session plugin already checks this blocklist.
**Phase:** User erasure implementation

### GC2 — R2 Objects Orphaned After Workspace Deletion
**Risk:** PostgreSQL CASCADE deletes DB rows, but R2 avatars and CI payloads persist indefinitely. Ghost files = residual personal data = GDPR violation.
**Warning signs:** R2 storage usage never decreases after workspace deletions.
**Prevention:** Enumerate ALL R2 keys by workspace prefix BEFORE triggering DB CASCADE. Batch-delete R2 objects first, then delete the workspace row. Order matters — after CASCADE, you can't reconstruct the key paths.
**Phase:** Workspace deletion worker

### GC3 — Anonymization Is Re-Identifiable
**Risk:** Replacing name/email is necessary but not sufficient. If avatar_url, activity timestamps, or unique behavioral patterns remain, the user may still be identifiable (violating GDPR's anonymization standard).
**Warning signs:** EDPB 2025 enforcement specifically targeted weak anonymization.
**Prevention:** Audit EVERY PII-bearing column before writing the anonymization query. Delete avatar from R2. Set avatar_url to NULL. Clear pending_email. The `deleted-{uuid}@deleted.invalid` email pattern is non-reversible and UNIQUE-constraint-safe.
**Phase:** User erasure implementation

### GC4 — BullMQ Deletion Job Is Not Idempotent
**Risk:** Partial failure on retry (e.g., R2 delete succeeded but DB delete failed) leaves workspace in inconsistent state — some data deleted, some not.
**Warning signs:** Workspace stuck in "processing" status forever.
**Prevention:** Check-then-act at every step. Track progress in `deletion_status` column. Atomic status claim (`UPDATE ... SET status = 'processing' WHERE status = 'pending_deletion' RETURNING id`) prevents concurrent execution. Each step must be independently retryable.
**Phase:** Lifecycle worker implementation

### GC5 — Email UNIQUE Constraint Blocks Re-Registration After Erasure
**Risk:** If you anonymize email to a placeholder but keep the UNIQUE constraint, the original email address might not be freed for re-registration. Or worse, the placeholder collides with another anonymized user.
**Warning signs:** User tries to re-register after erasure and gets "email already exists."
**Prevention:** Use `deleted-{uuid}@deleted.invalid` pattern — UUID guarantees uniqueness, and the original email is freed. Verify Auth.js doesn't cache old email lookups.
**Phase:** User erasure implementation

---

## Moderate Pitfalls

### GM1 — Workspace Restore vs. User Erasure Interaction
**Risk:** Admin cancels workspace deletion (restore), but a member had independently requested user erasure. The workspace restore should NOT cancel the user's individual erasure request — they're separate rights.
**Warning signs:** User erasure silently cancelled when admin restores workspace.
**Prevention:** Track user erasure requests in a separate table (`user_erasure_requests`) with independent lifecycle. Workspace restore only cancels the workspace deletion job, not individual erasure jobs.
**Phase:** Cancellation logic

### GM2 — Deletion Audit Log Is Itself Personal Data
**Risk:** If the audit log stores name, email, or IP alongside erasure timestamps, the log itself becomes personal data that needs its own retention policy.
**Warning signs:** Audit log grows indefinitely with PII.
**Prevention:** Log ONLY UUIDs and timestamps — never name/email. Add a TTL to the audit table (e.g., 2 years). The UUID is meaningless after the user row is anonymized.
**Phase:** Audit log implementation

### GM3 — Deleted Avatar Visible From CDN Edge Cache
**Risk:** After R2 delete, Cloudflare edge cache may still serve the image for hours/days.
**Warning signs:** User sees their avatar still loading after erasure confirmation.
**Prevention:** Issue Cloudflare cache purge API call after R2 delete. Or set short Cache-Control headers on presigned avatar URLs (already 1-hour expiry on presigned URLs — may be acceptable).
**Phase:** R2 cleanup in erasure worker

### GM4 — Data Export Is Too Narrow
**Risk:** Article 20 data portability covers data the user PROVIDED and data GENERATED through their use of the service. Only exporting name/email may not satisfy a strict interpretation.
**Warning signs:** DSAR request asks for "all data about me."
**Prevention:** Include workspace memberships, roles, and created_at timestamps in the export JSON. Test cases and runs they created are workspace data (not personal data portability) — but mention them in the export as "workspace data available to your workspace admin."
**Phase:** Data export endpoint

---

## Minor Pitfalls

### GMi1 — Railway Backups Contain Post-Erasure Data
**Risk:** If Railway retains DB snapshots longer than 30 days, erased data persists in backups indefinitely.
**Warning signs:** Can't prove full erasure to ICO because backups exist.
**Prevention:** Document a "put beyond use" policy (ICO accepts this for backup erasure — you're not expected to delete individual rows from encrypted backups). Add a runbook note: after any backup restore, re-run pending erasures.
**Phase:** Documentation / privacy policy

### GMi2 — Grace Period Expiry Job Races With Workspace Restore
**Risk:** Admin clicks "Cancel deletion" at exactly the same moment the grace period expires and the BullMQ job fires.
**Warning signs:** Workspace deleted despite admin cancellation.
**Prevention:** Atomic status claim in the worker: `UPDATE workspaces SET deletion_status = 'processing' WHERE id = ? AND deletion_status = 'pending_deletion' RETURNING id`. If 0 rows returned (admin already cancelled), abort the job. The cancel endpoint sets `deletion_status = NULL`.
**Phase:** Lifecycle worker implementation

### GMi3 — Privacy Policy Becomes Stale When Hardcoded in JSX
**Risk:** Privacy policy text embedded in React components becomes stale and hard to update without a deploy.
**Warning signs:** Policy text is months old, doesn't reflect current processing.
**Prevention:** Store policy content in a separate markdown file or CMS-like structure. Include a "Last updated" date visible to users. Or just accept that updates require a deploy — at pre-launch scale this is fine.
**Phase:** Privacy policy page

---

## Phase Mapping Summary

| Pitfall | Phase |
|---------|-------|
| GC1 (JWT sessions) | User erasure |
| GC2 (R2 orphans) | Workspace deletion worker |
| GC3 (Weak anonymization) | User erasure |
| GC4 (Non-idempotent jobs) | Lifecycle worker |
| GC5 (Email UNIQUE) | User erasure |
| GM1 (Restore vs erasure) | Cancellation logic |
| GM2 (Audit log PII) | Audit log |
| GM3 (CDN cache) | R2 cleanup |
| GM4 (Narrow export) | Data export |
| GMi1 (Backup retention) | Documentation |
| GMi2 (Race condition) | Lifecycle worker |
| GMi3 (Stale policy) | Privacy policy page |

---

*Sources: ICO Right to Erasure guidance, EDPB 2025 coordinated enforcement report, Auth.js v5 session docs, BullMQ delayed jobs docs, Cloudflare R2 docs*
