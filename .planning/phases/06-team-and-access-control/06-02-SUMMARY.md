---
phase: 06-team-and-access-control
plan: 02
subsystem: backend-api
tags: [invitations, rbac, tier-enforcement, email-queue, tdd]
dependency_graph:
  requires: [06-01]
  provides: [invitation-crud, accept-invite-flow, editor-seat-cap, workspace-invite-email]
  affects: [server.ts, email.worker.ts, workspace_invitations-table]
tech_stack:
  added: []
  patterns: [bcrypt-token-hashing, withWorkspace-tenant-scoped-insert, free-tier-cap-enforcement, bullmq-email-queue]
key_files:
  created:
    - apps/api/src/routes/members.ts
  modified:
    - apps/api/src/routes/__tests__/members.test.ts
    - apps/api/src/queues/email.worker.ts
    - apps/api/src/server.ts
decisions:
  - "Admin guard uses bare sql (not withWorkspace) — pre-RLS context check before setting workspace transaction"
  - "Editor cap counts active workspace_members with role=editor using bare sql — same approach as workspace slug uniqueness"
  - "Invite token validation iterates pending invites by email (ORDER BY created_at DESC); breaks on first match — handles multiple pending invites gracefully"
  - "Reply.send() called after withWorkspace transaction to avoid race conditions"
  - "Already-member 409 caught via postgres error code 23505 (unique constraint) inside try/catch around withWorkspace"
  - "Email worker uses switch statement with default fallback — otp/password-reset/welcome types log and skip (handled upstream by email.ts lib)"
metrics:
  duration_minutes: 11
  completed_date: "2026-03-10"
  tasks_completed: 2
  files_changed: 4
---

# Phase 06 Plan 02: Invitation CRUD Routes and Tier Enforcement Summary

Invitation backend with bcrypt tokens, editor seat cap enforcement, and workspace-invite email worker handler. Admin-only routes for creating/listing invitations and an authenticated accept route that inserts the new workspace member.

---

## What Was Built

### Task 1: Invitation routes + tier enforcement (TDD)

**`apps/api/src/routes/members.ts`** — Fastify plugin with three routes:

- **POST `/api/workspaces/:workspaceId/invitations`** (admin only):
  - Admin guard via bare `sql` (pre-RLS context)
  - Free tier editor cap: counts active editors, returns 403 `TIER_LIMIT_EXCEEDED` if `>= 3` on free plan
  - Existing-member check via `workspace_members JOIN users ON email`
  - Invalidates prior pending invites for same email (`SET accepted_at = NOW()`)
  - Generates 64-char hex token, bcrypt-hashes it (10 rounds), inserts into `workspace_invitations` via `withWorkspace`
  - Queues `workspace-invite` email job via `emailQueue.add`
  - Returns 201 with `{ id, email, role, expires_at }`

- **POST `/api/workspaces/:workspaceId/invitations/accept`** (authenticated):
  - Looks up user's email from `users` table
  - Finds pending invitations (not accepted, any expiry) for that email in the workspace
  - Iterates invites comparing bcrypt token; returns 400 if no match
  - Returns 400 if matched invite is expired
  - Uses `withWorkspace` to mark invite accepted + insert `workspace_members` row atomically
  - Catches 23505 (unique constraint) to return 409 already-member

- **GET `/api/workspaces/:workspaceId/invitations`** (admin only):
  - Returns pending invitations (accepted_at IS NULL, expires_at > NOW())
  - Never exposes `token_hash`

Registered in `apps/api/src/server.ts` alongside other route plugins.

### Task 2: Email worker workspace-invite handler

**`apps/api/src/queues/email.worker.ts`** — Added switch statement with `workspace-invite` case:
- Lazy `getResend()` helper throws only if `RESEND_API_KEY` missing at send time
- Sends plain-text invitation email with inviteUrl, workspaceName, inviterName
- Other job types (otp, password-reset, welcome) handled upstream by email.ts lib — worker logs and skips

---

## Test Results

All 14 tests pass (members.test.ts):

**USR-01 (POST /invitations):**
- 201 + email queued when admin invites valid email
- 403 when non-admin tries to invite
- 409 when email is already an active member
- Re-invite invalidates prior pending invite (accepted_at set)

**USR-02 (POST /invitations/accept):**
- 200 + workspace_members row created when token valid
- 400 when token is expired
- 400 when token is invalid (wrong token)
- 409 when user is already a member

**USR-05 (Editor seat cap):**
- 201 for viewer invite (unlimited)
- 403 TIER_LIMIT_EXCEEDED when 3 editors exist and inviting another editor

**USR-06 (Tier enforcement):**
- 403 with TIER_LIMIT_EXCEEDED code and upgrade message in error body

**GET /invitations:**
- 200 list for admin (no token_hash exposed)
- 403 for non-admin

Full test suite: 163 passed, 37 todo — zero failures.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] workspace_invitations table missing from test DB**
- **Found during:** Task 1 test run
- **Issue:** Migration 0006 was in the journal but not applied to `velo_dev` DB (Drizzle migrator had already recorded prior migrations; 0006 was added as an untracked file and not applied)
- **Fix:** Manually applied `0006_team_access_control.sql` via `sql.unsafe()`, then inserted the migration hash into `drizzle.__drizzle_migrations` to prevent re-run, and granted `velo_app` role permissions on the new table
- **Files modified:** DB only (idempotent fixup — migration SQL was already written)
- **Commits:** N/A (DB state change, not a code commit)

### Plan Executed As Written

- Token invalidation, admin guard pattern, withWorkspace usage, tier cap logic — all follow plan specifications exactly
- Email worker handler matches the exact code pattern from 06-RESEARCH.md

---

## Self-Check: PASSED

- apps/api/src/routes/members.ts: FOUND
- apps/api/src/queues/email.worker.ts: FOUND
- apps/api/src/routes/__tests__/members.test.ts: FOUND
- apps/api/src/server.ts: FOUND (memberRoutes registered)
- Commit 43e6550 (feat task 1): FOUND
- Commit 0697acb (feat task 2): FOUND
- All 14 tests pass
- Full CI simulation (lint + typecheck + tests): PASS
