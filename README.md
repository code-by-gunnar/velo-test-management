<p align="center">
  <img src="apps/web/public/velo-lockup-dark.svg" alt="Velo" height="48" />
</p>

<p align="center">
  Lean test management for teams that ship fast.
</p>

<p align="center">
  <a href="https://runvelo.app">Live App</a> &middot;
  <a href="https://runvelo.app/features">Features</a> &middot;
  <a href="#stack">Stack</a> &middot;
  <a href="#getting-started">Getting Started</a>
</p>

---

## What is Velo?

Velo is a QA test management platform built for startups and scale-ups (20-200 people). It gives QA engineers one clean place to write, run, and track tests — with a keyboard-first UI, real-time dashboards, and CI/CD integrations that work out of the box.

Built by a QA engineer, for QA engineers.

## Features

**Test Cases**
- Keyboard-first editor — create a complete test case in under 30 seconds without touching the mouse
- Supports traditional (step/expected) and GWT/BDD (Given-When-Then) formats
- Nested suite hierarchy with drag-and-drop reordering
- Bulk move, copy, and delete across suites
- CSV import with auto-suite creation and keyword column mapping
- AI-powered import from Linear issues — paste a spec, get structured test cases

**Test Runs**
- Create runs from suites, filters, or full projects
- Execute with P/F/B/S keyboard shortcuts and arrow key navigation
- Inline step comments and case-level notes during execution
- Evidence upload (screenshots, videos, PDFs) stored in Cloudflare R2
- One-click defect filing to Linear with template, auto-synced evidence, and Bug label

**Reports Dashboard**
- Pass rate trend chart (SVG, zero dependencies)
- Fragile cases table (most-failed in last 30 days)
- Recent runs overview with status breakdown
- 60-second Valkey cache, parallel queries

**CI Ingestion**
- POST JUnit XML or Allure JSON from any CI pipeline
- Auto-maps results to test cases by name or external ID
- Supports pytest, Maven Surefire, Gradle, Jest-junit, and Go gotestsum
- Raw payloads stored in Cloudflare R2 for debugging

**Integrations**
- Linear OAuth + persistent API key — file defects, AI import, webhook status sync
- Outbound webhooks with HMAC-SHA256 signing and exponential backoff
- Full REST API (v1) with rate limiting via API keys

**Observability**
- Sentry error tracking — frontend (Next.js) + API (Fastify)
- PostHog product analytics — 19 server-side events across all routes
- Session replay on errors

**Multi-tenancy & Security**
- Workspace isolation enforced at app layer + PostgreSQL RLS (runtime runs as a non-superuser role so RLS actually binds)
- Free tier: 3 editors, 1 project, 500 test cases
- Viewers always free
- RBAC (admin/editor/viewer) with invite flow and deactivation
- GDPR lifecycle: workspace deletion (30-day grace), user erasure (7-day grace)
- SSRF protection on webhook URLs, fail-closed session management

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (Pages Router), TypeScript, Tailwind CSS |
| Backend | Node.js 22, Fastify 5, postgres.js (raw SQL) |
| Database | PostgreSQL 16 with RLS, Drizzle Kit (migrations only) |
| Cache / Queue | Valkey (Redis fork), BullMQ |
| Auth | Auth.js v5 (PKCE, Google + GitHub OAuth) |
| Storage | Cloudflare R2 |
| Real-time | SSE + Valkey pub/sub |
| AI | Anthropic Claude API (spec-to-test conversion) |
| Analytics | PostHog (server-side, EU region) |
| Error Tracking | Sentry (frontend + API) |
| Email | nodemailer over SMTP (optional — console mode without it) |
| Hosting | Self-hosted Docker Compose (web + API + PostgreSQL + Valkey, optional Caddy TLS) |

## Project Structure

```
velo-test-management/
├── apps/
│   ├── api/          Fastify 5 API server (17 route files, 192+ tests)
│   └── web/          Next.js 16 frontend (Pages Router)
├── packages/
│   └── types/        Shared TypeScript types
├── docs/             Design docs, market positioning, pricing strategy
└── .planning/        Roadmap, requirements, phase plans
```

## Getting Started

### Self-hosted (Docker Compose) — recommended

Prerequisites: Docker with Compose v2.

```bash
# Configure — fill in the three required secrets (generation commands are in the file)
cp .env.example .env

# Full stack: web :3000, API :3001, PostgreSQL, Valkey
docker compose -f docker-compose.yml -f docker-compose.app.yml up -d --build
```

Migrations run automatically on API start. **No email account required**: without
SMTP configured, signup OTPs and reset links print to `docker compose logs api`,
and team-invite links appear in the UI for copy-paste. To send real email, set the
`SMTP_*` variables in `.env` — any provider works (Gmail app password, SES,
Mailgun, smtp.resend.com).

For a server deploy with TLS, layer `docker-compose.prod.yml` (Caddy, `app.`/`api.`
subdomains) — the deploy checklist is in that file's header.

### Local development

Prerequisites: Node.js 22+, pnpm 9+, Docker (for backing services).

```bash
pnpm install

# Backing services only (PostgreSQL + Valkey)
docker compose up -d

# Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# API (:3001) + web (:3000), migrations run on API start
pnpm dev
```

### Running Tests

```bash
# All checks (lint + typecheck + tests)
pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test
```

## Environments

| Service | URL |
|---------|-----|
| Self-hosted (web) | http://localhost:3000 (or `https://app.<your-domain>` via prod overlay) |
| Self-hosted (API) | http://localhost:3001 (or `https://api.<your-domain>` via prod overlay) |
| Marketing site | https://runvelo.app |

## Roadmap

- [x] **v1 Foundation** — CI/CD, schema, auth, workspace isolation, design system
- [x] **Test Cases** — Keyboard editor, suites, drag-drop, CSV import
- [x] **Test Runs & Dashboard** — Execution, live SSE dashboard
- [x] **CI Ingestion** — JUnit XML, Allure JSON, R2 storage
- [x] **Integrations & API** — Linear, REST API, webhooks
- [x] **Team & Access Control** — RBAC, invites, plan tiers
- [x] **GWT/BDD** — Given-When-Then format, keyword editor, CSV keyword import
- [x] **AI Import** — Linear spec-to-test via Claude API
- [x] **Test Evidence** — File upload, R2 storage, Linear sync
- [x] **Reports Dashboard** — Trend chart, fragile cases, recent runs
- [x] **Security & Performance** — Audit (8 findings fixed), indexes, caching
- [x] **Observability** — Sentry error tracking, PostHog analytics (19 events)
- [x] **Self-Hosting** — Docker Compose stack, non-superuser DB role, Caddy prod overlay
- [ ] **Tagging & Filtering** — Custom tags on test cases
- [ ] **Bulk Actions** — Multi-select operations
- [ ] **Slack Integration** — Run notifications
- [ ] **GitHub Actions Integration** — Native CI connector

## License

Proprietary. All rights reserved.
