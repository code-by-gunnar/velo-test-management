---
phase: 01-foundation
plan: 01
subsystem: auth/schema
tags: [migration, drizzle, oauth, schema, auth]
dependency_graph:
  requires: []
  provides: [user_oauth_accounts table, nullable password_hash, null-safe verify-credentials]
  affects: [apps/api/src/routes/auth.ts, apps/api/src/db/schema.ts]
tech_stack:
  added: []
  patterns: [drizzle pgTable with unique constraints, null-guard before bcrypt.compare]
key_files:
  created:
    - apps/api/drizzle/0009_social_auth.sql
  modified:
    - apps/api/drizzle/meta/_journal.json
    - apps/api/src/db/schema.ts
    - apps/api/src/routes/auth.ts
decisions:
  - id: null-guard-message
    summary: Null password_hash returns identical 401 "Invalid credentials" as wrong password — no information leakage about OAuth-only account existence
metrics:
  duration: 109s
  completed_date: "2026-03-12T23:20:39Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 3
---

# Phase 1 Plan 1: Social Auth Schema & Null Guard Summary

**One-liner:** Migration 0009 adds user_oauth_accounts table + nullable password_hash with null-safe verify-credentials guard preventing TypeError on OAuth-only login attempts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create migration 0009 and update Drizzle schema | 14a5ad9 | 0009_social_auth.sql, _journal.json, schema.ts |
| 2 | Add null password_hash guard to verify-credentials | bbb7fc1 | auth.ts |

## What Was Built

**Migration 0009** (`apps/api/drizzle/0009_social_auth.sql`):
- `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL` — enables OAuth-only accounts with no password
- `CREATE TABLE user_oauth_accounts` with provider + provider_account_id unique constraint and user_id + provider unique constraint
- Index on `user_id` for fast lookup

**Drizzle schema** (`apps/api/src/db/schema.ts`):
- `password_hash` field changed from `.notNull()` to nullable
- New `oauthAccounts` export matching the SQL table structure exactly, placed in the non-tenant section after `passwordResetTokens`

**Verify-credentials null guard** (`apps/api/src/routes/auth.ts`):
- Added `if (!user.password_hash) { return reply.status(401).send({ error: "Invalid credentials" }) }` before `bcrypt.compare`
- Returns same 401 + identical error message as wrong password — no information leakage

## Verification

- `pnpm --recursive typecheck` — PASSED (both apps/api and apps/web)
- `cd apps/api && pnpm test` — PASSED (185 tests, all 6 auth tests green)
- Migration file exists with correct SQL
- Journal entry for idx 9 present in `_journal.json`
- `schema.ts` exports `oauthAccounts` with correct columns + constraints
- `auth.ts` null guard present before `bcrypt.compare`

## Decisions Made

- **Null guard error message:** Returns `"Invalid credentials"` (not `"Account uses social login"`) — intentional information hiding to prevent account enumeration by probing whether an email is OAuth-only vs. password-based.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| apps/api/drizzle/0009_social_auth.sql | FOUND |
| apps/api/src/db/schema.ts | FOUND |
| apps/api/src/routes/auth.ts | FOUND |
| .planning/phases/01-foundation/01-01-SUMMARY.md | FOUND |
| commit 14a5ad9 (Task 1) | FOUND |
| commit bbb7fc1 (Task 2) | FOUND |
