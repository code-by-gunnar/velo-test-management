---
phase: 01-foundation
plan: 02
subsystem: auth
tags: [fastify, postgres, oauth, jwt, tdd, vitest, integration-tests]

requires:
  - phase: 01-01
    provides: "migration 0009 adding user_oauth_accounts table; null password_hash guard in verify-credentials"

provides:
  - "POST /api/auth/oauth-signin endpoint with 5-path resolution (INF-08)"
  - "Integration tests covering all 5 OAuth paths plus null password_hash guard"

affects: [phase-2-authjs-callback, social-auth]

tech-stack:
  added: []
  patterns:
    - "Error code capture pattern: set errorCode inside sql.begin(), handle reply.send() after transaction"
    - "TDD RED->GREEN: failing tests committed first, then implementation to pass"
    - "ON CONFLICT (provider, provider_account_id) DO NOTHING for idempotent oauth account inserts"

key-files:
  created:
    - "apps/api/src/routes/__tests__/auth.test.ts (OAuth signin describe block — 7 new tests)"
  modified:
    - "apps/api/src/routes/auth.ts (POST /api/auth/oauth-signin route added)"

key-decisions:
  - "reply.send() called outside sql.begin() transaction block to avoid race conditions with test DB verification (CLAUDE.md rule)"
  - "Error codes captured as local variables inside transaction, not thrown as exceptions, to keep reply.send() outside sql.begin()"
  - "TypeScript null guard on step 7 fullUser query using rows[0] pattern with explicit if-check (avoids tsc strict error)"
  - "sql.end() moved from first describe afterAll to OAuth describe afterAll to prevent connection closure before OAuth tests run"

patterns-established:
  - "Error-capture pattern: let errorCode = null; inside tx set errorCode; after tx if errorCode then reply.status(409)"
  - "OAuth JIT provision: INSERT with email_verified=true and password_hash=NULL"
  - "Auto-link: UPDATE email_verified=true on existing user before inserting oauth account"

requirements-completed: [INF-08]

duration: 7min
completed: 2026-03-12
---

# Phase 1 Plan 2: OAuth Signin Fastify Route Summary

**POST /api/auth/oauth-signin with 5-path resolution (JIT provision, returning user, auto-link, unverified email block, provider conflict block) plus full TDD integration test coverage**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-12T23:23:00Z
- **Completed:** 2026-03-12T23:28:14Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Wrote 7 failing integration tests covering all 5 OAuth resolution paths plus guard and schema validation (RED phase)
- Implemented `POST /api/auth/oauth-signin` handling all 5 paths inside a single `sql.begin()` transaction (GREEN phase)
- Full CI simulation passes: lint + typecheck + 192 tests

## Task Commits

1. **Task 1: Integration tests (RED)** - `b071716` (test)
2. **Task 2: oauth-signin implementation (GREEN)** - `459d5f5` (feat)

## Files Created/Modified

- `apps/api/src/routes/__tests__/auth.test.ts` — Added `describe("OAuth signin")` block with 7 tests; fixed afterAll sql.end() ordering to prevent connection closure before OAuth tests
- `apps/api/src/routes/auth.ts` — Added `POST /api/auth/oauth-signin` route with 7-step transaction handler

## Decisions Made

- Error codes (`unverified_email`, `provider_conflict`) are captured as local variables inside the transaction and handled via `reply.send()` after the transaction — this is required by the `reply.send() outside withWorkspace` rule in CLAUDE.md
- Used `rows[0]` destructuring with explicit `if (fullUser)` check for the step 7 final fetch to satisfy TypeScript strict mode (destructuring from query results is typed as possibly undefined)
- Moved `sql.end()` from the first describe block's `afterAll` to the OAuth describe block's `afterAll` to prevent the postgres connection from closing before the second describe block's tests run

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict error on fullUser possibly undefined**
- **Found during:** Task 2 (typecheck after implementation)
- **Issue:** `const [fullUser] = await q\`...\`` typed as possibly undefined by tsc
- **Fix:** Changed to `const rows = await q\`...\`; const fullUser = rows[0]; if (fullUser) { ... }`
- **Files modified:** apps/api/src/routes/auth.ts
- **Verification:** `pnpm --recursive typecheck` passes with zero errors
- **Committed in:** 459d5f5 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed sql.end() closing connection before OAuth tests run**
- **Found during:** Task 1 (RED phase test run)
- **Issue:** First describe block's `afterAll` called `sql.end()`, causing CONNECTION_ENDED errors in subsequent OAuth tests
- **Fix:** Removed `sql.end()` from first describe's afterAll, kept only in OAuth describe's afterAll
- **Files modified:** apps/api/src/routes/__tests__/auth.test.ts
- **Verification:** All 192 tests pass in a single run
- **Committed in:** b071716 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — correctness bugs)
**Impact on plan:** Both fixes necessary for test suite correctness and TypeScript compliance. No scope creep.

## Issues Encountered

None beyond the auto-fixed issues above.

## Next Phase Readiness

- `POST /api/auth/oauth-signin` is ready for Phase 2 (Auth.js signIn callback wiring)
- Response shape matches `verify-credentials` exactly: `{ id, email, name, workspace_id, workspace_slug, role }`
- Error codes `unverified_email` and `provider_conflict` are ready for Phase 2 Auth.js callback to map to user-facing messages
- Pitfalls to address in Phase 2: Set-Cookie multi-value fix, workspace_id injection in signIn callback, GitHub user:email scope, allowDangerousEmailAccountLinking flag

---
*Phase: 01-foundation*
*Completed: 2026-03-12*
