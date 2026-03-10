# Phase 3: Test Runs and Dashboard - Research

**Researched:** 2026-03-10
**Domain:** Real-time test execution with SSE streaming, keyboard-driven UI, Fastify 5 + iovalkey pub/sub
**Confidence:** HIGH

## Summary

Phase 3 implements the core test execution workflow: creating runs, executing cases with keyboard shortcuts (P/F/B/S), filing defects inline, and watching results update live on a dashboard via SSE. The existing schema (test_runs, run_items, defects tables) and Valkey infrastructure are already deployed, so Phase 3 is primarily API routes + frontend pages + real-time plumbing.

The most important technical discovery is that **Next.js Pages Router API routes cannot proxy SSE streams on Vercel** -- `res.write()` chunks are buffered until `res.end()`. The SSE endpoint must be consumed directly from the browser to the Railway API, bypassing the `/api/backend/` gateway. This is the single most impactful architectural constraint for this phase.

For Fastify 5 SSE, use `reply.hijack()` + `reply.raw` to write SSE events directly. The official `@fastify/sse` plugin exists (v0.4.0) but is very new with only 21 GitHub stars; the raw approach is well-documented, simple, and avoids an additional dependency risk. Each SSE connection gets a dedicated iovalkey subscriber instance (iovalkey requires a separate connection for pub/sub subscriber mode), cleaned up on `request.raw.on('close')`.

**Primary recommendation:** Use raw Fastify SSE via `reply.hijack()` + `reply.raw`, connect browser EventSource directly to Railway API URL (not through Next.js gateway), create one iovalkey subscriber per SSE connection with cleanup on close.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full-screen focus mode for execution -- dedicated page filling viewport, no case list visible
- All steps visible as vertical list with Action | Expected columns, current step highlighted
- Case-level verdict only -- P/F/B/S marks the whole case, no step-level pass/fail
- Auto-advance immediately -- pressing P/F/B/S records result and instantly shows next case
- Comments: both case-level textarea and per-step comment icon (TR-04)
- Modal dialog for run creation from runs page with name, suite picker, assignee
- Suite picker for scoping -- select suites from tree, "All Cases" option
- Immediately active on creation -- no draft state, active from moment created
- Separate "Test Runs" sidebar nav item below "Test Cases"
- Card grid layout for dashboard -- each run as a card with segmented progress bar
- Segmented color bar (green/red/amber/gray/light gray) proportional to counts
- Run detail page with item list -- click card to navigate to detail
- Filter bar above cards: Assignee | Status | Milestone dropdowns with chips
- SSE per run_id for real-time updates on dashboard and detail page
- Inline prompt after fail verdict -- brief form before auto-advance with File Defect / Skip
- Linear integration stubbed -- local defect record only, "File to Linear" disabled
- Inline badge on failed items showing "Defect filed" with popover
- Rerun Failures action on completed runs in detail page

### Claude's Discretion
- Exact animation/transition for execution screen entry
- Keyboard hints display style (subtle footer bar vs overlay)
- Time-to-complete estimate algorithm
- Empty state design for runs page
- Run card hover/active states
- Progress bar segment minimum width
- SSE reconnection strategy and heartbeat interval (20s heartbeat per architecture decision)

### Deferred Ideas (OUT OF SCOPE)
- Linear API integration for defect filing -- Phase 5 (INT-01, INT-02)
- Milestones / test plans grouping multiple runs -- v2 (TR-V2-01)
- Coverage and trend reports -- v2 (DA-V2-01)
- Custom dashboard builder -- v2 (DA-V2-02)
- Run scheduling -- out of scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TR-01 | Create named test run scoped to project/suite/milestone, assign to team member | Run creation API with suite-scoped case snapshot; existing test_runs + run_items schema |
| TR-02 | Execute run case-by-case with P/F/B/S keyboard shortcuts | Keyboard event handling pattern with activeElement guard; PATCH run_items/:id endpoint |
| TR-03 | Keyboard execution -- pressing key marks result and advances to next case | Auto-advance state machine; useCallback + useEffect keydown listener |
| TR-04 | Inline comment on any test step during execution | Step annotations need new run_item_step_comments table (current schema has only run_items.comment for case-level) |
| TR-05 | File defect directly from failed run item | Local defect record via existing defects table; inline form after F verdict |
| TR-06 | Execution history for test case across all previous runs | SQL query joining run_items to test_runs filtered by test_case_id |
| TR-07 | Rerun-failures flow -- new run from previous run's failures | API endpoint that copies failed run_items into a new test_run |
| DA-01 | Live dashboard with real-time updates via SSE + Valkey pub/sub | Fastify reply.hijack() + reply.raw SSE; iovalkey subscriber per connection; direct browser-to-API connection |
| DA-02 | Real-time progress bar, pass rate %, time-to-complete estimate | Computed from run_items aggregate; EMA algorithm for time estimate |
| DA-03 | Dashboard filterable by assignee, status, milestone | SQL WHERE clauses on test_runs query; client-side filter state |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.0.0 | HTTP server, SSE via reply.hijack() + reply.raw | Already in stack |
| iovalkey | ^0.3.3 | Valkey pub/sub for SSE fan-out | Already in stack, ioredis-compatible API |
| postgres | ^3.4.8 | Raw SQL queries via withWorkspace | Already in stack |
| next | 16.1.6 | Pages Router frontend | Already in stack |
| react | ^19.0.0 | UI components | Already in stack |
| class-variance-authority | ^0.7.1 | Component variants (StatusBadge, RunCard) | Already in stack |
| zod | ^4.3.6 | Request body validation | Already in stack |

### New Dependencies
None required. SSE is implemented with raw Node.js APIs (reply.raw), iovalkey pub/sub uses the existing Valkey connection library, and EventSource is a browser built-in.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw reply.hijack() SSE | @fastify/sse plugin v0.4.0 | Plugin is official Fastify but very new (21 stars), adds dependency for ~30 lines of code; raw approach is well-documented and sufficient |
| Browser EventSource | Custom fetch + ReadableStream | EventSource has built-in reconnection with Last-Event-ID; fetch-based SSE loses auto-reconnect |
| Direct API SSE connection | Proxied through Next.js gateway | Pages Router CANNOT proxy SSE on Vercel -- res.write chunks are buffered until res.end() |

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
├── routes/
│   ├── runs.ts              # CRUD + SSE stream endpoint
│   ├── run-items.ts         # Execute (PATCH status), comments
│   └── defects.ts           # File defect from run item
├── lib/
│   ├── valkey.ts            # Existing -- add createSubscriberConnection()
│   └── sse.ts               # SSE helper: writeEvent(), heartbeat timer

apps/web/src/
├── pages/app/[slug]/[projectKey]/
│   ├── runs/
│   │   ├── index.tsx         # Dashboard -- card grid with filters (DA-01, DA-03)
│   │   └── [runId]/
│   │       ├── index.tsx     # Run detail -- item list, progress (DA-02)
│   │       └── execute.tsx   # Full-screen execution (TR-02, TR-03)
├── components/runs/
│   ├── RunCard.tsx           # Card with segmented progress bar
│   ├── SegmentedBar.tsx      # Green/red/amber/gray/light-gray bar
│   ├── RunCreateModal.tsx    # Modal with name, suite picker, assignee
│   ├── ExecutionScreen.tsx   # Full-screen case execution view
│   ├── DefectPrompt.tsx      # Inline defect form after F verdict
│   └── RunFilters.tsx        # Assignee/Status/Milestone filter bar
├── hooks/
│   ├── useRunSSE.ts          # EventSource hook with reconnection
│   └── useKeyboardExecution.ts  # P/F/B/S keyboard handler
```

### Pattern 1: Fastify SSE via reply.hijack() + reply.raw

**What:** Server-Sent Events endpoint using Fastify's raw HTTP response
**When to use:** Any endpoint that needs to push real-time updates to the browser
**Confidence:** HIGH -- reply.hijack() documented in Fastify 5.8.x official docs

```typescript
// apps/api/src/routes/runs.ts
import { Redis as Valkey } from "iovalkey"

fastify.get<{ Params: { runId: string } }>(
  "/api/workspaces/:workspaceId/runs/:runId/stream",
  async (request, reply) => {
    if (!request.userId) return reply.status(401).send({ error: "Unauthorized" })
    if (request.workspaceId !== request.params.workspaceId) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    const { runId } = request.params
    const res = reply.raw

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Prevent nginx/Railway proxy buffering
    })

    // Create dedicated subscriber for this connection
    const sub = new Valkey(process.env.VALKEY_URL!, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    })

    const channel = `run:${runId}`
    await sub.subscribe(channel)

    sub.on("message", (_ch: string, message: string) => {
      res.write(`data: ${message}\n\n`)
    })

    // 20s heartbeat to prevent Railway proxy timeout
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n")
    }, 20_000)

    // Send initial state
    // (query current run stats and send as first event)

    // Cleanup on disconnect
    request.raw.on("close", () => {
      clearInterval(heartbeat)
      sub.unsubscribe(channel).then(() => sub.quit())
    })

    // Tell Fastify we're handling the response ourselves
    reply.hijack()
  }
)
```

### Pattern 2: Publishing Run Updates via Valkey

**What:** After updating a run_item status, publish the new aggregate to the run's channel
**When to use:** Every PATCH to run_items that changes status

```typescript
// apps/api/src/routes/run-items.ts
// After updating run_item status in withWorkspace transaction:

const stats = await tx`
  SELECT
    COUNT(*) FILTER (WHERE status = 'pass')::int AS pass,
    COUNT(*) FILTER (WHERE status = 'fail')::int AS fail,
    COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked,
    COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
    COUNT(*) FILTER (WHERE status = 'untested')::int AS untested,
    COUNT(*)::int AS total
  FROM run_items
  WHERE run_id = ${runId}
`

// Publish OUTSIDE the transaction (after withWorkspace completes)
await fastify.valkey.publish(`run:${runId}`, JSON.stringify({
  type: "run_update",
  runId,
  stats: stats[0],
  updatedItem: { id: itemId, status, testCaseTitle },
}))
```

### Pattern 3: Browser SSE with Direct API Connection

**What:** EventSource connecting directly to Railway API (bypasses Next.js gateway)
**When to use:** SSE endpoints only -- all other fetches still use /api/backend/ gateway
**Why:** Next.js Pages Router buffers res.write() on Vercel, making SSE impossible through the gateway

```typescript
// apps/web/src/hooks/useRunSSE.ts
import { useState, useEffect, useRef } from "react"

interface RunStats {
  pass: number; fail: number; blocked: number; skipped: number; untested: number; total: number
}

export function useRunSSE(runId: string, apiUrl: string, token: string | null) {
  const [stats, setStats] = useState<RunStats | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!runId || !token) return

    // Direct connection to Railway API -- NOT through /api/backend/ gateway
    // Auth token passed as query param since EventSource doesn't support custom headers
    const url = `${apiUrl}/api/workspaces/{wid}/runs/${runId}/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === "run_update") {
        setStats(data.stats)
      }
    }

    es.onerror = () => {
      // Browser auto-reconnects after ~3s by default
      // No manual retry logic needed for EventSource
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [runId, apiUrl, token])

  return stats
}
```

### Pattern 4: Keyboard Execution Handler

**What:** Global keydown listener for P/F/B/S that respects active form elements
**When to use:** Full-screen execution page only

```typescript
// apps/web/src/hooks/useKeyboardExecution.ts
import { useEffect, useCallback } from "react"

type Verdict = "pass" | "fail" | "blocked" | "skipped"

const KEY_MAP: Record<string, Verdict> = {
  p: "pass", P: "pass",
  f: "fail", F: "fail",
  b: "blocked", B: "blocked",
  s: "skipped", S: "skipped",
}

export function useKeyboardExecution(
  onVerdict: (verdict: Verdict) => void,
  enabled: boolean
) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return

    // Don't fire when user is typing in an input, textarea, or contenteditable
    const tag = (e.target as HTMLElement).tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
    if ((e.target as HTMLElement).isContentEditable) return

    const verdict = KEY_MAP[e.key]
    if (verdict) {
      e.preventDefault()
      onVerdict(verdict)
    }
  }, [onVerdict, enabled])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])
}
```

### Pattern 5: Computed Run Status

**What:** Run status derived from run_items aggregate, never written directly
**When to use:** After every run_item status change

```sql
-- Compute run status from items
-- active = has untested items remaining
-- completed = all items have a verdict (no untested)
-- aborted = manually set via separate endpoint

UPDATE test_runs
SET status = CASE
  WHEN (SELECT COUNT(*) FILTER (WHERE status = 'untested') FROM run_items WHERE run_id = $1) = 0
    THEN 'completed'::run_status
  ELSE 'active'::run_status
END,
completed_at = CASE
  WHEN (SELECT COUNT(*) FILTER (WHERE status = 'untested') FROM run_items WHERE run_id = $1) = 0
    THEN NOW()
  ELSE NULL
END,
updated_at = NOW()
WHERE id = $1
```

### Anti-Patterns to Avoid
- **Proxying SSE through Next.js gateway:** Pages Router buffers `res.write()` on Vercel. SSE will appear to hang with no events delivered until the connection times out.
- **Using the shared Valkey connection as a subscriber:** iovalkey (like ioredis) enters "subscriber mode" when you call `.subscribe()` -- the connection can ONLY receive pub/sub messages after that. Always create a new connection per subscriber.
- **Storing run.status as a writable column:** Must be computed from run_items aggregate. A directly writable status column will inevitably drift from reality.
- **Using `document.onkeydown` without element guard:** Will fire P/F/B/S while user types in comment textarea.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE reconnection | Custom retry logic with fetch | Browser EventSource API | Built-in auto-reconnect with Last-Event-ID, 3s default retry, exponential backoff on repeated failures |
| UUID generation | Math.random-based IDs | uuidv7 (already in stack) | Time-sortable, globally unique, already used throughout codebase |
| Form validation | Manual if/else checks | zod (already in stack) | Schema composition, TypeScript type inference |
| CSS variants | Conditional className strings | CVA + clsx (already in stack) | Type-safe variant API, consistent with existing components |

## Common Pitfalls

### Pitfall 1: SSE Through Next.js Pages Router on Vercel
**What goes wrong:** SSE events never reach the browser. Connection appears to hang, then timeout.
**Why it happens:** Vercel's serverless runtime and Next.js Pages Router buffer `res.write()` until `res.end()`. The chunks are never streamed incrementally.
**How to avoid:** Browser EventSource connects directly to the Railway API URL, not through `/api/backend/`. Only SSE endpoints need this -- all other API calls continue using the gateway.
**Warning signs:** SSE works locally but not on Vercel deployment. Events arrive all at once when connection closes.

### Pitfall 2: Valkey Subscriber Connection Leak
**What goes wrong:** Memory usage grows linearly with connections. After many SSE connects/disconnects, Valkey connection pool is exhausted.
**Why it happens:** Each SSE connection creates a dedicated iovalkey subscriber. If `request.raw.on('close')` cleanup fails to fire or `sub.quit()` is not called, the connection leaks.
**How to avoid:** Always clean up in the close handler. Add a safety timeout (e.g., 30min max connection) that kills the subscriber. Log subscriber creation/destruction counts.
**Warning signs:** Railway logs show increasing "connected clients" in Valkey. Health endpoint starts reporting degraded.

### Pitfall 3: Railway Proxy Timeout on Idle SSE
**What goes wrong:** SSE connection drops after ~60s of no activity, browser reconnects, cycle repeats.
**Why it happens:** Railway's proxy expects regular data flow. Idle connections are assumed dead.
**How to avoid:** Send a heartbeat comment (`: heartbeat\n\n`) every 20 seconds. SSE spec defines comments (lines starting with `:`) as no-ops -- EventSource ignores them but they keep the connection alive.
**Warning signs:** Clients reconnect every ~60s. Server logs show repeated subscribe/unsubscribe cycles.

### Pitfall 4: CORS for Direct API Connection
**What goes wrong:** Browser blocks EventSource to Railway API with CORS error.
**Why it happens:** EventSource from Vercel origin to Railway origin is cross-origin. The existing CORS config already allows the Vercel origin, but EventSource does NOT send custom headers -- it uses cookies or query params for auth.
**How to avoid:** Ensure CORS config allows the Vercel origin (already does). Pass auth token as query parameter since EventSource API does not support custom headers. Add query-param token extraction to session plugin for SSE routes only.
**Warning signs:** Console shows "Access-Control-Allow-Origin" errors on the EventSource connection.

### Pitfall 5: Keyboard Shortcuts Fire During Text Input
**What goes wrong:** User types "pass" in comment textarea and the "p" keystroke triggers a Pass verdict.
**Why it happens:** Global keydown listener without checking activeElement.
**How to avoid:** Check `e.target.tagName` -- skip if INPUT, TEXTAREA, SELECT, or contentEditable. Only listen for keyboard shortcuts when no form element is focused.
**Warning signs:** Random verdicts while typing comments.

### Pitfall 6: Run Item Snapshot vs Live Case Data
**What goes wrong:** Test case is edited after run creation, but run shows new version.
**Why it happens:** Run items reference test_case_id directly. If queries join to live test_cases table, edits affect in-progress runs.
**How to avoid:** On run creation, snapshot the case title and steps into the run_items or a separate snapshot. Alternatively, always use the test case data as-of the run's created_at. Simplest approach: store title on run_items and fetch steps at execution time (steps rarely change mid-run).
**Warning signs:** Editing a test case title changes the title shown in an already-running run.

### Pitfall 7: reply.send() Inside withWorkspace
**What goes wrong:** Response is sent before transaction commits. If transaction rolls back, client already has stale data.
**Why it happens:** Calling reply.send() inside the withWorkspace callback.
**How to avoid:** Return data from withWorkspace, then call reply.send() after. Already documented in CLAUDE.md.

## Code Examples

### Run Creation with Case Snapshot

```typescript
// POST /api/workspaces/:workspaceId/runs
// Creates a test run and snapshots all matching cases into run_items

const run = await withWorkspace(workspaceId, async (tx) => {
  // Insert the run
  const [newRun] = await tx`
    INSERT INTO test_runs (id, workspace_id, project_id, name, status, assigned_to, created_by, started_at)
    VALUES (${uuidv7()}, ${workspaceId}, ${projectId}, ${name}, 'active', ${assignedTo}, ${userId}, NOW())
    RETURNING *
  `

  // Get cases from selected suites (or all project cases)
  const cases = suiteIds.length > 0
    ? await tx`
        SELECT id, title FROM test_cases
        WHERE project_id = ${projectId}
          AND suite_id = ANY(${suiteIds}::uuid[])
          AND deleted_at IS NULL
        ORDER BY position
      `
    : await tx`
        SELECT id, title FROM test_cases
        WHERE project_id = ${projectId}
          AND deleted_at IS NULL
        ORDER BY suite_id NULLS LAST, position
      `

  // Snapshot cases into run_items
  if (cases.length > 0) {
    const values = cases.map((c: { id: string }) => ({
      id: uuidv7(),
      workspace_id: workspaceId,
      run_id: newRun.id,
      test_case_id: c.id,
      status: "untested",
    }))

    // Batch insert run_items
    await tx`
      INSERT INTO run_items ${tx(values, "id", "workspace_id", "run_id", "test_case_id", "status")}
    `
  }

  return { ...newRun, item_count: cases.length }
})

reply.status(201).send(run)
```

### Rerun Failures Flow

```typescript
// POST /api/workspaces/:workspaceId/runs/:runId/rerun-failures
// Creates a new run containing only the failed items from the source run

const newRun = await withWorkspace(workspaceId, async (tx) => {
  // Get failed items from source run
  const failedItems = await tx`
    SELECT ri.test_case_id
    FROM run_items ri
    WHERE ri.run_id = ${sourceRunId}
      AND ri.status = 'fail'
  `

  if (failedItems.length === 0) {
    throw { statusCode: 400, message: "No failed items to rerun" }
  }

  // Get source run metadata
  const [sourceRun] = await tx`
    SELECT name, project_id FROM test_runs WHERE id = ${sourceRunId}
  `

  // Create new run
  const [run] = await tx`
    INSERT INTO test_runs (id, workspace_id, project_id, name, status, assigned_to, created_by, started_at)
    VALUES (
      ${uuidv7()}, ${workspaceId}, ${sourceRun.project_id},
      ${`Rerun: ${sourceRun.name}`}, 'active', ${userId}, ${userId}, NOW()
    )
    RETURNING *
  `

  // Snapshot failed cases into new run_items
  const values = failedItems.map((fi: { test_case_id: string }) => ({
    id: uuidv7(),
    workspace_id: workspaceId,
    run_id: run.id,
    test_case_id: fi.test_case_id,
    status: "untested",
  }))

  await tx`
    INSERT INTO run_items ${tx(values, "id", "workspace_id", "run_id", "test_case_id", "status")}
  `

  return { ...run, item_count: failedItems.length }
})

reply.status(201).send(newRun)
```

### Execution History Query

```typescript
// GET /api/workspaces/:workspaceId/test-cases/:caseId/history
// Returns execution history for a test case across all runs

const history = await withWorkspace(workspaceId, async (tx) => {
  return tx`
    SELECT
      ri.id AS run_item_id,
      ri.status,
      ri.comment,
      ri.executed_at,
      tr.id AS run_id,
      tr.name AS run_name,
      tr.created_at AS run_created_at,
      u.name AS executed_by_name
    FROM run_items ri
    JOIN test_runs tr ON tr.id = ri.run_id
    LEFT JOIN users u ON u.id = ri.executed_by
    WHERE ri.test_case_id = ${caseId}
    ORDER BY ri.executed_at DESC NULLS LAST
    LIMIT 50
  `
})
```

### SSE Auth via Query Parameter

```typescript
// In session plugin or SSE route, extract token from query param
// EventSource API does not support custom headers

fastify.get("/api/workspaces/:workspaceId/runs/:runId/stream", async (request, reply) => {
  // For SSE, accept token from query param (EventSource can't set headers)
  const queryToken = (request.query as { token?: string }).token
  if (queryToken && !request.userId) {
    // Manually decode the token (same logic as session plugin)
    // This is needed because EventSource doesn't send Authorization header
    // ... decode queryToken and set request.userId, request.workspaceId
  }
  // ... rest of SSE handler
})
```

## Schema Changes Required

### New Table: run_item_step_comments

TR-04 requires step-level comments during execution. The current schema has `run_items.comment` for case-level comments, but step annotations need their own table.

```sql
CREATE TABLE run_item_step_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_item_id UUID NOT NULL REFERENCES run_items(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,  -- references test_case_steps.step_order
  comment TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE run_item_step_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_item_step_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON run_item_step_comments
  USING (workspace_id::text = current_setting('app.workspace_id', true));
```

### Optional: Snapshot title on run_items

Consider adding a `case_title` column to run_items to snapshot the title at run creation time:

```sql
ALTER TABLE run_items ADD COLUMN case_title VARCHAR(500);
```

This prevents a title change on the test case from affecting an in-progress run's display.

## SSE Architecture Deep Dive

### Direct Connection Architecture

```
Browser (Vercel)                    Railway API
┌─────────────┐                    ┌─────────────┐
│ EventSource ├───── HTTPS ────────│ GET /stream  │
│ (direct)    │    (cross-origin)  │ reply.hijack │
└─────────────┘                    └──────┬───────┘
                                          │
                                   ┌──────┴───────┐
                                   │ iovalkey sub  │
                                   │ (dedicated)   │
                                   └──────┬───────┘
                                          │ subscribe
                                   ┌──────┴───────┐
                                   │   Valkey      │
                                   │ channel:      │
                                   │ run:{runId}   │
                                   └──────┬───────┘
                                          │ publish
                                   ┌──────┴───────┐
                                   │ PATCH handler │
                                   │ (run-items)   │
                                   └──────────────┘
```

### Auth for EventSource

EventSource does not support custom headers. Options:
1. **Query parameter token** -- pass the session JWT as `?token=xxx`. Simple, but token appears in server logs and browser history. Acceptable for internal tool.
2. **Cookie-based auth** -- requires `withCredentials: true` on EventSource AND Railway CORS to allow credentials. More complex but cleaner.

**Recommendation:** Use query parameter token. It is simpler, and the session token is already short-lived (JWT with expiry). For an internal QA tool, the security tradeoff is acceptable.

### Extracting Token for SSE on Frontend

The session token needs to be passed from getServerSideProps to the client for direct API connection:

```typescript
// In getServerSideProps for runs pages:
const token = context.req.cookies["__Secure-authjs.session-token"]
  ?? context.req.cookies["authjs.session-token"]

return {
  props: {
    slug, projectKey, workspaceId, projectId,
    apiUrl: process.env.API_URL,  // Railway URL
    sseToken: token ?? null,      // For direct EventSource connection
  }
}
```

## Time-to-Complete Estimation

### Algorithm: Exponential Moving Average (EMA)

**Recommendation:** Use EMA with alpha=0.3 for responsive estimation that weighs recent cases more heavily.

```typescript
function estimateTimeRemaining(
  executedItems: Array<{ executed_at: string }>,
  totalItems: number,
  startedAt: string
): number | null {
  const executed = executedItems.filter(i => i.executed_at).length
  if (executed < 2) return null // Need at least 2 data points

  // Sort by execution time
  const sorted = executedItems
    .filter(i => i.executed_at)
    .sort((a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime())

  // Calculate inter-case durations
  const durations: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const delta = new Date(sorted[i].executed_at).getTime() - new Date(sorted[i-1].executed_at).getTime()
    if (delta > 0 && delta < 300_000) { // Ignore gaps > 5min (breaks)
      durations.push(delta)
    }
  }

  if (durations.length === 0) return null

  // EMA with alpha=0.3
  let ema = durations[0]
  for (let i = 1; i < durations.length; i++) {
    ema = 0.3 * durations[i] + 0.7 * ema
  }

  const remaining = totalItems - executed
  return Math.round(ema * remaining) // milliseconds
}
```

**Why EMA over simple average:** If a tester speeds up (gets familiar with cases) or slows down (encounters complex cases), EMA adapts. Simple average is dominated by early outliers.

**Edge cases:**
- Fewer than 2 executed items: return null (show "Estimating..." in UI)
- Gaps > 5 minutes between cases: exclude from average (tester took a break)
- All cases completed: return 0

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebSocket for real-time | SSE for server-to-client push | Always -- SSE is better for unidirectional updates | Simpler server, auto-reconnect, works through most proxies |
| Polling for dashboard updates | SSE + pub/sub fan-out | -- | Real-time without polling overhead |
| @fastify/sse plugin | reply.hijack() + reply.raw | Plugin v0.4.0 is very new | Raw approach is more battle-tested, fewer moving parts |
| ioredis for Valkey | iovalkey | 2024 | License-safe Valkey client, API-compatible with ioredis |

## Open Questions

1. **Cookie-based vs query-param auth for EventSource**
   - What we know: EventSource doesn't support custom headers. Query param is simpler. Cookie requires `withCredentials` and CORS credentials.
   - What's unclear: Whether Railway's CORS proxy supports `Access-Control-Allow-Credentials` properly.
   - Recommendation: Start with query parameter. If security review flags it, switch to cookie-based.

2. **Run item case_title snapshot**
   - What we know: Without snapshotting, editing a test case changes display in running runs.
   - What's unclear: Whether users actually edit cases while runs are active (solo QA workflow).
   - Recommendation: Add `case_title` to run_items now. It's a simple column and prevents subtle bugs later.

3. **Maximum SSE connection duration**
   - What we know: Long-lived SSE connections on Railway may eventually be killed by load balancer resets (typically 1-2 hours).
   - What's unclear: Railway's exact timeout for long-lived connections.
   - Recommendation: Client EventSource auto-reconnects. Add `id:` field to SSE events so Last-Event-ID works on reconnect. Server sends full state on connect (not just deltas).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && pnpm test` |
| Full suite command | `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TR-01 | Create run with case snapshot | integration | `cd apps/api && npx vitest run src/routes/__tests__/runs.test.ts -t "create run"` | No -- Wave 0 |
| TR-02 | Execute run item P/F/B/S | integration | `cd apps/api && npx vitest run src/routes/__tests__/run-items.test.ts -t "execute"` | No -- Wave 0 |
| TR-03 | Keyboard shortcuts | unit (frontend) | `cd apps/web && npx vitest run src/hooks/__tests__/useKeyboardExecution.test.ts` | No -- Wave 0 |
| TR-04 | Step-level comments | integration | `cd apps/api && npx vitest run src/routes/__tests__/run-items.test.ts -t "step comment"` | No -- Wave 0 |
| TR-05 | File defect from run item | integration | `cd apps/api && npx vitest run src/routes/__tests__/defects.test.ts` | No -- Wave 0 |
| TR-06 | Execution history | integration | `cd apps/api && npx vitest run src/routes/__tests__/runs.test.ts -t "history"` | No -- Wave 0 |
| TR-07 | Rerun failures | integration | `cd apps/api && npx vitest run src/routes/__tests__/runs.test.ts -t "rerun"` | No -- Wave 0 |
| DA-01 | SSE stream delivers events | integration | `cd apps/api && npx vitest run src/routes/__tests__/runs.test.ts -t "SSE"` | No -- Wave 0 |
| DA-02 | Stats computation (pass rate, ETA) | unit | `cd apps/api && npx vitest run src/lib/__tests__/run-stats.test.ts` | No -- Wave 0 |
| DA-03 | Filter runs by assignee/status | integration | `cd apps/api && npx vitest run src/routes/__tests__/runs.test.ts -t "filter"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && pnpm test`
- **Per wave merge:** `pnpm --recursive lint && pnpm --recursive typecheck && cd apps/api && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/routes/__tests__/runs.test.ts` -- covers TR-01, TR-06, TR-07, DA-01, DA-03
- [ ] `apps/api/src/routes/__tests__/run-items.test.ts` -- covers TR-02, TR-04
- [ ] `apps/api/src/routes/__tests__/defects.test.ts` -- covers TR-05
- [ ] `apps/api/src/lib/__tests__/run-stats.test.ts` -- covers DA-02
- [ ] `apps/web/src/hooks/__tests__/useKeyboardExecution.test.ts` -- covers TR-03
- [ ] Migration file for `run_item_step_comments` table
- [ ] Migration file for `run_items.case_title` column (if adopted)

## Sources

### Primary (HIGH confidence)
- Fastify 5.8.x official docs -- reply.hijack() and reply.raw documentation (https://fastify.dev/docs/latest/Reference/Reply/)
- iovalkey GitHub -- pub/sub API compatible with ioredis, subscriber mode behavior (https://github.com/valkey-io/iovalkey)
- MDN EventSource docs -- reconnection behavior, Last-Event-ID, retry field (https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- HTML Living Standard -- SSE specification (https://html.spec.whatwg.org/multipage/server-sent-events.html)
- Existing codebase -- schema.ts, valkey.ts, tenant.ts, session.plugin.ts, [...path].ts gateway

### Secondary (MEDIUM confidence)
- Next.js GitHub Discussion #48427 -- Pages Router cannot stream SSE on Vercel, confirmed by multiple users and Vercel team (https://github.com/vercel/next.js/discussions/48427)
- Liran Tal blog -- Fastify reply.raw SSE pattern (https://lirantal.com/blog/avoid-fastify-reply-raw-and-reply-hijack-despite-being-a-powerful-http-streams-tool)
- @fastify/sse npm v0.4.0 -- official plugin exists but very new (https://www.npmjs.com/package/@fastify/sse)

### Tertiary (LOW confidence)
- Railway proxy timeout behavior -- assumed ~60s based on common proxy defaults; needs testing on actual Railway deployment

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies needed
- Architecture: HIGH -- SSE with reply.hijack() is well-documented in Fastify 5 docs; Pages Router SSE limitation confirmed by Next.js team
- Pitfalls: HIGH -- SSE proxy limitation verified from multiple sources; Valkey subscriber pattern from ioredis/iovalkey documentation
- Schema changes: MEDIUM -- run_item_step_comments table design is straightforward but needs migration testing

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable technologies, no fast-moving dependencies)
