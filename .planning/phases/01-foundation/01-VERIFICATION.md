---
phase: 01-foundation
verified: 2026-03-12T23:45:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
gaps: []
human_verification: []
---

# Phase 1: Schema & Fastify Route — Verification Report

**Phase Goal:** The database schema supports OAuth users and the Fastify endpoint can resolve any OAuth sign-in (new user, returning user, auto-link) before Auth.js is wired
**Verified:** 2026-03-12T23:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Migration 0009 runs on startup and creates `user_oauth_accounts` table | VERIFIED | `apps/api/drizzle/0009_social_auth.sql` contains correct DDL; journal entry idx=9 tag="0009_social_auth" present in `_journal.json` |
| 2 | `users.password_hash` accepts NULL (OAuth-only users have no password) | VERIFIED | `schema.ts` line 58: `password_hash: text("password_hash")` — `.notNull()` removed; SQL file has `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL` |
| 3 | `verify-credentials` returns 401 (not TypeError) when `password_hash` is NULL | VERIFIED | `auth.ts` lines 177-179: explicit `if (!user.password_hash) { return reply.status(401).send({ error: "Invalid credentials" }) }` before `bcrypt.compare`; integration test at line 265 confirms 401, not 500 |
| 4 | `POST /api/auth/oauth-signin` returns user object for a new OAuth user (JIT provisioned) | VERIFIED | Endpoint at `auth.ts` line 290; test "Path 1: new user" at line 138 covers JIT provision path with null workspace fields |
| 5 | `POST /api/auth/oauth-signin` returns same user on repeated calls (idempotent, no duplicate rows) | VERIFIED | `ON CONFLICT (provider, provider_account_id) DO NOTHING` at line 412; test "Path 2: returning user" at line 160 calls endpoint twice and asserts `body1.id === body2.id` |
| 6 | `POST /api/auth/oauth-signin` auto-links when email matches an existing verified credentials user | VERIFIED | Steps 3-5 in handler (lines 359-401) handle email lookup, unverified guard, second-provider guard, then auto-link UPDATE; test "Path 3: auto-link" at line 180 asserts returned `id` matches pre-existing user |
| 7 | `POST /api/auth/oauth-signin` blocks with 409 when an unverified email account exists | VERIFIED | `errorCode = "unverified_email"` set at line 361; 409 response sent at lines 440-444; test "Path 4" at line 207 asserts `res.statusCode === 409` and `body.error === "unverified_email"` |
| 8 | `POST /api/auth/oauth-signin` blocks with 409 when user already has a different provider linked | VERIFIED | `errorCode = "provider_conflict"` set at line 374; 409 response at lines 446-450; test "Path 5" at line 233 asserts `res.statusCode === 409` and `body.error === "provider_conflict"` |

**Score:** 8/8 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/drizzle/0009_social_auth.sql` | CREATE TABLE user_oauth_accounts + ALTER password_hash DROP NOT NULL | VERIFIED | File exists, 19 lines, contains both DDL statements plus index |
| `apps/api/drizzle/meta/_journal.json` | Journal entry for migration 0009 | VERIFIED | Entry at idx=9, tag="0009_social_auth", breakpoints=true |
| `apps/api/src/db/schema.ts` | Drizzle oauthAccounts table definition + nullable password_hash | VERIFIED | `export const oauthAccounts` at line 86; `password_hash: text("password_hash")` (no .notNull()) at line 58; two unique constraints match SQL |
| `apps/api/src/routes/auth.ts` | Null password_hash guard in verify-credentials + POST /api/auth/oauth-signin endpoint | VERIFIED | Guard at lines 177-179; oauth-signin route registered at line 297; all 5 resolution paths implemented in single sql.begin() transaction |
| `apps/api/src/routes/__tests__/auth.test.ts` | Integration tests for all 5 oauth-signin paths + null password_hash guard | VERIFIED | `describe("OAuth signin")` block at line 112; 7 tests covering all 5 paths, idempotency, guard, and schema validation |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `0009_social_auth.sql` | `schema.ts` | Schema definition must match raw SQL exactly | VERIFIED | SQL: `user_oauth_accounts` with `provider VARCHAR(20)`, `provider_account_id VARCHAR(255)`, two UNIQUE constraints; schema.ts `oauthAccounts` table mirrors these exactly at lines 86-99 |
| `auth.ts` verify-credentials | `users.password_hash` | Null guard before bcrypt.compare | VERIFIED | `if (!user.password_hash)` at line 177 short-circuits before `bcrypt.compare` at line 181 |
| `auth.ts` oauth-signin | `user_oauth_accounts` table | sql.begin() transaction with ON CONFLICT | VERIFIED | `ON CONFLICT (provider, provider_account_id) DO NOTHING` at line 412 |
| `auth.ts` oauth-signin | `users` table | Email lookup for auto-link and collision detection | VERIFIED | `WHERE email = ${email.toLowerCase()}` at line 354; email lowercased on insert at line 395 |
| `auth.test.ts` | `POST /api/auth/oauth-signin` | app.inject() integration tests | VERIFIED | `url: "/api/auth/oauth-signin"` injections at lines 143, 169, 173, 192, 219, 252, 289 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INF-05 | 01-01-PLAN.md | Schema migration adds `user_oauth_accounts` table and makes `password_hash` nullable | SATISFIED | Migration SQL file exists; Drizzle schema updated; journal entry registered; `password_hash` nullable in both SQL and Drizzle schema |
| INF-08 | 01-02-PLAN.md | Fastify `POST /api/auth/oauth-signin` endpoint handles user resolution (new, returning, auto-link) | SATISFIED | Endpoint implemented at `auth.ts` line 290 handling all 5 paths; 7 integration tests all passing per SUMMARY (192 total tests green); response shape `{ id, email, name, workspace_id, workspace_slug, role }` matches verify-credentials |

**All 2 requirements claimed by Phase 1 plans are SATISFIED.**

**Orphaned requirements check:** ROADMAP.md Coverage Map shows INF-05 and INF-08 assigned to Phase 1. No additional requirements map to Phase 1. Zero orphans.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns detected |

Scanned files:
- `apps/api/drizzle/0009_social_auth.sql` — pure DDL, no stubs
- `apps/api/src/db/schema.ts` — full table definition with constraints, no TODOs
- `apps/api/src/routes/auth.ts` — complete 5-path implementation, no placeholder returns, no console.log-only handlers, `reply.send()` correctly called outside `sql.begin()` on all paths
- `apps/api/src/routes/__tests__/auth.test.ts` — 7 substantive integration tests with real DB assertions, no todo stubs

---

## Human Verification Required

None. All observable truths are verifiable via code inspection and commit history. The endpoint handles no UI flows, and no visual/real-time behavior is involved in Phase 1.

---

## Implementation Quality Notes

The following implementation choices are worth highlighting for Phase 2 context:

1. **Security: error code information hiding.** The null password_hash guard at `auth.ts` line 177-179 returns the same `"Invalid credentials"` message as a wrong password — intentionally preventing account enumeration (an OAuth-only user cannot be fingerprinted by probing the verify-credentials endpoint).

2. **Correctness: reply.send() outside sql.begin().** All `reply.send()` / `reply.status().send()` calls in the oauth-signin handler are after the transaction block (lines 440-460), satisfying the CLAUDE.md rule against calling `reply.send()` inside a transaction callback.

3. **Idempotency: ON CONFLICT DO NOTHING.** The oauth account INSERT at line 404-413 uses `ON CONFLICT (provider, provider_account_id) DO NOTHING`, making the endpoint safe to call multiple times for the same OAuth sign-in (e.g., retries, concurrent requests).

4. **Test isolation: sql.end() ordering.** `sql.end()` is correctly deferred to the OAuth describe block's `afterAll` (line 135), preventing the connection from closing before the second describe block's tests execute.

5. **Commits verified:** All 4 commits referenced in SUMMARYs confirmed present in git log:
   - `14a5ad9` — migration 0009 + schema
   - `bbb7fc1` — null password_hash guard
   - `b071716` — failing OAuth tests (RED)
   - `459d5f5` — oauth-signin implementation (GREEN)

---

## Gaps Summary

No gaps. All 8 observable truths are verified. Both phase requirements (INF-05, INF-08) are satisfied. All artifacts exist, are substantive, and are correctly wired. No anti-patterns detected. Phase 1 goal is achieved.

---

_Verified: 2026-03-12T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
