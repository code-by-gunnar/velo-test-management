---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: milestone
status: planning
stopped_at: Completed 01-02-PLAN.md
last_updated: "2026-03-12T23:33:08.661Z"
progress:
  total_phases: 8
  completed_phases: 5
  total_plans: 30
  completed_plans: 23
---

---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Social Auth
status: in_progress
stopped_at: "Completed 01-02-PLAN.md"
last_updated: "2026-03-12T23:29:00Z"
last_activity: 2026-03-12 -- Executed 01-02: oauth-signin Fastify endpoint + TDD integration tests
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Milestones

### v1.0 -- Core Platform (48 requirements, 6 phases)
**Status:** Ready to plan

### UI Redesign -- "Clean Elevation" (38 requirements, 4 phases)
**Status:** COMPLETE (38/38 satisfied, merged to master 2026-03-11)

### v1.1 -- GDPR & Data Lifecycle (20 requirements, 4 phases)
**Status:** COMPLETE (20/20 satisfied, completed 2026-03-12)

### Post-Milestone Additions (on master, after merge)
- CSV import with suite auto-creation from area column
- Suite management: right-click context menu (rename/delete), bulk delete with select mode
- requireAdmin middleware + admin-only delete test run endpoint
- Deleted test case handling in execution screen (404 -> user message)
- Auto-resize step textareas on mount, whitespace-pre-wrap in view mode
- Calm gray confirmation pattern (no red/blue destructive styling)
- User profile management: name edit, OTP-verified email change, R2 avatar upload
- Sidebar popover menu (profile + sign out)
- Landing page redesign (comparison table, feature cards, how-it-works)
- WCAG accessibility pass (prefers-reduced-motion, focus-visible rings)

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Ship a focused, keyboard-first test management tool that startups actually want to use
**Current focus:** v1.2 Social Auth -- Phase 2: Auth.js Config & OAuth Chain

## Current Position

Phase: Phase 2 -- Auth.js Config & OAuth Chain
Plan: 1 of 2 complete (07-03 done, 07-04 pending)
Status: In progress

```
Progress: [x] Phase 1  [~] Phase 2  [ ] Phase 3  [ ] Phase 4
          |___________|___________|___________|___________|
          25%          37.5%                               100%
```

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Auto-link accounts on email match (most SaaS standard)
- Skip OTP for OAuth users (provider already verified)
- Google + GitHub only (most common for dev-tool SaaS)
- Auth.js v5 built-in providers (no custom OAuth)
- Zero new npm packages -- all provider logic in existing next-auth
- [Phase 01-foundation]: Null password_hash guard returns identical 401 error message as wrong password to prevent OAuth-account enumeration
- [Phase 01-foundation]: Error codes captured as local variables inside transaction, reply.send() called after sql.begin() block (CLAUDE.md rule)

### Critical Implementation Notes

- **OC3 RESOLVED (Plan 07-03):** The `[...nextauth].ts` bridge now uses `getSetCookie()` to forward Set-Cookie headers individually -- OAuth state/nonce/PKCE cookies are no longer corrupted.
- **OC2 (Phase 2):** `workspace_id` MUST be injected into the `user` object inside the `signIn` callback. If not, OAuth users get null workspace permanently with no recovery path.
- **OC4 (Phase 2):** GitHub requires explicit `user:email` scope. Handle null email case by redirecting to custom error page (not returning `false`).
- **OC6 (Phase 4):** Schema `ON DELETE CASCADE` covers hard-delete path. Erasure worker needs explicit `DELETE FROM user_oauth_accounts WHERE user_id = $userId` for the anonymization path (which updates, not deletes, the user row).
- **`allowDangerousEmailAccountLinking`:** Set the flag AND implement linking in the `signIn` callback. Flag alone is a no-op without a database adapter.
- **verify-credentials null check:** Confirm the existing route short-circuits before `bcrypt.compare` when `password_hash IS NULL` before migration 0009 ships to production.

### Environment Variables Needed

- `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` -- Google Cloud Console OAuth credentials
- `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET` -- GitHub OAuth App credentials (two separate apps: dev + production)

### Pitfalls Checklist (from research/PITFALLS.md)

- [x] Set-Cookie multi-value fix in `[...nextauth].ts` bridge (07-03, ccfb8da)
- [ ] `workspace_id` injection in `signIn` callback (verify with page refresh)
- [ ] GitHub `user:email` scope + null email fallback via `/user/emails` API
- [ ] `allowDangerousEmailAccountLinking: true` on both providers
- [x] `verify-credentials` null `password_hash` safety confirmed before migration
- [ ] Erasure worker explicit DELETE for anonymization path
- [ ] Two GitHub OAuth Apps registered (dev + prod separate callback URLs)

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-03-13T00:12:13Z
Stopped at: Completed 07-03-PLAN.md
Resume file: None
Next action: Execute 07-04-PLAN.md (Google/GitHub providers + signIn callback)
