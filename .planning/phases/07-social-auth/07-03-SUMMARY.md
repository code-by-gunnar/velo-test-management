---
phase: 07-social-auth
plan: "03"
subsystem: auth
tags: [oauth, set-cookie, nextauth, pages-router, cookie-forwarding]

requires:
  - phase: 07-social-auth/01
    provides: "user_oauth_accounts schema and migration"
  - phase: 07-social-auth/02
    provides: "oauth-signin Fastify endpoint"
provides:
  - "Fixed Pages Router bridge that correctly forwards multiple Set-Cookie headers"
  - "Unit tests verifying Set-Cookie array forwarding"
affects: [07-social-auth/04, 07-social-auth/05]

tech-stack:
  added: []
  patterns:
    - "getSetCookie() for Web-to-Node Set-Cookie forwarding"

key-files:
  created:
    - apps/web/src/__tests__/nextauth-bridge.test.ts
  modified:
    - apps/web/src/pages/api/auth/[...nextauth].ts

key-decisions:
  - "No new dependencies needed -- getSetCookie() is built into Node.js 18+ Headers API"

patterns-established:
  - "Set-Cookie forwarding: always use getSetCookie() when bridging Web Response to Node.js res"

requirements-completed: [INF-06]

duration: 2min
completed: 2026-03-13
---

# Phase 07, Plan 03: Set-Cookie Bridge Fix Summary

**Fixed Pages Router nextauth bridge to forward OAuth Set-Cookie headers individually via getSetCookie() instead of comma-joining them**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T00:10:39Z
- **Completed:** 2026-03-13T00:12:13Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fixed critical OAuth cookie corruption bug in `[...nextauth].ts` bridge
- Added unit tests covering multi-cookie, single-cookie, and no-cookie scenarios
- Existing auth callback tests remain passing (no regression)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Set-Cookie header forwarding in [...nextauth].ts bridge** - `ccfb8da` (fix)
2. **Task 2: Add unit test for Set-Cookie array forwarding** - `7d2836a` (test)

## Files Created/Modified
- `apps/web/src/pages/api/auth/[...nextauth].ts` - Fixed header forwarding to skip Set-Cookie in forEach, use getSetCookie() for array forwarding
- `apps/web/src/__tests__/nextauth-bridge.test.ts` - Unit tests for Set-Cookie forwarding logic (3 test cases)

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Set-Cookie bridge fix is the prerequisite for OAuth provider testing
- Ready for Phase 2 plan 04: Auth.js signIn callback wiring with Google/GitHub providers
- OAuth state/nonce/PKCE cookies will now be forwarded correctly during authorization flows

---
*Phase: 07-social-auth*
*Completed: 2026-03-13*
