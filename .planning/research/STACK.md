# Technology Stack

**Project:** Velo — QA Test Management Platform
**Researched:** 2026-03-08
**Scope:** Gaps only — already-decided components excluded from analysis

---

## Already Decided (Reference Only)

| Layer | Decision |
|-------|----------|
| Frontend | Next.js 16 Pages Router + TypeScript + Tailwind CSS |
| Backend | Node.js 22 LTS + Fastify 5 |
| Database | PostgreSQL 16 |
| Cache / Pub-Sub | Valkey (Redis fork — SSPL avoidance) |
| Auth | Auth.js v5 (PKCE enforced) |
| Storage | Cloudflare R2 |
| Hosting | Railway |
| CI/CD | GitHub Actions |
| Observability | Sentry + Better Stack |
| AI (Phase 3+) | Anthropic Claude API (claude-sonnet-4-6 / claude-haiku-4-5) |

---

## Gap Analysis: What Needs Decisions

The decided stack leaves seven open areas:

1. ORM / query layer
2. Schema migrations
3. Real-time transport (WebSocket)
4. Background job processing
5. Email delivery
6. Testing frameworks (unit + integration + e2e)
7. Form validation / schema validation library

---

## Recommended Stack: Gap Fills

### 1. ORM / Query Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Drizzle ORM** | 0.36.x | Primary ORM for PostgreSQL | SQL-first, TypeScript-native, generates typed queries without reflection. Zero runtime overhead vs Prisma's query engine binary. Supports raw SQL escape hatches cleanly. Fastify-compatible (no decorator magic). `drizzle-kit` ships schema diffing and migration generation. |

**Why not Prisma:** Prisma 5+ still ships a separate query engine binary (~40MB), adds cold-start penalty relevant on Railway's free-tier containers, and generates SQL in a proprietary intermediate language. The "Prisma accelerate" offering creates a paid dependency path. For a solo greenfield project, Drizzle's SQL-first model is easier to debug and gives exact control over queries needed for run execution performance targets (<300ms).

**Why not TypeORM:** TypeORM is actively maintained but relies heavily on decorators and `reflect-metadata`, which conflicts with Fastify's ethos and adds build complexity. The codebase has a history of subtle bugs with nullable columns and junction tables — exactly the patterns Velo needs (RunItem relationships).

**Confidence:** MEDIUM — Drizzle 0.36.x was stable and production-used as of August 2025. Verify current patch version at `npmjs.com/package/drizzle-orm` before pinning in `package.json`.

---

### 2. Schema Migrations

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **drizzle-kit** | 0.27.x | Migration generation + apply | Ships with Drizzle ORM — same mental model, no second tool. `drizzle-kit generate` diffs schema against current DB state; `drizzle-kit migrate` applies. Works well in Railway's build pipeline via `npm run db:migrate` pre-start hook. |

**Why not Flyway / Liquibase:** JVM dependency, heavy for a Node.js mono-service. Overkill until multi-team scale.

**Why not node-postgres-migrate:** Low adoption, no TypeScript-aware schema diff.

**Confidence:** HIGH — drizzle-kit is the canonical companion to Drizzle ORM, not an independent ecosystem choice.

---

### 3. Real-Time Transport (WebSocket)

This is the highest-stakes gap. The "live run dashboard with real-time updates — no page refresh required" (DA-01) is a core differentiator.

#### Server Side (Fastify)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **@fastify/websocket** | 8.x | WebSocket plugin for Fastify 5 | Official Fastify ecosystem plugin. Wraps `ws` (the dominant Node.js WebSocket library). Fastify 5-compatible. Supports per-route WebSocket handlers, which maps cleanly to `/ws/runs/:runId`. |

**Architecture decision:** Use Valkey pub/sub as the broadcast backbone. When a RunItem status changes (API call from test runner or UI), the handler publishes to a Valkey channel `run:{runId}:updates`. A single WebSocket server process subscribes and fans out to connected clients per runId. This avoids sticky sessions and works with Railway's single-instance MVP deployment.

**Why not Socket.IO:** Socket.IO adds ~70KB client bundle, long-polling fallback complexity, and a proprietary protocol layer. For 2025, browsers universally support native WebSocket. The added abstraction is net-negative for a lean product. Socket.IO makes sense only when IE11 or corporate proxies that block WebSocket are in scope — neither applies here.

**Why not SSE (Server-Sent Events):** SSE is unidirectional (server-to-client only). Velo's run execution interface requires bidirectional signalling (client submits P/F/B/S status, server broadcasts to all viewers). WebSocket is the correct primitive.

**Why not Ably / Pusher / PartyKit:** Managed real-time services add a paid external dependency and data egress. For MVP with Railway + Valkey already in the stack, self-hosted WebSocket is simpler and free.

#### Client Side (Next.js Pages Router)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Native WebSocket API** | — | Browser WebSocket client | No library needed. Wrap in a custom React hook (`useRunUpdates(runId)`) with reconnect logic using exponential backoff. Pages Router makes this straightforward — no RSC/streaming conflicts. |

**Reconnect pattern:** Implement `useWebSocket` hook with: exponential backoff (1s, 2s, 4s, max 30s), visibility change listener to reconnect on tab focus, and a message queue to buffer updates during reconnect window. This is ~80 lines of code and avoids adding `reconnecting-websocket` or similar micro-libraries.

**Confidence:** HIGH — `@fastify/websocket` 8.x + Valkey pub/sub is a well-understood pattern. The architecture is straightforward for single-instance Railway deployment.

---

### 4. Background Job Processing

Velo needs async jobs for: JUnit XML / Allure JSON ingestion (IN-01), Jira two-way sync (INT-01), and later webhook fanout.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **BullMQ** | 5.x | Job queue backed by Valkey | BullMQ is the dominant Redis-compatible job queue in the Node.js ecosystem. It explicitly supports Valkey via `ioredis` 5.x (Valkey speaks the Redis protocol — full compatibility). Rate limiting, retries, dead-letter queues, and job progress events are all built-in. The BullMQ license is MIT for core; the paid "BullMQ Pro" features are not needed at MVP scale. |

**Why not `pg-boss`:** pg-boss uses PostgreSQL as the queue backend. This is architecturally appealing (fewer services) but adds table-locking patterns and polling overhead to the primary DB. For Velo's <300ms performance target, keeping job queue traffic off the primary Postgres is cleaner.

**Why not Inngest / Trigger.dev:** Both are managed platforms. Inngest requires an external service; Trigger.dev's self-hosted path adds operational overhead. For MVP on Railway, BullMQ with Valkey is simpler and already in the infrastructure footprint.

**Worker process:** Run BullMQ workers in the same Node.js process (using Fastify's onReady hook) for MVP. If Railway's free tier CPU becomes a constraint, split into a separate Railway service later — BullMQ's architecture supports this transparently since workers only need the Valkey connection.

**Confidence:** MEDIUM — BullMQ 5.x Valkey compatibility relies on protocol compatibility. Verify Valkey 8.x remains fully Redis-protocol compatible at integration time. As of August 2025, Valkey 8.x maintained this compatibility.

---

### 5. Email Delivery

Velo needs transactional email for: auth (magic links, password reset), team invitations, and run completion notifications (Phase 3+).

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Resend** | 4.x SDK | Email delivery service | Resend is the dominant developer-focused transactional email provider as of 2025. It has a clean REST API, official Node.js SDK, generous free tier (3,000 emails/month), and React Email for template authoring. Critically: it delivers without DKIM/SPF complexity for MVP — Resend manages domain reputation on your behalf. |
| **React Email** | 3.x | Email template system | Works with Resend directly. Templates are React components — same mental model as the Next.js frontend. Type-safe. |

**Why not SendGrid / Mailgun:** Both have more complex pricing and historically worse developer experience. Resend was built specifically to fix the "email is painful" problem and has overtaken them in the startup ecosystem.

**Why not Nodemailer + SMTP:** Requires managing an SMTP server or third-party relay. More operational surface area with no advantage over Resend's SDK.

**Confidence:** MEDIUM — Resend SDK 4.x was current as of August 2025. Verify current version.

---

### 6. Testing Frameworks

#### Backend (Fastify API)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Vitest** | 2.x | Unit + integration tests | Vitest is the modern replacement for Jest in the Node.js/TypeScript ecosystem. ~5x faster than Jest on cold runs due to native ESM support and Vite's transform pipeline. Compatible with Jest's API (`describe`, `it`, `expect`) — zero relearning. First-class TypeScript support without Babel or ts-jest gymnastics. |
| **@fastify/inject** | built-in | Route integration tests | Fastify's built-in `inject()` method allows full HTTP simulation without a network socket. Use with Vitest for fast, isolated route tests (no `supertest` needed). |
| **testcontainers** | 10.x | PostgreSQL test isolation | Spins a real PostgreSQL container per test suite. Eliminates "works in CI, breaks locally" class of bugs that come from mocking the DB layer. Works with GitHub Actions via Docker. |

**Why not Jest:** Jest's CommonJS-first design requires explicit ESM configuration that conflicts with Fastify 5's ESM-first packaging. Multiple `transform` config hacks required. Vitest's ESM-native approach eliminates this entirely.

**Why not Mocha:** Lower adoption in the TypeScript ecosystem; less tooling integration.

#### Frontend (Next.js Pages Router)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Vitest** | 2.x | Component unit tests | Same test runner as backend — one config, one runner, one CI step. |
| **@testing-library/react** | 16.x | Component testing | Industry standard for testing React components from the user's perspective. Works cleanly with Vitest via `@vitejs/plugin-react`. |
| **jsdom** | 25.x | DOM environment for Vitest | Required for React component tests in Vitest. Use `environment: 'jsdom'` in vitest config. |

#### End-to-End

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Playwright** | 1.48.x | E2E browser tests | Playwright is the dominant E2E testing tool for 2025, overtaking Cypress in ecosystem momentum. Key advantages: multi-browser (Chromium, Firefox, WebKit) in one runner, built-in network interception for WebSocket testing (critical for DA-01 validation), auto-wait reducing flakiness, and first-class GitHub Actions support. |

**Why not Cypress:** Cypress still lacks native multi-tab support and has historically struggled with WebSocket testing — both blockers for Velo's real-time run dashboard. Playwright's WebSocket interceptors (`page.on('websocket')`) are production-grade.

**Why not Selenium:** 2015-era tooling. No reason to choose it in 2025 unless browser matrix is exotic.

**Confidence for Vitest:** HIGH — mature, stable, widely adopted.
**Confidence for Playwright:** HIGH — industry-standard as of 2025.
**Confidence for testcontainers:** MEDIUM — verify Node.js 22 LTS compatibility at integration time.

---

### 7. Schema / Runtime Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Zod** | 3.x | Schema validation + type inference | Zod is the de facto standard for TypeScript-first runtime validation. Used for: API request body validation in Fastify route schemas, environment variable validation at startup, and form validation on the frontend. Fastify's `@fastify/type-provider-zod` plugin bridges Zod schemas to Fastify's JSON Schema validation pipeline cleanly. Single library for both backend and frontend eliminates duplication of validation logic. |

**Why not Yup:** Yup predates TypeScript-first design and requires separate type declarations. Slower in benchmarks.

**Why not Valibot:** Valibot is newer (smaller bundle) and worth watching, but Zod has larger ecosystem support (tRPC, Drizzle integrations, Auth.js) making it the lower-risk choice for a solo project.

**Why not `fastify-plugin` + JSON Schema only:** Fastify supports JSON Schema natively, but raw JSON Schema lacks TypeScript type inference, requiring manual type declarations that drift. Zod generates the types.

**Confidence:** HIGH — Zod 3.x is stable and universally used.

---

### 8. API Type Safety (Optional but Recommended)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **tRPC** | — | NOT recommended | tRPC requires a dedicated client-server architecture where the client imports server types directly. This conflicts with Velo's design goal of a REST API with full UI parity (API-01) that external consumers (CI/CD integrations, JUnit ingestion) can use. A tRPC-only API would be difficult for non-Next.js consumers. |
| **Zod + Fastify type provider** | — | Type-safe REST API | Use `@fastify/type-provider-zod` to get full TypeScript types for route inputs and outputs. This gives compile-time safety without sacrificing the REST contract. |

**Decision:** No tRPC. REST with Zod schemas is the correct choice given the external API requirement.

**Confidence:** HIGH — this is a direct architectural constraint from the project requirements.

---

### 9. Drag-and-Drop (Suite / Folder Structure)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **@dnd-kit/core** | 6.x | Drag-and-drop for suite tree | dnd-kit is the modern, accessibility-first DnD library for React. It replaced `react-beautiful-dnd` (deprecated in 2023 by Atlassian). Works with Next.js Pages Router. Supports tree-like structures via `@dnd-kit/sortable`. No dependency on a specific rendering strategy — important since Velo uses Pages Router. |

**Why not react-beautiful-dnd:** Officially deprecated by Atlassian (2023). Active bugs unfixed.

**Why not react-dnd:** Lower ergonomics, heavier API surface, less active maintenance relative to dnd-kit.

**Confidence:** HIGH — dnd-kit is the clear successor as of 2025.

---

### 10. HTTP Client (Server-Side — Jira Integration)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **undici** | 6.x | Jira API calls from backend | `undici` is Node.js 22's built-in HTTP client (it powers `fetch` in Node.js). Using it directly (or via the native `fetch` API in Node.js 22) avoids adding `axios` or `got` as a dependency. Node.js 22 LTS ships `fetch` as stable — no polyfill needed. |

**Why not axios:** axios is excellent but unnecessary when Node.js 22's native `fetch` covers the use case. Reduces dependency surface.

**Why not got:** Same reasoning — native fetch is sufficient for Jira REST API calls which are straightforward request/response patterns.

**Confidence:** HIGH — Node.js 22 LTS ships stable `fetch`.

---

## Full Stack Reference Table

| Layer | Library | Version | Confidence |
|-------|---------|---------|------------|
| ORM | Drizzle ORM | 0.36.x | MEDIUM |
| Migrations | drizzle-kit | 0.27.x | HIGH |
| WebSocket (server) | @fastify/websocket | 8.x | HIGH |
| WebSocket (client) | Native browser API | — | HIGH |
| Job queue | BullMQ | 5.x | MEDIUM |
| Email | Resend SDK | 4.x | MEDIUM |
| Email templates | React Email | 3.x | MEDIUM |
| Validation | Zod | 3.x | HIGH |
| Fastify type bridge | @fastify/type-provider-zod | 2.x | HIGH |
| Unit/integration tests | Vitest | 2.x | HIGH |
| React component tests | @testing-library/react | 16.x | HIGH |
| DB test isolation | testcontainers | 10.x | MEDIUM |
| E2E tests | Playwright | 1.48.x | HIGH |
| Drag-and-drop | @dnd-kit/core + @dnd-kit/sortable | 6.x | HIGH |
| HTTP client (server) | Node.js native fetch / undici | built-in | HIGH |

---

## Alternatives Considered and Rejected

| Category | Recommended | Rejected | Reason |
|----------|-------------|---------|--------|
| ORM | Drizzle ORM | Prisma | Binary query engine, cold-start cost, paid acceleration path |
| ORM | Drizzle ORM | TypeORM | Decorator-heavy, `reflect-metadata` complexity, junction table bugs |
| WebSocket | @fastify/websocket + native WS | Socket.IO | 70KB bundle overhead, long-polling complexity, proprietary protocol |
| WebSocket | @fastify/websocket + native WS | SSE | Unidirectional — cannot handle client status submissions |
| WebSocket | @fastify/websocket + native WS | Managed (Ably/Pusher) | Paid external dependency, unnecessary for single-instance MVP |
| Job queue | BullMQ | pg-boss | Adds polling load to primary DB, worsens <300ms targets |
| Job queue | BullMQ | Inngest / Trigger.dev | Managed external service, adds operational dependency |
| Email | Resend | SendGrid / Mailgun | Worse DX, more complex pricing |
| Email | Resend | Nodemailer + SMTP | Manual SMTP relay management |
| Testing | Vitest | Jest | ESM conflicts with Fastify 5, slower, transform config complexity |
| E2E | Playwright | Cypress | Multi-tab gaps, WebSocket testing limitations |
| Validation | Zod | Yup | Not TypeScript-first, separate type declarations drift |
| Validation | Zod | Valibot | Smaller ecosystem, less integration support |
| API type safety | REST + Zod | tRPC | Incompatible with external REST API requirement (IN-01, API-01) |
| Drag-and-drop | dnd-kit | react-beautiful-dnd | Deprecated by Atlassian 2023 |

---

## Installation Reference

```bash
# ORM + Migrations
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit

# Fastify plugins
pnpm add @fastify/websocket @fastify/type-provider-zod

# Validation
pnpm add zod

# Job queue
pnpm add bullmq

# Email
pnpm add resend @react-email/components

# Testing
pnpm add -D vitest @vitest/ui
pnpm add -D @testing-library/react @testing-library/user-event jsdom
pnpm add -D testcontainers
pnpm add -D @playwright/test

# Frontend DnD
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## Version Verification Required Before Integration

These versions were current as of August 2025 (research knowledge cutoff). Verify before pinning in `package.json`:

| Package | Check At |
|---------|---------|
| drizzle-orm | npmjs.com/package/drizzle-orm |
| drizzle-kit | npmjs.com/package/drizzle-kit |
| bullmq | npmjs.com/package/bullmq — also verify Valkey 8.x protocol compatibility in release notes |
| resend | npmjs.com/package/resend |
| @playwright/test | playwright.dev/docs/release-notes |
| testcontainers | npmjs.com/package/testcontainers — verify Node.js 22 compatibility |

---

## Sources

- Knowledge base (August 2025 cutoff) — covers all listed library versions
- Project constraints: `D:/git_repo/personal/velo-test-management/.planning/PROJECT.md`
- WebSearch and WebFetch unavailable in this research session — version numbers flagged MEDIUM where recency matters most
- Fastify 5 official docs: fastify.dev
- Playwright official: playwright.dev
- Drizzle ORM: orm.drizzle.team
- BullMQ: docs.bullmq.io
- Resend: resend.com/docs
- dnd-kit: dndkit.com
