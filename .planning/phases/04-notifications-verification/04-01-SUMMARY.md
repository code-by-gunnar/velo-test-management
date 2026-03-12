---
phase: 04-notifications-verification
plan: 01
subsystem: email
tags: [email, lifecycle, gdpr, templates, bullmq]
dependency_graph:
  requires: []
  provides: [lifecycle-email-templates, lifecycle-email-queue-types, sendLifecycleEmails-helper]
  affects: [email.worker.ts, email.queue.ts, email-templates.ts, email.ts]
tech_stack:
  added: []
  patterns: [batch-enqueue-per-recipient, typed-union-dispatch]
key_files:
  created: []
  modified:
    - apps/api/src/lib/email-templates.ts
    - apps/api/src/queues/email.queue.ts
    - apps/api/src/queues/email.worker.ts
    - apps/api/src/lib/email.ts
decisions:
  - Removed unused originalEmail param from userErasureCompletedEmail to satisfy no-unused-vars lint rule
metrics:
  duration: 3m
  completed: "2026-03-12T13:02:39Z"
requirements: [WLC-05, TRN-03]
---

# Phase 04 Plan 01: Lifecycle Email Templates Summary

Six lifecycle email templates (3 workspace deletion + 3 user erasure) wired into BullMQ email worker with batch-send helper for multi-recipient notifications.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add lifecycle email templates | 58c0a7a | apps/api/src/lib/email-templates.ts |
| 2 | Extend email queue types | 20d7bd6 | apps/api/src/queues/email.queue.ts |
| 3 | Add lifecycle email handlers to worker | 9b5742f | apps/api/src/queues/email.worker.ts |
| 4 | Add sendLifecycleEmails batch helper | 0444853 | apps/api/src/lib/email.ts |

## What Was Built

**Email Templates (email-templates.ts):**
- `workspaceDeletionRequestedEmail(workspaceName, scheduledDate, exportUrl)` -- includes export CTA
- `workspaceDeletionWarningEmail(workspaceName, scheduledDate, timeRemaining, cancelUrl)` -- includes cancel link
- `workspaceDeletionCompletedEmail(workspaceName)` -- confirmation only
- `userErasureRequestedEmail(scheduledDate, cancelUrl)` -- includes cancel CTA
- `userErasureWarningEmail(scheduledDate, timeRemaining)` -- reminder with deadline
- `userErasureCompletedEmail()` -- confirmation of anonymization

All templates use the existing `layout()`, `heading()`, `paragraph()`, `button()`, and `muted()` helpers for consistent Industrial Notebook branding.

**Queue Types (email.queue.ts):**
EmailJobData type union extended with 6 new literals: `workspace-deletion-requested`, `workspace-deletion-warning`, `workspace-deletion-completed`, `user-erasure-requested`, `user-erasure-warning`, `user-erasure-completed`.

**Worker Handlers (email.worker.ts):**
Six new switch cases in the email worker, each extracting typed payload and sending via Resend with both HTML template and plain-text fallback.

**Batch Helper (email.ts):**
`sendLifecycleEmails(recipients, subject, type, payload)` enqueues one BullMQ job per recipient. Fire-and-forget with independent retry semantics per job.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused parameter from userErasureCompletedEmail**
- **Found during:** Task 1 (lint verification)
- **Issue:** Plan specified `originalEmail: string` parameter but the template body never uses it. ESLint `@typescript-eslint/no-unused-vars` flagged this as an error.
- **Fix:** Removed the parameter entirely. The worker already has `to` for the recipient address; no information is lost.
- **Files modified:** apps/api/src/lib/email-templates.ts, apps/api/src/queues/email.worker.ts

## Verification

- `pnpm typecheck` (apps/api): PASSED
- `pnpm lint` (apps/api): PASSED (zero errors, zero warnings)

## Self-Check: PASSED

All 4 files exist. All 4 commit hashes verified.
