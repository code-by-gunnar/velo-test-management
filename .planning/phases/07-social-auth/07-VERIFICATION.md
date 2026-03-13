---
phase: 07-social-auth
verified: 2026-03-13T01:00:00Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "Complete Google OAuth sign-in from login page"
    expected: "User lands in app with session.user.workspace_id populated (check via browser DevTools or /api/auth/session)"
    why_human: "Requires real Google OAuth credentials, browser redirect flow, and running app"
  - test: "Complete GitHub OAuth sign-in with a private-email GitHub account"
    expected: "User signs in successfully — email is resolved via user:email scope"
    why_human: "Requires real GitHub OAuth credentials and a GitHub account with private email settings"
  - test: "Sign in via OAuth with same email as existing credentials account"
    expected: "No duplicate account created — session shows same user ID as the credentials account"
    why_human: "Requires running database to verify no duplicate rows"
---

# Phase 07: Social Auth (Phase 2) Verification Report

**Phase Goal:** Users can complete an OAuth sign-in flow end-to-end in development -- the full chain from clicking "Continue with Google/GitHub" through callback to landing in the app with a valid JWT carrying workspace_id and role
**Verified:** 2026-03-13T01:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pages Router bridge correctly forwards multiple Set-Cookie headers | VERIFIED | `[...nextauth].ts` lines 40-49: uses `getSetCookie()` to forward cookies as array. Unit test covers 3 scenarios (multi/single/none) |
| 2 | User can complete Google OAuth sign-in with workspace_id populated | VERIFIED (code path) | Google provider registered (auth.ts:42), signIn callback calls oauth-signin (auth.ts:95), populates workspace_id (auth.ts:119-122), jwt/session callbacks propagate it |
| 3 | User can complete GitHub OAuth including private email | VERIFIED (code path) | GitHub provider registered (auth.ts:43), built-in `user:email` scope handles private emails. No custom code needed |
| 4 | Existing email/password user auto-linked via OAuth | VERIFIED | Backend oauth-signin endpoint (api/routes/auth.ts:380-386) auto-links by email match. signIn callback passes email to backend (auth.ts:101) |
| 5 | OAuth JWT carries identical fields as Credentials JWT | VERIFIED | Same jwt callback (auth.ts:130-148) and session callback (auth.ts:151-169) handle both. Test ALK-03 explicitly verifies field parity |

**Score:** 5/5 truths verified at code level

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/pages/api/auth/[...nextauth].ts` | Fixed bridge with getSetCookie() | VERIFIED | Lines 40-49: skips Set-Cookie in forEach, uses getSetCookie() for array forwarding |
| `apps/web/src/__tests__/nextauth-bridge.test.ts` | Unit tests for Set-Cookie forwarding | VERIFIED | 3 test cases covering multi-cookie, single-cookie, no-cookie |
| `apps/web/src/auth.ts` | Auth.js config with Google + GitHub + signIn callback | VERIFIED | Google/GitHub providers (lines 42-43), signIn callback (lines 87-125) calls oauth-signin, populates user object |
| `apps/web/.env.example` | OAuth env var documentation | VERIFIED | AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET with setup URLs |
| `apps/web/src/__tests__/auth-callbacks.test.ts` | OAuth signIn callback tests | VERIFIED | 6 new test cases: credentials passthrough, null account, OAuth success with user population, 409 redirect, no-email redirect, JWT field propagation |
| `apps/api/src/routes/auth.ts` | POST /api/auth/oauth-signin endpoint | VERIFIED | Lines 290-461: handles 5 paths (returning, auto-link, JIT provision, unverified guard, provider conflict guard) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `auth.ts` signIn callback | `api/routes/auth.ts` POST /api/auth/oauth-signin | fetch() with provider, providerAccountId, email, name | WIRED | auth.ts:95-104 sends POST, auth.ts:112-122 reads response and populates user |
| `auth.ts` signIn callback | `auth.ts` jwt callback | user object mutation | WIRED | signIn mutates user.id, workspace_id, workspace_slug, role (lines 118-122); jwt reads them (lines 132-137) |
| `[...nextauth].ts` bridge | @auth/core handlers | getSetCookie() for Web Response to Node.js res | WIRED | Lines 46-49: getSetCookie() returns array, res.setHeader('set-cookie', array) sends multiple headers |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INF-06 | 07-03 | Pages Router bridge forwards multiple Set-Cookie headers | SATISFIED | getSetCookie() in bridge + 3 unit tests |
| OAP-01 | 07-04 | Google OAuth sign-in | SATISFIED | Google provider registered, signIn callback wired |
| OAP-02 | 07-04 | GitHub OAuth sign-in | SATISFIED | GitHub provider registered, signIn callback wired |
| OAP-03 | 07-04 | OAuth users bypass email OTP | SATISFIED | signIn callback goes directly to backend -- no OTP step exists in OAuth path |
| OAP-04 | 07-04 | GitHub private email via user:email scope | SATISFIED | Built-in GitHub provider includes user:email scope by default |
| ALK-01 | 07-04 | Auto-link existing account by email match | SATISFIED | Backend oauth-signin handles auto-link (api/routes/auth.ts lines 380-386) |
| ALK-02 | 07-04 | JIT provision new OAuth users | SATISFIED | Backend oauth-signin handles JIT provision (api/routes/auth.ts lines 388-400) |
| ALK-03 | 07-04 | OAuth JWT carries identical fields as credentials | SATISFIED | Same jwt/session callbacks, test explicitly verifies field parity |

No orphaned requirements found -- all 8 Phase 2 requirement IDs from REQUIREMENTS.md traceability table are claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No anti-patterns detected |

No TODOs, FIXMEs, placeholders, empty implementations, or stub returns found in any modified file.

### Human Verification Required

### 1. Google OAuth End-to-End

**Test:** Configure AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in .env.local, start the app, click "Continue with Google" on the login page
**Expected:** User completes Google OAuth flow, lands in app. Check `/api/auth/session` -- response includes `workspace_id`, `role`, and `id` fields
**Why human:** Requires real Google OAuth credentials, browser redirect flow, and running app with database

### 2. GitHub OAuth with Private Email

**Test:** Configure AUTH_GITHUB_ID and AUTH_GITHUB_SECRET, use a GitHub account with "Keep my email addresses private" enabled
**Expected:** User signs in successfully -- email is resolved via the `user:email` scope (not the public profile)
**Why human:** Requires real GitHub OAuth credentials and a specific GitHub account configuration

### 3. Auto-Link Verification

**Test:** Create a credentials account (email+password), then sign in via OAuth (Google or GitHub) using the same email address
**Expected:** No duplicate user row created. Session shows the same user ID as the credentials account. `user_oauth_accounts` row created linking to existing user
**Why human:** Requires running database and sequential manual operations

### Gaps Summary

No code-level gaps found. All artifacts exist, are substantive (no stubs), and are properly wired. All 8 requirements are covered by implementation and tests.

The only remaining verification is end-to-end human testing with real OAuth provider credentials, which cannot be automated without a running app, database, and configured OAuth applications.

---

_Verified: 2026-03-13T01:00:00Z_
_Verifier: Claude (gsd-verifier)_
