# Requirements: Velo v1.2 Social Auth

**Defined:** 2026-03-12
**Core Value:** Ship a focused, keyboard-first test management tool that startups actually want to use — no Jira complexity, no enterprise bloat.

## v1.2 Requirements

Requirements for adding Google and GitHub OAuth alongside existing email/password auth.

### OAuth Providers

- [ ] **OAP-01**: User can sign in or sign up using their Google account
- [ ] **OAP-02**: User can sign in or sign up using their GitHub account
- [ ] **OAP-03**: OAuth users bypass email OTP verification (provider already verified email)
- [ ] **OAP-04**: GitHub OAuth handles private-email users by requesting `user:email` scope

### Account Linking

- [ ] **ALK-01**: OAuth sign-in auto-links to existing account when email matches (no duplicate accounts)
- [ ] **ALK-02**: New OAuth users are JIT-provisioned and routed to workspace onboarding
- [ ] **ALK-03**: OAuth sessions carry identical JWT fields (workspace_id, role, id) as credentials sessions

### UI

- [ ] **UI-01**: Login page displays "Continue with Google" and "Continue with GitHub" buttons with visual separator
- [ ] **UI-02**: Signup page displays the same social auth buttons
- [ ] **UI-03**: Custom `/auth/error` page shows actionable messages for auth failures (not generic Auth.js errors)
- [ ] **UI-04**: User avatar is seeded from OAuth provider profile picture on first sign-in

### Infrastructure

- [ ] **INF-05**: Schema migration adds `user_oauth_accounts` table and makes `password_hash` nullable
- [ ] **INF-06**: Pages Router `[...nextauth].ts` bridge correctly forwards multiple `Set-Cookie` headers
- [ ] **INF-07**: GDPR erasure worker deletes `user_oauth_accounts` rows during user anonymization
- [ ] **INF-08**: Fastify `POST /api/auth/oauth-signin` endpoint handles user resolution (new, returning, auto-link)

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Connected Accounts

- **CON-01**: User can view linked OAuth providers in profile settings
- **CON-02**: User can unlink an OAuth provider from their account (with lockout prevention)

### Additional Providers

- **PRV-01**: User can sign in with Apple
- **PRV-02**: User can sign in with Microsoft / Azure AD (enterprise SSO)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Account unlinking | Lockout risk, complex UX — defer to future milestone |
| Apple Sign-In | Apple Developer account required, low dev-tool relevance |
| Microsoft / Azure AD SSO | Enterprise tier feature, not needed for startup ICP |
| OAuth refresh token storage | Velo doesn't call Google/GitHub APIs on user's behalf |
| "Link account while signed in" flow | Auto-link on email match covers 95% of the need |
| Dark mode | Deferred to future milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| OAP-01 | Pending | Pending |
| OAP-02 | Pending | Pending |
| OAP-03 | Pending | Pending |
| OAP-04 | Pending | Pending |
| ALK-01 | Pending | Pending |
| ALK-02 | Pending | Pending |
| ALK-03 | Pending | Pending |
| UI-01 | Pending | Pending |
| UI-02 | Pending | Pending |
| UI-03 | Pending | Pending |
| UI-04 | Pending | Pending |
| INF-05 | Pending | Pending |
| INF-06 | Pending | Pending |
| INF-07 | Pending | Pending |
| INF-08 | Pending | Pending |

**Coverage:**
- v1.2 requirements: 15 total
- Mapped to phases: 0
- Unmapped: 15 ⚠️

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 after initial definition*
