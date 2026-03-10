---
phase: 03-test-runs-and-dashboard
plan: "04"
subsystem: api
tags: [sse, real-time, valkey, pub-sub, run-stats, da-01, da-02]
dependency_graph:
  requires: [03-02, 03-03]
  provides: [sse-stream-endpoint, run-stats-helpers]
  affects: [apps/api/src/routes/runs.ts, apps/api/src/plugins/session.plugin.ts]
tech_stack:
  added: [iovalkey-subscriber-per-connection, sse-heartbeat-20s]
  patterns: [fastify-reply-hijack, dedicated-subscriber-mode, ema-time-estimation]
key_files:
  created:
    - apps/api/src/lib/sse.ts
    - apps/api/src/lib/run-stats.ts
    - apps/api/src/lib/__tests__/run-stats.test.ts
  modified:
    - apps/api/src/routes/runs.ts
    - apps/api/src/plugins/session.plugin.ts
decisions:
  - "Dedicated iovalkey subscriber per SSE connection — subscriber mode locks the connection; cannot reuse shared valkey instance"
  - "reply.hijack() used so Fastify does not attempt to finalize the response after the handler returns"
  - "X-Accel-Buffering: no sent per-request via res.writeHead() to prevent Railway/nginx from buffering SSE frames"
  - "?token= query param accepted by session plugin for EventSource (cannot set custom headers)"
  - "Initial SSE event sends full run stats + EMA ETA so UI is populated immediately on connect"
metrics:
  duration: "~10 minutes"
  completed: "2026-03-10"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 2
requirements: [DA-01, DA-02]
---

# Phase 3 Plan 04: SSE Real-Time Stream and Run Stats Summary

SSE endpoint at GET /runs/:id/stream with dedicated iovalkey subscriber per connection, 20s heartbeat for Railway proxy, EMA-based time-to-complete estimation, and 10 unit tests for pure stat computation functions.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | SSE helper, run-stats module, SSE endpoint | 37b9765 | sse.ts, run-stats.ts, runs.ts (+SSE route), session.plugin.ts |
| 2 | Unit tests for run-stats (DA-02) | 85f73d5 | run-stats.test.ts (10 tests) |

## What Was Built

### apps/api/src/lib/sse.ts
Two exports:
- `writeSSEEvent(res, data, event?)` — writes `event:` + `data:` lines to raw ServerResponse
- `startHeartbeat(res, intervalMs)` — setInterval that writes `: heartbeat\n\n` every 20s

### apps/api/src/lib/run-stats.ts
Two pure functions with no DB or network dependencies:
- `computeRunStats(items)` — counts pass/fail/blocked/skipped/untested, computes `pass_rate = round(pass / executed * 100)` where `executed = total - untested`
- `estimateTimeRemaining(items, totalItems)` — EMA (alpha=0.3) over inter-case durations, excludes gaps > 5 minutes, returns null for < 2 data points, returns 0 when all items done

### GET /api/workspaces/:workspaceId/runs/:runId/stream
Full SSE lifecycle:
1. Auth guard (401/403)
2. UUID validation (400)
3. `res.writeHead(200, { Content-Type: text/event-stream, X-Accel-Buffering: no, ... })`
4. Fetch current run_items via withWorkspace → compute stats + ETA → writeSSEEvent (initial payload)
5. `new Valkey(VALKEY_URL)` dedicated subscriber → subscribe to `run:${runId}` channel
6. `sub.on("message")` forwards raw Valkey messages as SSE data frames
7. `startHeartbeat(res, 20_000)` — Railway proxy keep-alive
8. `request.raw.on("close")` cleanup — clearInterval + unsubscribe + quit

### session.plugin.ts
Added `?token=` query parameter extraction as a third fallback (after Bearer header and cookie). EventSource API in browsers cannot set custom headers, so the JWT must be passed via query string for SSE connections.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `pnpm --recursive typecheck` passes (all 0 errors)
- `npx vitest run src/lib/__tests__/run-stats.test.ts` — 10/10 tests pass
- SSE endpoint registered at GET /api/workspaces/:workspaceId/runs/:runId/stream
- Session plugin accepts ?token= query parameter
- sse.ts and run-stats.ts created as specified

## Self-Check: PASSED

- apps/api/src/lib/sse.ts — FOUND
- apps/api/src/lib/run-stats.ts — FOUND
- apps/api/src/lib/__tests__/run-stats.test.ts — FOUND
- Commit 37b9765 (feat) — FOUND
- Commit 85f73d5 (test) — FOUND
