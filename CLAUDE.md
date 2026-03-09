# Velo Test Management — Claude Code Instructions

## MANDATORY: Before Every Push

Run these checks locally. Do NOT push until all pass. CI failures waste deploy cycles.

### Lint (must be zero errors)

```bash
cd apps/web && npx eslint src --ext .ts,.tsx --max-warnings 0
cd apps/api && npx eslint src --ext .ts --max-warnings 0
```

Or from repo root:

```bash
pnpm --recursive lint
```

### Type-check

```bash
pnpm --recursive typecheck
```

### API tests

```bash
cd apps/api && pnpm test
```

### Full CI simulation (run all three before pushing)

```bash
pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test
```

---

## MANDATORY: Issue Debugging

**Never guess at root causes. Always pull logs first.**

### Vercel logs (frontend errors, gateway 5xx, SSR failures)

```bash
vercel logs https://velo-test-management.vercel.app --limit 50
```

Or via CLI for a specific deployment:

```bash
vercel logs <deployment-url> --limit 100
```

### Railway logs (API errors, DB errors, startup failures)

```bash
railway logs --tail 50
```

For more context:

```bash
railway logs --tail 200
```

### CI logs (lint/test failures before deploy)

```bash
gh run list --limit 5
gh run view <run-id> --log-failed
```

### Diagnosis workflow

1. Pull Railway logs for API errors (500s, DB errors, startup panics)
2. Pull Vercel logs for frontend/gateway errors (auth failures, CORS, SSR)
3. Pull CI logs for lint/test failures
4. Read the actual error message before touching any code
5. Do NOT propose a fix until the root cause is identified in the logs

---

## Project Structure

```
velo-test-management/
├── apps/
│   ├── api/          — Fastify 5 + postgres.js + drizzle-kit migrations
│   └── web/          — Next.js 16 Pages Router + Tailwind
├── packages/
│   └── types/        — Shared TypeScript types
└── .planning/        — Roadmap, requirements, phase plans
```

## Key Architectural Rules

- **Next.js gateway pattern**: All client-side fetches use `/api/backend/...` (handled by `apps/web/src/pages/api/backend/[...path].ts`). Never use `/api/workspaces/...` directly from the browser.
- **Auth**: Auth.js v5 JWE tokens. Server-side fetches forward the raw cookie as `Authorization: Bearer`.
- **Multi-tenancy**: Every tenant-scoped DB operation goes through `withWorkspace(workspaceId, async tx => {...})`. Never use bare `sql` for tenant queries.
- **reply.send() outside withWorkspace**: Do NOT call `reply.send()` inside the `withWorkspace` transaction callback. Call it AFTER the transaction commits to avoid race conditions with test DB verification.
- **Migrations**: Run via Drizzle on startup (`runMigrations()`). If a migration gets skipped (journal entry without SQL file in a prior deploy), add an idempotent fixup in `runFixups()` in server.ts.
- **ESLint rules in apps/web**: `react-hooks/refs` forbids `ref.current` access during render AND `react-hooks/set-state-in-effect` forbids `setState` inside `useEffect`. Use the render-time conditional update pattern only with `useRef` from React — but be aware this may also be flagged. When in doubt, remove local state and read from props directly.

## Stack

- **Frontend**: Next.js 16 Pages Router, TypeScript, Tailwind, dnd-kit
- **Backend**: Node.js 22, Fastify 5, postgres.js (raw SQL), drizzle-kit for migrations
- **DB**: PostgreSQL 16 with RLS. `SET LOCAL app.workspace_id` enforces tenant isolation per transaction.
- **Auth**: Auth.js v5 (PKCE). Session token forwarded as Bearer from Next.js gateway to Railway API.
- **Hosting**: Vercel (web) + Railway (api). Railway service root is `apps/api/`.
- **Package manager**: pnpm workspaces

## Environments

| Service | URL |
|---------|-----|
| Web (prod) | https://velo-test-management.vercel.app |
| API (prod) | https://velo-test-management-production.up.railway.app |
| API health | https://velo-test-management-production.up.railway.app/health |
