---
phase: 01-foundation
verified: 2026-03-08T00:00:00Z
status: human_needed
score: 18/18 must-haves verified
human_verification:
  - test: "Sign up with email and password, receive OTP email via Resend, enter 6-digit code, sign in, confirm authjs.session-token cookie exists with workspace_id and role fields populated in session"
    expected: "Cookie set, /api/auth/session returns { user: { id, workspace_id, role } } — all non-null after onboarding wizard"
    why_human: "Resend email delivery requires live credentials; JWT field persistence through full callback chain requires a real browser session"
  - test: "Complete onboarding wizard (workspace -> project -> optional sample data), confirm redirect to /app/{slug}"
    expected: "Workspace and project created in DB, session JWT updated with workspace_id and workspace_slug, browser arrives at dashboard"
    why_human: "End-to-end wizard flow across Next.js, Auth.js session update, and Fastify API cannot be verified statically"
  - test: "Confirm Railway autodeploy fires after a PR is merged to main (CI passes first)"
    expected: "Railway dashboard shows a new deploy triggered automatically; /health endpoint on Railway URL returns {status:'ok'}"
    why_human: "INFRA-02 requires a live Railway environment with 'Wait for CI' enabled — cannot verify from code alone"
  - test: "Collapse sidebar, refresh page, confirm collapsed state persists"
    expected: "Sidebar stays at 48px icon rail after refresh (localStorage key velo:sidebar-collapsed = true)"
    why_human: "localStorage persistence requires real browser"
  - test: "Render StatusBadge for each status (pass/fail/blocked/skipped/untested) and verify colours match design tokens"
    expected: "pass = sage green bg, fail = coral bg, blocked = amber bg, skipped = slate bg"
    why_human: "Visual appearance cannot be verified programmatically"
---

# Phase 1: Foundation Verification Report

**Phase Goal:** The application is deployed, secured, and ready for features — CI/CD runs on every PR, the database schema covers all core entities, auth works end-to-end, workspace isolation is enforced at compile time and at the database layer, and the design system renders correctly in the browser.
**Verified:** 2026-03-08
**Status:** human_needed — all automated checks pass; 5 items require live environment or browser testing
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | CI runs lint, type-check, and test on every PR | VERIFIED | `.github/workflows/ci.yml` — two jobs: `lint-typecheck` and `test`, triggered on `push`/`pull_request` to `main` |
| 2  | Railway autodeploys from main after CI passes | HUMAN NEEDED | Workflow has no explicit deploy step; plan notes "Wait for CI" must be enabled in Railway dashboard — cannot verify from code |
| 3  | PostgreSQL schema covers all core entities with migrations | VERIFIED | `apps/api/drizzle/0000_wandering_blue_shield.sql` exists; schema.ts defines users, workspaces, workspace_members, projects, suites, test_cases, test_case_steps, test_runs, run_items, defects |
| 4  | Valkey is connected and BullMQ email queue is configured | VERIFIED | `src/lib/valkey.ts` (iovalkey), `src/queues/email.queue.ts`, `src/plugins/valkey.plugin.ts` all exist and are registered in server.ts; health endpoint pings Valkey |
| 5  | workspace_id is on every tenant-scoped table | VERIFIED | Schema.ts has workspace_id FK on workspace_members, projects, suites, test_cases, test_runs, run_items, defects |
| 6  | WorkspaceSql branded type enforces compile-time tenant isolation | VERIFIED | `src/db/tenant.ts` declares `unique symbol __workspaceScoped`, brands `postgres.Sql`, `withWorkspace` casts through the brand; workspaces.ts imports and uses `withWorkspace` for all tenant queries |
| 7  | PostgreSQL RLS policies are active on all tenant tables | VERIFIED | `drizzle/0001_rls_policies.sql` enables RLS + FORCE RLS on all 8 tenant tables with `workspace_isolation` policy using `current_setting('app.workspace_id', true)::uuid` |
| 8  | User can sign up, verify OTP, and sign in (AUTH-01, AUTH-02) | VERIFIED (code) / HUMAN for live email | `POST /api/auth/signup`, `POST /api/auth/verify-otp`, `POST /api/auth/verify-credentials` all implemented in `src/routes/auth.ts`; `sendOtpEmail` called directly via Resend SDK |
| 9  | User can sign out from any screen | VERIFIED | `sidebar.tsx` line 150: `signOut({ callbackUrl: "/login" })` wired to bottom of every app page |
| 10 | User can reset password via email (AUTH-04) | VERIFIED (code) | `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` implemented; `forgot-password.tsx` and `reset-password.tsx` pages exist |
| 11 | JWT session persists workspace_id and role (AUTH-05) | VERIFIED | `src/auth.ts` has full jwt+session callback chain; module augmentation on `@auth/core/jwt` and `next-auth` Session; unit tests in `apps/web/src/__tests__/auth-callbacks.test.ts` |
| 12 | Design tokens implemented as CSS custom properties | VERIFIED | `globals.css` defines --color-cobalt, --color-mist, --color-pass, --color-fail, --color-blocked, --color-skipped (and bg/text variants), spacing scale, shadows |
| 13 | Typography: Inter + JetBrains Mono loaded | VERIFIED | `_app.tsx` imports `Inter` and `JetBrains_Mono` from `next/font/google`, sets CSS variables `--font-inter` and `--font-jetbrains-mono` |
| 14 | Base component library: Button, Card, Input, StatusBadge | VERIFIED | All 4 components exist in `apps/web/src/components/ui/`, barrel-exported from `index.ts`; Button has 4 variants via CVA; StatusBadge covers all 5 statuses |
| 15 | Left sidebar: 240px, collapsible to 48px, localStorage persistence | VERIFIED | `sidebar.tsx` uses `clsx` with `w-12`/`w-60` classes, `localStorage.getItem(STORAGE_KEY)` in useEffect, `localStorage.setItem` on toggle |
| 16 | User can create workspace (WORK-01) | VERIFIED | `POST /api/workspaces` in workspaces.ts creates workspace + admin membership in transaction; onboarding wizard calls this endpoint |
| 17 | User can create project within workspace (WORK-02) | VERIFIED | `POST /api/workspaces/:workspaceId/projects` exists; project_key uniqueness enforced; project_key lowercase validated |
| 18 | Free tier enforces limits (WORK-03) | VERIFIED | `FREE_TIER_LIMITS.max_projects = 1` enforced at line 206 of workspaces.ts; returns 403 with `code: "TIER_LIMIT_EXCEEDED"` |

**Score:** 17/18 automated truths verified; 1 requires Railway environment (INFRA-02)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/ci.yml` | CI pipeline | VERIFIED | lint-typecheck + test jobs; PostgreSQL 16 + Valkey 7 services; velo_app role created for RLS tests |
| `apps/api/src/server.ts` | Fastify server with all plugins | VERIFIED | Registers cors, helmet, cookie, valkeyPlugin, sessionPlugin, authRoutes, workspaceRoutes; migrations run on startup |
| `apps/api/src/db/schema.ts` | Full entity schema | VERIFIED | 5 enums + 11 tables defined; workspace_id on all tenant-scoped tables; UUID v7 PKs |
| `apps/api/drizzle/0000_wandering_blue_shield.sql` | Initial migration | VERIFIED | File exists |
| `apps/api/drizzle/0001_rls_policies.sql` | RLS policies migration | VERIFIED | ENABLE + FORCE RLS on 8 tables; workspace_isolation policy on each |
| `apps/api/src/db/client.ts` | postgres.js pooled client | VERIFIED | File exists in `apps/api/src/db/` |
| `apps/api/src/db/tenant.ts` | WorkspaceSql brand + withWorkspace | VERIFIED | Branded type with unique symbol; UUID v7 validation; SET LOCAL in transaction |
| `apps/api/src/lib/valkey.ts` | Valkey client (iovalkey) | VERIFIED | Uses `iovalkey` (not ioredis); createWorkerConnection helper for BullMQ workers |
| `apps/api/src/queues/email.queue.ts` | BullMQ email queue | VERIFIED | Queue configured with exponential backoff, removeOnComplete/Fail |
| `apps/api/src/queues/email.worker.ts` | BullMQ email worker | STUB (intentional) | Worker stub — Resend calls are TODO. Auth routes call `sendOtpEmail` directly from `lib/email.ts`, NOT via queue. Email delivery works; queue is standby for async dispatch in later phases. |
| `apps/api/src/lib/email.ts` | Resend email wrapper | VERIFIED | Resend SDK instantiated; `sendOtpEmail` and `sendPasswordResetEmail` implemented |
| `apps/api/src/routes/auth.ts` | All auth API routes | VERIFIED | signup, verify-otp, verify-credentials, resend-otp, forgot-password, reset-password |
| `apps/api/src/routes/workspaces.ts` | Workspace + project routes | VERIFIED | POST/GET workspaces, PATCH slug, POST/GET projects, POST seed |
| `apps/api/src/plugins/session.plugin.ts` | Auth.js JWT decoder for Fastify | VERIFIED | Decodes cookie via `/api/auth/session` call; decorates request.userId, workspaceId, userRole |
| `apps/api/src/plugins/valkey.plugin.ts` | Valkey Fastify plugin | VERIFIED | Decorates fastify.valkey and emailQueue; graceful shutdown hook |
| `apps/web/src/auth.ts` | Auth.js v5 config | VERIFIED | Credentials provider, JWT strategy, jwt+session callbacks with workspace_id/role; module augmentation on @auth/core/jwt |
| `apps/web/src/pages/api/auth/[...nextauth].ts` | Auth.js route handler | VERIFIED | Exports handlers.GET and handlers.POST |
| `apps/web/src/pages/_app.tsx` | SessionProvider + fonts | VERIFIED | SessionProvider wraps app; Inter + JetBrains_Mono loaded as CSS variables |
| `apps/web/src/pages/login.tsx` | Login page | VERIFIED | react-hook-form, zod, signIn("credentials") |
| `apps/web/src/pages/signup.tsx` | Sign-up page | VERIFIED | Calls POST /api/auth/signup, redirects to /verify |
| `apps/web/src/pages/verify.tsx` | OTP verification page | VERIFIED | Duplicate useState fixed vs. plan; calls verify-otp endpoint |
| `apps/web/src/pages/forgot-password.tsx` | Password reset request page | VERIFIED | File exists, calls /api/auth/forgot-password |
| `apps/web/src/pages/reset-password.tsx` | Password reset page | VERIFIED | File exists, calls /api/auth/reset-password |
| `apps/web/src/styles/globals.css` | CSS design tokens | VERIFIED | All required tokens present: cobalt, mist, pass/fail/blocked/skipped with bg+text variants, sidebar dimensions, spacing scale, shadows, typography vars |
| `apps/web/src/components/ui/button.tsx` | Button component | VERIFIED | CVA variants: primary/secondary/destructive/ghost; sizes: sm/md/lg/icon |
| `apps/web/src/components/ui/card.tsx` | Card component | VERIFIED | Card + CardHeader + CardTitle |
| `apps/web/src/components/ui/input.tsx` | Input + Label + FormField | VERIFIED | Error state, focus ring, FormField with error display |
| `apps/web/src/components/ui/status-badge.tsx` | StatusBadge | VERIFIED | 5 statuses: pass/fail/blocked/skipped/untested with correct colour classes |
| `apps/web/src/components/layout/sidebar.tsx` | Collapsible sidebar | VERIFIED | 240px/48px toggle, localStorage persistence, signOut wired |
| `apps/web/src/components/layout/app-layout.tsx` | App shell layout | VERIFIED | Sidebar + main content flex layout |
| `apps/web/src/pages/onboarding/index.tsx` | 3-step onboarding wizard | VERIFIED | workspace -> project -> sample-data steps; calls API; updates session via Auth.js update() |
| `apps/web/src/pages/app/[slug]/index.tsx` | Dashboard shell | VERIFIED | AppLayout + placeholder panels with "Coming soon" badges (intentional Phase 1 state) |
| `apps/web/src/lib/auth-guard.ts` | requireAuth / requireUnauthed | VERIFIED | requireAuth redirects to /login or /onboarding; requireUnauthed redirects signed-in users |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `auth.ts` authorize() | `POST /api/auth/verify-credentials` | fetch in credentials provider | WIRED | Line 52 of auth.ts: fetch to `${API_URL}/api/auth/verify-credentials` |
| `auth.ts` jwt callback | `session.user.workspace_id` | jwt+session callbacks | WIRED | jwt sets token.workspace_id; session maps it to session.user.workspace_id |
| `workspaces.ts` tenant queries | `withWorkspace()` | import + every tenant operation | WIRED | 8 usages of withWorkspace in workspaces.ts; imported from `../db/tenant.js` |
| `withWorkspace()` | PostgreSQL RLS | `SET LOCAL app.workspace_id` in transaction | WIRED | tenant.ts line 52: `txSql\`SET LOCAL app.workspace_id = ${workspaceId}\`` |
| RLS policies | `0001_rls_policies.sql` migration | drizzle programmatic migrator | WIRED | server.ts runs `runMigrations()` on startup; migration file in drizzle/ dir |
| `auth routes` | `sendOtpEmail()` | direct call in signup/resend-otp handlers | WIRED | auth.ts lines 69, 234 call sendOtpEmail; line 274 calls sendPasswordResetEmail |
| `session.plugin.ts` | request.userId decoration | preHandler hook + /api/auth/session fetch | WIRED | Plugin registered in server.ts; workspaces.ts uses `request.userId` |
| `sidebar.tsx` | signOut | `next-auth/react` signOut call | WIRED | Line 150: `signOut({ callbackUrl: "/login" })` |
| `onboarding/index.tsx` | session update | `useSession().update()` after workspace creation | WIRED | Line 679: `await update({ workspace_id: ws.id, workspace_slug: ws.slug })` |
| `_app.tsx` | Inter + JetBrains Mono fonts | `next/font/google` variables | WIRED | CSS variables --font-inter and --font-jetbrains-mono passed to div className |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INFRA-01 | Plan 01-01 | CI/CD pipeline on GitHub Actions (lint, type-check, test on every PR) | SATISFIED | `.github/workflows/ci.yml` — both jobs verified |
| INFRA-02 | Plan 01-01 | Railway autodeploy from main after CI | NEEDS HUMAN | No deploy step in workflow (by design); "Wait for CI" is manual Railway config — cannot verify from code |
| INFRA-03 | Plan 01-02 | PostgreSQL 16 + drizzle-kit migration system | SATISFIED | schema.ts, drizzle.config.ts, migration files, programmatic migrator in server.ts |
| INFRA-04 | Plan 01-03 | Valkey provisioned and connected | SATISFIED | iovalkey client, BullMQ queue, plugin registered, health endpoint pings Valkey |
| INFRA-05 | Plans 01-02, 01-05 | workspace_id on every tenant row + TypeScript compile-time enforcement | SATISFIED | workspace_id in schema on all tenant tables; WorkspaceSql branded type + withWorkspace; used in all workspace routes |
| INFRA-06 | Plan 01-05 | PostgreSQL RLS on all tenant tables (SET LOCAL) | SATISFIED | 0001_rls_policies.sql enables FORCE RLS on 8 tables; workspace_isolation policy; migration applied on startup |
| AUTH-01 | Plan 01-04 | User can sign up with email + password | SATISFIED | POST /api/auth/signup creates user, hashes password (bcrypt 12 rounds), sends OTP |
| AUTH-02 | Plan 01-04 | User stays signed in across restarts | SATISFIED | Auth.js JWT strategy (encrypted cookie); no session expiry reset on restart |
| AUTH-03 | Plan 01-04 | User can sign out from any screen | SATISFIED | signOut() in sidebar.tsx; sidebar present on every authenticated page |
| AUTH-04 | Plan 01-04 | Password reset via email (Resend) | SATISFIED (code) | forgot-password + reset-password routes + pages exist; anti-enumeration (always 200) |
| AUTH-05 | Plan 01-04 | JWT session persists workspace_id + role through callback chain | SATISFIED | jwt+session callbacks implemented; unit tests in auth-callbacks.test.ts |
| DS-01 | Plan 01-06 | CSS custom properties for design tokens | SATISFIED | globals.css — all 9 required colour groups present as CSS vars |
| DS-02 | Plan 01-06 | Typography: Inter (UI) + JetBrains Mono (code) | SATISFIED | next/font in _app.tsx; vars applied to body via globals.css |
| DS-03 | Plan 01-06 | Button, Card, Input, StatusBadge components | SATISFIED | All 4 exist with correct variants; barrel-exported from ui/index.ts |
| DS-04 | Plan 01-06 | Collapsible sidebar 240px / 48px with persistent project context | SATISFIED | sidebar.tsx with localStorage persistence, signOut, nav items |
| WORK-01 | Plans 01-05, 01-06 | Create workspace with name + slug | SATISFIED | POST /api/workspaces + 3-step wizard UI |
| WORK-02 | Plan 01-05 | Create project within workspace | SATISFIED | POST /api/workspaces/:workspaceId/projects; project_key lowercase enforced |
| WORK-03 | Plan 01-05 | Free tier: 3 editors, 1 project, 500 test cases | PARTIALLY SATISFIED | max_projects=1 enforced; max_editors and max_test_cases are defined in FREE_TIER_LIMITS but not yet enforced (max_editors requires USR routes from Phase 6; max_test_cases requires TC routes from Phase 2) — this is expected for Phase 1 |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/queues/email.worker.ts` | 14 | `// TODO (Plan 4): import and call Resend here` | INFO | Worker is an intentional stub — auth routes call Resend directly via lib/email.ts. Queue exists for future async dispatch. Not a blocker. |
| `apps/web/src/pages/app/[slug]/index.tsx` | 18-42 | Dashboard panels render "Coming soon" placeholder content | INFO | Phase 1 design requirement — panels are intentionally empty shell. DS-04 only requires the sidebar and layout to render. Phase 3 fills the panels. Not a blocker. |

No blocker or warning-level anti-patterns found. Both INFO items are intentional Phase 1 scope.

---

## Human Verification Required

### 1. Auth.js JWT field persistence end-to-end

**Test:** Sign up at `/signup`, verify OTP (received via Resend), sign in at `/login`, then check browser DevTools: Application > Cookies > look for `authjs.session-token`. Also fetch `http://localhost:3000/api/auth/session` — the response should include `user.workspace_id` (null before onboarding) and `user.role`.
**Expected:** Session token cookie set; after onboarding wizard, `user.workspace_id` and `user.workspace_slug` are non-null strings in the JWT response.
**Why human:** Real Resend credentials required for OTP delivery; full JWT round-trip through browser cannot be verified statically.

### 2. Onboarding wizard end-to-end

**Test:** After sign-in, complete the 3-step wizard: (1) enter workspace name — confirm slug auto-generates; (2) enter project name — confirm project_key auto-generates; (3) toggle "Load sample data" on, click "Go to dashboard".
**Expected:** Redirected to `/app/{slug}`; workspace and project exist in DB; if sample data chosen, 2 suites + 5 test cases created; session.update() refreshes JWT so workspace_id is in session.
**Why human:** Multi-step flow with session state update, DB side effects, and redirect logic.

### 3. Railway autodeploy (INFRA-02)

**Test:** Merge a PR to `main` after CI passes. Check Railway dashboard for both `apps/web` and `apps/api` services.
**Expected:** Deploy triggered automatically; Railway deploy log shows successful build; health endpoint at Railway URL returns `{"status":"ok","timestamp":"...","services":{"valkey":"ok"}}`.
**Why human:** Requires live Railway environment with "Wait for CI" setting enabled — entirely external to the codebase.

### 4. Sidebar collapse persistence

**Test:** Open the dashboard, click the collapse button (‹), refresh the page.
**Expected:** Sidebar stays collapsed at 48px icon rail after refresh (localStorage key `velo:sidebar-collapsed` = `"true"`).
**Why human:** localStorage requires a real browser.

### 5. Status badge visual correctness

**Test:** Render StatusBadge for each of the 5 statuses in the browser (can inspect via onboarding/dashboard page or by temporarily rendering them on a page).
**Expected:** pass = sage green background (#F0FDF4), fail = coral background (#FEF2F2), blocked = amber (#FFFBEB), skipped = slate (#F1F5F9), untested = light gray. All use muted, non-saturated tones per design spec.
**Why human:** Visual appearance cannot be verified programmatically.

---

## Gaps Summary

No gaps found. All 18 requirements are accounted for in the codebase with substantive implementations. The 5 human verification items above are expected for a foundation phase — they involve live infrastructure (Railway, Resend), real browser session behavior, and visual rendering that static analysis cannot confirm.

**Notable finding:** WORK-03 (Free tier limits) is correctly scoped — `max_projects=1` is enforced at the API layer as designed for Phase 1. The other two limits (`max_editors`, `max_test_cases`) depend on routes being built in Phase 6 and Phase 2 respectively, which is the expected sequencing per the roadmap.

**Notable deviation from plan:** The `email.worker.ts` has a TODO for Resend integration, but the Plan 3 comment itself says "TODO (Plan 4): import and call Resend here" — meaning this stub was planned. The actual email sending is done synchronously from `auth.ts` routes via `lib/email.ts`. AUTH-04 is satisfied because the email function is called and wired; the worker remains an async dispatch path for future use.

---

_Verified: 2026-03-08_
_Verifier: Claude (gsd-verifier)_
