---
phase: 05-integrations-and-api
plan: 03
subsystem: api
tags: [linear, oauth, graphql, encryption, aes-256-gcm, defects]

# Dependency graph
requires:
  - phase: 05-01
    provides: "linear_connections and defects tables with external_id/external_url/external_status columns"
provides:
  - "Linear OAuth connect/disconnect flow (auth, callback, team selection, status)"
  - "AES-256-GCM encryption for OAuth token storage"
  - "Linear GraphQL API client (issue creation, org/team queries)"
  - "Auto-filing defects to Linear with graceful degradation"
affects: [05-integrations-and-api, 06-team-and-access-control]

# Tech tracking
tech-stack:
  added: []
  patterns: [aes-256-gcm-token-encryption, linear-graphql-native-fetch, oauth-state-valkey-csrf]

key-files:
  created:
    - apps/api/src/lib/encryption.ts
    - apps/api/src/lib/linear-client.ts
    - apps/api/src/routes/linear.ts
  modified:
    - apps/api/src/routes/defects.ts
    - apps/api/src/server.ts

key-decisions:
  - "Native fetch for Linear API (no SDK dependency) — Node 22 built-in is sufficient"
  - "CSRF state stored in Valkey with 10-min TTL — prevents OAuth replay attacks"
  - "Placeholder team_id='pending' during callback, updated in separate POST /team step"
  - "Linear auto-filing happens AFTER defect transaction commits — defect never lost due to Linear failure"

patterns-established:
  - "Token encryption: encrypt/decrypt via AES-256-GCM with ENCRYPTION_KEY env var"
  - "OAuth state management: Valkey-backed CSRF tokens with TTL for OAuth flows"
  - "Graceful integration degradation: external API failures logged but never block core operations"

requirements-completed: [INT-01]

# Metrics
duration: 7min
completed: 2026-03-10
---

# Phase 5 Plan 3: Linear OAuth + Issue Creation Summary

**Linear OAuth connection flow with AES-256-GCM encrypted tokens and auto-filing defects as Linear issues via native fetch GraphQL client**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-10T16:22:25Z
- **Completed:** 2026-03-10T16:29:00Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments
- AES-256-GCM encryption utility for secure OAuth token storage
- Linear GraphQL API client using native fetch (no SDK dependency)
- Full OAuth connect/disconnect flow with Valkey-backed CSRF protection
- Defect creation auto-files to Linear when connected, with graceful degradation on failure

## Task Commits

Each task was committed atomically:

1. **Task 1: Token encryption utility** - `2d73cc0` (feat)
2. **Task 2: Linear API client** - `f7ec81d` (feat)
3. **Task 3: Linear OAuth routes** - `6267370` (feat)
4. **Task 4: Modify defect creation for Linear auto-filing** - `1860562` (feat)

## Files Created/Modified
- `apps/api/src/lib/encryption.ts` - AES-256-GCM encrypt/decrypt for OAuth tokens
- `apps/api/src/lib/linear-client.ts` - Linear GraphQL API client (token exchange, org/teams, issue CRUD)
- `apps/api/src/routes/linear.ts` - OAuth connect, callback, team selection, status, disconnect routes
- `apps/api/src/routes/defects.ts` - Auto-file defects to Linear; added external_status to queries
- `apps/api/src/server.ts` - Registered linearRoutes plugin

## Decisions Made
- Used native fetch for Linear API instead of @linear/sdk — Node 22 built-in, zero dependencies
- CSRF state stored in Valkey with 10-min TTL — one-time use, prevents replay attacks
- Placeholder team_id='pending' during OAuth callback — user selects team in separate POST step
- Linear auto-filing happens AFTER defect withWorkspace commits — defect never lost due to Linear API failure
- exactOptionalPropertyTypes requires `| undefined` on optional interface properties

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes compatibility in CreateLinearIssueParams**
- **Found during:** Task 4 (defect creation modification)
- **Issue:** TypeScript `exactOptionalPropertyTypes` rejects `string | undefined` assigned to `description?: string`
- **Fix:** Changed interface to `description?: string | undefined`
- **Files modified:** `apps/api/src/lib/linear-client.ts`
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** `1860562` (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type fix for strict TypeScript. No scope creep.

## Issues Encountered
None beyond the TypeScript strictness fix documented above.

## User Setup Required
The following environment variables must be configured before Linear integration works:
- `ENCRYPTION_KEY` - 32-byte hex string (64 characters) for token encryption
- `LINEAR_CLIENT_ID` - Linear OAuth app client ID
- `LINEAR_CLIENT_SECRET` - Linear OAuth app client secret
- `LINEAR_REDIRECT_URI` - OAuth callback URL

## Next Phase Readiness
- Linear OAuth flow ready for frontend integration (workspace settings page)
- Defect auto-filing ready — works transparently when Linear is connected
- Token encryption pattern established for any future encrypted storage needs

---
*Phase: 05-integrations-and-api*
*Completed: 2026-03-10*
