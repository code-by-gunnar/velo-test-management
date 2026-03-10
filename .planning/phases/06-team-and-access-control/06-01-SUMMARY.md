---
phase: 06-team-and-access-control
plan: 01
subsystem: team-access
tags: [migration, schema, rbac, invitations, email-queue, test-stubs]
dependency_graph:
  requires: []
  provides: [workspace_invitations migration, workspaceInvitations schema, workspace-invite email type, USR test stubs]
  affects: [apps/api/src/db/schema.ts, apps/api/src/queues/email.queue.ts, apps/api/drizzle/]
tech_stack:
  added: []
  patterns: [drizzle schema definition, RLS policy, BullMQ email queue type extension, vitest todo stubs]
key_files:
  created:
    - apps/api/drizzle/0006_team_access_control.sql
    - apps/api/src/routes/__tests__/members.test.ts
  modified:
    - apps/api/drizzle/meta/_journal.json
    - apps/api/src/db/schema.ts
    - apps/api/src/queues/email.queue.ts
decisions:
  - workspaceInvitations uses token_hash (not raw token) matching the pattern established by verificationTokens and passwordResetTokens
  - RLS workspace_isolation policy on workspace_invitations matches pattern from all other tenant tables
  - Test stubs use it.todo() (not it.skip()) — vitest counts them as todo not failed
metrics:
  duration: ~5 minutes
  completed: "2026-03-10"
  tasks_completed: 2
  files_changed: 5
---

# Phase 6 Plan 1: Team Access Foundation (Wave 0) Summary

**One-liner:** workspace_invitations migration with RLS policy, Drizzle schema definition using existing workspaceRoleEnum, email queue extended with workspace-invite type, and 20 vitest todo stubs covering all USR-01 through USR-06 requirements.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create workspace_invitations migration and schema definition | e176a71 | 0006_team_access_control.sql, _journal.json, schema.ts, email.queue.ts |
| 2 | Create test stubs for all USR requirements | 18b7cc3 | members.test.ts |

---

## Verification Results

- `npx tsc --noEmit` — PASSED (no errors)
- `pnpm --recursive lint` — PASSED (zero warnings)
- `pnpm --recursive typecheck` — PASSED (both apps/api and apps/web)
- `pnpm test members.test.ts --reporter=verbose` — PASSED (20 todo stubs, 0 failures)
- Full API test suite — PASSED (149 tests pass, 57 todo, 0 failures)

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Self-Check: PASSED

- `apps/api/drizzle/0006_team_access_control.sql` — FOUND
- `apps/api/drizzle/meta/_journal.json` entry idx 6 — FOUND
- `apps/api/src/db/schema.ts` exports `workspaceInvitations` — FOUND
- `apps/api/src/queues/email.queue.ts` contains `"workspace-invite"` — FOUND
- `apps/api/src/routes/__tests__/members.test.ts` — FOUND (56 lines, 20 todo stubs)
- Commits e176a71 and 18b7cc3 — FOUND in git log
