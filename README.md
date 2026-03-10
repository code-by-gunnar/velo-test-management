<p align="center">
  <img src="apps/web/public/velo-lockup-dark.svg" alt="Velo" height="48" />
</p>

<p align="center">
  Lean test management for teams that ship fast.
</p>

<p align="center">
  <a href="https://velo-test-management.vercel.app">Live App</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#stack">Stack</a> &middot;
  <a href="#getting-started">Getting Started</a>
</p>

---

## What is Velo?

Velo is a QA test management platform built for startups and scale-ups (20–200 people). It gives QA engineers one clean place to write, run, and track tests — with a keyboard-first UI, real-time dashboards, and CI/CD integrations that work out of the box.

Built by a QA engineer, for QA engineers.

## Features

**Test Cases**
- Keyboard-first editor — create a complete test case in under 30 seconds without touching the mouse
- Nested suite hierarchy with drag-and-drop reordering
- Bulk move, copy, and delete across suites
- CSV/Excel import with step structure preserved

**Test Runs**
- Create runs from suites, filters, or milestones
- Execute with P/F/B/S keyboard shortcuts — mark and advance without clicking
- Inline step comments during execution
- Rerun failures from any previous run

**Live Dashboard**
- Real-time progress via SSE — no page refresh
- Pass rate, time-to-complete, and progress bar update live as results come in

**CI Ingestion**
- POST JUnit XML or Allure JSON from any CI pipeline
- Auto-maps results to test cases by name or external ID
- Supports pytest, Maven Surefire, Gradle, Jest-junit, and Go gotestsum
- Raw payloads stored in Cloudflare R2 for debugging

**Integrations**
- Linear OAuth — file defects directly from failed test items, status syncs back automatically
- Outbound webhooks with HMAC-SHA256 signing and exponential backoff
- Full REST API with parity to the UI

**Multi-tenancy**
- Workspace isolation enforced at app layer + PostgreSQL RLS
- Free tier: 3 editors, 1 project, 500 test cases
- Viewers always free

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (Pages Router), TypeScript, Tailwind CSS |
| Backend | Node.js 22, Fastify 5, postgres.js (raw SQL) |
| Database | PostgreSQL 16 with RLS, Drizzle Kit (migrations only) |
| Cache / Queue | Valkey (Redis fork), BullMQ |
| Auth | Auth.js v5 (PKCE) |
| Storage | Cloudflare R2 |
| Real-time | SSE + Valkey pub/sub |
| Hosting | Vercel (web) + Railway (API) |
| CI/CD | GitHub Actions |

## Project Structure

```
velo-test-management/
├── apps/
│   ├── api/          Fastify 5 API server
│   └── web/          Next.js 16 frontend
├── packages/
│   └── types/        Shared TypeScript types
└── .planning/        Roadmap, requirements, phase plans
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL 16
- Valkey (or Redis-compatible)

### Setup

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Run database migrations (happens automatically on API start)
cd apps/api && pnpm dev

# Start the frontend
cd apps/web && pnpm dev
```

The API runs on `http://localhost:3001` and the web app on `http://localhost:3000`.

### Running Tests

```bash
# All checks (lint + typecheck + tests)
pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test
```

## Roadmap

- [x] **Phase 1** — Foundation (CI/CD, schema, auth, workspace isolation, design system)
- [x] **Phase 2** — Test Cases (keyboard editor, suites, drag-drop, CSV import)
- [x] **Phase 3** — Test Runs & Dashboard (execution, live SSE dashboard)
- [x] **Phase 4** — CI Ingestion (JUnit XML, Allure JSON, R2 storage)
- [x] **Phase 5** — Integrations & API (Linear, REST API, webhooks)
- [ ] **Phase 6** — Team & Access Control (RBAC, invites, plan tiers)

## License

Proprietary. All rights reserved.
