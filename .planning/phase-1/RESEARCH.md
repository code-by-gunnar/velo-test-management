# Phase 1: Foundation — Research

**Researched:** 2026-03-08
**Domain:** Infrastructure, Auth, Design System, Multi-tenancy, CI/CD
**Confidence:** HIGH (most findings verified against official docs or official GitHub)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

| Decision | Value |
|----------|-------|
| Frontend | Next.js 16 Pages Router (NOT App Router — CVE-2025-55182) |
| Backend | Node.js 22 LTS + Fastify 5 |
| Database | PostgreSQL 16 — Drizzle for schema/migrations only, postgres.js raw SQL for runtime |
| Cache / Queue | Valkey (Redis fork). BullMQ for async jobs |
| Auth | Auth.js v5, PKCE enforced. No Clerk. |
| Email | Resend SDK |
| Hosting | Railway |
| CI/CD | GitHub Actions |
| Primary keys | UUID v7 (time-ordered) |
| Multi-tenancy | App-layer workspace_id enforcement (TypeScript compile-time) + PostgreSQL RLS with SET LOCAL (transaction-scoped) as defense-in-depth |
| Design language | Notion/Craft — light, spatial, warm. Cobalt (#2563EB) accent, Mist (#F8FAFC) background |
| Typography | Inter for UI, JetBrains Mono for code/IDs |
| Status colours | Muted sage (pass), warm coral (fail), amber (blocked), slate (skipped) |

### Context Decisions (from discuss-phase session)

**Onboarding:** Hybrid wizard (workspace name/slug → first project → optional sample data). 1 workspace per company. Single workspace per user in v1. Post-wizard: home dashboard with greyed-out placeholder panels.

**Sidebar:** Dashboard/Test Cases/Test Runs visible but disabled. Settings active. Collapsible to 48px icon rail. State persists in localStorage.

**Email verification (OTP):** 6-digit OTP, 15-min expiry, hard block until verified. Lock after 5 wrong attempts.

**URL routing:** `/app/[slug]/[projectKey]/[section]`. Auth routes at `/login`, `/signup`, `/verify`. Post-login: `/app/[slug]`.

### Deferred Ideas (OUT OF SCOPE)

- Multi-workspace support (1 user → many workspaces): deferred to Phase 6 with invites
- "Last visited project" redirect after login: deferred to v2
- Dark mode: explicitly out of scope for v1
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | GitHub Actions CI — lint, type-check, test on every PR | GitHub Actions + pnpm workspace caching patterns documented |
| INFRA-02 | Railway auto-deploy from main branch merge | Railway autodeploy + "Wait for CI" feature documented |
| INFRA-03 | PostgreSQL 16 on Railway + drizzle-kit migration system | drizzle-kit migrate CLI and CI pattern documented |
| INFRA-04 | Valkey provisioned + connected (session store, pub/sub, BullMQ) | iovalkey + BullMQ compatibility confirmed; connection pattern documented |
| INFRA-05 | workspace_id on every tenant table, TypeScript compile-time enforcement | Drizzle schema pattern with workspace_id documented; TypeScript brand type approach recommended |
| INFRA-06 | PostgreSQL RLS on all tenant-scoped tables using SET LOCAL | Exact postgres.js + SET LOCAL transaction pattern documented |
| AUTH-01 | Sign up with email + password | Auth.js v5 Credentials provider pattern documented |
| AUTH-02 | Sign in + stay signed in across browser restarts | JWT strategy with cookie documented; Pages Router auth() documented |
| AUTH-03 | Sign out from any screen | signOut() via client-side call |
| AUTH-04 | Password reset via email link (Resend) | Must be hand-rolled outside Auth.js v5 — reset token table pattern documented |
| AUTH-05 | JWT persists workspace_id + role through authorize→jwt→session | Full callback chain verified against authjs.dev; TypeScript augmentation pattern documented |
| DS-01 | Design tokens as CSS custom properties | Standard CSS custom property pattern — no external library needed |
| DS-02 | Typography scale — Inter + JetBrains Mono | Google Fonts / next/font documented |
| DS-03 | Base components — Button, Card, Form Input, Status Badge | Standard Tailwind + className variant pattern (CVA) |
| DS-04 | Left sidebar 240px collapsible to 48px | localStorage persistence pattern documented |
| WORK-01 | Create workspace with name and slug | Schema pattern documented; slug uniqueness constraint |
| WORK-02 | Create project within workspace | Project key uniqueness per-workspace constraint |
| WORK-03 | Free tier limits — schema-enforced | COUNT check before INSERT pattern documented |
</phase_requirements>

---

## Summary

Phase 1 is a greenfield build with no existing code. The tech stack is fully locked. The main research risks are Auth.js v5's integration with Pages Router (it works, but the Pages Router path is less documented than App Router), and confirming the Valkey + BullMQ compatibility story (confirmed: iovalkey is a drop-in ioredis fork; BullMQ runs its full test suite against Valkey).

The most non-obvious implementation detail is the postgres.js + RLS + SET LOCAL pattern: each API request must open a postgres.js transaction, call `SET LOCAL app.workspace_id = $1` inside it, and run all tenant-scoped queries within that same transaction. The RLS policy uses `current_setting('app.workspace_id')::uuid` to filter rows.

Auth.js v5 is JWT-first with Pages Router. It does NOT require a database adapter — the session lives in an encrypted cookie. Custom fields (workspace_id, role) flow: `authorize` returns them on the user object → `jwt` callback copies them to the token → `session` callback exposes them on the session. TypeScript module augmentation seals the types.

**Primary recommendation:** Use iovalkey (not ioredis) as the Valkey client throughout (BullMQ, pub/sub, session-adjacent work). Use the `uuidv7` npm package for UUID v7 generation in Node.js (Railway runs PostgreSQL 16, which does not have the built-in `uuidv7()` function — that is PostgreSQL 18+).

---

## Auth.js v5 + Valkey Adapter

### Key Facts (HIGH confidence — verified against authjs.dev)

Auth.js v5 is a substantial rewrite from v4. The main breaking changes relevant to this project:

- Import path changed: use `import { auth, signIn, signOut } from "@/auth"` — no more `getServerSession(authOptions)`
- Cookie prefix changed from `next-auth` to `authjs`
- Next.js 14.0+ required. Next.js 16 is supported.
- Database adapter is **optional** when using JWT strategy. Auth.js v5 stores sessions in encrypted JWTs in cookies by default — no Redis session store is needed unless you want database sessions.
- The `pages` option still works for custom sign-in/verify routes.

### Session Store Architecture Decision

Auth.js v5 with JWT strategy = session in encrypted cookie. No Redis session store adapter is required or recommended. Valkey (via iovalkey) is used for:
1. BullMQ job queues (email dispatch, etc.)
2. Pub/sub for SSE (Phase 3)
3. Rate limiting (OTP attempts, etc.) — store attempt counts in Valkey with TTL

There is no official Auth.js v5 Valkey/ioredis adapter for session persistence because JWT strategy does not need one. Do not attempt to use an Upstash Redis adapter — that is for database session strategy and adds unnecessary complexity.

### Pages Router Integration (HIGH confidence — verified against authjs.dev/reference/nextjs)

Create `auth.ts` at the project root (or `src/auth.ts`):

```typescript
// src/auth.ts
import NextAuth, { type DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      workspace_id: string | null
      role: string | null
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    workspace_id?: string | null
    role?: string | null
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // validate with zod, query db, verify bcrypt hash
        // return { id, email, name, workspace_id, role } or null
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Step 1: user returned from authorize flows into jwt callback
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.workspace_id = (user as any).workspace_id ?? null
        token.role = (user as any).role ?? null
      }
      return token
    },
    // Step 2: token fields exposed on session object
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.workspace_id = token.workspace_id ?? null
      session.user.role = token.role ?? null
      return session
    },
  },
})
```

Wire into Next.js Pages Router:

```typescript
// src/pages/api/auth/[...nextauth].ts
import { handlers } from "@/auth"

export const { GET, POST } = handlers
```

**Pages Router page protection** via `getServerSideProps`:

```typescript
import { auth } from "@/auth"

export const getServerSideProps = async (context) => {
  const session = await auth(context)
  if (!session) {
    return { redirect: { destination: "/login", permanent: false } }
  }
  return { props: { session } }
}
```

**Pages Router API route protection**:

```typescript
import { auth } from "@/auth"
import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await auth(req, res)
  if (!session) return res.status(401).json({ error: "Unauthorized" })
  // use session.user.workspace_id, session.user.role
}
```

### OTP Email Verification

Auth.js v5 does not manage custom OTP flows. The OTP verification screen (`/verify`) must be built as a plain Next.js page outside Auth.js:
1. After sign-up, create user in DB with `email_verified = false`, generate a 6-digit OTP, store hashed OTP + expiry + attempt_count in a `verification_tokens` table, send via Resend.
2. `/verify` page: user submits 6-digit code → Fastify API validates token, increments attempt_count, checks expiry, sets `email_verified = true` on success.
3. After OTP verification, call `signIn("credentials", { email, password })` to establish the Auth.js session.
4. Auth middleware / `getServerSideProps` checks `session.user.email_verified` before allowing access to `/app/*`.

### Password Reset

Auth.js v5 does not have a built-in password reset flow. Build it manually:
1. `POST /api/auth/forgot-password` → generate secure random token, store hashed in `password_reset_tokens` table (expires 1h), send link via Resend.
2. `GET /reset-password?token=X` → validate token, render form.
3. `POST /api/auth/reset-password` → validate token + expiry, hash new password, update user, invalidate token.

### Pitfalls

- **Custom fields on `user` object**: Auth.js v5's `authorize` callback types `user` as the `User` interface. Extra fields (workspace_id, role) won't be on the type by default — cast with `as any` in the jwt callback or extend the `User` interface via module augmentation.
- **JWT strategy + adapter conflict**: If you add a database adapter, Auth.js defaults to database session strategy. Explicitly set `session: { strategy: "jwt" }` to override.
- **Pages Router requires `(req, res)` or `(context)` call**: `await auth()` (no args) only works in App Router server components. Pages Router must pass the context object.
- **Cookie size**: Adding workspace_id + role to JWT increases cookie size. Keep custom fields minimal — store workspace_id (UUID string) and role string only.

---

## postgres.js + RLS SET LOCAL Pattern

### The Pattern (HIGH confidence — verified against PostgreSQL docs + Crunchy Data blog)

Every tenant-scoped API request must:
1. Open a postgres.js transaction (`sql.begin()`)
2. Execute `SET LOCAL app.workspace_id = $1` with the workspace_id from the session
3. Run all tenant-scoped queries within the same transaction

`SET LOCAL` scopes the variable to the current transaction. When the transaction ends (commit or rollback), the variable is cleared. This prevents workspace_id leaking across requests on pooled connections.

```typescript
// src/lib/db.ts
import postgres from "postgres"

export const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
})

/**
 * Execute a callback inside a transaction with RLS context set.
 * All tenant-scoped queries must use this wrapper.
 */
export async function withWorkspace<T>(
  workspaceId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL app.workspace_id = ${workspaceId}`
    return fn(tx)
  })
}
```

Usage in a Fastify route handler:

```typescript
import { withWorkspace } from "@/lib/db"

fastify.get("/projects", async (request, reply) => {
  const { workspace_id } = request.session.user // from Auth.js JWT
  const projects = await withWorkspace(workspace_id, (tx) =>
    tx`SELECT * FROM projects WHERE workspace_id = ${workspace_id}::uuid`
  )
  return projects
})
```

### RLS Policy DDL

```sql
-- Enable RLS on a tenant-scoped table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

-- Policy: rows visible only when app.workspace_id matches
CREATE POLICY workspace_isolation ON projects
  FOR ALL
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- The database role used by the app must not be a superuser
-- Superusers bypass RLS. Use a limited role:
-- CREATE ROLE app_user LOGIN PASSWORD '...';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
```

The `true` second argument to `current_setting` makes it return NULL (rather than error) if the setting is not defined — which would cause the policy to deny all rows if SET LOCAL was never called.

### Pitfall: Connection Pool and SET LOCAL

`SET LOCAL` only holds for the transaction duration. `SET` (without LOCAL) persists for the session/connection, which is dangerous with a connection pool. Always use `SET LOCAL` inside `sql.begin()`. Never use `SET` outside a transaction.

### TypeScript Compile-Time Enforcement (INFRA-05)

Use a branded type for workspace-scoped queries to catch unenforced calls at compile time:

```typescript
// src/types/db.ts
declare const __workspaceScoped: unique symbol

export type WorkspaceSql = postgres.TransactionSql & {
  readonly [__workspaceScoped]: true
}

// withWorkspace returns WorkspaceSql — any function requiring
// tenant-scoped access declares it in its signature
export async function withWorkspace<T>(
  workspaceId: string,
  fn: (tx: WorkspaceSql) => Promise<T>
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL app.workspace_id = ${workspaceId}`
    return fn(tx as WorkspaceSql)
  })
}
```

Route handlers that accept a `WorkspaceSql` parameter cannot be called with a bare `sql` object — TypeScript catches it. This is the compile-time enforcement layer for INFRA-05.

---

## Drizzle Schema + drizzle-kit Migrations

### Pattern (HIGH confidence — verified against orm.drizzle.team)

Drizzle ORM is used for schema definition and migration generation only. postgres.js handles all runtime queries. This means: define the schema in Drizzle, run `drizzle-kit generate` to produce SQL migration files, run `drizzle-kit migrate` to apply them. Never use `db.select()` or any Drizzle query builder at runtime.

### Schema Definition Pattern

```typescript
// src/db/schema.ts
import { pgTable, uuid, varchar, text, boolean, timestamp, integer, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// UUID v7 default function (Node.js side)
const uuidv7Default = () => sql`gen_random_uuid()` // fallback — see UUID section

// Non-tenant table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidV7()),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password_hash: text("password_hash").notNull(),
  email_verified: boolean("email_verified").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Tenant table — workspace_id on every row
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidV7()),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: varchar("name", { length: 255 }).notNull(),
  project_key: varchar("project_key", { length: 20 }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
```

### Core Schema: Phase 1 Tables

Tables needed in Phase 1:

| Table | Notes |
|-------|-------|
| `users` | id, email, password_hash, email_verified, created_at |
| `workspaces` | id, name, slug (unique), plan_tier, created_at |
| `workspace_members` | id, workspace_id, user_id, role (admin/editor/viewer), created_at |
| `projects` | id, workspace_id, name, project_key (unique per workspace), created_at |
| `verification_tokens` | id, user_id, token_hash, expires_at, attempt_count, created_at |
| `password_reset_tokens` | id, user_id, token_hash, expires_at, used_at, created_at |

Phase 2 tables (suites, test_cases, test_case_steps) should be defined in schema now but migrations deferred to Phase 2, OR define them now so sample data seeding works.

### drizzle.config.ts

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

### Migration Commands

```bash
# Generate migration SQL from schema changes
npx drizzle-kit generate

# Apply pending migrations (safe in CI — idempotent)
npx drizzle-kit migrate

# Inspect DB (optional)
npx drizzle-kit studio
```

Migrations are stored in `./drizzle/` as numbered `.sql` files. Commit them to git. The `__drizzle_migrations` table in PostgreSQL tracks applied migrations.

### CI Migration Step

Run `npx drizzle-kit migrate` in the deploy step (after the build, before starting the server). Railway can run this as a pre-start command or as a separate Railway "job" service triggered at deploy time. Simplest approach for Phase 1: add it to the Fastify startup script before the server begins listening.

```typescript
// src/server.ts
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 })
await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" })
await migrationClient.end()

// then start Fastify
```

This uses Drizzle's programmatic migrator (not the CLI) — no extra shell process needed. It is safe to run on every startup because it only applies unapplied migrations.

---

## Next.js 16 Pages Router + Auth.js v5

### Next.js 16 Key Facts (HIGH confidence — verified against nextjs.org/blog/next-16)

Next.js 16 (released October 2025) fully supports the Pages Router. The CVE-2025-55182 vulnerability affects React Server Components in the App Router only. Pages Router applications are explicitly listed as NOT affected. This confirms the Pages Router choice is correct for security.

Breaking changes in Next.js 16 relevant to this project:
- `next lint` command removed — use ESLint/Biome CLI directly
- `serverRuntimeConfig` and `publicRuntimeConfig` removed — use environment variables
- `middleware.ts` deprecated in favour of `proxy.ts` (but middleware.ts still works for now)
- Node.js 20.9+ minimum. Node.js 22 is supported.
- Turbopack is the default bundler. Falls back to webpack if a webpack config is present.

### API Routes for Auth.js v5

```typescript
// src/pages/api/auth/[...nextauth].ts
export { GET, POST } from "@/auth"
export const runtime = "nodejs" // required — Auth.js v5 needs Node.js runtime
```

### Session Provider

Auth.js v5 with Pages Router does NOT require a `SessionProvider` wrapper for server-rendered pages since `getServerSideProps` can call `auth(context)`. If any client component needs to read the session, wrap `_app.tsx`:

```typescript
// src/pages/_app.tsx
import { SessionProvider } from "next-auth/react"

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <Component {...pageProps} />
    </SessionProvider>
  )
}
```

Client-side session reads (if needed): `const { data: session } = useSession()`

### Route Guard Utility

```typescript
// src/lib/auth-guard.ts
import { auth } from "@/auth"
import type { GetServerSidePropsContext } from "next"

export async function requireAuth(context: GetServerSidePropsContext) {
  const session = await auth(context)
  if (!session) {
    return { redirect: { destination: "/login", permanent: false } }
  }
  if (!session.user.workspace_id) {
    // User authenticated but has no workspace — redirect to onboarding wizard
    return { redirect: { destination: "/onboarding", permanent: false } }
  }
  return { session }
}
```

### URL Structure Implementation

Next.js Pages Router file structure for the locked URL pattern:

```
src/pages/
├── index.tsx                           # marketing / redirect
├── login.tsx                           # /login
├── signup.tsx                          # /signup
├── verify.tsx                          # /verify (OTP)
├── onboarding/
│   └── index.tsx                       # /onboarding (wizard)
├── app/
│   └── [slug]/
│       ├── index.tsx                   # /app/[slug] (workspace home)
│       ├── settings.tsx                # /app/[slug]/settings
│       └── [projectKey]/
│           ├── index.tsx               # /app/[slug]/[projectKey]
│           ├── cases.tsx               # /app/[slug]/[projectKey]/cases (Phase 2)
│           ├── runs.tsx                # /app/[slug]/[projectKey]/runs (Phase 3)
│           └── settings.tsx            # /app/[slug]/[projectKey]/settings
└── api/
    └── auth/
        └── [...nextauth].ts
```

---

## Railway + GitHub Actions CI/CD

### Railway Auto-Deploy (HIGH confidence — verified against docs.railway.com)

Railway auto-deploys when a commit is pushed to the connected branch. To enable the "Wait for CI" gate:
1. Connect the repo to Railway (each service separately).
2. In service Settings, enable **"Wait for CI"** — this causes Railway to wait for GitHub Actions workflows to pass before deploying.
3. Set the watch paths per service to avoid cross-service rebuilds.

**Monorepo service configuration:**
- Frontend service: root directory = `apps/web`, watch path = `apps/web/**`
- Backend service: root directory = `apps/api`, watch path = `apps/api/**` + `packages/**`

**Critical Fastify config for Railway:**
```typescript
await fastify.listen({
  port: parseInt(process.env.PORT ?? "3001"),
  host: "::",  // REQUIRED — Railway needs dual-stack binding
})
```

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: velo
          POSTGRES_PASSWORD: velo
          POSTGRES_DB: velo_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      valkey:
        image: valkey/valkey:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm run test
        env:
          DATABASE_URL: postgresql://velo:velo@localhost:5432/velo_test
          VALKEY_URL: redis://localhost:6379
```

Railway deployment itself is handled by the "Wait for CI" autodeploy, not by a separate deploy step in GitHub Actions. The CI workflow just needs to pass; Railway picks it up automatically.

### Environment Variables on Railway

Set per-service in Railway dashboard (not in the YAML):
- `DATABASE_URL` — Railway PostgreSQL connection string (auto-injected if using Railway's Postgres add-on)
- `VALKEY_URL` — Railway Valkey connection string
- `AUTH_SECRET` — random 32+ byte string (`openssl rand -base64 32`)
- `AUTH_URL` — the public URL of the Next.js frontend (for Auth.js v5 redirect callbacks)
- `RESEND_API_KEY` — from Resend dashboard
- `NODE_ENV` — `production`

---

## UUID v7 Strategy

### Decision (HIGH confidence — verified against npm registry + PostgreSQL docs)

Use the `uuidv7` npm package for UUID v7 generation in Node.js. Do NOT rely on PostgreSQL-level UUID v7 generation:
- PostgreSQL 16 does NOT have a built-in `uuidv7()` function. That was added in PostgreSQL 18 (released late 2025).
- The `pg_uuidv7` extension could be used on PostgreSQL 16, but Railway's managed PostgreSQL may not have it installed. Avoid the dependency.
- Generating UUIDs in Node.js means you know the ID before the INSERT, enabling optimistic local state updates and batch queries.

```bash
pnpm add uuidv7
```

```typescript
import { uuidv7 } from "uuidv7"

const id = uuidv7() // "01931234-abcd-7xxx-yxxx-xxxxxxxxxxxx"
```

### In Drizzle Schema

```typescript
import { uuidv7 } from "uuidv7"

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  // ...
})
```

### In postgres.js Queries (Runtime)

```typescript
import { uuidv7 } from "uuidv7"

const id = uuidv7()
await sql`
  INSERT INTO projects (id, workspace_id, name, project_key)
  VALUES (${id}::uuid, ${workspaceId}::uuid, ${name}, ${projectKey})
`
return id
```

### Sorting

UUID v7 values sort lexicographically in time order. `ORDER BY id` gives you insertion order, which is convenient for pagination.

---

## Monorepo Structure (Next.js + Fastify)

### Directory Layout (MEDIUM confidence — based on pnpm workspace conventions + Railway monorepo docs)

```
velo-test-management/
├── apps/
│   ├── web/                    # Next.js 16 Pages Router frontend
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   └── styles/
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   └── tsconfig.json
│   └── api/                    # Fastify 5 backend
│       ├── src/
│       │   ├── routes/
│       │   ├── plugins/
│       │   ├── db/
│       │   │   ├── schema.ts   # Drizzle schema definitions
│       │   │   └── migrations/ # drizzle-kit output
│       │   ├── lib/
│       │   └── server.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── types/                  # Shared TypeScript types
│       ├── src/
│       │   └── index.ts        # DTOs, API response shapes
│       ├── package.json
│       └── tsconfig.json
├── pnpm-workspace.yaml
├── package.json                # Root — scripts only, no dependencies
└── tsconfig.base.json          # Shared TypeScript base config
```

### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### Root package.json Scripts

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter='./apps/*' dev",
    "build": "pnpm --filter='./packages/*' build && pnpm --filter='./apps/*' build",
    "lint": "pnpm --recursive lint",
    "typecheck": "pnpm --recursive typecheck",
    "test": "pnpm --recursive test"
  }
}
```

### Shared Types Package

```json
// packages/types/package.json
{
  "name": "@velo/types",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

Reference in apps:
```json
// apps/web/package.json (and apps/api/package.json)
{
  "dependencies": {
    "@velo/types": "workspace:*"
  }
}
```

### Fastify Plugin Architecture

Fastify v5 uses encapsulated plugins. Recommended structure:

```typescript
// apps/api/src/server.ts
import Fastify from "fastify"
import authPlugin from "./plugins/auth"
import workspaceRoutes from "./routes/workspaces"

const fastify = Fastify({ logger: true })

// Global plugins
await fastify.register(authPlugin)

// Route plugins (scoped)
await fastify.register(workspaceRoutes, { prefix: "/api/v1" })

await fastify.listen({ port: parseInt(process.env.PORT ?? "3001"), host: "::" })
```

Fastify v5 breaking changes to watch for:
- `reply.getResponseTime()` replaced with `reply.elapsedTime`
- JSON Schema shorthand syntax removed — use full JSON Schema objects
- `hasRoute()` behavior changed (exact match only)

---

## BullMQ + Valkey

### Connection (HIGH confidence — verified against docs.bullmq.io + iovalkey GitHub)

BullMQ uses ioredis internally. Since we are using Valkey (not Redis), use `iovalkey` — the official Valkey-maintained ioredis fork. BullMQ passes connection options directly to ioredis; simply swap ioredis for iovalkey.

```bash
pnpm add bullmq iovalkey
```

```typescript
import { Queue, Worker } from "bullmq"
import Valkey from "iovalkey"

// Shared connection for Queue (producer)
const connection = new Valkey(process.env.VALKEY_URL!)

// Queue (producer side)
export const emailQueue = new Queue("email", { connection })

// Worker (consumer side) — maxRetriesPerRequest MUST be null for Workers
const workerConnection = new Valkey(process.env.VALKEY_URL!, {
  maxRetriesPerRequest: null,
})
const emailWorker = new Worker(
  "email",
  async (job) => {
    // process job: send email via Resend
  },
  { connection: workerConnection }
)
```

Important: `QueueEvents` requires its own connection (blocking connection — cannot be shared).

### Valkey Configuration for BullMQ

Add to Valkey config (Railway managed Valkey may already have this):
```
maxmemory-policy noeviction
```

Without `noeviction`, Valkey may evict BullMQ job keys under memory pressure, causing silent job loss.

### Phase 1 Queues

| Queue | Purpose | Phase |
|-------|---------|-------|
| `email` | OTP emails, password reset emails (Resend) | Phase 1 |
| `notifications` | Future: run complete notifications | Phase 3+ |

---

## Implementation Recommendations

### 1. UUID Strategy: Use `uuidv7` npm package everywhere

PostgreSQL 16 has no native `uuidv7()`. Use the npm package in Node.js for all ID generation. Cast to `::uuid` in SQL. Do not mix strategies.

### 2. Auth.js v5: JWT strategy, no database adapter

Do not add an Auth.js database adapter. Use JWT-in-cookie as the session. Store workspace_id and role in the JWT. Implement OTP and password reset as custom Fastify routes outside Auth.js.

### 3. RLS: Always wrap tenant queries in `withWorkspace()`

Never run tenant-scoped queries without the `withWorkspace` wrapper. The TypeScript branded type (`WorkspaceSql`) catches unenforced calls at compile time. Enable `FORCE ROW LEVEL SECURITY` on all tenant tables so even the table owner role is filtered.

### 4. Drizzle: Schema-only, programmatic migrator at startup

Define all Phase 1 tables in Drizzle schema (include Phase 2 tables for suites/test_cases if sample data seeding requires them). Run migrations via the programmatic migrator in Fastify startup, not via a separate shell process. Commit generated SQL files to git.

### 5. Railway: "Wait for CI" mode, watch paths per service

Enable "Wait for CI" on the Railway services so deploys only happen after GitHub Actions passes. Configure watch paths so frontend changes do not trigger a backend rebuild.

### 6. iovalkey over ioredis

Use `iovalkey` (not `ioredis`) as the Valkey client across the entire project — BullMQ, pub/sub, rate limiting. The API is identical to ioredis. This avoids taking a dependency on a Redis-licensed package.

### 7. Next.js 16: Use Turbopack, drop `next lint`

Turbopack is now the default in Next.js 16. Do not disable it. Replace `next lint` in CI with a direct `eslint` or `biome` invocation since `next lint` was removed in v16.

### 8. Sample Data Seeding

Phase 1 requires a seed script that creates a sample workspace, project, suites, and test cases. Since test_cases are a Phase 2 entity, either:
  - Option A: Define suites + test_cases tables in Phase 1 schema (even though the UI is not built) and seed them. This makes the app feel real immediately.
  - Option B: Seed only workspace + project in Phase 1; seed cases in Phase 2.

**Recommendation: Option A.** Define the full schema now and seed static data. The "Load sample data" checkbox in the wizard should be backed by actual data.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `vitest.config.ts` (root) — Wave 0 gap |
| Quick run command | `pnpm test --reporter=dot` |
| Full suite command | `pnpm test --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-05 | workspace_id present on all tenant queries | unit (TypeScript compile) | `pnpm typecheck` | ❌ Wave 0 |
| INFRA-06 | RLS blocks cross-workspace data access | integration | `vitest run apps/api/src/db/__tests__/rls.test.ts` | ❌ Wave 0 |
| AUTH-01 | User can sign up with valid credentials | integration | `vitest run apps/api/src/routes/__tests__/auth.test.ts` | ❌ Wave 0 |
| AUTH-05 | workspace_id + role persist through JWT callbacks | integration | `vitest run apps/web/src/__tests__/auth.test.ts` | ❌ Wave 0 |
| WORK-01 | Workspace created with name and slug | integration | `vitest run apps/api/src/routes/__tests__/workspaces.test.ts` | ❌ Wave 0 |
| WORK-03 | Free tier enforces project limit | unit | `vitest run apps/api/src/lib/__tests__/tier-limits.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm typecheck && pnpm test --reporter=dot`
- **Per wave merge:** `pnpm test --coverage`
- **Phase gate:** Full suite green before marking Phase 1 complete

### Wave 0 Gaps

- [ ] `vitest.config.ts` — root Vitest config with PostgreSQL testcontainer globalSetup
- [ ] `apps/api/src/db/__tests__/rls.test.ts` — covers INFRA-06
- [ ] `apps/api/src/routes/__tests__/auth.test.ts` — covers AUTH-01, AUTH-02, AUTH-03, AUTH-04
- [ ] `apps/web/src/__tests__/auth.test.ts` — covers AUTH-05 (JWT callback chain)
- [ ] `apps/api/src/routes/__tests__/workspaces.test.ts` — covers WORK-01, WORK-02, WORK-03
- [ ] Framework install: `pnpm add -D vitest @testcontainers/postgresql` in api workspace

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getServerSession(authOptions)` | `await auth(context)` | Auth.js v5 | Simpler; one function for all access patterns |
| `next-auth` cookie prefix | `authjs` cookie prefix | Auth.js v5 | Existing v4 sessions invalidated on migration |
| `ioredis` | `iovalkey` | March 2024 Redis SSPL | Drop-in — only the import changes |
| PostgreSQL uuid v4 PKs | UUID v7 via npm `uuidv7` | 2023 (RFC 9562) | Time-ordered, better index locality |
| Redis session store with NextAuth | JWT-in-cookie (no store needed) | Auth.js v5 default | Simpler; no Redis adapter needed for auth |
| `next lint` in CI | Direct ESLint/Biome call | Next.js 16 | `next lint` command removed |
| Express-based BFF | Fastify 5 + Next.js Pages Router | Ongoing | Fastify is ~5-10% faster than v4; validated on Railway |

---

## Open Questions

1. **Railway Valkey availability**
   - What we know: Railway offers managed Valkey (it replaced their Redis offering post-SSPL). Connection URL via `VALKEY_URL` env var.
   - What's unclear: Whether the Railway-managed Valkey instance allows `maxmemory-policy noeviction` configuration, or whether it is pre-configured correctly.
   - Recommendation: Test at provisioning time. If noeviction is not configurable, BullMQ jobs should use explicit job TTLs as a safety net.

2. **Auth.js v5 stable vs beta**
   - What we know: Auth.js v5 has been in "beta" naming for an extended period. It is widely used in production.
   - What's unclear: Whether `next-auth@5` is the correct package or if it has been renamed to `@auth/nextjs`.
   - Recommendation: At implementation time, check `npm info next-auth` and `npm info @auth/nextjs` to confirm the current stable package name and version.

3. **Drizzle ORM version — v1.0 beta**
   - What we know: Drizzle released a v1.0.0-beta.2 in late 2025 per search results.
   - What's unclear: Whether to use the beta or the latest stable `0.x`.
   - Recommendation: Use the latest stable `0.x` (e.g., `drizzle-orm@0.38.x`). The beta may have instabilities. Upgrade after Phase 1 is complete.

---

## Sources

### Primary (HIGH confidence)
- [authjs.dev — Migrating to v5](https://authjs.dev/getting-started/migrating-to-v5) — breaking changes, Pages Router integration
- [authjs.dev — Extending the Session](https://authjs.dev/guides/extending-the-session) — JWT + session callback chain, TypeScript augmentation
- [authjs.dev — Credentials Provider](https://authjs.dev/getting-started/providers/credentials) — authorize callback pattern
- [authjs.dev/reference/nextjs](https://authjs.dev/reference/nextjs) — Pages Router auth() usage in getServerSideProps and API routes
- [authjs.dev — Custom Sign-in Pages](https://authjs.dev/guides/pages/signin) — pages option, signIn() from custom forms
- [orm.drizzle.team — drizzle-kit migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate) — CI migration commands
- [orm.drizzle.team — PostgreSQL column types](https://orm.drizzle.team/docs/column-types/pg) — uuid, $defaultFn
- [docs.railway.com — Monorepo](https://docs.railway.com/guides/monorepo) — watch paths, root directory config
- [docs.railway.com — GitHub Autodeploys](https://docs.railway.com/deployments/github-autodeploys) — Wait for CI
- [docs.railway.com — Fastify](https://docs.railway.com/guides/fastify) — host "::" requirement
- [docs.bullmq.io — Connections](https://docs.bullmq.io/guide/connections) — connection options, maxRetriesPerRequest
- [github.com/valkey-io/iovalkey](https://github.com/valkey-io/iovalkey) — iovalkey package, ioredis compatibility
- [nextjs.org/blog/next-16](https://nextjs.org/blog/next-16) — Next.js 16 release notes, breaking changes
- [react.dev — CVE-2025-55182](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components) — Pages Router not affected

### Secondary (MEDIUM confidence)
- [Crunchy Data — RLS for Tenants](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) — SET LOCAL transaction pattern
- [encore.dev — Fastify v5 breaking changes](https://encore.dev/blog/fastify-v5) — breaking change summary
- [bullmq.io — Redis Alternatives 2025](https://bullmq.io/articles/redis/top-redis-alternatives-2025/) — Valkey compatibility statement

### Tertiary (LOW confidence — unverified single source)
- BullMQ full test suite runs against Valkey: mentioned in community discussions, not formally linked to official release notes
- Railway Valkey `maxmemory-policy` configurability: not verified in docs

---

## Metadata

**Confidence breakdown:**
- Auth.js v5 callback chain: HIGH — verified against authjs.dev directly
- postgres.js + RLS SET LOCAL: HIGH — PostgreSQL docs + Crunchy Data blog + AWS docs all agree
- Drizzle schema + migrations: HIGH — verified against orm.drizzle.team
- Railway + GitHub Actions: HIGH — verified against Railway docs
- UUID v7 strategy: HIGH — npm package confirmed, PostgreSQL 16 limitation confirmed
- BullMQ + Valkey via iovalkey: HIGH — BullMQ docs confirm ioredis-compatible clients work; iovalkey is official Valkey fork
- Monorepo structure: MEDIUM — convention-based; no single authoritative source

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (30 days — stable ecosystem, no fast-moving dependencies)
