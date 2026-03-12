# Feature Landscape: GDPR & Data Lifecycle

**Domain:** GDPR compliance for multi-tenant SaaS
**Project:** Velo v1.1
**Researched:** 2026-03-12
**Legal basis:** Contract performance (not consent) — eliminates cookie banners, consent withdrawal flows, CMP tooling

---

## Table Stakes (Must-Have for UK GDPR Compliance)

### Privacy Policy Page
- **Article 13 transparency obligation** — legally required before processing any personal data
- Static `/privacy` page with data controller identity, processing purposes, legal basis, retention periods, user rights
- Complexity: LOW (static page, content needs legal review)
- Dependencies: None — can ship first

### Right to Erasure — Individual User (Article 17)
- User can request deletion of their personal data from profile/settings
- 7-day grace period with cancellation
- Anonymize PII (name → "Deleted User", email → `deleted-{uuid}@deleted.invalid`, avatar deleted from R2)
- Preserve test history (runs, comments) with anonymized references — cascade-deleting would break other users' data
- Complexity: HIGH (anonymization across multiple tables, R2 cleanup, session invalidation)
- Dependencies: Privacy policy (must explain rights before enabling them)

### Right to Erasure — Workspace (Article 17)
- Admin can request workspace deletion from settings
- 30-day grace period with cancellation
- Hard delete ALL workspace data: users removed from workspace, test cases, suites, runs, run items, comments, defects, API keys, invitations, CI ingestion data
- Delete R2 objects (avatars, CI payloads) by workspace prefix
- Complexity: HIGH (cascade delete across 15+ tables, R2 bulk cleanup, BullMQ scheduled jobs)
- Dependencies: User erasure (individual rights must work independently of workspace lifecycle)

### Data Export / Portability (Article 20)
- User can download all their personal data as JSON
- Scope: name, email, avatar URL, workspace memberships, roles
- Lightweight — Velo stores minimal PII
- Complexity: LOW (single API endpoint, JSON response)
- Dependencies: None

### Grace Period + Cancellation
- Workspace deletion: 30-day grace, admin can cancel anytime during grace
- User erasure: 7-day grace, user can cancel anytime during grace
- ICO best practice — prevents accidental irreversible deletion
- Complexity: MEDIUM (BullMQ delayed jobs with deterministic jobId for cancellation)
- Dependencies: Workspace deletion and user erasure features

### Scheduled Hard-Delete Jobs
- BullMQ delayed jobs execute after grace period expires
- Must be idempotent (safe to retry on failure)
- Daily sweep job as safety net for any missed delayed jobs
- Complexity: MEDIUM (new lifecycle queue, worker with progress tracking)
- Dependencies: BullMQ queue setup

### Erasure Status Visibility
- Show pending deletion/erasure status in account settings and workspace settings
- Article 12 transparency — user must know the status of their request
- Complexity: LOW (read deletion_requested_at columns, display banner)
- Dependencies: Deletion request endpoints

---

## Differentiators (Beyond Minimum Compliance — Builds Trust)

### Self-Serve Erasure
- No support ticket needed — user/admin can request from UI
- ICO explicitly recommends self-serve rights mechanisms
- Complexity: MEDIUM (UI flows in settings pages)

### Deletion Confirmation Emails
- Email at request time, warning before grace expires, confirmation after deletion
- Uses existing Resend integration
- Complexity: LOW (3 email templates, BullMQ triggers)

### Workspace Deletion Member Notifications
- Notify workspace members when admin requests deletion
- Give members time to export their data before workspace is gone
- Complexity: LOW (email to all active members)

### R2 Avatar Deletion in Erasure Job
- Delete user's avatar from R2 during anonymization
- Prevents zombie object storage files
- Complexity: LOW (single R2 delete call)

### Internal Erasure Audit Log
- Log erasure requests with UUIDs and timestamps only (no PII in the log itself)
- Supports ICO audit if questioned
- TTL on audit entries (e.g., 2 years)
- Complexity: LOW (simple table insert)

---

## Anti-Features (Deliberately NOT Building)

| Feature | Why Not |
|---------|---------|
| Cookie consent banner | Session cookie is strictly necessary (exempt). No analytics cookies. |
| Consent management platform | Legal basis is contract, not consent. No consent to manage. |
| DPA / Terms of Service | Needs legal review, not code. Defer to lawyer. |
| Full Article 30 RoPA | Article 30(5) exempts <250 employees for non-high-risk processing. |
| DSAR automation tooling | mailto: link is compliant at current scale. |
| Right to restriction / right to object | Irrelevant for contract-basis processing. |
| Automated decision-making disclosures (Article 22) | Velo makes no automated decisions about users. |

---

## Complexity Summary

| Feature | Effort | Priority |
|---------|--------|----------|
| Privacy policy page | 1 day | P0 |
| Data export endpoint | 1 day | P0 |
| User erasure (anonymize) | 2-3 days | P0 |
| Workspace deletion (hard delete) | 2-3 days | P0 |
| Grace period + cancellation | 1 day | P0 |
| Scheduled cleanup jobs | 1 day | P0 |
| Erasure status UI | 0.5 day | P1 |
| Deletion confirmation emails | 0.5 day | P1 |
| Member notifications | 0.5 day | P1 |
| **Total** | **~9 days** | |

---

## Dependency Order

```
Privacy Policy (no deps)
    └─→ Data Export (no deps)
        └─→ User Erasure + Cancellation
            └─→ Workspace Deletion + Member Notifications
                └─→ Scheduled Cleanup Jobs
                    └─→ Status UI + Confirmation Emails
```

---

*Sources: ICO Right to Erasure guidance, EDPB 2025 coordinated enforcement report, GDPR Articles 12/13/17/20, ICO Data Portability guidance*
