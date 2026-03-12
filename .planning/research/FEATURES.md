# Feature Landscape: v1.2 Social Auth (Google + GitHub OAuth)

**Domain:** OAuth sign-in/sign-up for existing SaaS with email/password auth
**Project:** Velo v1.2
**Researched:** 2026-03-12
**Overall confidence:** HIGH (Auth.js v5 has first-class OAuth provider support; patterns well-established)

---

## Table Stakes

Features users expect from any SaaS with social auth. Missing = product feels half-finished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| "Continue with Google" button on login page | Every dev-tool SaaS offers this; users expect zero-friction entry | Low | One Auth.js provider + env vars |
| "Continue with GitHub" button on login page | GitHub is the default identity for developers; absence is a red flag for dev tools | Low | One Auth.js provider + env vars |
| Social auth on signup page too | Users land on signup via marketing; buttons must appear on both paths | Low | Reuse same provider config, apply to both routes |
| Auto-link when OAuth email matches existing account | Standard behavior (Supabase, Clerk, Auth0 all do this); users expect to "just work" regardless of which method they used first | Medium | Requires `allowDangerousEmailAccountLinking: true` on trusted providers + custom `signIn` callback to handle credentials-provider users |
| New OAuth users land in workspace onboarding | OAuth users who have never signed up before must go through the same workspace creation flow as email users | Medium | Check for `workspace_id` in JWT on first login; redirect to onboarding if absent |
| OAuth users bypass email OTP | Provider has already verified the email; demanding a second OTP verification is jarring and unusual | Low | Set `email_verified = true` for OAuth users in the user record; skip the OTP step in the auth callback |
| Existing JWT/session fields preserved | `workspace_id`, `role`, and custom claims must populate correctly for OAuth sessions — feature parity with email sessions | Medium | Custom `jwt` and `session` callbacks must hydrate these fields from the DB for OAuth users the same way they do for credentials users |
| "Sign in" and "Sign up" are the same OAuth action | OAuth has no separate "create account" concept — clicking "Continue with Google" on either page works | Low | Both pages point to the same `signIn("google")` call; JIT provisioning in the callback handles new vs returning users |

---

## Differentiators

Features that build trust and polish. Not expected at launch, but add meaningful value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Connected accounts" section in profile settings | Users want to know which providers are linked; surfaces transparency about their identity | Medium | Requires reading `accounts` table (Auth.js adapter model); display Google/GitHub connection status with link timestamps |
| Show provider icon next to linked account | Visual cue — small Google/GitHub logo next to connected provider — reinforces what's linked | Low | Static SVG icons from provider brand assets |
| Graceful "account already exists" error page | If auto-link fails for any reason, show a helpful message ("You previously signed in with email — use that to sign in, then connect Google in settings") rather than a cryptic Auth.js error | Low | Custom error page at `/auth/error` |
| Avatar seeded from OAuth provider on first login | GitHub and Google both return a profile image; auto-populate avatar instead of leaving it blank | Low | Read `image` from the OAuth profile in the `signIn` callback; write to R2 or store URL if no avatar exists yet |

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Account unlinking (disconnect a provider) | Adds UI complexity, risk of lockout if email/password not set, and requires careful UX to prevent users locking themselves out | Defer — display connected accounts as read-only for now |
| Apple Sign-In | Requires Apple Developer account ($99/yr), notarization, and has additional UX requirements (hide email relay). Low dev-tool relevance. | Defer to future milestone |
| Microsoft / Azure AD SSO | Enterprise SAML/OIDC pattern, not needed for 20-200 person startup ICP | Defer; belongs in enterprise tier |
| "Link account while signed in" flow | Adds a second OAuth flow specifically for merging, with distinct UI and error handling. Auto-link on email match covers 95% of the need. | Auto-link on sign-in covers this without a dedicated flow |
| OAuth refresh token storage | Velo does not call Google/GitHub APIs on the user's behalf — no need to store or refresh OAuth tokens | Discard access tokens after session creation; do not store in DB |
| Separate "sign up with OAuth" page | OAuth is inherently JIT — no pre-registration form needed | One callback handler creates the user if they don't exist |
| Username from GitHub as display name | GitHub usernames (e.g., `gunnarx2`) make poor display names; full name from GitHub profile is better | Use `profile.name` from the OAuth profile, fall back to `profile.login` only if name is null |

---

## Feature Dependencies

```
Existing Auth.js v5 JWT/session pipeline
    └─→ Google provider (AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET)
    └─→ GitHub provider (AUTH_GITHUB_ID, AUTH_GITHUB_SECRET)
        └─→ allowDangerousEmailAccountLinking on both providers
            └─→ Custom signIn callback: JIT user provision + auto-link logic
                └─→ Custom jwt callback: hydrate workspace_id + role for OAuth users
                    └─→ Social buttons on login + signup pages
                        └─→ OAuth bypass of email_verified check
                        └─→ Avatar seeding from OAuth profile (differentiator)
                        └─→ Connected accounts display in profile (differentiator)
```

---

## Critical Decisions Affecting Features

### Auto-Link via `allowDangerousEmailAccountLinking`

Auth.js v5 disables automatic OAuth-to-credentials account linking by default because it's insecure between arbitrary providers. The "dangerous" label applies when the provider cannot be trusted to verify emails. However:

- Google verifies emails on all accounts — HIGH confidence
- GitHub verifies emails on public accounts (though users can set a noreply address for commits, the primary account email returned via OAuth is verified)
- Both are appropriate to trust with `allowDangerousEmailAccountLinking: true`

The custom `signIn` callback must still handle the edge case where a credentials-provider user (no `accounts` row for OAuth) exists with the same email — Auth.js does not automatically link credentials sessions.

**Verdict:** Use `allowDangerousEmailAccountLinking: true` on both Google and GitHub providers. Add a `signIn` callback that upserts the OAuth account link when an email match is found against an existing credentials user.

### GitHub Email Privacy

GitHub users can set their commit email to a noreply address (`ID+user@users.noreply.github.com`), but this only affects git operations. The email returned via OAuth is the user's primary verified account email — not the noreply alias. This is safe to use for account lookup and linking.

Edge case: users with no public email on GitHub. The GitHub OAuth API returns `null` for email if the user has no public email. Velo must request the `user:email` scope to get the verified primary email via a secondary API call — Auth.js handles this automatically for the GitHub provider.

**Verdict:** Request `user:email` scope (Auth.js GitHub provider default). Handle the case where email is null gracefully — require the user to add an email to their GitHub account before they can use GitHub OAuth.

### New OAuth Users and Workspace Onboarding

Velo is multi-tenant. A new OAuth user has no workspace. The post-sign-in redirect logic must check for `workspace_id` in the JWT and route to workspace creation if absent. This is identical to the email/password new user flow and reuses the same onboarding page.

**Verdict:** The `jwt` callback populates `workspace_id` from the DB. If null, the session middleware redirects to `/onboarding`. No new onboarding UI needed — the OAuth path converges with the existing flow.

---

## MVP Recommendation

**Minimum for v1.2 ship:**

1. Google OAuth provider configured with `allowDangerousEmailAccountLinking: true`
2. GitHub OAuth provider configured with `allowDangerousEmailAccountLinking: true`
3. Custom `signIn` callback: JIT provision new users, auto-link email matches from credentials accounts
4. Custom `jwt`/`session` callbacks: hydrate `workspace_id` + `role` for OAuth users
5. Social buttons on `/auth/signin` and `/auth/signup` pages
6. OAuth users skip email OTP verification
7. Avatar seeded from provider profile on first login (low effort, high polish)
8. Graceful `/auth/error` page for OAuthAccountNotLinked errors

**Defer from MVP:**

- Connected accounts settings page — useful but not blocking
- Account unlinking — defer entirely

---

## Complexity Summary

| Feature | Effort | Priority |
|---------|--------|----------|
| Google + GitHub provider config + env vars | 0.5 day | P0 |
| signIn callback: JIT provision + auto-link | 1 day | P0 |
| jwt/session callbacks: hydrate workspace_id + role | 0.5 day | P0 |
| Social buttons on login + signup pages | 0.5 day | P0 |
| OAuth bypass of email OTP check | 0.5 day | P0 |
| Avatar seed from OAuth profile | 0.5 day | P1 |
| /auth/error graceful error page | 0.5 day | P1 |
| Connected accounts in profile settings | 1 day | P2 |
| **Total (MVP P0+P1)** | **~3.5 days** | |
| **Total (all P0–P2)** | **~4.5 days** | |

---

## Sources

- [Auth.js v5 Google Provider docs](https://authjs.dev/getting-started/providers/google) — HIGH confidence
- [Auth.js v5 GitHub Provider docs](https://authjs.dev/getting-started/providers/github) — HIGH confidence
- [Auth.js v5 Configuring OAuth Providers](https://authjs.dev/guides/configuring-oauth-providers) — HIGH confidence
- [Auth.js allowDangerousEmailAccountLinking — nextauthjs/next-auth Discussion #9992](https://github.com/nextauthjs/next-auth/issues/9992) — MEDIUM confidence (issue discussion, consistent with docs)
- [Supabase identity linking (email-based auto-link precedent)](https://supabase.com/docs/guides/auth/auth-identity-linking) — MEDIUM confidence
- [Clerk account linking strategy (email as common identifier)](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/account-linking) — MEDIUM confidence
- [GitHub email addresses docs (OAuth vs commit noreply)](https://docs.github.com/en/account-and-profile/reference/email-addresses-reference) — HIGH confidence
- [Login/Signup UX 2025 best practices — Authgear](https://www.authgear.com/post/login-signup-ux-guide) — MEDIUM confidence
