# Phase 1 Context: Schema & Fastify Route

**Phase:** 1 — Schema & Fastify Route (v1.2 Social Auth)
**Created:** 2026-03-12
**Status:** Ready for research & planning

---

## Locked-In Decisions (from PROJECT.md / REQUIREMENTS.md — do not re-research)

| Decision | Value |
|----------|-------|
| Auth framework | Auth.js v5, PKCE enforced |
| OAuth providers | Google + GitHub only (no Apple, no Microsoft) |
| Auto-link strategy | Auto-link on email match (no duplicate accounts) |
| OAuth users skip OTP | Provider already verified the email |
| No refresh token storage | Velo doesn't call Google/GitHub APIs on behalf of users |
| JIT provisioning | New OAuth users are created and routed to workspace onboarding |
| Next migration | 0009 (after 0008_gdpr_lifecycle_tables.sql) |

---

## A — One-Directional, Single-Provider Linking

**Decision: Linking is one-directional and limited to one OAuth provider per user.**

### Rules

1. **Email/password → OAuth**: Auto-links. User gains OAuth as an additional login method and keeps their password. The existing workspace context is preserved.
2. **OAuth-only → email/password**: Not supported. No "set password" or "create credentials" flow exists. OAuth-only users stay OAuth-only.
3. **One provider max**: A user can have at most one linked OAuth provider (Google OR GitHub, not both). This avoids complexity in the linking table and in support scenarios.
4. **Auto-linked users keep both methods**: An email/password user who auto-links via OAuth can use either method forever. They don't lose their password.

### Error handling (no information leakage)

- **Forgot password for OAuth-only user**: Return generic message — "Please use the login method you originally chose." No provider name revealed.
- **Credentials login for OAuth-only user** (null `password_hash`): Return "Invalid credentials" — same error as wrong password. No leak that the account is OAuth-only.
- **OAuth sign-in when user already has a different provider linked**: Block with generic error. User must use their existing login method.

### Support escalation

- Edge cases where a user is locked out (e.g., lost access to their OAuth provider) are handled manually by support. No self-service provider switching in v1.

---

## B — Unverified Email Collision

**Decision: Block OAuth sign-in when an unverified email/password account exists.**

### Scenario

1. User signs up with email `alice@example.com` via email/password
2. OTP is sent but never verified — account exists in `users` with `email_verified = false`
3. User (or someone else) attempts OAuth sign-in via Google with `alice@example.com`

### Behavior

- **Block the OAuth sign-in**. Return: "An account with this email exists but hasn't been verified. Please verify your email first."
- The user must go back to the email/password flow and complete OTP verification before any auto-linking can occur.
- This prevents bypassing email verification and protects against account hijacking (someone signing up with your email, then you OAuth-linking to their unverified shell).

### Research flag

- **Confirm this is best practice.** Researcher should check how major SaaS tools handle OAuth sign-in when an unverified email account exists. The decision is locked unless research reveals a clear reason to change it.

---

## C — Avatar Seeding

**Decision: Deferred to Phase 3 (UI-04).**

- The Phase 1 `oauth-signin` endpoint does NOT accept or store avatar URLs.
- Phase 3 will handle seeding the avatar from the OAuth provider's profile picture.
- The `users.avatar_url` column already exists (migration 0007). Phase 3 will populate it.

---

## Research Flags (for gsd-phase-researcher)

1. **Unverified email collision best practice** (Area B): How do major SaaS tools (Linear, Notion, Vercel, GitHub itself) handle OAuth sign-in when an unverified email/password account already exists? Is blocking the standard approach or is there a better pattern?
2. **GitHub missing `name` field**: How often do GitHub users have no `name` set? What does the GitHub OAuth profile return when `name` is null? Researcher should check the GitHub API docs for the `user` endpoint response shape.
3. **GitHub `user:email` scope**: Confirm that requesting `user:email` scope reliably returns the primary verified email even for users with "Keep my email address private" enabled. Document the exact API behavior.

---

## Code Context

### Existing assets to modify

| File | Change needed |
|------|---------------|
| `apps/api/src/db/schema.ts` | Add `user_oauth_accounts` table definition. Make `password_hash` nullable (remove `.notNull()`) |
| `apps/api/drizzle/` | New migration `0009_*.sql` — CREATE TABLE + ALTER COLUMN |
| `apps/api/src/routes/auth.ts` | Add `POST /api/auth/oauth-signin` endpoint. Guard `verify-credentials` against null `password_hash` |

### Patterns to follow

- **Migration naming**: `0009_<descriptive_name>.sql` in `apps/api/drizzle/`
- **Route pattern**: Auth routes are in `apps/api/src/routes/auth.ts` as a Fastify plugin
- **User resolution query**: Follow `verify-credentials` pattern — JOIN `workspace_members` + `workspaces` to return `{ id, email, name, workspace_id, workspace_slug, role }`
- **Transaction pattern**: `sql.begin(async (tx: TransactionSql) => { const q = tx as unknown as Sql; ... })` for multi-statement writes
- **UUID generation**: `uuidv7()` from the `uuidv7` package
- **Idempotent writes**: Use `ON CONFLICT` for the oauth-signin endpoint to prevent duplicate rows on retry

### Integration points

- **Downstream (Phase 2)**: Auth.js `signIn` callback will call this endpoint. The response shape must match what Auth.js `authorize()` returns for Credentials — `{ id, email, name, workspace_id, workspace_slug, role }`.
- **Downstream (Phase 4)**: GDPR erasure worker will need to delete `user_oauth_accounts` rows. The `ON DELETE CASCADE` on `user_id` FK handles the user deletion path, but the anonymization path (which updates rather than deletes) will need explicit cleanup.

---

## Deferred Ideas (captured, not acted on)

- Multiple OAuth providers per user (Google + GitHub): deferred to reduce complexity
- Self-service provider switching / unlinking: deferred to future milestone (CON-01, CON-02)
- "Set password" flow for OAuth-only users: explicitly out of scope
- Avatar seeding from OAuth profile: Phase 3

---

*Context created: 2026-03-12*
*Supersedes: Phase 1 Foundation context (v1.0 — no longer relevant)*
