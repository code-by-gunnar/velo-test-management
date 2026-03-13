---
phase: 07-social-auth
plan: "04"
subsystem: auth
tags: [oauth, auth.js, google, github, signin-callback]
dependency_graph:
  requires: [07-03]
  provides: [oauth-providers, signin-callback]
  affects: [apps/web/src/auth.ts]
tech_stack:
  added: []
  patterns: [Auth.js signIn callback, OAuth user resolution via backend, error redirect pattern]
key_files:
  created: []
  modified:
    - apps/web/src/auth.ts
    - apps/web/.env.example
    - apps/web/src/__tests__/auth-callbacks.test.ts
decisions:
  - "signIn callback returns redirect URL (not false) for error cases -- avoids generic Auth.js error page"
  - "User object mutated in signIn callback is same object passed to jwt callback -- no separate data flow needed"
  - "Google and GitHub providers passed as bare references (no function call) for Auth.js env auto-detection"
metrics:
  duration: 113s
  completed: "2026-03-13T00:16:13Z"
  tasks: 3/3
  commits: 3
---

# Phase 07 Plan 04: Google/GitHub Providers + signIn Callback Summary

Auth.js configured with Google (OIDC) and GitHub (OAuth2) providers, signIn callback wired to Fastify oauth-signin endpoint for user resolution with error redirect handling.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Add Google and GitHub providers + signIn callback | 5b908c2 | Google/GitHub providers registered, signIn callback calls /api/auth/oauth-signin, populates user object for jwt callback |
| 2 | Update .env.example with OAuth env vars | b208c31 | AUTH_GOOGLE_ID/SECRET, AUTH_GITHUB_ID/SECRET with setup URLs and callback URL format |
| 3 | Extend auth callback tests for OAuth signIn flow | 0e7b2eb | 6 new tests: credentials passthrough, null account, OAuth success, 409 redirect, no-email redirect, JWT field propagation |

## Verification Results

- `cd apps/web && npx tsc --noEmit` -- PASS
- `cd apps/web && pnpm vitest run src/__tests__/auth-callbacks.test.ts` -- PASS (11 tests, 0 failures)
- `pnpm --filter web lint` -- PASS (zero warnings)

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Error redirect pattern**: signIn callback returns `/login?error=<code>` string instead of `false` for backend errors. This gives the login page actionable error codes (provider_conflict, unverified_email, no_email, oauth_error) rather than Auth.js's generic error page.
2. **Bare provider references**: `Google` and `GitHub` passed without calling them as functions -- Auth.js v5 auto-detects `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` and `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` from environment.
3. **Typed backend response**: The `res.json()` result in signIn callback is typed with explicit interface `{ id, workspace_id, workspace_slug, role }` to match the oauth-signin endpoint contract.

## Requirements Satisfied

- **OAP-01**: Google OAuth provider registered
- **OAP-02**: GitHub OAuth provider registered
- **OAP-03**: OAuth users bypass OTP (signIn callback goes directly to backend, no OTP step)
- **OAP-04**: GitHub private email handled by built-in provider (user:email scope is default)
- **ALK-01**: Auto-linking delegated to backend endpoint (signIn callback passes email)
- **ALK-02**: signIn callback populates user object with backend response
- **ALK-03**: OAuth JWT carries identical fields as credentials JWT (verified by test)

## Self-Check: PASSED
