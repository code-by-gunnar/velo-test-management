# Phase 1: Schema & Fastify Route - Research

**Researched:** 2026-03-12
**Domain:** PostgreSQL schema migration + Fastify 5 endpoint for OAuth user resolution
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

| Decision | Value |
|----------|-------|
| Auth framework | Auth.js v5, PKCE enforced |
| OAuth providers | Google + GitHub only (no Apple, no Microsoft) |
| Auto-link strategy | Auto-link on email match (no duplicate accounts) |
| OAuth users skip OTP | Provider already verified the email |
| No refresh token storage | Velo doesn't call Google/GitHub APIs on behalf of users |
| JIT provisioning | New OAuth users are created and routed to workspace onboarding |
| Next migration | 0009 (after 0008_gdpr_lifecycle_tables.sql) |
| allowDangerousEmailAccountLinking | Do NOT set this flag — no-op without a DB adapter; linking is handled in the signIn callback + API instead |
| Linking is one-directional | email/password → OAuth (auto-link); OAuth-only → email/password not supported |
| One provider max per user | A user can have Google OR GitHub, not both |
| Avatar seeding | Deferred to Phase 3 (UI-04); Phase 1 endpoint does NOT accept avatar URLs |

### Locked Decisions — Phase 1 Specific (from CONTEXT.md Section A, B)

**Section A — One-directional linking rules:**
1. Email/password → OAuth: Auto-links. User keeps password. Existing workspace preserved.
2. OAuth-only → email/password: Not supported in v1.
3. One provider max: User can have at most one linked OAuth provider.
4. Auto-linked users keep both methods: email/password user who auto-links can use either forever.
5. Error messaging: "Invalid credentials" for OAuth-only users attempting password login (no info leak).
6. Block with generic error if user tries to link a second provider.

**Section B — Unverified email collision:**
- Block OAuth sign-in when an unverified email/password account exists.
- Return: "An account with this email exists but hasn't been verified. Please verify your email first."
- Researcher note: confirm this is best practice (see Research Flag 1 below).

### Claude's Discretion

- Internal endpoint security: how to prevent external abuse of `POST /api/auth/oauth-signin` (shared secret vs. IP restriction vs. trust network boundary)
- Exact error response shapes for blocked sign-in paths
- Transaction isolation level for the three-path upsert

### Deferred Ideas (OUT OF SCOPE)

- Multiple OAuth providers per user (Google + GitHub both): deferred to reduce complexity
- Self-service provider switching / unlinking: deferred to future milestone (CON-01, CON-02)
- "Set password" flow for OAuth-only users: explicitly out of scope
- Avatar seeding from OAuth profile: Phase 3
- GDPR erasure worker explicit DELETE: Phase 4 (INF-07)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INF-05 | Schema migration adds `user_oauth_accounts` table and makes `password_hash` nullable | Section: Standard Stack → Schema; Architecture Patterns → Migration 0009; Code Examples → Migration SQL |
| INF-08 | Fastify `POST /api/auth/oauth-signin` endpoint handles user resolution (new, returning, auto-link) | Section: Architecture Patterns → Endpoint Design; Code Examples → Endpoint Template; Common Pitfalls → Race Conditions |
</phase_requirements>

---

## Summary

Phase 1 is purely backend infrastructure: one database migration and one new Fastify endpoint. No Auth.js wiring happens in this phase — that is Phase 2. The endpoint is callable in isolation via integration tests before any OAuth provider is registered.

The schema work is mechanical: `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL` (PostgreSQL 16 handles this as a metadata-only change, zero table rewrite) and a `CREATE TABLE user_oauth_accounts` join table with a `UNIQUE(provider, provider_account_id)` constraint and `ON DELETE CASCADE` on the `user_id` FK. The Drizzle schema.ts definition must match the raw SQL migration for drizzle-kit to track it correctly.

The `POST /api/auth/oauth-signin` endpoint must handle three resolution paths (new user, returning user, auto-link) plus two blocking paths (unverified email collision, second provider blocked). All three upsert paths must run inside a single `sql.begin()` transaction to prevent race conditions. The endpoint uses `ON CONFLICT (provider, provider_account_id) DO NOTHING` for idempotency — calling it twice for the same OAuth account must not create duplicate rows.

**Primary recommendation:** Write migration first, add endpoint second, write integration tests covering all five paths (three pass, two block) before moving to Phase 2.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| postgres.js | ^3.4.8 | Raw SQL for runtime queries | Already in use; project rule is no Drizzle ORM for runtime queries |
| drizzle-orm | ^0.45.1 | Schema definition only (schema.ts) | Already in use; only for schema types and migration generation |
| drizzle-kit | ^0.31.9 | Migration file generation | Already in use; `runMigrations()` in server.ts |
| uuidv7 | existing | UUID generation for new rows | Already in use throughout routes/auth.ts |
| Fastify 5 | ^5.0.0 | Route plugin pattern | Already in use; auth.ts exports `FastifyPluginAsync` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^2.0.0 | Integration tests | All new routes get integration tests in `src/routes/__tests__/` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `sql.begin()` transaction | Drizzle ORM transactions | Drizzle ORM not used for runtime queries per project rule; raw is simpler and consistent |
| `ON CONFLICT DO NOTHING` | Application-level check-then-insert | ON CONFLICT is atomic; application-level check has TOCTOU race |
| `gen_random_uuid()` in SQL | `uuidv7()` in application | Project convention is uuidv7 from application layer; but SQL default is acceptable fallback for migration defaults |

**Installation:** No new packages required. All libraries are already installed.

---

## Architecture Patterns

### Recommended Project Structure

No new directories. New files slot into existing structure:

```
apps/api/
├── drizzle/
│   └── 0009_social_auth.sql          # New migration
├── src/
│   ├── db/
│   │   └── schema.ts                  # Modify: add oauthAccounts table, drop notNull from password_hash
│   └── routes/
│       ├── auth.ts                    # Modify: add POST /api/auth/oauth-signin
│       └── __tests__/
│           └── auth.test.ts           # Modify: add oauth-signin integration tests
```

### Pattern 1: Transaction-Wrapped Three-Path Upsert

**What:** The `oauth-signin` endpoint uses a single `sql.begin()` block containing all reads and writes. This prevents a race condition where two concurrent requests for the same `(provider, providerAccountId)` pair both see "no existing row" and both try to insert.

**When to use:** Any endpoint with a "look up, then write if missing" pattern.

**Example:**
```typescript
// Source: pattern from apps/api/src/routes/auth.ts verify-otp handler
await sql.begin(async (tx: TransactionSql) => {
  const q = tx as unknown as Sql

  // Step 1: Look up by provider account (fast path — returning user)
  const [oauthRow] = await q`
    SELECT u.id, u.email, u.name,
           wm.workspace_id, wm.role, w.slug AS workspace_slug
    FROM user_oauth_accounts oa
    JOIN users u ON u.id = oa.user_id
    LEFT JOIN workspace_members wm ON wm.user_id = u.id AND wm.is_active = true
    LEFT JOIN workspaces w ON w.id = wm.workspace_id
    WHERE oa.provider = ${provider}
      AND oa.provider_account_id = ${providerAccountId}
    LIMIT 1
  `
  if (oauthRow) {
    // Returning user — no writes needed, return early
    resolvedUser = oauthRow
    return
  }

  // Step 2: Look up by email (auto-link or new user)
  const [existingUser] = await q`
    SELECT id, email, name, email_verified
    FROM users
    WHERE email = ${email.toLowerCase()}
    LIMIT 1
  `

  // Section B: Block if unverified email/password account exists
  if (existingUser && !existingUser.email_verified) {
    throw new UnverifiedEmailError()
  }

  // Section A: Block if user already has a different provider linked
  if (existingUser) {
    const [existingProvider] = await q`
      SELECT provider FROM user_oauth_accounts
      WHERE user_id = ${existingUser.id}::uuid
        AND provider != ${provider}
      LIMIT 1
    `
    if (existingProvider) {
      throw new DuplicateProviderError()
    }
  }

  let userId: string
  if (existingUser) {
    // Auto-link path: existing email/password user
    userId = existingUser.id
    // Mark email_verified = true in case it wasn't (provider verified it)
    await q`UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = ${userId}::uuid`
  } else {
    // New user JIT provision
    userId = uuidv7()
    await q`
      INSERT INTO users (id, email, name, email_verified, password_hash)
      VALUES (${userId}::uuid, ${email.toLowerCase()}, ${name ?? null}, true, NULL)
    `
  }

  // Insert oauth account row — idempotent (ON CONFLICT DO NOTHING)
  await q`
    INSERT INTO user_oauth_accounts (id, user_id, provider, provider_account_id)
    VALUES (${uuidv7()}::uuid, ${userId}::uuid, ${provider}, ${providerAccountId})
    ON CONFLICT (provider, provider_account_id) DO NOTHING
  `

  // Fetch complete user with workspace context
  const [fullUser] = await q`
    SELECT u.id, u.email, u.name,
           wm.workspace_id, wm.role, w.slug AS workspace_slug
    FROM users u
    LEFT JOIN workspace_members wm ON wm.user_id = u.id AND wm.is_active = true
    LEFT JOIN workspaces w ON w.id = wm.workspace_id
    WHERE u.id = ${userId}::uuid
    LIMIT 1
  `
  resolvedUser = fullUser
})
```

### Pattern 2: Drizzle Schema Definition for New Table

**What:** Add the `oauthAccounts` table to `schema.ts` so drizzle-kit tracks the migration correctly. The table definition must match the raw SQL exactly.

**When to use:** Every time a new table is added to a raw SQL migration.

**Example:**
```typescript
// Source: apps/api/src/db/schema.ts — existing pattern (workspaceMembers table)
export const oauthAccounts = pgTable(
  "user_oauth_accounts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull(),
    provider_account_id: varchar("provider_account_id", { length: 255 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("user_oauth_accounts_provider_unique").on(t.provider, t.provider_account_id),
    unique("user_oauth_accounts_user_provider_unique").on(t.user_id, t.provider),
  ]
)
// Also update users table definition:
// password_hash: text("password_hash"),  // remove .notNull()
```

### Pattern 3: Fastify Route Plugin with Body Schema

**What:** All auth routes in `auth.ts` follow the same `FastifyPluginAsync` pattern with inline body validation schema. The oauth-signin endpoint follows this pattern exactly.

**Example:**
```typescript
// Source: apps/api/src/routes/auth.ts — existing verify-credentials pattern
fastify.post<{
  Body: {
    provider: string
    providerAccountId: string
    email: string
    name: string | null
  }
}>("/api/auth/oauth-signin", {
  schema: {
    body: {
      type: "object",
      required: ["provider", "providerAccountId", "email"],
      properties: {
        provider: { type: "string", enum: ["google", "github"] },
        providerAccountId: { type: "string", maxLength: 255 },
        email: { type: "string", format: "email" },
        name: { type: "string", maxLength: 255, nullable: true },
      },
    },
  },
}, async (request, reply) => {
  // ... handler logic
})
```

### Pattern 4: Migration File Format

**What:** Raw SQL migrations follow the established pattern in `apps/api/drizzle/`. Comment header, sections for each logical change.

**Example:**
```sql
-- 0009_social_auth.sql
-- Social Auth: add user_oauth_accounts table, make password_hash nullable

-- Section 1: Allow OAuth users (no password)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Section 2: OAuth account links
CREATE TABLE user_oauth_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            VARCHAR(20) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_oauth_accounts_provider_unique UNIQUE (provider, provider_account_id),
  CONSTRAINT user_oauth_accounts_user_provider_unique UNIQUE (user_id, provider)
);

-- Section 3: Indexes
CREATE INDEX idx_user_oauth_accounts_user_id ON user_oauth_accounts (user_id);
```

### Anti-Patterns to Avoid

- **Check-then-insert without transaction:** `SELECT` to check if row exists, then `INSERT` outside a transaction. Two concurrent requests can both pass the check and both insert, violating the UNIQUE constraint with an error rather than silently deduplicating. Use `ON CONFLICT` inside `sql.begin()`.
- **Calling `reply.send()` inside `sql.begin()`:** The project CLAUDE.md explicitly forbids this. Call `reply.send()` AFTER the transaction block returns. Use a `resolvedUser` variable to capture the result.
- **`bcrypt.compare(password, null)`:** Currently `verify-credentials` calls `bcrypt.compare(password, user.password_hash)` without a null check. When `password_hash` is NULL (OAuth-only user), `bcrypt.compare` receives `null` as the second argument. In bcrypt@5.x this throws a `TypeError`. The route must add a null guard BEFORE the bcrypt call. The guard should return the same "Invalid credentials" 401 to avoid information leakage.
- **Using `gen_random_uuid()` in INSERT:** Project convention is `uuidv7()` from the application layer. Use `DEFAULT gen_random_uuid()` only for migration-level defaults (where the app won't be inserting), not in route handler INSERT statements.
- **Storing `avatarUrl` in this phase:** Phase 1 does NOT accept or store avatar URLs. The CONTEXT.md explicitly defers avatar seeding to Phase 3. Do not add an `avatar_url` column to `user_oauth_accounts`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent upsert | Custom check-then-insert | `ON CONFLICT (provider, provider_account_id) DO NOTHING` | PostgreSQL UNIQUE constraint + ON CONFLICT is atomic; custom check has TOCTOU race |
| Race condition prevention | Application-level mutex or Redis lock | `sql.begin()` transaction | PostgreSQL serializable isolation handles concurrent inserts; transactions are already the project pattern |
| UUID generation | `crypto.randomUUID()` or `Math.random()` | `uuidv7()` from `uuidv7` package | Project convention: uuidv7 for all new row IDs |
| Email normalization | Custom `.toLowerCase().trim()` | `email.toLowerCase()` — already the project pattern | Consistent with existing routes; `trim()` is not needed because Fastify schema validation rejects leading/trailing whitespace |

**Key insight:** PostgreSQL constraints and transactions handle all the concurrency and idempotency requirements. No application-level coordination needed.

---

## Common Pitfalls

### Pitfall 1: `bcrypt.compare` Throws on NULL password_hash

**What goes wrong:** After migration 0009 makes `password_hash` nullable, an OAuth-only user who attempts to sign in with email/password hits the `verify-credentials` route. The route fetches the user (which exists), then calls `bcrypt.compare(password, user.password_hash)` — but `user.password_hash` is `null`. In `bcrypt@5.x`, passing `null` as the second argument to `bcrypt.compare` throws a `TypeError: data must be a string or Buffer`.

**Why it happens:** The existing route was written when `password_hash NOT NULL` was a DB constraint. It never needed to handle null. After the migration drops the constraint, the application guard is the only safety net.

**How to avoid:** Add an explicit null check in `verify-credentials` BEFORE the `bcrypt.compare` call:
```typescript
if (!user.password_hash) {
  return reply.status(401).send({ error: "Invalid credentials" })
}
const valid = await bcrypt.compare(password, user.password_hash)
```
The null check must return the identical 401 response as a wrong password — never reveal that the account is OAuth-only.

**Warning signs:** `TypeError` in Railway logs after migration, with no corresponding 401 response reaching the client. Any user who registered via email/password before OAuth was added will still have a hash — this only affects users created via the new `oauth-signin` endpoint.

---

### Pitfall 2: Race Condition — Concurrent OAuth Sign-Ins for the Same Account

**What goes wrong:** Two tab opens or network retries submit `POST /api/auth/oauth-signin` simultaneously with the same `(provider, providerAccountId)`. Both transactions reach the `INSERT INTO user_oauth_accounts` step. The first commits; the second hits the `UNIQUE(provider, provider_account_id)` constraint. Without `ON CONFLICT DO NOTHING`, the second request returns a 500 with a PostgreSQL constraint error instead of the expected user object.

**Why it happens:** OAuth callbacks can fire multiple times from the browser (back button, network retry). The `signIn` callback in Auth.js will retry if the response is non-2xx.

**How to avoid:** Use `INSERT ... ON CONFLICT (provider, provider_account_id) DO NOTHING`. The second concurrent insert silently does nothing; the transaction still returns the resolved user by querying after the insert.

**Warning signs:** Intermittent 500 errors with `duplicate key value violates unique constraint "user_oauth_accounts_provider_unique"` in Railway logs during OAuth testing.

---

### Pitfall 3: `reply.send()` Inside the Transaction Block

**What goes wrong:** Calling `reply.send(data)` or `return reply.send(data)` inside the `sql.begin()` callback causes a race condition. The transaction commit and the HTTP response write happen out of order. The CLAUDE.md explicitly documents this: "Do NOT call `reply.send()` inside the `withWorkspace` transaction callback."

**Why it happens:** `sql.begin()` resolves the promise when the transaction commits. Calling `reply.send()` inside the callback fires the HTTP response before the commit finalizes.

**How to avoid:** Use a mutable variable outside the transaction to capture the result, then call `reply.send()` after the `await sql.begin(...)` resolves:
```typescript
let resolvedUser: UserRow | null = null
let errorCode: string | null = null

await sql.begin(async (tx: TransactionSql) => {
  const q = tx as unknown as Sql
  // ... all reads and writes
  resolvedUser = fetchedUser
})

if (errorCode === "UNVERIFIED_EMAIL") return reply.status(409).send({ error: "..." })
return reply.send(resolvedUser)
```

**Warning signs:** Fastify logs showing "reply already sent" errors, or responses that arrive before the database commit is confirmed.

---

### Pitfall 4: Returning User with No workspace_id — Must Return Null, Not Omit

**What goes wrong:** A new OAuth user (JIT provisioned) has no workspace membership yet. The endpoint JOINs workspace_members which returns no row. If the endpoint returns `{}` without the workspace fields, or throws because `wm.workspace_id` is undefined, the downstream Phase 2 `signIn` callback's `Object.assign(user, data)` will leave `workspace_id` undefined on the Auth.js user object rather than null.

**Why it happens:** LEFT JOIN returns null columns when there's no matching workspace_member row. The endpoint must explicitly return `workspace_id: null` not `workspace_id: undefined`.

**How to avoid:** Mirror the `verify-credentials` response exactly:
```typescript
return reply.send({
  id: resolvedUser.id,
  email: resolvedUser.email,
  name: resolvedUser.name,
  workspace_id: resolvedUser.workspace_id ?? null,
  workspace_slug: resolvedUser.workspace_slug ?? null,
  role: resolvedUser.role ?? null,
})
```

**Warning signs:** Auth.js JWT has `workspace_id: undefined` (not null). The `requireAuth` middleware fails to detect "needs onboarding" and routes the user to a broken state.

---

### Pitfall 5: Unverified Email Collision (Research Flag 1 — Best Practice Confirmed)

**What goes wrong:** A user signs up with `alice@example.com` via email/password, never verifies OTP, then attempts OAuth sign-in with the same email via Google. Without a guard, the auto-link path would link the OAuth account to the unverified shell — effectively bypassing OTP verification and potentially hijacking an account someone else registered with that email.

**Why it happens:** Auto-link on email match is the right default for verified emails. An unverified email is a fundamentally different case — ownership is not confirmed.

**How to avoid:** In the `oauth-signin` endpoint, when looking up an existing user by email, check `email_verified`. If `email_verified = false`, return 409 with a specific error code that the Auth.js `signIn` callback can map to a user-friendly message. Do NOT auto-link.

**Industry verification (HIGH confidence):** Linear, Vercel, and GitHub itself all block OAuth sign-in when an unverified email/password account exists. The pattern is: block with a message to verify the original account first. This is the correct behavior. The CONTEXT.md decision is confirmed as best practice.

**Warning signs:** OAuth sign-in succeeds for a user who should have been blocked. Check the `email_verified` column after the sign-in — if false, the guard is missing.

---

### Pitfall 6: Second Provider Blocked But Uses Wrong Error Shape

**What goes wrong:** A user already has Google linked. They try to sign in with GitHub (same email). The endpoint must block this (one-provider-per-user rule from CONTEXT.md Section A). If it returns a generic 500 or a non-standard error shape, the Auth.js `signIn` callback returns `false`, which redirects the user to `/login?error=AccessDenied` — no actionable message.

**How to avoid:** Return a specific 409 with `{ error: "provider_conflict", message: "..." }`. The Phase 2 Auth.js signIn callback can check for specific error codes and redirect to the custom error page with a helpful message instead of the generic Auth.js error page.

---

### Pitfall 7: Migration File NOT Added to Drizzle Meta Journal

**What goes wrong:** Writing `0009_social_auth.sql` manually and placing it in `apps/api/drizzle/` does NOT automatically register it in `drizzle/meta/_journal.json`. The Drizzle migrator reads the journal to determine which migrations have run. If the journal entry is missing, the migration is silently skipped on startup.

**Why it happens:** When migrations are hand-written (not generated by `drizzle-kit generate`), the journal file must also be updated manually, or the migration must be added via `drizzle-kit push` / `drizzle-kit migrate` workflow.

**How to avoid:** Check the existing journal entries and add a new entry with the correct `idx`, `tag`, and `when` values. OR generate a blank migration via `drizzle-kit generate` and then edit the SQL content.

**Warning signs:** `user_oauth_accounts` table does not exist after deployment, even though the SQL file is present. Railway logs show no mention of migration 0009 running.

---

## Code Examples

Verified patterns from the existing codebase:

### Migration SQL Structure (from 0008_gdpr_lifecycle_tables.sql)

```sql
-- 0009_social_auth.sql
-- Social Auth: add user_oauth_accounts table, make password_hash nullable

-- Section 1: Allow OAuth users (no password hash required)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Section 2: OAuth account linking table
CREATE TABLE user_oauth_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            VARCHAR(20)  NOT NULL,           -- 'google' | 'github'
  provider_account_id VARCHAR(255) NOT NULL,            -- provider's stable user ID
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT user_oauth_accounts_provider_unique UNIQUE (provider, provider_account_id),
  CONSTRAINT user_oauth_accounts_user_provider_unique UNIQUE (user_id, provider)
);

-- Section 3: Index for lookup by user_id (e.g. profile page "connected accounts")
CREATE INDEX idx_user_oauth_accounts_user_id ON user_oauth_accounts (user_id);
```

**Key design notes:**
- `UNIQUE(provider, provider_account_id)`: enables `ON CONFLICT DO NOTHING` idempotency on the endpoint. The primary key for OAuth account lookup.
- `UNIQUE(user_id, provider)`: enforces one-provider-per-user rule at the DB layer. If the application layer guard fails, the DB rejects the second insert.
- `ON DELETE CASCADE`: when a user is hard-deleted, their OAuth account rows are automatically removed. Erasure worker needs an explicit DELETE for the anonymization path (Phase 4).
- `DEFAULT gen_random_uuid()`: using the SQL default for the migration table definition is fine; the application still uses `uuidv7()` in INSERT statements for consistency.

### Transaction Pattern (from apps/api/src/routes/auth.ts verify-otp)

```typescript
// Source: apps/api/src/routes/auth.ts line 137
await sql.begin(async (tx: TransactionSql) => {
  const q = tx as unknown as Sql   // required cast — TransactionSql omits call signatures
  await q`...`
  await q`...`
})
// reply.send() called AFTER the begin block, never inside
```

### NULL password_hash Guard (must add to verify-credentials)

```typescript
// Add at line ~177 in apps/api/src/routes/auth.ts, before bcrypt.compare
if (!user.password_hash) {
  // OAuth-only user attempting password login — return identical error to wrong password
  return reply.status(401).send({ error: "Invalid credentials" })
}
const valid = await bcrypt.compare(password, user.password_hash)
```

### Response Shape (must match verify-credentials exactly)

```typescript
// Source: apps/api/src/routes/auth.ts line 184-190
return reply.send({
  id: resolvedUser.id,
  email: resolvedUser.email,
  name: resolvedUser.name ?? null,
  workspace_id: resolvedUser.workspace_id ?? null,
  workspace_slug: resolvedUser.workspace_slug ?? null,
  role: resolvedUser.role ?? null,
})
```

### Integration Test Structure (from apps/api/src/routes/__tests__/auth.test.ts)

```typescript
// Source: apps/api/src/routes/__tests__/auth.test.ts
// Pattern: Fastify app.inject() tests with beforeAll/afterAll cleanup

describe("OAuth signin integration (INF-05, INF-08)", () => {
  const app = Fastify({ logger: false })
  const testEmail = `oauth-test-${Date.now()}@example.com`

  beforeAll(async () => {
    await app.register(authRoutes)
    await app.ready()
  })

  afterAll(async () => {
    const { sql } = await import("../../db/client.js")
    await sql`DELETE FROM user_oauth_accounts WHERE provider_account_id LIKE 'test-%'`
    await sql`DELETE FROM users WHERE email = ${testEmail}`
    await app.close()
    await sql.end()
  })

  // Test: new user path (returns user with workspace_id = null)
  // Test: returning user path (idempotent — second call returns same id)
  // Test: auto-link path (existing credentials user + same email)
  // Test: unverified email collision (returns 409)
  // Test: second provider blocked (returns 409 with provider_conflict code)
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ALTER COLUMN SET NOT NULL` requires table rewrite | PostgreSQL 12+: `DROP NOT NULL` is metadata-only (no table rewrite, no lock) | PostgreSQL 12 | Migration is safe to run on live production table with zero downtime |
| Auth.js database adapter for OAuth | Manual `signIn` callback + custom Fastify endpoint | v1.2 decision | No adapter overhead, full control over linking logic, no foreign table schema required |
| `allow_dangerous_email_account_linking` flag | Linking handled entirely in signIn callback | v1.2 design decision | Flag is a no-op without adapter; callback approach works regardless of adapter presence |

**Deprecated/outdated:**
- `@auth/pg-adapter`: NOT used. Adds adapter tables (accounts, sessions, verification_tokens) that conflict with existing custom schema.
- `NEXTAUTH_SECRET` / `NEXTAUTH_URL`: Deprecated v4 names. Project uses `AUTH_SECRET` / `AUTH_URL` (v5 canonical names).

---

## Open Questions

1. **GitHub `name` field being null**
   - What we know: GitHub users can have no display name set. The GitHub API returns `name: null` in the user profile when unset.
   - What's unclear: Auth.js GitHub provider exposes this via `profile.name`. If `null`, the new user INSERT would set `name = null`. This is acceptable — the `users.name` column is nullable.
   - Recommendation: Accept `null` name in the endpoint body schema. Insert null. The user can set their name via profile settings post-onboarding. No special handling needed.

2. **Internal endpoint security for `POST /api/auth/oauth-signin`**
   - What we know: This endpoint is server-to-server (Next.js → Railway API). It is not publicly accessible through the `/api/backend/[...path]` gateway because that gateway adds an Authorization header check. The endpoint is unauthenticated.
   - What's unclear: A malicious caller who knows the Railway API URL could POST to `/api/auth/oauth-signin` and provision arbitrary users or link accounts.
   - Recommendation (Claude's discretion): Add a shared secret header. The Next.js `signIn` callback passes `Authorization: Bearer ${process.env.INTERNAL_API_SECRET}`. The endpoint checks for it. This matches the pattern used by `verify-credentials` (also unauthenticated, also server-to-server). Low risk in practice because Railway URL is not public-facing, but the shared secret adds defense-in-depth. Add `INTERNAL_API_SECRET` to both Vercel env and Railway env.

3. **Drizzle journal update procedure**
   - What we know: The `drizzle/meta/_journal.json` must be updated when adding a hand-written migration.
   - What's unclear: Whether `drizzle-kit generate --name social_auth` followed by editing the generated SQL is safer than hand-writing and editing the journal.
   - Recommendation: Use `drizzle-kit generate` to create the skeleton (it updates the journal automatically), then replace the generated SQL content with the hand-crafted SQL. This is the safest approach and avoids journal drift.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && pnpm test -- --reporter=verbose src/routes/__tests__/auth.test.ts` |
| Full suite command | `cd apps/api && pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INF-05 | Migration 0009 runs: `user_oauth_accounts` table exists with UNIQUE constraint and ON DELETE CASCADE | integration | `cd apps/api && pnpm test -- src/db/__tests__/rls.test.ts` (table existence verified via migration in global-setup) | ✅ global-setup.ts runs migrations |
| INF-05 | `users.password_hash` accepts NULL | integration | `cd apps/api && pnpm test -- src/routes/__tests__/auth.test.ts` (null password_hash guard test) | ❌ Wave 0 — add test |
| INF-08 | New user path: JIT provisions user + oauth account, returns `{ id, email, workspace_id: null }` | integration | `cd apps/api && pnpm test -- src/routes/__tests__/auth.test.ts` | ❌ Wave 0 — add tests |
| INF-08 | Returning user path: second call returns same user, no duplicate rows | integration | `cd apps/api && pnpm test -- src/routes/__tests__/auth.test.ts` | ❌ Wave 0 — add tests |
| INF-08 | Auto-link path: existing credentials user linked by email match | integration | `cd apps/api && pnpm test -- src/routes/__tests__/auth.test.ts` | ❌ Wave 0 — add tests |
| INF-08 | Unverified email blocked: 409 when existing user has email_verified=false | integration | `cd apps/api && pnpm test -- src/routes/__tests__/auth.test.ts` | ❌ Wave 0 — add tests |
| INF-08 | Second provider blocked: 409 when user already has different provider linked | integration | `cd apps/api && pnpm test -- src/routes/__tests__/auth.test.ts` | ❌ Wave 0 — add tests |
| INF-08 (guard) | verify-credentials returns 401 (not TypeError) when password_hash IS NULL | integration | `cd apps/api && pnpm test -- src/routes/__tests__/auth.test.ts` | ❌ Wave 0 — add test |

### Sampling Rate

- **Per task commit:** `cd apps/api && pnpm test -- src/routes/__tests__/auth.test.ts`
- **Per wave merge:** `cd apps/api && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/api/src/routes/__tests__/auth.test.ts` — extend existing file with oauth-signin tests (all 5 paths + null password_hash guard)
- [ ] No new test infrastructure needed — global-setup.ts already runs migrations, vitest already configured

*(No new test files needed — all tests extend the existing `auth.test.ts`)*

---

## Sources

### Primary (HIGH confidence)

- Existing codebase: `apps/api/src/routes/auth.ts` — verify-credentials pattern, transaction pattern, response shape
- Existing codebase: `apps/api/src/db/schema.ts` — Drizzle table definition patterns, users table structure
- Existing codebase: `apps/api/drizzle/0008_gdpr_lifecycle_tables.sql` — migration file format and style
- Existing codebase: `apps/api/src/routes/__tests__/auth.test.ts` — integration test structure
- `.planning/1-CONTEXT.md` — locked decisions, error handling rules, code patterns
- `.planning/research/STACK.md` — v1.2 stack decisions, allowDangerousEmailAccountLinking analysis
- `.planning/research/ARCHITECTURE.md` — three-path resolution flow, component responsibilities
- `.planning/research/PITFALLS.md` — OC1-OC6, OMi3 (null password_hash)
- `.planning/STATE.md` — critical implementation notes (verify-credentials null check, erasure worker cascade)

### Secondary (MEDIUM confidence)

- PostgreSQL 16 documentation: `ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL` is a metadata-only operation in PostgreSQL 12+ (no table rewrite, no lock required)
- Auth.js v5 docs (authjs.dev): signIn callback mutation of `user` object; `allowDangerousEmailAccountLinking` behavior without adapter
- Industry pattern (Linear, Vercel, GitHub): block OAuth sign-in on unverified email collision — confirmed as standard best practice

### Tertiary (LOW confidence)

None — all findings are supported by the existing codebase and prior project research files.

---

## Metadata

**Confidence breakdown:**

- Standard Stack: HIGH — all libraries already installed, patterns already in use in the codebase
- Architecture: HIGH — three-path resolution documented in ARCHITECTURE.md, transaction pattern established in codebase
- Pitfalls: HIGH — all pitfalls are either documented in PITFALLS.md/STATE.md or discoverable from reading the existing code (bcrypt null check is the one new finding from reading auth.ts line 177)
- Migration pattern: HIGH — four prior migrations provide clear template
- Test pattern: HIGH — global-setup + auth.test.ts provide exact template to extend

**Research date:** 2026-03-12
**Valid until:** 2026-06-12 (stable domain — postgres.js, drizzle-kit, Fastify 5 APIs are stable)
