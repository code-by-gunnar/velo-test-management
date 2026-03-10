---
phase: 06-team-and-access-control
plan: "03"
subsystem: members-api
tags: [rbac, deactivation, session-invalidation, valkey, tdd]
dependency_graph:
  requires: [06-02]
  provides: [USR-03, USR-04]
  affects: [session-plugin, members-routes]
tech_stack:
  added: []
  patterns:
    - Valkey blocklist key pattern (deactivated:{workspaceId}:{userId}) with 30-day TTL
    - Direct valkey import in route files (consistent with existing pattern)
    - Fail-open Valkey error handling in preHandler to avoid blocking all auth requests
key_files:
  created: []
  modified:
    - apps/api/src/routes/members.ts
    - apps/api/src/plugins/session.plugin.ts
    - apps/api/src/routes/__tests__/members.test.ts
decisions:
  - Valkey imported directly in members.ts (not via fastify.valkey decoration) — consistent with existing route pattern; fastify.valkey decoration only used by plugins that need lifecycle management
  - Valkey blocklist SET happens before DB update on deactivation — atomic ordering ensures user cannot sneak through on race condition
  - Fail-open catch block in session plugin — Valkey outage should not lock out all authenticated users; DB membership check in individual routes is secondary guard
  - Bare sql for role change DB update (not withWorkspace) — admin operation targeting workspace_members directly; RLS context not needed for admin-level operations
metrics:
  duration: 8 minutes
  completed: "2026-03-10"
  tasks_completed: 2
  files_modified: 3
---

# Phase 6 Plan 03: Role Change and Member Deactivation Summary

**One-liner:** PATCH role change with Valkey cache bust and PATCH deactivate with 30-day blocklist key for immediate session invalidation.

---

## What Was Built

### Task 1: Role change and deactivation routes (TDD)

Two new routes added to `apps/api/src/routes/members.ts`:

**PATCH /api/workspaces/:workspaceId/members/:userId**
- Admin-only guard using bare sql (pre-RLS, consistent with invite route pattern)
- Validates body: `{ role: "admin" | "editor" | "viewer" }`
- Free tier editor cap check when upgrading to editor (same logic as invite route)
- Updates `workspace_members SET role = $role, updated_at = NOW()` where `is_active = true`
- Busts Valkey role cache key (`member_role:{workspaceId}:{userId}`) on success
- Returns 200 with `{ user_id, role }`, 403 for non-admin, 403 TIER_LIMIT_EXCEEDED for cap, 404 if member not found

**PATCH /api/workspaces/:workspaceId/members/:userId/deactivate**
- Admin-only guard
- Self-deactivation prevention: 400 if callerId === targetUserId
- Sets Valkey blocklist key (`deactivated:{workspaceId}:{userId}`) with 30-day TTL BEFORE DB update
- Updates `workspace_members SET is_active = false`
- Busts Valkey role cache key
- Returns 200 with `{ deactivated: true }`

### Task 2: Session plugin blocklist check

Extended preHandler hook in `apps/api/src/plugins/session.plugin.ts`:
- Imports `valkey` directly from `../lib/valkey.js`
- After JWT decode, checks `deactivated:{workspaceId}:{userId}` key in Valkey
- On blocklist hit: clears `userId`, `workspaceId`, `userRole` — `requireAuth` returns 401
- Empty catch block for fail-open behavior when Valkey is down

---

## Test Results

- 23 tests in members.test.ts — all pass
- 172 tests total across all test files — all pass
- 3 skipped (pre-existing, unrelated)
- 0 lint errors
- 0 TypeScript errors

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Self-Check: PASSED

Files exist:
- `apps/api/src/routes/members.ts` — FOUND (contains "deactivat")
- `apps/api/src/plugins/session.plugin.ts` — FOUND (contains "deactivated:")

Commits exist:
- `00f2239` — test(06-03): add failing tests for USR-03 role change and USR-04 deactivation
- `79ec088` — feat(06-03): add role change and deactivation routes to members.ts
- `b66513c` — feat(06-03): add Valkey blocklist check to session plugin for USR-04
