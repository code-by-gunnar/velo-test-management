# Research Summary: v1.2 Social Auth (Google + GitHub OAuth)

**Project:** Velo — QA Test Management Platform
**Domain:** OAuth integration into existing Auth.js v5 JWT-only SaaS
**Researched:** 2026-03-12
**Confidence:** HIGH

## Executive Summary

Velo v1.2 adds Google and GitHub OAuth alongside the existing email/password Credentials provider. The key finding across all four research dimensions is that this is a well-scoped, low-risk milestone: zero new npm packages are required (both providers ship inside the already-installed `next-auth@5.0.0-beta.30`), one database migration handles all schema changes, and the existing Auth.js callback chain accommodates OAuth users without architectural surgery. The recommended approach is to use Auth.js's built-in provider imports, intercept OAuth sign-ins in a `signIn` callback that calls a new Fastify `POST /api/auth/oauth-signin` endpoint, and mutate the `user` object so the existing `jwt` callback populates tokens identically for OAuth and Credentials users.

The primary risk is not complexity but silent failure modes. Three bugs can make OAuth appear broken with no obvious error: (1) the existing Pages Router `[...nextauth].ts` bridge overwrites multi-value `Set-Cookie` headers, silently dropping the OAuth state/nonce cookies and leaving users unable to complete sign-in; (2) if `workspace_id` is not injected into the `user` object inside the `signIn` callback, OAuth users get a permanent null workspace forever; (3) GitHub users with private email settings return `null` email from the default OAuth scope, which must be handled explicitly by requesting `user:email` scope. All three have deterministic fixes documented in PITFALLS.md.

The second category of risk is GDPR compliance. The new `user_oauth_accounts` table introduces personal data (provider account IDs) that the existing v1.1 erasure worker does not know about. This must be addressed at the schema level with `ON DELETE CASCADE` and at the worker level with an explicit `DELETE FROM user_oauth_accounts WHERE user_id = $userId` before shipping. This is a correctness requirement for the data deletion path the platform already exposes.

---

## Key Findings

### Stack Additions

No new packages are required in either `apps/web` or `apps/api`. All OAuth provider logic ships inside `next-auth` which is already installed. The v1.2 stack changes are purely configuration and database:

- **Google provider** — `import Google from "next-auth/providers/google"`, add to `providers[]`. Auth.js v5 auto-reads `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` from env with no explicit config.
- **GitHub provider** — `import GitHub from "next-auth/providers/github"`, same pattern. Requires `user:email` scope added explicitly to handle private-email users.
- **Migration `0009_social_auth.sql`** — two changes: `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL` (OAuth users have no password) and `CREATE TABLE user_oauth_accounts` (stable join table linking users to providers with `UNIQUE(provider, provider_account_id)` and `ON DELETE CASCADE`).
- **New Fastify route** — `POST /api/auth/oauth-signin` in `apps/api/src/routes/auth.ts`. Server-to-server from the Auth.js `signIn` callback; not exposed through the Next.js gateway.
- **Four new env vars** — `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`. Set in Vercel (production) and `.env.local` (development).

One external-registration constraint: Google allows multiple redirect URIs per OAuth Client ID (dev and prod in one app), but GitHub OAuth Apps accept only one callback URL. Two separate GitHub OAuth Apps are required — one for dev, one for production.

See [STACK.md](./STACK.md) for full schema DDL, Drizzle definitions, and env var table.

### Expected Features

**Must have (table stakes) — P0:**
- "Continue with Google" and "Continue with GitHub" buttons on both `/auth/signin` and `/auth/signup` pages
- Auto-link when OAuth email matches an existing email/password account (standard behavior; absence causes user confusion and forces account fragmentation)
- New OAuth users routed to existing workspace onboarding (workspace_id null check already guards this path)
- OAuth users bypass email OTP verification (provider already verified the email; demanding OTP is jarring)
- Identical JWT/session fields (`workspace_id`, `role`, `id`) for OAuth and Credentials sessions

**Should have (differentiators) — P1:**
- Avatar seeded from OAuth provider profile on first login (low effort, high polish signal for dev-tool users)
- Graceful `/auth/error` page with actionable messaging for null-email and access-denied cases

**Defer (v2+):**
- Connected accounts settings page (useful; `user_oauth_accounts` table supports it when ready)
- Account unlinking (lockout risk; needs careful UX — defer entirely)
- Apple Sign-In (Apple Developer account required, extra OIDC complexity, low dev-tool relevance)
- Microsoft / Azure AD SSO (enterprise tier feature)
- OAuth refresh token storage (no Google/GitHub API calls needed on the user's behalf)

See [FEATURES.md](./FEATURES.md) for the full complexity and effort breakdown (~3.5 days for P0+P1, ~4.5 days for all tiers).

### Architecture Integration Points

The existing architecture requires no structural change. Auth.js handles the OAuth code exchange internally; the `signIn` callback is the only integration boundary. The Fastify `session.plugin.ts` JWE decoder is untouched — OAuth users produce the same token shape as Credentials users.

**Major components and their responsibilities:**

1. **`apps/web/src/auth.ts` (signIn callback)** — Intercepts OAuth sign-ins only (`account.type === "oauth"`). Calls Fastify `oauth-signin` endpoint, mutates `user` object with DB-resolved fields. The `jwt` callback then copies them to the token identically to the Credentials path. No DB calls in `jwt` callback.
2. **`POST /api/auth/oauth-signin` (Fastify)** — Owns all user-resolution logic: fast path by `(provider, provider_account_id)`, email-match auto-link path for existing credentials users, new-user JIT provision path. Returns `{ id, email, name, workspace_id, workspace_slug, role }` — same shape as `verify-credentials`.
3. **`user_oauth_accounts` table** — Stable join table with `UNIQUE(provider, provider_account_id)` preventing duplicate rows on repeat sign-in and `ON DELETE CASCADE` ensuring GDPR erasure propagates automatically.
4. **`apps/web/src/pages/api/auth/[...nextauth].ts` (Pages Router bridge)** — Requires a targeted fix for multi-value `Set-Cookie` header forwarding before any OAuth flow can work (see pitfall OC3 below).
5. **`apps/web/src/pages/login.tsx` + `signup.tsx`** — Add OAuth buttons above the email/password form with a visual separator. Both pages call `signIn("google")` / `signIn("github")` — the same action handles both new and returning users.

**Three data flow paths through `oauth-signin`:**
- New user: no `user_oauth_accounts` row, no `users` row by email → INSERT both, return `workspace_id=null` → onboarding
- Returning user: `user_oauth_accounts` row found → JOIN users, return existing workspace context
- Auto-link: no `user_oauth_accounts` row but email matches `users` row → INSERT `user_oauth_accounts` for this provider, return existing workspace context

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full data flow sequences and anti-pattern list.

### Critical Pitfalls

1. **OC3 — Pages Router bridge drops OAuth cookies (BLOCKER, fix first)** — The existing `[...nextauth].ts` bridge uses `res.setHeader(key, value)` in a loop, which overwrites earlier values for the same header key. OAuth sign-in sets 3+ `Set-Cookie` headers (state, nonce, session-token). All but the last are silently dropped. Fix: accumulate `Set-Cookie` values into an array and call `res.setHeader("Set-Cookie", cookiesArray)` once. Without this fix, every OAuth test produces a false negative.

2. **OC2 — workspace_id permanently null for OAuth users if signIn callback is wrong** — The `user` object passed to the `jwt` callback on OAuth sign-in is the raw OAuth profile, not the DB user. If `workspace_id` is not injected into `user` inside the `signIn` callback before returning `true`, it will be null in every token for that session with no recovery path. Test: sign in via OAuth → page refresh → inspect session. `session.user.workspace_id` must be non-null after onboarding.

3. **OC4 — GitHub returns null email for private-email users** — GitHub's default `user` scope does not expose private primary emails. Add `authorization: { params: { scope: "read:user user:email" } }` to the GitHub provider. The `signIn` callback must handle null email by returning a redirect to a custom error page with an actionable message, not `false` (which shows generic "Access denied").

4. **OC6 — GDPR erasure does not clean up OAuth account records** — The v1.1 erasure worker targets only the `users` table. The new `user_oauth_accounts` table contains personal data. Two required mitigations: (a) schema-level `ON DELETE CASCADE` on the `user_id` foreign key for hard-delete paths, and (b) explicit `DELETE FROM user_oauth_accounts WHERE user_id = $userId` in the erasure worker for the anonymization path. Both are required; the CASCADE alone does not cover anonymization (which updates the user row rather than deleting it).

5. **OC1 — OAuthAccountNotLinked blocks all existing users on first OAuth attempt** — Auth.js v5 blocks email-based account linking by default. Without handling this, any user who previously signed up with email/password hits the `OAuthAccountNotLinked` error page when they try Google/GitHub sign-in. Set `allowDangerousEmailAccountLinking: true` on both providers (safe for Google and GitHub, which both verify emails) AND implement the linking logic in the `signIn` callback. The flag alone has no effect without a database adapter — both are required.

See [PITFALLS.md](./PITFALLS.md) for the full checklist including moderate pitfalls (deactivated user OAuth bypass via Valkey blocklist, silent signIn block UX) and the "Looks Done But Isn't" verification checklist.

---

## Implications for Roadmap

Research confirms a clean 4-phase build order with a hard sequential dependency on the first two phases. The critical path is: schema migration → Fastify route → Auth.js config changes. UI and provider registration can overlap once Auth.js config is unblocked.

### Phase 1: Schema Migration + Fastify `oauth-signin` Route

**Rationale:** Everything else depends on the database schema and the `oauth-signin` endpoint existing. The migration is a metadata-only `ALTER COLUMN` (safe on a live table in PostgreSQL 16) plus a new table. The Fastify route can be fully integration-tested independently before any Auth.js changes touch production.

**Delivers:** A working, testable server-side OAuth user resolution layer. All three user paths (new, returning, auto-link) covered by testcontainer integration tests. GDPR cascade in place from the start.

**Addresses:** OC6 (GDPR cascade via `ON DELETE CASCADE`), OMi3 (null password_hash audit of existing password routes)

**Avoids:** Building Auth.js changes before the API contract is stable; shipping OAuth before the erasure path is correct.

### Phase 2: Pages Router Bridge Fix + Auth.js Config Changes

**Rationale:** The bridge fix (OC3) is a hard blocker for all OAuth testing — it must land before any manual or automated test of the sign-in flow. Auth.js config (providers + signIn callback) can then be added and tested against the Phase 1 endpoint. These two pieces ship together because neither is useful without the other.

**Delivers:** End-to-end OAuth sign-in working in development for both Google and GitHub. JWT token shape verified to carry `workspace_id` and `role`. Auto-link behavior verified against an existing credentials user.

**Addresses:** OC3 (Set-Cookie blocker), OC1 (allowDangerousEmailAccountLinking + signIn callback linking), OC2 (workspace_id injection via signIn callback mutation), OC4 (GitHub null email + user:email scope), OM1 (JWT fields persist after page refresh), OM5 (deactivated user blocked at signIn callback)

### Phase 3: Login/Signup UI + Error Handling

**Rationale:** UI work is fully decoupled from backend implementation. Can proceed in parallel with Phase 2 once the `signIn()` function signatures are known.

**Delivers:** "Continue with Google" and "Continue with GitHub" buttons on both auth pages with a visual separator. Custom `/auth/error` page with actionable messaging for null-email and access-denied cases. Avatar seeded from OAuth profile on first login.

**Addresses:** OM4 (silent signIn block without actionable user message), all P0 and P1 table-stakes feature requirements.

**Avoids:** Generic Auth.js error pages reaching users; shipping buttons before the backend is ready.

### Phase 4: Provider Registration + Environment Variables + GDPR Erasure Worker Update

**Rationale:** Provider console registration can proceed in parallel with phases 2-3 but must be complete before any production testing. The GDPR erasure worker update must ship alongside the feature, not as a follow-up — it closes the OC6 gap for the anonymization path that the schema CASCADE alone does not cover.

**Delivers:** Production-ready OAuth with registered callbacks in Google Cloud Console and GitHub OAuth Apps, correct env vars in Vercel, erasure worker updated for the anonymization path.

**Addresses:** OC5 (redirect_uri_mismatch in production), OC6 (erasure worker explicit DELETE for anonymization path), OMi1 (AUTH_* env var naming consistency)

### Phase Ordering Rationale

- Schema and Fastify route first because the Auth.js `signIn` callback makes a synchronous server-to-server call — Auth.js config cannot be production-tested without the endpoint live.
- Pages Router bridge fix before any OAuth testing because the bug silently drops cookies; without fixing it, every manual test produces a false negative with no obvious cause.
- UI last because it has no hard dependency beyond the `signIn()` function signature, but shipping buttons before the backend is ready creates confusing half-states.
- Provider registration and erasure worker are parallelizable with phases 2-3 but must be complete before the milestone ships.

### Research Flags

Phases with standard patterns (no additional research needed):
- **Phase 1 (Schema + Fastify route):** Standard Drizzle migration + postgres.js INSERT/SELECT patterns. Well-established in this codebase.
- **Phase 3 (UI):** Standard Next.js pages with `signIn()` from `next-auth/react`. No novel patterns.

Phases requiring careful implementation verification (not research, but checklist):
- **Phase 2 (Auth.js config):** The `signIn` callback mutation pattern is documented but subtle. Run the full "Looks Done But Isn't" checklist from PITFALLS.md before marking done. Specifically: Set-Cookie header count, workspace_id in JWT after refresh, GitHub private email test.
- **Phase 4 (GDPR):** Verify the erasure worker handles both the hard-delete path (covered by CASCADE) and the anonymization path (requires explicit DELETE). Confirm with a test user.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new packages confirmed against next-auth@5.0.0-beta.30 source. Drizzle schema patterns are established in the codebase. ALTER COLUMN safety confirmed for PostgreSQL 16. |
| Features | HIGH | Auth.js v5 provider support is first-class and well-documented. Feature scope is narrow and concrete. Effort estimates (~3.5 days P0+P1) are credible for this codebase. |
| Architecture | HIGH | signIn callback mutation pattern is documented in Auth.js v5 official docs. Component boundaries are clear and match existing patterns. All three data flow paths are explicitly sequenced. |
| Pitfalls | HIGH | OC3 (Set-Cookie bug) confirmed by reading the existing `[...nextauth].ts` code. OC4 (GitHub null email) confirmed against GitHub API docs. OC6 (GDPR gap) follows directly from the erasure worker's documented scope. |

**Overall confidence:** HIGH

### Gaps to Address During Implementation

- **`allowDangerousEmailAccountLinking` scope:** STACK.md and PITFALLS.md both note this flag is a no-op without a database adapter. Set the flag anyway (it documents intent and provides a safety net if an adapter is added later) AND implement linking in the signIn callback. Do not rely on the flag alone.

- **GitHub null email fallback via access_token:** PITFALLS.md recommends calling GitHub's `/user/emails` API transiently using `account.access_token` if `profile.email` is null. This is a transient use — do not persist `account.access_token` to the token or DB. The implementation must make clear that the access token is consumed in the signIn callback and discarded.

- **`verify-credentials` null password_hash safety:** The existing route must be confirmed (by reading the code) to short-circuit before `bcrypt.compare` when `password_hash IS NULL`. Research indicates it does, but this must be verified against the actual implementation before migration 0009 is applied to production.

---

## Sources

### Primary (HIGH confidence)

- Auth.js v5 Google provider source — `next-auth/providers/google` built-in; zero new packages confirmed
- Auth.js v5 GitHub provider guide — `user:email` scope requirement documented
- Auth.js v5 environment variables guide — `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` auto-detection confirmed
- Auth.js v5 callbacks reference — `signIn`, `jwt`, `session` callback signatures and `user` object mutation behavior
- Auth.js errors reference — `OAuthAccountNotLinked` error behavior and `allowDangerousEmailAccountLinking` semantics
- GitHub REST API docs — email addresses reference; user:email scope behavior for private-email users
- Google Cloud Console OAuth documentation — multiple redirect URI support per Client ID
- Existing codebase audit — `apps/web/src/auth.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/db/schema.ts`, `apps/web/src/pages/api/auth/[...nextauth].ts`

### Secondary (MEDIUM confidence)

- Auth.js GitHub issue #9992 — `allowDangerousEmailAccountLinking` without adapter is a no-op (community discussion, consistent with docs)
- nextauthjs/next-auth issue #7581 — GitHub OAuth Apps single-callback URL limitation confirmed
- Supabase identity linking docs and Clerk account linking docs — email-as-common-identifier precedent across industry
- Auth.js v5 social logins community guide — general pattern validation for signIn callback approach

---

*Research completed: 2026-03-12*
*Ready for roadmap: yes*
