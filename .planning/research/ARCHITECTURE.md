# Architecture: v1.2 Social Auth (Google + GitHub OAuth)

**Project:** Velo v1.2
**Researched:** 2026-03-12
**Scope:** How Google and GitHub OAuth integrate with the existing Auth.js v5 JWT-only architecture

---

## System Overview

The existing architecture uses Auth.js v5 with a single Credentials provider and a pure JWT session strategy (no database adapter). The JWE token is encrypted with HKDF-SHA256, decoded server-side by `session.plugin.ts` on the Fastify API, and carries three custom fields: `id`, `workspace_id`, and `role`.

OAuth integration must:
1. Handle the OAuth callback entirely within Auth.js (no custom OAuth routes)
2. Upsert the user into the existing `users` table (no new `accounts` table)
3. Populate the same custom JWT fields so the Fastify `session.plugin.ts` decodes sessions identically
4. Route new OAuth users through the existing workspace onboarding flow
5. Auto-link an OAuth sign-in to an existing email/password account when emails match

---

## The Database Adapter Question

**The critical architectural constraint:** Auth.js's built-in account linking (the `accounts` table) only works when a database adapter is configured. Without an adapter, Auth.js does not persist OAuth account records between sign-ins and cannot perform automatic multi-provider linking natively.

**The consequence:** Without an adapter, every OAuth sign-in is treated as a fresh sign-in event — there is no built-in "this Google account is the same user as this GitHub account" reconciliation.

**The chosen approach:** No adapter. All user lookup, upsert, and linking logic lives in the Auth.js `signIn` callback, which calls a new Fastify API endpoint. This preserves the existing architecture (no `@auth/pg-adapter`, no adapter-required `accounts`/`sessions` tables) while giving full control over the linking logic.

The trade-off is explicit: linking is email-based (email from OAuth provider = email in `users` table). This is acceptable for this ICP because:
- Google and GitHub both verify email addresses before exposing them via OAuth
- The project's design decision is explicitly "auto-link on email match"
- No cross-provider linking (Google-GitHub to same account) is needed at this milestone

---

## New vs Modified Components

### New: `user_oauth_accounts` table (schema addition)

Stores which OAuth providers are connected to each user. Used for display ("Connected accounts" in profile), for preventing duplicate provider connections, and as an audit trail. It does NOT replace the Credentials flow and is NOT used by Auth.js's adapter — it is app-managed.

```sql
CREATE TABLE user_oauth_accounts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider   VARCHAR(20) NOT NULL,          -- 'google' | 'github'
  provider_account_id VARCHAR(255) NOT NULL, -- provider's stable user ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_account_id)
);
```

This table answers "which users have linked Google/GitHub" without requiring Auth.js adapter infrastructure.

### New: `POST /api/auth/oauth-signin` Fastify route

Called from the Auth.js `signIn` callback during every OAuth sign-in. Encapsulates all the upsert/link logic, keeping it in the Fastify API where it can be tested independently.

Responsibilities:
- Accept `{ provider, providerAccountId, email, name, avatarUrl }` from the `signIn` callback
- Look up user by `(provider, providerAccountId)` in `user_oauth_accounts` — fast path for returning users
- On miss: look up by email in `users` — auto-link path for existing email/password accounts
- On no match: create new user (`email_verified = true`, `password_hash = NULL`)
- Insert into `user_oauth_accounts` if this provider entry doesn't exist
- Return `{ id, email, name, workspace_id, workspace_slug, role }` — same shape as `verify-credentials`

The route is internal (server-to-server from Next.js), not exposed through the gateway.

### Modified: `apps/web/src/auth.ts`

Add Google and GitHub providers. Add a `signIn` callback. Extend the `jwt` callback to handle the OAuth flow path.

The `signIn` callback is the critical addition:

```typescript
async signIn({ user, account, profile }) {
  // Only intercept OAuth providers — let credentials through unchanged
  if (!account || account.type !== "oauth") return true

  const res = await fetch(`${process.env.API_URL}/api/auth/oauth-signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      email: user.email,
      name: user.name,
      avatarUrl: user.image,
    }),
  })

  if (!res.ok) return false  // Blocks sign-in if DB call fails

  const dbUser = await res.json()

  // Mutate the user object — Auth.js passes this to the jwt callback as `user`
  user.id = dbUser.id
  user.email = dbUser.email
  user.name = dbUser.name
  ;(user as any).workspace_id = dbUser.workspace_id
  ;(user as any).workspace_slug = dbUser.workspace_slug
  ;(user as any).role = dbUser.role

  return true
}
```

The `jwt` callback already handles `if (user)` to copy custom fields — no changes needed there. The `signIn` callback populates the same fields that `authorize()` returns, so the existing jwt callback path works identically for both Credentials and OAuth.

### Modified: `apps/web/src/pages/login.tsx`

Add Google and GitHub sign-in buttons. Use `signIn("google")` and `signIn("github")` from `next-auth/react`. No form — OAuth is a redirect flow. Buttons appear above the email/password form with a visual separator ("or continue with").

### Modified: `apps/web/src/pages/signup.tsx`

Same OAuth buttons as login page. OAuth sign-up and sign-in are the same action from Auth.js's perspective — the `signIn` callback creates the user if they don't exist.

### Unchanged: `apps/api/src/plugins/session.plugin.ts`

The Fastify JWE decoder does not change. It reads `id`, `workspace_id`, and `role` from the token payload — OAuth users have the same token shape as Credentials users.

### Unchanged: Onboarding flow

OAuth users with `workspace_id = null` (new users) land at `/onboarding` just like email/password users. The existing guard in `_app.tsx` or middleware handles this redirect. No changes needed.

---

## Data Flow

### OAuth Sign-In (new user)

```
1. User clicks "Sign in with Google"
2. Browser → GET /api/auth/signin/google (Auth.js handler)
3. Auth.js → redirects to Google OAuth consent screen
4. Google → redirects to /api/auth/callback/google with code
5. Auth.js exchanges code for tokens, fetches Google profile
6. Auth.js invokes signIn callback with { user, account, profile }
7. signIn callback → POST /api/auth/oauth-signin (Fastify, server-to-server)
8. Fastify: no user_oauth_accounts row found, no users row found (email miss)
9. Fastify: INSERT INTO users (email_verified=true, password_hash=NULL)
10. Fastify: INSERT INTO user_oauth_accounts (provider='google', provider_account_id=...)
11. Fastify returns { id, email, name, workspace_id=null, workspace_slug=null, role=null }
12. signIn callback mutates user object with these fields, returns true
13. Auth.js invokes jwt callback with { user } — copies custom fields to token
14. Auth.js sets JWE cookie
15. Browser redirected to /onboarding (workspace_id is null → guard triggers)
```

### OAuth Sign-In (returning user, same provider)

```
Steps 1-6: same
7. signIn callback → POST /api/auth/oauth-signin
8. Fastify: user_oauth_accounts row found (provider + providerAccountId match)
9. Fastify: JOIN users, return { id, workspace_id, workspace_slug, role }
10. signIn callback mutates user, returns true
11-14: same, lands at /app/{slug}
```

### OAuth Sign-In (email matches existing email/password account — auto-link)

```
Steps 1-6: same
7. signIn callback → POST /api/auth/oauth-signin
8. Fastify: no user_oauth_accounts row for this (provider, providerAccountId)
9. Fastify: users row found by email → this is the auto-link case
10. Fastify: INSERT INTO user_oauth_accounts linking provider to existing user
11. Fastify returns existing user's { id, workspace_id, workspace_slug, role }
12-15: same as returning user, lands at /app/{slug}
```

---

## Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `auth.ts` (web) | Declares Google/GitHub providers; `signIn` callback calls Fastify to upsert user; `jwt` callback copies fields to token | Fastify `/api/auth/oauth-signin` |
| `POST /api/auth/oauth-signin` (Fastify) | Upsert user + oauth account record; email-based auto-linking; returns user shape identical to `verify-credentials` | `users` table, `user_oauth_accounts` table |
| `session.plugin.ts` (Fastify) | Decodes JWE token per request; no change needed | Valkey (blocklist, role cache) |
| `[...nextauth].ts` (pages router bridge) | Bridges NextApiRequest → NextRequest for Auth.js handlers; no change needed | Auth.js handlers |
| `login.tsx` / `signup.tsx` | Add OAuth buttons; call `signIn("google")` / `signIn("github")` | Auth.js client |
| `user_oauth_accounts` (DB table) | Stable record of which provider accounts map to which users; used for profile "connected accounts" display | Queried by `/api/auth/oauth-signin` |

---

## Schema Changes

### Migration 0009: Social auth tables

```sql
-- New table: tracks which OAuth providers are linked to each user
CREATE TABLE user_oauth_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            VARCHAR(20) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_account_id),
  UNIQUE (user_id, provider)             -- one Google account per user
);

-- Allow password_hash to be NULL (OAuth users have no password)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
```

**Note on `password_hash` nullability:** The existing schema defines `password_hash TEXT NOT NULL`. OAuth-only users have no password. The column must become nullable. Existing email/password users are unaffected — their `password_hash` remains set. The `verify-credentials` route already queries `password_hash` directly and will 401 if it is NULL (bcrypt.compare against NULL throws, which the route's `!user` check short-circuits before reaching).

---

## Auth.js Configuration Changes

### Environment variables to add

```
AUTH_GOOGLE_ID=...       # Google Cloud Console → OAuth 2.0 client ID
AUTH_GOOGLE_SECRET=...   # Google Cloud Console → OAuth 2.0 client secret
AUTH_GITHUB_ID=...       # GitHub → OAuth App → client ID
AUTH_GITHUB_SECRET=...   # GitHub → OAuth App → client secret
```

Auth.js v5 auto-discovers `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` and `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` when using the built-in Google and GitHub providers. No manual `clientId`/`clientSecret` props needed.

### OAuth app callback URLs to register

```
Google Cloud Console:
  Authorized redirect URI: https://velo-test-management.vercel.app/api/auth/callback/google
  (local dev):              http://localhost:3000/api/auth/callback/google

GitHub OAuth App:
  Homepage URL:    https://velo-test-management.vercel.app
  Callback URL:    https://velo-test-management.vercel.app/api/auth/callback/github
  (local dev):      http://localhost:3000/api/auth/callback/github
```

---

## Patterns to Follow

### Pattern: signIn callback as the user-resolution boundary

Auth.js's `signIn` callback is the correct integration point — it runs before the `jwt` callback, receives the provider profile, and allows mutation of the `user` object that the `jwt` callback then reads. This is the documented pattern for custom user persistence without an adapter.

The `jwt` callback should not make database calls. All DB resolution (upsert, link, workspace lookup) belongs in `signIn`, so the `jwt` callback stays as a pure "copy fields to token" function as it is today.

### Pattern: Server-to-server for OAuth user resolution

The `signIn` callback runs on the Next.js server during the OAuth callback. It calls the Fastify API directly (via `API_URL`, not through the gateway `/api/backend/...` proxy) — same as how `authorize()` calls `verify-credentials`. This keeps all user-management logic in the Fastify layer, testable with the existing integration test patterns.

### Pattern: Identical JWT token shape for all auth methods

OAuth users get the same JWE token shape as Credentials users: `{ id, workspace_id, workspace_slug, role }`. The Fastify `session.plugin.ts` and the `requireAuth` middleware are unaware of how the user authenticated. No changes needed in the API.

---

## Anti-Patterns to Avoid

### Anti-Pattern: Adding the `@auth/pg-adapter`

Using the Auth.js database adapter would require the `accounts`, `sessions`, and `verification_tokens` tables from Auth.js's schema, which conflict with the existing custom `verification_tokens` table. It would also shift session strategy from JWT to database for all providers unless explicitly forced back to JWT — which breaks the Fastify JWE decoder. Do not add the adapter.

### Anti-Pattern: Handling OAuth callback in a custom API route

Do not write a custom `/api/auth/google/callback` Fastify route. Auth.js handles the OAuth code exchange, PKCE, and state verification internally. The `signIn` callback is the correct hook for post-authentication logic. Bypassing Auth.js's callback handler means reimplementing security-critical OAuth flows.

### Anti-Pattern: Storing the OAuth access token in the JWT

The OAuth `access_token` from Google/GitHub is not needed beyond user identity resolution. Storing it in the JWE token increases cookie size and creates a token rotation problem (OAuth tokens expire; the JWT does not auto-refresh them). Do not persist `account.access_token` to the token.

### Anti-Pattern: Calling `verify-credentials` for OAuth users

Do not try to route OAuth users through the existing `verify-credentials` endpoint. It requires a `password_hash`, which OAuth users do not have. The new `oauth-signin` endpoint is the correct parallel path.

### Anti-Pattern: `allowDangerousEmailAccountLinking` on the provider

This Auth.js option enables automatic email-based linking at the provider level, but it only takes effect when a database adapter is present. Without an adapter, it has no effect. Do not rely on it — the linking logic belongs in the `signIn` callback calling `oauth-signin`.

---

## Build Order

```
1. Schema migration 0009
   - ALTER users.password_hash DROP NOT NULL
   - CREATE user_oauth_accounts
   - No code dependencies

2. POST /api/auth/oauth-signin Fastify route + integration tests
   - Depends on: schema
   - Three paths: new user, returning user, auto-link
   - Test each path with testcontainers

3. Auth.js config changes (auth.ts)
   - Add Google + GitHub providers
   - Add signIn callback calling oauth-signin
   - Depends on: oauth-signin route being deployed (or use API_URL pointing to local dev)

4. Login + signup page UI
   - Add OAuth buttons
   - Depends on: auth.ts changes

5. Provider registration (Google Cloud Console + GitHub)
   - Register redirect URIs for prod and local dev
   - Can be done in parallel with steps 2-4
   - Required before end-to-end testing

6. Environment variables
   - Add AUTH_GOOGLE_ID/SECRET, AUTH_GITHUB_ID/SECRET to Vercel + Railway
   - Required before any live testing
```

**Critical path:** Steps 1 → 2 → 3 are sequential. Steps 4, 5, 6 can overlap once step 3 is unblocked.

---

## Open Questions

- **GitHub email privacy:** GitHub users can set their email to private, in which case the primary email may not be in the OAuth profile. The `oauth-signin` route must handle a null email gracefully — either block sign-in with a clear error or use the GitHub-provided noreply address. Verify behavior against GitHub's API before implementing.
- **`password_hash` NOT NULL migration safety:** The column is `NOT NULL` in the current production schema. The ALTER must run as a non-blocking operation. PostgreSQL 16 supports `ALTER COLUMN DROP NOT NULL` as a metadata-only change (no table rewrite) — safe on a live table.
- **Profile page "connected accounts" UI:** Out of scope for this architecture document, but the `user_oauth_accounts` table enables it. Could be a small addition to the profile page.
- **Disconnect OAuth account:** Deferred per PROJECT.md scope. Would require deleting the `user_oauth_accounts` row and ensuring the user has either a password or another OAuth provider before allowing disconnect (to prevent lockout).

---

*Sources: [Auth.js OAuth configuration guide](https://authjs.dev/guides/configuring-oauth-providers), [Auth.js database models](https://authjs.dev/concepts/database-models), [Auth.js adapters](https://authjs.dev/reference/core/adapters), [NextAuth.js callbacks](https://next-auth.js.org/configuration/callbacks), [Auth.js Google provider](https://authjs.dev/getting-started/providers/google), existing codebase audit (auth.ts, session.plugin.ts, auth.ts routes, schema.ts)*
