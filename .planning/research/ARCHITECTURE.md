# Architecture Patterns

**Domain:** QA test management SaaS (solo founder, lean MVP)
**Project:** Velo
**Researched:** 2026-03-08
**Confidence:** HIGH for patterns (established domain); MEDIUM for specific library versions

---

## Recommended Architecture

Velo is a **monolith-first, vertically-sliced SaaS** — one frontend, one backend API, one database, one cache. No microservices. No event buses. The solo-founder constraint makes this mandatory: splitting services early kills velocity and adds operational burden before product-market fit exists.

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Next.js)                    │
│  Pages Router + TypeScript + Tailwind CSS               │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Auth    │ │  Suite   │ │  Run     │ │Dashboard │  │
│  │  Pages   │ │  Editor  │ │  Exec    │ │  Live    │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│       │            │            │            │          │
│       └────────────┴────────────┴────────────┘          │
│                         │                               │
│              REST (fetch) + SSE (EventSource)           │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│              API Layer (Fastify 5 / Node 22)            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Auth Middleware (Auth.js v5 session validation) │  │
│  │  Workspace Scoping Middleware (tenant context)   │  │
│  │  Rate Limiting (per workspace/tier)              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐  │
│  │  /auth  │ │ /suites │ │  /runs  │ │  /ingest    │  │
│  │  routes │ │ /cases  │ │ /items  │ │  (JUnit/    │  │
│  │         │ │ /milest.│ │ /defects│ │   Allure)   │  │
│  └────┬────┘ └────┬────┘ └────┬────┘ └─────┬───────┘  │
│       │           │           │             │           │
│  ┌────▼───────────▼───────────▼─────────────▼───────┐  │
│  │              Service Layer                       │  │
│  │  (business logic, validation, orchestration)    │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │                               │
│  ┌──────────────────────▼────────────────────────────┐  │
│  │              Repository Layer                    │  │
│  │  (SQL queries via postgres.js / raw SQL)         │  │
│  └──────────┬───────────────────────────────────────┘  │
│             │                          │                │
└─────────────┼──────────────────────────┼────────────────┘
              │                          │
┌─────────────▼──────────┐  ┌───────────▼────────────────┐
│  PostgreSQL 16          │  │  Valkey (Redis fork)        │
│  Primary data store     │  │  - Session store           │
│  workspace_id on every  │  │  - Pub/Sub for SSE fanout  │
│  row (app-level tenant) │  │  - API response cache      │
│                         │  │  - Rate limit counters     │
└─────────────────────────┘  └────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | Notes |
|-----------|---------------|-------------------|-------|
| **Next.js Pages** | UI rendering, routing, form state | Fastify API (REST + SSE) | No direct DB access; all reads/writes go through API |
| **Auth.js v5** | Session management, PKCE, cookie-based auth | Next.js (middleware), Fastify (token validation) | Sessions stored in Valkey; JWT-less by design |
| **Fastify API** | HTTP request handling, auth enforcement, rate limiting | PostgreSQL, Valkey, Cloudflare R2 | Thin handler layer — business logic lives in services |
| **Service Layer** | Business logic, validation, orchestration | Repositories, external APIs (Jira) | One service per domain aggregate (SuiteService, RunService, etc.) |
| **Repository Layer** | SQL queries, data mapping | PostgreSQL only | No ORM — raw SQL via `postgres.js` for performance control |
| **Ingest Pipeline** | Parse JUnit XML / Allure JSON, map to RunItems | RunService, Repository | CPU-bound parsing isolated to a queue or background task |
| **SSE Publisher** | Push run status changes to connected clients | Valkey pub/sub | Fastify SSE endpoint subscribes to Valkey channel per run_id |
| **Valkey** | Ephemeral state: sessions, pub/sub, cache, rate limits | Fastify API, Auth.js | Single instance for MVP; no cluster needed at this scale |
| **PostgreSQL** | Durable state: all business data | Fastify Repository layer | Row-level tenant scoping via `workspace_id` on every table |
| **Cloudflare R2** | File storage for ingest payloads (JUnit XML, Allure JSON) | Ingest Pipeline | Zero egress cost; presigned URLs for upload |

---

## Data Flow

### Write Path (Test Case Creation)

```
Browser form submit
  → POST /api/workspaces/:wid/projects/:pid/suites/:sid/cases
  → Auth middleware verifies session (Valkey lookup)
  → Workspace middleware verifies user membership + role
  → SuiteService.createCase() validates input, enforces plan limits
  → CaseRepository.insert() executes parameterized SQL
  → PostgreSQL row created with workspace_id, suite_id, created_by
  → 201 response with created case
  → Browser optimistic update (already shown); confirms from response
```

### Read Path (Suite Tree)

```
Browser requests suite tree
  → GET /api/workspaces/:wid/projects/:pid/suites?depth=all
  → Auth + workspace middleware
  → SuiteRepository.getTree() — recursive CTE query (WITH RECURSIVE)
  → PostgreSQL returns flat rows with depth/path
  → Service transforms to nested structure
  → Response JSON (target: <100ms for trees up to 10k cases)
  → Browser renders tree; Valkey cache hit on repeat requests
```

### Real-Time Path (Run Execution Updates)

```
QA engineer marks RunItem as PASS in Browser A
  → PATCH /api/runs/:rid/items/:iid  { status: "pass", duration_ms: 1240 }
  → RunItemService.updateStatus() writes to PostgreSQL
  → RunItemService publishes to Valkey channel: run:{run_id}:updates
  → 200 OK back to Browser A

Valkey pub/sub channel: run:{run_id}:updates
  → Fastify SSE handler (GET /api/runs/:rid/stream) is subscribed
  → Receives message, serializes to SSE event
  → Pushes event to all connected clients watching that run
  → Browser B (dashboard) receives EventSource message
  → React state updated without page reload
```

### Ingest Path (JUnit XML Upload)

```
CI/CD pipeline POSTs JUnit XML
  → POST /api/workspaces/:wid/projects/:pid/runs/:rid/ingest
  → API key auth (no session required for CI calls)
  → Raw XML buffered (or large files: presigned R2 URL upload)
  → IngestService.parseJUnit() transforms XML → RunItem[]
  → Bulk insert into run_items with status mapping
  → Valkey pub/sub publish: all watchers get live update
  → Webhook fired to registered endpoints (if configured)
```

---

## Real-Time Strategy: SSE over WebSocket

**Decision: Server-Sent Events (SSE)**

Rationale:

1. **Use case is one-directional.** The server pushes run updates to browsers. Browsers send updates via REST (PATCH). There is no need for bidirectional streaming at this stage.

2. **SSE works over plain HTTP/1.1.** No protocol upgrade. No connection management complexity. Native `EventSource` API in all modern browsers. No client library needed.

3. **SSE reconnects automatically.** `EventSource` has built-in reconnection with `Last-Event-ID` header. If the Fastify process restarts, clients reconnect without any client-side code.

4. **WebSocket adds operational overhead** for no gain here: you need to handle handshake upgrades, ping/pong heartbeats, binary framing, and a more complex Fastify plugin (`@fastify/websocket`). SSE needs none of this.

5. **Fastify 5 SSE implementation is trivial.** Set `Content-Type: text/event-stream`, disable buffering, write `data:` lines. No plugin required.

6. **Valkey pub/sub is the fanout mechanism**, not WebSocket rooms. This means SSE is stateless from the API server's perspective — any Fastify instance can serve any client because all state flows through Valkey channels. This matters when Railway auto-scales horizontally.

**SSE channel design:**

```
run:{run_id}:updates     — live run item status changes
workspace:{wid}:activity — workspace-level activity feed (future)
```

**When to reconsider WebSocket:** If Phase 3+ adds collaborative test case editing (multiple editors in the same suite simultaneously), WebSocket becomes appropriate. For Phase 1+2 (run execution), SSE is correct.

---

## Multi-Tenancy Approach: Application-Level Isolation with workspace_id

**Decision: Shared schema, workspace_id column on every table, enforced at service layer**

### Why not PostgreSQL Row-Level Security (RLS)

RLS is powerful but adds significant operational complexity for a solo founder:

- Every query must SET app.current_workspace_id for RLS policies to fire
- Forgetting to set the role variable silently returns no rows (confusing bugs)
- Connection pooling (PgBouncer / node-postgres pool) interacts badly with session-level SET — you must use transaction-level SET or reset on connection return
- Debugging "why am I getting no data" is harder than "I forgot workspace_id in my WHERE clause"

For a solo founder moving fast, the risk of an RLS misconfiguration silently breaking reads outweighs the protection benefit when you can enforce workspace scoping at the Fastify middleware + repository layer with a code review.

### Application-Level Enforcement Pattern

```
1. Auth middleware: resolve session → user_id
2. Workspace middleware: resolve workspace slug/id from URL param
                         → verify user_membership row exists
                         → attach { workspace_id, role } to request context
3. Every repository function accepts workspace_id as first param
4. Every SQL query has WHERE workspace_id = $1 as first condition
5. No repository function works without workspace_id
```

This is enforced by convention + TypeScript types. The repository interface signature makes omission a compile error:

```typescript
// Every repo method requires WorkspaceContext
interface WorkspaceContext {
  workspaceId: string;
  userId: string;
  role: 'admin' | 'editor' | 'viewer';
}

// Cannot call without context — caught at compile time
async getTestCase(ctx: WorkspaceContext, caseId: string): Promise<TestCase>
```

### When to Add RLS

Add RLS in Phase 4+ (Enterprise tier) when compliance requirements or SOC 2 audit mandates cryptographic data isolation guarantees. At that point, RLS becomes a defence-in-depth layer, not the primary mechanism.

---

## Database Schema Design Patterns

### Core Design Principles

1. **UUID v7 primary keys** — time-ordered, globally unique, safe to expose in URLs. Avoid sequential integers (enumerable IDs are a security risk in multi-tenant systems).

2. **workspace_id on every tenant-owned table** — denormalized for query performance and mandatory WHERE clause filtering. No need to join through projects to discover workspace ownership.

3. **Soft deletes on critical entities** — `deleted_at TIMESTAMPTZ` on TestCase, Suite, TestRun. Hard deletes on RunItem, Defect (run-scoped, lower value to recover).

4. **`position` as integer for ordering** — suites and test cases within suites use an integer position column. Re-ordering is a batch UPDATE, not a recursive tree restructure. Use gap-based positioning (increments of 1000) to avoid rewriting all rows on every drag.

5. **JSONB for flexible fields** — `steps` on TestCase is JSONB array (each step: `{ action, expected, order }`). `tags` on TestCase is `text[]` (PostgreSQL native array — simpler than a join table for MVP). Custom metadata fields (future) go in a `metadata JSONB` column.

6. **Recursive CTE for suite tree** — self-referencing `parent_suite_id` with a recursive `WITH RECURSIVE` query for tree retrieval. Index on `(project_id, parent_suite_id)`.

### Annotated Schema

```sql
-- Workspace: tenant root
CREATE TABLE workspaces (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,   -- URL segment: velo.app/w/acme-qa
  plan_tier    TEXT NOT NULL DEFAULT 'free',  -- free|starter|growth|enterprise
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- User membership (junction table — user:workspace is many:many)
CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id      UUID NOT NULL REFERENCES users(id),
  role         TEXT NOT NULL DEFAULT 'viewer',  -- admin|editor|viewer
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- Project: scoped to workspace
CREATE TABLE projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  key          TEXT NOT NULL,           -- short code e.g. "VELO" for display
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (workspace_id, key)
);
CREATE INDEX idx_projects_workspace ON projects(workspace_id) WHERE deleted_at IS NULL;

-- Suite: self-referencing tree within a project
CREATE TABLE suites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id),  -- denormalized
  project_id     UUID NOT NULL REFERENCES projects(id),
  parent_suite_id UUID REFERENCES suites(id),
  name           TEXT NOT NULL,
  position       INTEGER NOT NULL DEFAULT 1000,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX idx_suites_project ON suites(project_id, parent_suite_id) WHERE deleted_at IS NULL;

-- TestCase: leaf node, belongs to suite
CREATE TABLE test_cases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id),  -- denormalized
  suite_id       UUID NOT NULL REFERENCES suites(id),
  title          TEXT NOT NULL,
  preconditions  TEXT,
  steps          JSONB NOT NULL DEFAULT '[]',  -- [{order, action, expected}]
  priority       TEXT NOT NULL DEFAULT 'medium',  -- low|medium|high|critical
  tags           TEXT[] NOT NULL DEFAULT '{}',
  created_by     UUID NOT NULL REFERENCES users(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  position       INTEGER NOT NULL DEFAULT 1000,
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX idx_test_cases_suite ON test_cases(suite_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_cases_workspace ON test_cases(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_test_cases_tags ON test_cases USING gin(tags);

-- Milestone: grouping for runs
CREATE TABLE milestones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  project_id   UUID NOT NULL REFERENCES projects(id),
  name         TEXT NOT NULL,
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'active',  -- active|completed|archived
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TestRun: execution snapshot
CREATE TABLE test_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  project_id   UUID NOT NULL REFERENCES projects(id),
  milestone_id UUID REFERENCES milestones(id),
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending|in_progress|completed|aborted
  created_by   UUID NOT NULL REFERENCES users(id),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_runs_project ON test_runs(project_id, status);
CREATE INDEX idx_runs_workspace ON test_runs(workspace_id);

-- RunItem: per-case result within a run
CREATE TABLE run_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  test_case_id   UUID NOT NULL REFERENCES test_cases(id),
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending|pass|fail|blocked|skipped
  assignee       UUID REFERENCES users(id),
  comment        TEXT,
  duration_ms    INTEGER,
  executed_at    TIMESTAMPTZ,
  UNIQUE (run_id, test_case_id)
);
CREATE INDEX idx_run_items_run ON run_items(run_id, status);

-- Defect: linked to a failed/blocked run item
CREATE TABLE defects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_item_id  UUID NOT NULL REFERENCES run_items(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  external_ref TEXT,    -- Jira issue key e.g. "PROJ-123"
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',  -- open|in_progress|resolved|closed
  filed_by     UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_defects_workspace ON defects(workspace_id);
CREATE INDEX idx_defects_run_item ON defects(run_item_id);
```

### Key Query: Suite Tree (Recursive CTE)

```sql
WITH RECURSIVE suite_tree AS (
  -- Root suites for project
  SELECT id, name, parent_suite_id, position, 0 AS depth
  FROM suites
  WHERE project_id = $1 AND parent_suite_id IS NULL AND deleted_at IS NULL

  UNION ALL

  -- Recursive children
  SELECT s.id, s.name, s.parent_suite_id, s.position, st.depth + 1
  FROM suites s
  INNER JOIN suite_tree st ON s.parent_suite_id = st.id
  WHERE s.deleted_at IS NULL
)
SELECT * FROM suite_tree ORDER BY depth, position;
```

### Key Query: Run Dashboard Aggregates

```sql
SELECT
  status,
  COUNT(*) AS count
FROM run_items
WHERE run_id = $1
GROUP BY status;
```

Keep this as a single GROUP BY — do not compute this in application code. At 10k run items, database aggregation is still <10ms. Cache the result in Valkey (5-second TTL) to avoid hitting PostgreSQL on every SSE connection open.

---

## Suggested Build Order (Phase Dependencies)

The order matters because later components depend on earlier ones being stable.

### Phase 1: Foundation (sequential — each step unblocks the next)

```
1. Repository setup + CI/CD + Railway deploy pipeline
   └── Unblocks: everything. No point building on an undeployable base.

2. PostgreSQL schema + migrations (Flyway or node-migrate)
   └── Depends on: deployed database
   └── Unblocks: all data-layer work

3. Valkey connection + session store configuration
   └── Depends on: deployed Valkey instance
   └── Unblocks: auth, SSE

4. Auth.js v5 integration (email/password + session)
   └── Depends on: Valkey (session store), users table
   └── Unblocks: any protected endpoint

5. Workspace + membership model + middleware
   └── Depends on: auth, schema
   └── Unblocks: all tenant-scoped API routes

6. Design system tokens + base component library
   └── Can run in parallel with steps 2-5
   └── Unblocks: all UI work
```

### Phase 2: Core MVP (can parallelise by domain after Phase 1 complete)

```
Domain A: Test Case Management
  7a. Suite CRUD + tree API (GET suite tree, POST/PATCH/DELETE suite)
  7b. Test case CRUD API (POST/PATCH/DELETE case with steps JSONB)
  7c. Suite editor UI (keyboard-first, drag-drop reorder)
  7d. Test case editor UI (inline editing, 30-second create target)

Domain B: Test Runs (depends on Domain A cases existing)
  8a. Test run creation API (create run from suite/filter/milestone scope)
  8b. Run item creation (snapshot of selected cases into run_items)
  8c. Run execution API (PATCH run_item status + Valkey pub/sub publish)
  8d. SSE endpoint (GET /runs/:id/stream → Valkey subscribe → EventSource push)
  8e. Run creation UI + execution interface (keyboard shortcuts P/F/B/S)
  8f. Live dashboard UI (EventSource client, aggregate display)

Domain C: Ingest Pipeline (depends on runs existing)
  9a. JUnit XML parser (xml2js or fast-xml-parser)
  9b. Allure JSON parser
  9c. Ingest API endpoint (API key auth, map to run_items)
  9d. R2 upload path for large files (>1MB payloads)

Domain D: Integrations (can start after runs work)
  10a. Jira OAuth + client
  10b. Defect filing from RunItem UI
  10c. Jira status sync (webhook receive or polling)

Domain E: Access Control (weave into Phase 2 as features land)
  11a. Role enforcement in service layer (editor vs viewer)
  11b. Team management UI (invite, remove, change role)
  11c. Plan tier enforcement (editor seat limits per plan_tier)
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: ORM for Complex Tree Queries

**What:** Using Prisma or TypeORM for suite tree retrieval and run aggregate queries.

**Why bad:** ORMs cannot express recursive CTEs cleanly. You end up with N+1 queries (one per suite level) or fighting the ORM to emit raw SQL anyway. The suite tree is the hottest read path in the app.

**Instead:** Use `postgres.js` (tagged template literal SQL) for all queries. It is type-safe enough, has zero magic, and lets you write the CTE queries directly.

### Anti-Pattern 2: Polling for Real-Time Updates

**What:** Fetching `/api/runs/:id` every 3 seconds to detect status changes.

**Why bad:** At 50 concurrent users watching the same run, that is 50 requests every 3 seconds = 1000 requests/minute for a single run. SSE maintains one persistent connection per client; Valkey pub/sub delivers a single message to all subscribers regardless of client count.

**Instead:** SSE + Valkey pub/sub as described above.

### Anti-Pattern 3: Storing steps as Normalised Rows

**What:** Creating a `test_case_steps` table with foreign key to `test_cases`.

**Why bad:** A typical test case has 3-15 steps. Fetching a suite with 200 cases requires 200 + (200 * avg_steps) = 1000-3000 rows across two tables. JSONB column is a single row per case — the entire case including steps comes back in one fetch.

**Instead:** `steps JSONB NOT NULL DEFAULT '[]'` on `test_cases`. Steps are always read/written with their parent case. They have no independent lifecycle. JSONB is correct here.

### Anti-Pattern 4: Workspace Resolved from JWT Claims

**What:** Encoding workspace_id into the JWT and trusting it without database verification.

**Why bad:** If a user is removed from a workspace, their JWT still contains the workspace_id until it expires. They retain access until token rotation.

**Instead:** Workspace membership is verified on every request against the `workspace_members` table. Cache the result in Valkey with a short TTL (60 seconds) to avoid a database hit on every request. Valkey cache is invalidated on membership change.

### Anti-Pattern 5: Ingest Blocking the HTTP Response

**What:** Parsing a 5MB JUnit XML file synchronously inside the POST /ingest handler.

**Why bad:** Node.js is single-threaded. A large XML parse blocks the event loop for hundreds of milliseconds, degrading all other requests during that window.

**Instead:** For Phase 1+2 with small payloads (<500KB), parse synchronously but with a payload size guard. For larger payloads, upload to R2 and process asynchronously — return 202 Accepted immediately and have a background task (BullMQ + Valkey) process the file. Implement the guard in Phase 2; add the async path only if real-world payloads exceed the threshold.

---

## Scalability Considerations

| Concern | MVP (1-100 users) | Phase 3+ (100-5K users) | Notes |
|---------|-------------------|-------------------------|-------|
| Database connections | `postgres.js` pool (max 10) | Add PgBouncer sidecar | Railway supports sidecar services |
| SSE connections | Single Fastify process handles ~10K concurrent SSE | Horizontal scale via Railway; Valkey pub/sub keeps state | Each SSE connection is a long-lived HTTP response |
| Suite tree query | Recursive CTE, <50ms at 10K cases | Add materialized path column if >100K cases per project | Unlikely at MVP stage |
| Ingest throughput | Synchronous parse, 202 response | BullMQ queue backed by Valkey | Add when CI pipelines queue up |
| Valkey | Single instance | Redis Cluster or Upstash | Upstash is simple to add on Railway |

---

## Sources

All findings based on:
- Established SaaS multi-tenancy patterns (HIGH confidence — widely documented, stable over years)
- PostgreSQL 16 documentation — recursive CTEs, JSONB, array types (HIGH confidence)
- Fastify 5 architecture — plugin model, SSE via response streams (HIGH confidence — core framework docs)
- Node.js 22 event loop characteristics for synchronous parse risk (HIGH confidence)
- SSE vs WebSocket trade-off analysis — well-documented in browser standards (HIGH confidence)
- Auth.js v5 session store patterns (MEDIUM confidence — v5 was in RC/stable circa late 2024; verify Valkey adapter compatibility)
- Valkey as Redis fork compatibility (HIGH confidence — Valkey maintains Redis protocol compatibility)

Note: WebSearch and WebFetch were unavailable during this research session. Findings are drawn from training knowledge through August 2025. Confidence is noted per area above. The Auth.js v5 + Valkey adapter pairing should be verified against current Auth.js docs before Phase 1 implementation begins.
