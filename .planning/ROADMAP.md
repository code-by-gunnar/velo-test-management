# Roadmap: v1.2 Social Auth

## Overview

Add Google and GitHub OAuth as sign-in/sign-up options alongside existing email/password auth. Four phases: lay the database schema and Fastify endpoint foundation (everything else depends on this), wire the full OAuth chain by fixing the Pages Router cookie bug and configuring Auth.js, add the login/signup UI and error handling, then update the GDPR erasure worker and run integration tests. Zero new npm packages -- all provider logic ships inside the already-installed `next-auth`.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions (marked with INSERTED)
- Phase directories use global numbering (07-social-auth, etc.) to avoid collision with prior milestones

- [ ] **Phase 1: Schema & Fastify Route** - Migration adds `user_oauth_accounts` table and nullable `password_hash`, Fastify `POST /api/auth/oauth-signin` endpoint handles all three user-resolution paths
- [ ] **Phase 2: Auth.js Config & OAuth Chain** - Pages Router bridge fix unblocks cookie forwarding, Auth.js providers wired with signIn callback, end-to-end OAuth sign-in works for both providers
- [ ] **Phase 3: Login/Signup UI & Error Handling** - Social auth buttons on both auth pages, custom error page with actionable messages, avatar seeded from OAuth profile picture
- [ ] **Phase 4: GDPR Erasure Update & Verification** - Erasure worker deletes OAuth account rows during anonymization, integration tests verify all three user-resolution paths and erasure correctness

## Phase Details

### Phase 1: Schema & Fastify Route
**Goal**: The database schema supports OAuth users and the Fastify endpoint can resolve any OAuth sign-in (new user, returning user, auto-link) before Auth.js is wired
**Depends on**: Nothing (first phase)
**Requirements**: INF-05, INF-08
**Success Criteria** (what must be TRUE):
  1. Migration 0009 runs cleanly -- `user_oauth_accounts` table exists with `UNIQUE(provider, provider_account_id)` and `ON DELETE CASCADE`, and `users.password_hash` accepts NULL
  2. `POST /api/auth/oauth-signin` returns a user object with `{ id, email, name, workspace_id, workspace_slug, role }` for all three paths: new user (JIT provisioned), returning user (looked up by oauth account row), and auto-link (email-match with existing credentials user)
  3. Integration tests confirm the endpoint is idempotent -- calling it twice for the same `(provider, provider_account_id)` does not create duplicate rows
**Plans:** 2 plans
Plans:
- [ ] 07-01-PLAN.md -- Migration 0009 + Drizzle schema + null password_hash guard
- [ ] 07-02-PLAN.md -- POST /api/auth/oauth-signin endpoint + integration tests

### Phase 2: Auth.js Config & OAuth Chain
**Goal**: Users can complete an OAuth sign-in flow end-to-end in development -- the full chain from clicking "Continue with Google/GitHub" through callback to landing in the app with a valid JWT carrying workspace_id and role
**Depends on**: Phase 1
**Requirements**: INF-06, OAP-01, OAP-02, OAP-03, OAP-04, ALK-01, ALK-02, ALK-03
**Success Criteria** (what must be TRUE):
  1. The Pages Router `[...nextauth].ts` bridge correctly forwards multiple `Set-Cookie` headers -- OAuth state and nonce cookies are not silently dropped
  2. User can complete a Google OAuth sign-in from the login page and land in the app with `session.user.workspace_id` populated (non-null after workspace onboarding)
  3. User can complete a GitHub OAuth sign-in including accounts with private email settings (GitHub `user:email` scope is requested and the email is resolved)
  4. An existing email/password user who signs in via OAuth with the same email address is auto-linked -- no duplicate account is created, the existing workspace context is returned
  5. OAuth session JWT carries identical fields to a Credentials session (`workspace_id`, `role`, `id`) -- verified by inspecting the session after page refresh
**Plans**: TBD

### Phase 3: Login/Signup UI & Error Handling
**Goal**: The login and signup pages surface Google and GitHub as first-class sign-in options, auth failures show actionable messages rather than generic errors, and new OAuth users get their profile picture seeded automatically
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. Login page shows "Continue with Google" and "Continue with GitHub" buttons above the email/password form with a visual separator -- both buttons trigger the correct provider flow
  2. Signup page shows the same two social auth buttons with the same visual treatment
  3. Navigating to `/auth/error` (or being redirected there by an auth failure) shows a page with an actionable error message specific to the failure type -- not the generic Auth.js error screen
  4. A new user who signs in via OAuth for the first time has their profile picture populated from the provider's profile image -- visible in the sidebar avatar
**Plans**: TBD

### Phase 4: GDPR Erasure Update & Verification
**Goal**: OAuth account records are cleaned up during user anonymization (the schema CASCADE alone does not cover this path), and CI passes with integration tests covering all new behavior
**Depends on**: Phase 3
**Requirements**: INF-07
**Success Criteria** (what must be TRUE):
  1. The GDPR erasure worker explicitly deletes `user_oauth_accounts` rows for the target user before anonymizing the `users` row -- confirmed by test that the rows are gone after erasure runs
  2. `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test` passes with zero errors, including integration tests for the three `oauth-signin` resolution paths and the erasure worker OAuth cleanup
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema & Fastify Route | 0/2 | Planning complete | - |
| 2. Auth.js Config & OAuth Chain | 0/? | Not started | - |
| 3. Login/Signup UI & Error Handling | 0/? | Not started | - |
| 4. GDPR Erasure Update & Verification | 0/? | Not started | - |

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| INF-05 | Phase 1 |
| INF-08 | Phase 1 |
| INF-06 | Phase 2 |
| OAP-01 | Phase 2 |
| OAP-02 | Phase 2 |
| OAP-03 | Phase 2 |
| OAP-04 | Phase 2 |
| ALK-01 | Phase 2 |
| ALK-02 | Phase 2 |
| ALK-03 | Phase 2 |
| UI-01 | Phase 3 |
| UI-02 | Phase 3 |
| UI-03 | Phase 3 |
| UI-04 | Phase 3 |
| INF-07 | Phase 4 |

**Total: 15/15 requirements mapped. No orphans.**

---
*Roadmap created: 2026-03-12*
*Last updated: 2026-03-12*
