---
phase: 05-integrations-and-api
plan: 02
subsystem: api-auth-and-routing
tags: [auth, rate-limiting, crud, api-versioning]
dependency_graph:
  requires: [05-01]
  provides: [unified-auth, rate-limiter, v1-routes, crud-gaps]
  affects: [all-api-routes]
tech_stack:
  added: []
  patterns: [unified-auth-middleware, fixed-window-rate-limiter, onRoute-url-rewriting]
key_files:
  created:
    - apps/api/src/plugins/auth.plugin.ts
    - apps/api/src/lib/rate-limiter.ts
    - apps/api/src/routes/v1.ts
  modified:
    - apps/api/src/routes/workspaces.ts
    - apps/api/src/server.ts
    - apps/api/src/routes/defects.ts
decisions:
  - requireAuth is a named preHandler (not global hook) so routes opt in explicitly
  - Rate limiter uses fixed-window counter per API key in Valkey with fail-open on errors
  - v1 routes use onRoute hook to rewrite /api/ to /api/v1/ paths within encapsulation scope
  - Project soft-delete via deleted_at column (added via runFixups) preserves test cases/runs
  - GET members returns read-only list; write operations deferred to Phase 6 RBAC
metrics:
  duration: 484s
  completed: "2026-03-10T16:30:00Z"
  tasks: 4/4
  files_created: 3
  files_modified: 3
requirements:
  - INT-03
---

# Phase 5 Plan 02: Unified Auth + /api/v1/ + CRUD Gaps + Rate Limiting Summary

Unified auth middleware that accepts both Auth.js JWE sessions and API key Bearer tokens, /api/v1/ versioned route prefix with rate limiting, and four CRUD gap routes closed for full API parity.

## What Was Built

### Task 1: Unified auth middleware plugin (245e933)
Created `apps/api/src/plugins/auth.plugin.ts` providing `fastify.requireAuth` preHandler:
- Checks if session plugin already populated userId (Auth.js JWE) first
- Falls back to API key auth for `Bearer velo_*` tokens via verifyApiKey()
- Looks up created_by user from api_keys table to set request.userId
- Adds request.apiKeyId decoration for rate limiting and audit
- Registered as fastify-plugin with session dependency

### Task 2: Rate limiter with Valkey (fe81125)
Created `apps/api/src/lib/rate-limiter.ts`:
- Fixed-window counter: 100 requests/minute per API key
- Valkey key pattern: `ratelimit:{apiKeyId}:{windowId}`
- Returns 429 with X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After headers
- Session requests pass through without rate limiting
- Fails open on Valkey errors (non-critical path)

### Task 3: CRUD gap routes (0787bca)
Added to `apps/api/src/routes/workspaces.ts`:
- `PATCH /api/workspaces/:workspaceId` - update workspace name (admin only)
- `PATCH /api/workspaces/:workspaceId/projects/:projectId` - update name/project_key with uniqueness validation
- `DELETE /api/workspaces/:workspaceId/projects/:projectId` - soft-delete via deleted_at
- `GET /api/workspaces/:workspaceId/members` - read-only member list (user_id, email, role, joined_at)
- Added projects.deleted_at column fixup in server.ts runFixups()
- Updated GET projects to filter out soft-deleted records

### Task 4: /api/v1/ route prefix (6f2ba4d)
Created `apps/api/src/routes/v1.ts`:
- Uses Fastify onRoute hook to rewrite `/api/` to `/api/v1/` within encapsulation scope
- Plugin-level preHandlers apply requireAuth + rateLimiter to all v1 routes
- Re-registers all existing route modules (workspaces, suites, test-cases, runs, run-items, defects, api-keys, ingestion)
- Updated server.ts to register auth plugin globally and v1 routes plugin

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed exactOptionalPropertyTypes error in defects.ts**
- **Found during:** Task 4 (tsc --noEmit)
- **Issue:** `description: description ?? undefined` violates exactOptionalPropertyTypes when passed to CreateLinearIssueParams
- **Fix:** Changed to `...(description ? { description } : {})` spread pattern
- **Files modified:** apps/api/src/routes/defects.ts
- **Commit:** 6f2ba4d (included in Task 4 commit)

## Verification

- TypeScript compiles clean (`npx tsc --noEmit` - 0 errors)
- All 15 test files pass (149 tests pass, 37 todo, 3 skipped test files)
- No regressions in existing functionality

## Self-Check: PASSED

All 3 created files verified on disk. All 4 commit hashes verified in git log.
