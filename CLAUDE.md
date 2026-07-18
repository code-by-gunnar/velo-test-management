# Velo Test Management — Claude Code Instructions

## MANDATORY: Keep This File Updated

After any structural change (new route, new component, new migration, new integration, architectural decision), update this file. This is the primary context source — stale docs waste time rescanning.

## MANDATORY: Before Every Push

Run these checks locally. Do NOT push until all pass. CI failures waste deploy cycles.

```bash
pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test
```

Individual commands:

```bash
pnpm --recursive lint          # Zero warnings
pnpm --recursive typecheck     # Zero errors
cd apps/api && pnpm test       # 193+ tests pass
```

## MANDATORY: Issue Debugging

Never guess at root causes. Always pull logs first.

```bash
docker compose logs api --tail 50         # API errors, DB errors, startup failures
docker compose logs web --tail 50         # Frontend, gateway 5xx, SSR
gh run list --limit 5 && gh run view <id> --log-failed          # CI failures
```

Sentry dashboard: https://velo-qa.sentry.io (frontend: velo-production, API: api-production; API reports only when SENTRY_DSN is set)

Workflow: Sentry issues → docker compose logs → CI logs → read the error → then fix.

---

## Project Structure

```
velo-test-management/
├── apps/
│   ├── api/                    — Fastify 5 API server
│   │   ├── drizzle/            — SQL migrations (0000–0014)
│   │   │   └── meta/           — Drizzle journal
│   │   └── src/
│   │       ├── db/             — client.ts (postgres.js), tenant.ts (withWorkspace), schema.ts
│   │       ├── lib/            — encryption.ts, r2.ts, linear-client.ts, rate-limiter.ts, email.ts, sse.ts, posthog.ts
│   │       ├── plugins/        — session.plugin.ts, auth.plugin.ts, require-editor.ts, require-admin.ts
│   │       ├── queues/         — webhook.worker.ts, lifecycle.worker.ts, lifecycle.queue.ts
│   │       └── routes/         — All API route handlers (see Route Map below)
│   │       ├── instrument.ts    — Sentry init (imported first in server.ts)
│   └── web/                    — Next.js 16 frontend
│       ├── instrumentation-client.ts  — Sentry client init (browser)
│       ├── instrumentation.ts         — Sentry server/edge init hook
│       ├── sentry.server.config.ts    — Sentry server config
│       ├── sentry.edge.config.ts      — Sentry edge config
│       └── src/
│           ├── auth.ts         — Auth.js v5 config, JWT augmentation, OAuth callbacks
│           ├── components/
│           │   ├── ui/         — Button, Card, Input, FormField, StatusBadge, PriorityBadge, Toast
│           │   ├── layout/     — app-layout.tsx, sidebar.tsx (with ProjectSwitcher)
│           │   ├── cases/      — CasesPage, CasePanel, CaseList, StepEditor, GwtStepEditor,
│           │   │                  KeywordPill, GwtStepRow, ImportModal, LinearImportModal
│           │   ├── runs/       — ExecutionScreen, RunCreateModal, RunCard, DefectPrompt,
│           │   │                  DefectBadge, EvidenceUpload, ExecutionHistory, StepCommentIcon
│           │   ├── reports/    — RunTrendChart (SVG), FragileCasesTable, RecentRunsTable
│           │   ├── settings/   — LinearConnect, IntegrationsPanel, WebhookSettings, ApiReference
│           │   └── projects/   — CreateProjectModal, FormatPicker
│           ├── hooks/          — useTestCases, useSuiteTree, useImport, useLinearImport,
│           │                      useKeyboardExecution, useRunSSE, useUserRole
│           └── pages/
│               ├── index.tsx           — Landing page
│               ├── why-velo.tsx        — Positioning page
│               ├── _app.tsx            — SessionProvider + ToastProvider
│               ├── _error.tsx          — Sentry Pages Router error capture
│               ├── api/backend/[...path].ts  — Gateway proxy to Railway API
│               └── app/[slug]/[projectKey]/
│                   ├── cases.tsx       — Test cases page
│                   ├── settings.tsx    — Project settings
│                   ├── reports.tsx     — Reports dashboard
│                   └── runs/
│                       ├── index.tsx   — Run list + detail
│                       └── [runId]/
│                           ├── index.tsx   — Run detail
│                           └── execute.tsx — Execution screen
├── packages/types/             — Shared TypeScript types
├── docs/
│   ├── plans/                  — Design docs (linear-import, test-evidence, reports, etc.)
│   └── velo-market-positioning.md
└── .planning/                  — Roadmap, requirements, phase plans
```

## Route Map (API)

| Route File | Base Path | Key Endpoints |
|---|---|---|
| `auth.ts` | `/api/auth` | signup, verify-otp, verify-credentials*, oauth-signin*, forgot/reset-password |
| `workspaces.ts` | `/api/workspaces` | CRUD workspaces, projects, seed |
| `test-cases.ts` | `/api/workspaces/:wid/projects/:pid/cases` | CRUD cases, CSV import, Linear AI import |
| `suites.ts` | `/api/workspaces/:wid/projects/:pid/suites` | CRUD suites, reorder |
| `runs.ts` | `/api/workspaces/:wid/runs` | CRUD runs, run detail, SSE stream, execution history |
| `run-items.ts` | `/api/workspaces/:wid/run-items` | PATCH status, comment, step comments |
| `run-item-attachments.ts` | `/api/workspaces/:wid/run-items/:iid/attachments` | Upload/list/delete evidence |
| `defects.ts` | `/api/workspaces/:wid/defects` | File defect → auto-create Linear issue + sync evidence |
| `reports.ts` | `/api/workspaces/:wid/projects/:pid/reports` | Run trend, fragile cases, recent runs (cached 60s) |
| `linear.ts` | `/api/workspaces/:wid/linear` | OAuth flow, team selection, API key, status, disconnect |
| `linear-webhook.ts` | `/api/webhooks/linear` | Inbound webhook (issue status sync) |
| `webhooks.ts` | `/api/workspaces/:wid/projects/:pid/webhooks` | Outbound webhook CRUD + test |
| `ingestion.ts` | `/api/workspaces/:wid/ingest` | JUnit XML + Allure JSON CI ingestion |
| `api-keys.ts` | `/api/workspaces/:wid/api-keys` | API key CRUD for CI |
| `members.ts` | `/api/workspaces/:wid/members` | Invite, accept, deactivate, role change |
| `profile.ts` | `/api/me` | Profile, avatar upload/URL |
| `lifecycle.ts` | `/api/workspaces/:wid/lifecycle` | Workspace deletion (30-day grace) |
| `erasure.ts` | `/api/me/erasure` | User erasure (7-day grace, GDPR) |
| `export.ts` | `/api/workspaces/:wid/export` | ZIP export (JSON + CSV) |
| `v1.ts` | `/api/v1` | Public REST API (rate-limited via API keys) |

*`verify-credentials` and `oauth-signin` require `x-internal-secret` header (server-to-server only).

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 16 Pages Router | NOT App Router (CVE-2025-55182) |
| Styling | Tailwind CSS | Custom tokens in tailwind.config.ts |
| Backend | Fastify 5 | Plugins: cors, helmet, cookie, multipart, rate-limit |
| DB | PostgreSQL 16 + postgres.js | Raw SQL via tagged templates. NOT Drizzle ORM (need recursive CTEs). |
| Migrations | drizzle-kit | 15 migrations (0000–0014). Run on startup. |
| Cache/Queue | Valkey (Redis fork) | BullMQ for jobs, pub/sub for SSE, session blocklist |
| Auth | Auth.js v5 | PKCE, JWE tokens, `@auth/core` pinned to 0.41.0 |
| Storage | Cloudflare R2 | Evidence attachments, CI payloads, avatars |
| Email | Resend SDK | OTP, password reset, invitations |
| Integrations | Linear (OAuth + API key) | Defect sync, AI import, webhook status sync |
| AI | Anthropic Claude API | claude-sonnet-4-5 for spec-to-test conversion |
| Icons | lucide-react | No inline SVGs |
| DnD | dnd-kit | Case reordering in list |
| Analytics | PostHog (posthog-node) | Server-side, EU region (eu.i.posthog.com), 19 events |
| Error Tracking | Sentry | `@sentry/nextjs` (web) + `@sentry/node` (api) |
| Testing | Vitest | API integration tests against test PostgreSQL |
| Hosting | Self-hosted Docker Compose | Railway (api) decommissioned 2026-07 (trial expired); Vercel deployment = marketing/legacy |
| Package manager | pnpm workspaces | Monorepo |

## Key Architectural Rules

### Backend

- **Multi-tenancy**: Every tenant-scoped DB operation goes through `withWorkspace(workspaceId, async tx => {...})`. Never use bare `sql` for tenant queries. PostgreSQL RLS with `SET LOCAL app.workspace_id` enforces isolation.
- **reply.send() outside withWorkspace**: Do NOT call `reply.send()` inside the transaction callback. Call after the transaction commits.
- **Internal API secret**: `verify-credentials` and `oauth-signin` require `x-internal-secret` header. Read lazily from `process.env.INTERNAL_API_SECRET` (not at module load time — breaks tests).
- **Linear API key > OAuth token**: All Linear API calls prefer `api_key_enc` (never expires) over `access_token_enc` (may expire). Decrypt with `decrypt()` from `lib/encryption.ts`.
- **Rate limiting**: Auth routes use `@fastify/rate-limit` (10/min per IP). V1 API routes use custom rate limiter keyed by API key.
- **Webhook SSRF protection**: `isPrivateUrl()` blocks private IPs and requires HTTPS in production.
- **Session fail-closed**: If Valkey is down, session plugin denies access rather than allowing potentially deactivated users.
- **Sentry**: `@sentry/node` initialized via `import "./instrument.js"` at top of `server.ts`. `setupFastifyErrorHandler(fastify)` registered before all routes. Flush on shutdown with `Sentry.close(2000)`.
- **PostHog**: Server-side via `posthog-node`. Lazy singleton in `lib/posthog.ts`. 19 events tracked across all routes. Graceful shutdown flush.

### Frontend

- **Gateway pattern**: All client-side fetches use `/api/backend/...` (proxied by `pages/api/backend/[...path].ts`). Never call the Railway API directly from the browser.
- **ESLint strictness**: `react-hooks/refs` forbids `ref.current` during render. `react-hooks/set-state-in-effect` forbids `setState` in `useEffect`. Workaround: conditional mount (`{isOpen && <Component />}`) for state reset, or read from props directly.
- **exactOptionalPropertyTypes**: TypeScript is strict — cannot pass `undefined` to optional props. Use spread pattern: `{...(value ? { prop: value } : {})}`.
- **ToastProvider**: Mounted globally in `_app.tsx`. Use `useToast()` anywhere.
- **Component keying for remount**: When a component needs fresh state on prop change (e.g., `EvidenceUpload`), use `key={someId}` to force remount.
- **Sentry**: `@sentry/nextjs` with `withSentryConfig()` in `next.config.ts`. Client init in `instrumentation-client.ts`, server in `sentry.server.config.ts`, edge in `sentry.edge.config.ts`. Tunnel route `/api/t` bypasses ad-blockers. DSN hardcoded (not env var — `NEXT_PUBLIC_` vars weren't baked in at Vercel build time). Pages Router error capture via `pages/_error.tsx`.

### Test Formats (GWT/BDD)

- Projects have `test_format`: `'steps'` (traditional) or `'gwt'` (Given-When-Then).
- Set at creation, immutable after.
- `step_type` on test_case_steps: `'action'` (default) or `'given'`/`'when'`/`'then'`/`'and'`/`'but'`.
- CasePanel conditionally renders `StepEditor` or `GwtStepEditor`.
- Execution screen renders GWT steps with keyword pills (read-only).
- CSV import supports `colKeyword` param for keyword column mapping.

### Execution Screen

- No auto-advance after setting status — QA navigates manually.
- Compact icon-only status buttons (Pass/Fail/Blocked/Skip) next to case title.
- Defect prompt uses template (Environment, Steps, Expected, Actual) with "Clear template" toggle.
- Evidence upload (R2) with auto-sync to Linear on defect creation.
- Filed defect shows inline with Linear link.
- Toast on defect success/failure.
- Keyboard: P/F/B/S for status, ←/→ for navigation (always active).

## Design System

- **Aesthetic**: "Clean Elevation" — light surfaces, controlled depth, cool blue-gray. NOT dark mode.
- **Fonts**: DM Sans (`font-display`), IBM Plex Sans (`font-body`), JetBrains Mono (`font-mono`). NOT Inter.
- **Primary**: `#2D7FF9`. Use `primary`, `primary-hover`, `primary-selected` tokens.
- **Status tokens**: `pass-*`, `fail-*`, `blocked-*`, `skipped-*`. Never use raw Tailwind colors.
- **Page bg**: `bg-mist` (`#E8EDF2`). Cards: `bg-white`. Sidebar: `bg-white`.
- **Component library**: `components/ui/` — always use these, never bypass with raw HTML.
- **Button default**: Size `sm`. Use `md`/`lg` only on standalone pages.
- **Section alternation**: Landing/marketing pages alternate `bg-mist` and `bg-white border-y border-gray-200`.
- **Destructive actions**: Calm, understated. NOT alarming red boxes.

## Database Migrations (current: 0014)

| Migration | Purpose |
|---|---|
| 0000 | Base schema (users, workspaces, projects, test_cases, suites, runs, run_items, defects) |
| 0001 | RLS policies |
| 0002 | Test case soft delete |
| 0003 | Run item step comments |
| 0004 | CI ingestion tables |
| 0005 | Integrations (linear_connections, webhooks) |
| 0006 | Team access control (workspace_members, invitations) |
| 0007 | User avatar_url |
| 0008 | GDPR lifecycle tables |
| 0009 | Social auth (oauth_accounts) |
| 0010 | GWT support (test_format, step_type) |
| 0011 | Test case source tracking (source_url, source_ref) |
| 0012 | Run item attachments (evidence) |
| 0013 | Linear API key (api_key_enc) |
| 0014 | Performance indexes (run_items, test_case_steps, test_runs, suites, defects) |

## Environment Variables

### Railway (API)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `VALKEY_URL` | Valkey/Redis connection |
| `ENCRYPTION_KEY` | AES-256-GCM key for Linear tokens |
| `INTERNAL_API_SECRET` | Server-to-server auth (shared with Vercel) |
| `LINEAR_CLIENT_ID` | Linear OAuth app ID |
| `LINEAR_CLIENT_SECRET` | Linear OAuth app secret |
| `ANTHROPIC_API_KEY` | Claude API for spec-to-test |
| `RESEND_API_KEY` | Email sending |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Cloudflare R2 |
| `WEB_URL` | Frontend URL for redirects |
| `POSTHOG_KEY` | PostHog project API key |
| `POSTHOG_HOST` | PostHog ingest URL (eu.i.posthog.com) |
| `PORT` | Default 3001 |

### Vercel (Web)

| Variable | Purpose |
|---|---|
| `API_URL` | Railway API URL (server-side fetches) |
| `INTERNAL_API_SECRET` | Sent as header to verify-credentials/oauth-signin |
| `NEXT_PUBLIC_API_BASE_URL` | Displayed in API reference UI (falls back to localhost:3001) |
| `AUTH_SECRET` | Auth.js encryption key |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | GitHub OAuth |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN (also hardcoded as fallback) |
| `POSTHOG_KEY` | PostHog project API key |
| `POSTHOG_HOST` | PostHog ingest URL (eu.i.posthog.com) |

## Performance Notes

- **Indexes**: Migration 0014 adds 8 critical indexes. Without them, run detail and case listing do full table scans.
- **N+1 awareness**: CSV import and step inserts use loops (not yet bulk). Monitor for large imports.
- **Reports cached**: 60-second Valkey cache. Parallel queries via `Promise.all`.
- **Anthropic client**: Module-level singleton with 25s timeout. Model: `claude-sonnet-4-5`.
- **Connection pool**: 20 max connections, 30s idle timeout.
- **Linear retry**: `withRetry()` wraps `createLinearIssue` (2 retries, exponential backoff).

## Self-Hosted Deployment (Docker Compose)

Railway (api) was decommissioned 2026-07 (trial expired). The stack is now self-hosted and host-agnostic.

| Command | Result |
|---------|--------|
| `docker compose up -d` | Bare postgres + valkey (for local `pnpm dev`) — unchanged workflow |
| `docker compose -f docker-compose.yml -f docker-compose.app.yml up -d --build` | Full stack: web :3000, api :3001 |
| + `-f docker-compose.prod.yml` | Server deploy: adds Caddy (TLS, app./api. subdomains), unpublishes internal ports |

- **Env**: copy root `.env.example` → `.env`. App overlay hard-fails without `AUTH_SECRET`, `INTERNAL_API_SECRET`, `RESEND_API_KEY`, `APP_DB_PASSWORD` (compose `:?` guards).
- **DB roles**: runtime connects as non-superuser `velo_app` (provisioned on boot, RLS-enforced); migrations/fixups use the superuser via `MIGRATION_DATABASE_URL`. Never point runtime `DATABASE_URL` at a superuser — superusers bypass RLS even with FORCE. `workspace_members` carries a `USING (true)` exemption for `velo_app` (see audit #19 follow-up). The two compose files are split (not profiles) because compose interpolates the whole file at parse time — guards would break bare `docker compose up -d`.
- **Images**: `apps/api/Dockerfile` (pnpm deploy --prod + explicit `dist/` + `drizzle/` copy — pnpm deploy honors .gitignore and would drop them), `apps/web/Dockerfile` (Next standalone output; `NEXT_PUBLIC_API_BASE_URL` is a build ARG — changing the public API URL requires image rebuild).
- **SSE**: browser connects directly to the API (bypasses `/api/backend` gateway) — the `apiUrl` prop in `runs/*.tsx` getServerSideProps resolves `NEXT_PUBLIC_API_BASE_URL ?? API_URL`, so `API_URL` stays compose-internal (`http://api:3001`) while the browser uses the public URL.
- **Migrations**: run automatically on api boot (before listen); api healthcheck has `start_period: 30s` to cover this.
- **Sentry (api)**: DSN now env-driven (`SENTRY_DSN`, empty = disabled) so self-hosted instances don't pollute the hosted project. Web DSN still hardcoded (known deferral).
- **Prod checklist** lives in the header of `docker-compose.prod.yml` (DNS, WEB_URL/PUBLIC_API_URL, web image rebuild, OAuth callback re-registration).

## Environments

| Service | URL | Status |
|---------|-----|--------|
| Web (local compose) | http://localhost:3000 | active |
| API (local compose) | http://localhost:3001 | active |
| API health | http://localhost:3001/health | active |
| Web (Vercel) | https://runvelo.app | legacy — marketing only, API backend gone |
| API (Railway) | https://api.runvelo.app | decommissioned (serves Railway fallback) |

## Lessons Learned

- **`@auth/core` must be pinned to 0.41.0** — next-auth@5.0.0-beta.30 depends on it internally. Using 0.41.1 creates two copies and breaks module augmentation on `@auth/core/jwt`.
- **ESM import hoisting** — `process.env` reads at module top-level capture the value before test setup runs. Read env vars lazily inside functions.
- **Windows port EACCES** — Hyper-V reserves port ranges. Fix: `net stop winnat && net start winnat` (admin).
- **Claude model IDs** — Use alias format (`claude-sonnet-4-5`), not date-stamped IDs. The SDK version may not recognize newer date formats.
- **Lucide `Image` icon** — Triggers `jsx-a11y/alt-text` ESLint rule. Import as `ImageIcon` instead.
- **suppressHydrationWarning** — Required on any cell using `toLocaleString()` since server/client locales differ.
- **Linear tokens expire** — OAuth access tokens expire ~24hrs. Always prefer the stored API key (`api_key_enc`) for server-to-server calls.
- **Sentry DSN must be hardcoded** — `NEXT_PUBLIC_SENTRY_DSN` env var was not baked in at Vercel build time. Hardcode DSN directly in `instrumentation-client.ts` (DSN is public, not a secret).
- **Sentry tunnel route** — `/monitoring` is blocked by ad-blockers. Use `/api/t` instead.
- **Sentry Pages Router** — Uses `sentry.client.config.ts` pattern BUT also needs `instrumentation-client.ts` with direct `Sentry.init()` call for Next.js 16. `_error.tsx` required for error capture.
- **Sentry API (Fastify)** — `--import` flag didn't work in Railway container. Use direct `import "./instrument.js"` at top of `server.ts` instead.
- **Railway start command** — Defined in root `railway.toml`, NOT `apps/api/railway.toml`. Root toml is what Railway uses.
- **pnpm relative-path filters break on Windows via script wrapper** — `--filter='./apps/*'` in the root `dev` script matched zero projects when run as `pnpm dev` on the D: drive (resolves against wrong base dir in the nested pnpm context). Use name-based filters (`--filter=@velo/api --filter=@velo/web`) — immune to path resolution.
- **Turbopack junction-point crash on Windows** — `failed to create junction point ... The file exists (os error 80)` on `pnpm dev` = stale `.next` cache. Fix: `rm -rf apps/web/.next apps/web/node_modules/.cache` and restart.
- **Vercel function region must be pinned** — Without `"regions"` in vercel.json, Vercel functions run in iad1 (US East) by default. The gateway proxy (`/api/backend/*`) was routing every API call browser (EU) → US → Railway (EU Amsterdam) → back, adding ~250–450ms to every request. Pinned to `fra1` (closest to Railway EU). Verified via `X-Vercel-Id` header (`edge::function-region` format).
- **Vercel API_URL env var** — After domain changes, audit ALL Vercel env vars. `API_URL` was still pointing to old Vercel URL after the runvelo.app migration, causing the gateway proxy to fail silently. Login appeared broken but the real issue was Vercel → Railway routing.

## PostHog Events (19 total)

| Event | Route | Type |
|---|---|---|
| `user_signed_up` | auth.ts | Signup |
| `email_verified` | auth.ts | Auth |
| `workspace_created` | workspaces.ts | Core |
| `test_case_created` | test-cases.ts | Core |
| `test_cases_imported_csv` | test-cases.ts | Import |
| `test_cases_imported_linear_ai` | test-cases.ts | AI |
| `test_run_created` | runs.ts | Core |
| `run_item_status_changed` | run-items.ts | Execution |
| `evidence_uploaded` | run-item-attachments.ts | Evidence |
| `defect_filed` | defects.ts | Defects |
| `report_viewed` | reports.ts | Reports |
| `ci_results_ingested` | ingestion.ts | CI |
| `linear_connected` | linear.ts | Integration |
| `linear_disconnected` | linear.ts | Churn |
| `member_invited` | members.ts | Growth |
| `member_deactivated` | members.ts | Churn |
| `webhook_created` | webhooks.ts | CI |
| `api_key_created` | api-keys.ts | CI |
| `workspace_deletion_requested` | lifecycle.ts | Churn |

## Sentry Error Tracking

| Layer | Sentry Project | Org |
|---|---|---|
| Frontend (Next.js) | `velo-production` | `velo-qa` |
| API (Fastify) | `api-production` | `velo-qa` |

- **Region**: EU (de.sentry.io)
- **Frontend**: 10% trace sampling, 10% session replay (100% on error), tunnel via `/api/t`
- **API**: 10% trace sampling, `includeLocalVariables: true`, `setupFastifyErrorHandler` before routes
- **DSNs**: Hardcoded in source (public, not secrets)
