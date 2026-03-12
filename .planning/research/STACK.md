# Technology Stack

**Project:** Velo — QA Test Management Platform
**Researched:** 2026-03-12
**Scope (v1.2 update):** Social Auth (Google + GitHub OAuth) additions only. All prior stack decisions remain valid.

---

## Already Decided (Reference Only)

| Layer | Decision | Version in package.json |
|-------|----------|--------------------------|
| Frontend | Next.js 16 Pages Router + TypeScript + Tailwind CSS | 16.1.6 |
| Backend | Node.js 22 LTS + Fastify 5 | ^5.0.0 |
| Database | PostgreSQL 16 + postgres.js + drizzle-kit | postgres ^3.4.8, drizzle-kit ^0.31.9 |
| ORM | Drizzle ORM (schema + migrations only; raw SQL for queries) | ^0.45.1 |
| Cache / Pub-Sub / Job Queue | Valkey via iovalkey + BullMQ | iovalkey ^0.3.3, bullmq ^5.70.4 |
| Auth | Auth.js v5 / next-auth beta.30 | 5.0.0-beta.30 |
| Storage | Cloudflare R2 via @aws-sdk/client-s3 | ^3.1005.0 |
| Email | Resend SDK | ^6.9.3 |
| Validation | Zod | ^4.3.6 |
| Testing | Vitest 2.x + @testing-library/react 16.x | ^2.0.0 |

---

## v1.2 Social Auth Milestone: Gap Analysis

The v1.2 milestone adds Google and GitHub OAuth alongside the existing Credentials provider. The changes fall into four areas:

1. **Auth.js provider additions** — import `Google` and `GitHub` from `next-auth/providers/*` and add to the providers array
2. **signIn callback** — intercept OAuth sign-ins to call the Fastify API, upsert the user, resolve workspace context, and handle auto-linking
3. **jwt callback** — already handles custom fields; must handle the case where `user` arrives from OAuth (no `workspace_id` in the profile; must be populated from the API call result)
4. **Database schema** — `users.password_hash` is currently `NOT NULL`; OAuth users have no password. A migration must make it nullable. A new `oauth_accounts` table is needed to track which providers are linked to each user (prevents `OAuthAccountNotLinked` errors on repeat sign-in and enables future account unlinking)

---

## v1.2 Stack Decisions

### 1. OAuth Providers — Built-in Auth.js v5 Providers (No New Packages)

**Decision:** Import `Google` and `GitHub` from `next-auth/providers/google` and `next-auth/providers/github`. Zero new npm packages.

Both providers ship inside `next-auth` (which is already installed at 5.0.0-beta.30). There is no separate package to install.

```typescript
import Google from "next-auth/providers/google"
import GitHub from "next-auth/providers/github"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({ ... }),  // existing — unchanged
    Google,
    GitHub,
  ],
  ...
})
```

**Environment variable auto-detection:** Auth.js v5 automatically reads `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` and `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` from the environment when the provider is imported without explicit `clientId`/`clientSecret` arguments. No change to provider initialization code is required if env vars follow this naming convention.

**Confidence:** HIGH — Auth.js v5 official documentation confirms provider imports from `next-auth/providers/*` and `AUTH_*` environment variable auto-detection.

---

### 2. signIn Callback — API-Backed OAuth User Upsert

**Decision:** Add a `signIn` callback that intercepts OAuth sign-ins, calls a new Fastify endpoint (`POST /api/auth/oauth-signin`), and either returns `true` (allow) or `false` (block). The API endpoint handles user lookup-or-create and auto-linking on email match.

The existing Credentials flow uses `authorize()` which calls `/api/auth/verify-credentials`. OAuth must follow the same pattern: Auth.js does the OAuth dance, then the `signIn` callback hands off to the API for user resolution.

```typescript
callbacks: {
  async signIn({ user, account, profile }) {
    // Credentials provider: Auth.js calls authorize() itself — skip here
    if (account?.type === "credentials") return true

    // OAuth providers: call API to upsert user and resolve workspace context
    const res = await fetch(`${process.env.API_URL}/api/auth/oauth-signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: account?.provider,        // "google" | "github"
        providerAccountId: account?.providerAccountId,
        email: profile?.email,
        name: profile?.name ?? null,
        image: profile?.image ?? null,
      }),
    })

    if (!res.ok) return false

    // Attach API response to user object so jwt callback can read it
    const data = await res.json() as { id: string; workspace_id: string | null; workspace_slug: string | null; role: string | null }
    user.id = data.id
    // Attach custom fields — same shape as verify-credentials response
    Object.assign(user, data)
    return true
  },

  jwt({ token, user, trigger, session }) {
    if (user) {
      const u = user as { id?: string; workspace_id?: string | null; workspace_slug?: string | null; role?: string | null }
      if (u.id !== undefined) token.id = u.id
      token.workspace_id = u.workspace_id ?? null
      token.workspace_slug = u.workspace_slug ?? null
      token.role = u.role ?? null
    }
    // ... existing trigger === "update" handling unchanged
    return token
  },
  // session callback unchanged
}
```

**Why this pattern:** The existing `jwt` callback already reads from the `user` object passed on first sign-in. By populating `user` inside `signIn`, the same jwt callback code path works for both Credentials and OAuth users without branching logic. The API owns all user business logic; Auth.js is purely the OAuth transport layer.

**Confidence:** HIGH — Auth.js v5 `signIn` callback receives `user`, `account`, and `profile` on OAuth flows. The `user` object is mutable within the callback. Confirmed by Auth.js v5 callback documentation.

---

### 3. New Fastify Endpoint: POST /api/auth/oauth-signin

**Decision:** Add a new endpoint to `apps/api/src/routes/auth.ts` that handles OAuth user upsert and auto-linking. No new library.

This endpoint is called server-to-server from the Auth.js `signIn` callback (same pattern as `verify-credentials`). It is not a public-facing endpoint.

**Logic:**

```
1. Look up user by email (case-insensitive)
2a. If user exists → verify or insert oauth_accounts row for this provider
   → this is the "auto-link" path: same email = same account
   → mark users.email_verified = true (provider already verified it)
2b. If user does not exist → INSERT new user (password_hash = NULL, email_verified = true)
   → INSERT into oauth_accounts
3. Look up workspace membership (same JOIN as verify-credentials)
4. Return { id, email, name, workspace_id, workspace_slug, role }
```

**Auto-linking rationale:** Google and GitHub both verify email ownership before issuing OAuth tokens. A user who signs in with `alice@gmail.com` via Google is the same identity as `alice@gmail.com` via email/password. Auto-linking on email match is the correct behavior for a dev-tool SaaS — forcing users to merge accounts manually is friction with no security benefit when both providers are trusted.

**Idempotency:** The `oauth_accounts` INSERT uses `ON CONFLICT (provider, provider_account_id) DO NOTHING` so repeat sign-ins are a no-op.

**Confidence:** HIGH — this is a straightforward Fastify route using existing postgres.js patterns.

---

### 4. allowDangerousEmailAccountLinking — NOT Used

**Decision:** Do NOT set `allowDangerousEmailAccountLinking: true` on the providers. Handle linking manually in the `signIn` callback + API instead.

The Auth.js `allowDangerousEmailAccountLinking` option exists for use with a database adapter. Without an adapter (this project uses JWT strategy, no adapter), the flag has no effect — Auth.js does not manage the `accounts` table itself. The account linking logic must be implemented in the `signIn` callback regardless.

**Confidence:** MEDIUM — Auth.js v5 documentation states this option is for adapter-managed databases. Without an adapter, the option is a no-op in JWT mode. Community discussions confirm this interpretation.

---

### 5. Database Schema Changes — One Migration

**Decision:** Add migration `0009_social_auth.sql` with two changes:

#### 5a. Make `users.password_hash` nullable

```sql
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
```

OAuth users have no password. The existing `NOT NULL` constraint blocks inserting an OAuth-only user. Making it nullable is the correct approach — the application layer already controls which paths require a password (Credentials sign-in validates that `password_hash IS NOT NULL` before calling `bcrypt.compare`).

The Drizzle schema change:

```typescript
export const users = pgTable("users", {
  ...
  password_hash: text("password_hash"),  // was: .notNull()
  ...
})
```

**Confidence:** HIGH — this is a straightforward ALTER COLUMN; the constraint exists only in the initial migration SQL, not enforced by any application logic beyond the bcrypt comparison gate.

#### 5b. New `oauth_accounts` table

```sql
CREATE TABLE oauth_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,           -- "google" | "github"
  provider_account_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oauth_accounts_provider_unique UNIQUE (provider, provider_account_id)
);

CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts (user_id);
```

The `UNIQUE (provider, provider_account_id)` constraint:
- Prevents duplicate rows on repeat sign-in (INSERT ... ON CONFLICT DO NOTHING)
- Enables future account unlinking by deleting a specific row
- The provider_account_id is the stable external ID (Google sub, GitHub id) — not the email, which can change

The Drizzle schema definition:

```typescript
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull(),
    provider_account_id: varchar("provider_account_id", { length: 255 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("oauth_accounts_provider_unique").on(t.provider, t.provider_account_id),
  ]
)
```

**Why a separate table vs. columns on `users`:** A user can link multiple OAuth providers (Google AND GitHub). Columns on `users` would limit to one provider. A join table is the correct normal form and enables future unlinking UI without schema changes.

**Why not use Auth.js's built-in `accounts` table shape:** The built-in shape requires an adapter. This project uses JWT strategy with no adapter. A custom minimal `oauth_accounts` table is simpler and doesn't pull in adapter overhead.

**Confidence:** HIGH — standard join table pattern for OAuth account linking.

---

### 6. External App Registration Requirements

#### Google OAuth

**What to create:** Google Cloud Console project → "APIs & Services" → "Credentials" → "OAuth 2.0 Client ID" → "Web application"

**Authorized redirect URIs to register:**
- Development: `http://localhost:3000/api/auth/callback/google`
- Production: `https://velo-test-management.vercel.app/api/auth/callback/google`

**Note:** Google requires the "OAuth consent screen" to be configured first. For internal/testing use, "External" user type works; set to "Production" when ready to publish. The Google+ API does not need to be enabled — the built-in `userinfo` scope is sufficient.

**Confidence:** HIGH — Google Cloud Console OAuth configuration is well-documented and stable.

#### GitHub OAuth

**What to create:** GitHub → Settings → Developer settings → OAuth Apps → "New OAuth App"

**Authorization callback URL:** GitHub OAuth Apps accept only ONE callback URL per app. Register two separate apps:
- Development app callback: `http://localhost:3000/api/auth/callback/github`
- Production app callback: `https://velo-test-management.vercel.app/api/auth/callback/github`

Each app has its own `CLIENT_ID` and `CLIENT_SECRET`. Use environment-specific env vars:
- Local `.env.local`: `AUTH_GITHUB_ID=<dev-app-id>`, `AUTH_GITHUB_SECRET=<dev-app-secret>`
- Vercel production env: `AUTH_GITHUB_ID=<prod-app-id>`, `AUTH_GITHUB_SECRET=<prod-app-secret>`

**Confidence:** HIGH — GitHub OAuth Apps single-callback limitation is documented and a known constraint in the ecosystem.

---

## New Environment Variables Required

| Variable | Where Set | Value Pattern |
|----------|-----------|---------------|
| `AUTH_GOOGLE_ID` | Vercel env + `.env.local` | Google Cloud Console OAuth 2.0 Client ID |
| `AUTH_GOOGLE_SECRET` | Vercel env + `.env.local` | Google Cloud Console OAuth 2.0 Client Secret |
| `AUTH_GITHUB_ID` | Vercel env + `.env.local` | GitHub OAuth App Client ID |
| `AUTH_GITHUB_SECRET` | Vercel env + `.env.local` | GitHub OAuth App Client Secret |

No new env vars needed on the Railway API side — the `oauth-signin` endpoint uses the same `sql` connection already configured.

---

## What NOT to Add

| Considered | Decision | Rationale |
|------------|----------|-----------|
| `@auth/drizzle-adapter` or any Auth.js adapter | Do not add | Adapters change the session strategy default to "database" and require the full Auth.js accounts/sessions/verificationTokens schema. The project uses JWT strategy intentionally (no server-side session storage). Adding an adapter would require migrating all existing sessions and adding 3+ new tables. The manual signIn callback approach achieves the same result with zero added complexity. |
| `passport.js` + `passport-google-oauth20` / `passport-github2` | Do not add | The project is already on Auth.js v5. Adding Passport would duplicate the auth layer. Auth.js built-in providers are the correct choice. |
| `openid-client` directly | Do not add | Auth.js v5 uses openid-client internally. Exposing it directly would bypass CSRF, state, and PKCE handling that Auth.js provides. |
| `allowDangerousEmailAccountLinking: true` | Do not use | No-op without a database adapter (JWT strategy). Linking is handled by the signIn callback + API instead. |
| Storing Google/GitHub access tokens in the JWT | Do not do | The project has no use case for calling Google or GitHub APIs on behalf of the user. Storing OAuth tokens in the JWT inflates cookie size unnecessarily. |
| Apple Sign-In | Deferred | Requires Apple Developer Program membership + extra OIDC complexity (name only sent on first sign-in). Not in scope for v1.2. |
| PKCE enforcement for OAuth | Not needed | PKCE is for the Credentials provider (public clients). Google and GitHub OAuth use server-side confidential clients — PKCE is handled by Auth.js internally and not configurable at the provider level in v5. |

---

## Summary: What Changes in v1.2

| Area | Change |
|------|--------|
| `apps/web/package.json` | No new packages |
| `apps/api/package.json` | No new packages |
| `apps/web/src/auth.ts` | Add Google + GitHub providers; add `signIn` callback for OAuth user resolution |
| `apps/api/src/routes/auth.ts` | Add `POST /api/auth/oauth-signin` endpoint |
| `apps/api/src/db/schema.ts` | `users.password_hash` → nullable; add `oauthAccounts` table |
| `apps/api/drizzle/0009_social_auth.sql` | ALTER COLUMN + CREATE TABLE migration |
| Google Cloud Console | Register OAuth 2.0 Client ID (dev + prod redirect URIs) |
| GitHub Developer Settings | Register two OAuth Apps (one dev, one prod) |
| Vercel environment variables | Add `AUTH_GOOGLE_ID/SECRET`, `AUTH_GITHUB_ID/SECRET` |
| Local `.env.local` | Add same four variables (dev app credentials) |

**No new npm packages required for either `apps/web` or `apps/api`.**

---

## Integration Points with Existing Stack

| New Capability | Integrates With | How |
|----------------|-----------------|-----|
| Google + GitHub OAuth | Auth.js v5 built-in providers | Import from `next-auth/providers/*`, add to `providers[]` array |
| OAuth user resolution | Fastify auth.ts route | New server-to-server endpoint called from `signIn` callback |
| Custom JWT fields for OAuth users | Existing `jwt` callback | `signIn` callback mutates `user` object; `jwt` callback reads it identically to Credentials flow |
| `oauth_accounts` table | postgres.js raw SQL | INSERT ON CONFLICT DO NOTHING in new API endpoint |
| `password_hash` nullable | Existing signup/signin logic | Credentials verify-credentials already gates on bcrypt — null hash means `bcrypt.compare` is never reached |

---

## Version Verification

| Package | Installed | OAuth Provider Support |
|---------|-----------|------------------------|
| next-auth | 5.0.0-beta.30 | Google + GitHub providers included; confirmed in `next-auth/providers/*` |
| @auth/core | ^0.41.0 | Ships with next-auth 5 beta.30; no separate install needed |

Both packages are already installed. Zero version bumps required.

---

## Sources

- Auth.js v5 built-in Google provider source: https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/google.ts
- Auth.js environment variables guide: https://authjs.dev/guides/environment-variables
- Auth.js migration to v5: https://authjs.dev/getting-started/migrating-to-v5
- Auth.js GitHub provider guide: https://authjs.dev/guides/configuring-github
- Auth.js callbacks reference: https://next-auth.js.org/configuration/callbacks
- GitHub OAuth single callback URL limitation: https://github.com/nextauthjs/next-auth/issues/7581
- OAuthAccountNotLinked error and allowDangerousEmailAccountLinking: https://authjs.dev/reference/core/errors
- Auth.js social logins guide (v5): https://blog.greenroots.info/nextjs-and-next-auth-v5-guide-to-social-logins
- Existing codebase: D:/git_repo/personal/velo-test-management/apps/web/src/auth.ts
- Existing codebase: D:/git_repo/personal/velo-test-management/apps/api/src/routes/auth.ts
- Existing codebase: D:/git_repo/personal/velo-test-management/apps/api/src/db/schema.ts
