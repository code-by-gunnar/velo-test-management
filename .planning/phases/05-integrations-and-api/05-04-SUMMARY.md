---
phase: 05-integrations-and-api
plan: 04
subsystem: webhooks
tags: [linear-sync, webhooks, bullmq, hmac, sse]
dependency_graph:
  requires: [05-03, 05-01]
  provides: [linear-inbound-webhook, outbound-webhooks, webhook-crud]
  affects: [run-items, runs, valkey-plugin, server]
tech_stack:
  added: []
  patterns: [hmac-sha256-signing, bullmq-webhook-queue, fire-and-forget-dispatch, public-webhook-endpoint]
key_files:
  created:
    - apps/api/src/routes/linear-webhook.ts
    - apps/api/src/routes/webhooks.ts
    - apps/api/src/queues/webhook.queue.ts
    - apps/api/src/queues/webhook.worker.ts
  modified:
    - apps/api/src/routes/linear.ts
    - apps/api/src/lib/linear-client.ts
    - apps/api/src/routes/run-items.ts
    - apps/api/src/routes/runs.ts
    - apps/api/src/plugins/valkey.plugin.ts
    - apps/api/src/server.ts
decisions:
  - Linear webhook receiver registered before session/auth plugins as separate route file
  - fireWebhookEvent uses bare sql for cross-workspace webhook lookup
  - Abort fires run.completed webhook with aborted=true flag
  - Webhook signing secret shown once at creation like API keys
metrics:
  tasks_completed: 4
  tasks_total: 4
  files_created: 4
  files_modified: 6
---

# Phase 5 Plan 4: Linear Status Sync + Outbound Webhooks Summary

Linear inbound webhook receiver updates defect external_status on issue state changes with HMAC-SHA256 verification and Valkey idempotency; outbound webhook system fires run_item.failed and run.completed events through BullMQ with 5-retry exponential backoff.

## Tasks Completed

| Task | Name | Files | Status |
|------|------|-------|--------|
| 1 | Linear inbound webhook receiver | linear-webhook.ts, linear.ts, linear-client.ts, server.ts | Done |
| 2 | Webhook CRUD routes | webhooks.ts, server.ts | Done |
| 3 | BullMQ webhook queue and worker | webhook.queue.ts, webhook.worker.ts, valkey.plugin.ts | Done |
| 4 | Hook webhook triggers into run-items and runs | run-items.ts, runs.ts | Done |

## What Was Built

### Linear Inbound Webhook Receiver (Task 1)
- `POST /api/webhooks/linear` -- public endpoint, no auth required
- HMAC-SHA256 signature verification using stored webhook_signing_secret from linear_connections
- Looks up connection by organizationId from payload (bare sql, no RLS needed)
- Handles Issue update: finds defect by external_id, updates external_status
- Handles Issue remove: sets external_status to "Deleted"
- Idempotency: stores webhookId:deliveryId in Valkey with 24h TTL
- SSE publish to run channel when defect linked to a run_item
- Webhook registered with Linear during OAuth callback (non-fatal on failure)

### Webhook CRUD Routes (Task 2)
- `POST /projects/:projectId/webhooks` -- create with auto-generated HMAC secret (shown once)
- `GET /projects/:projectId/webhooks` -- list without secrets
- `PATCH /projects/:projectId/webhooks/:webhookId` -- update endpoint_url, events, active
- `DELETE /projects/:projectId/webhooks/:webhookId` -- delete
- `POST /projects/:projectId/webhooks/:webhookId/test` -- test ping with HMAC signing, 10s timeout
- Valid events: run.completed, run_item.failed
- All routes auth-guarded + withWorkspace

### BullMQ Webhook Queue and Worker (Task 3)
- webhookQueue: 5 attempts, exponential backoff (3s base), removeOnComplete 500, removeOnFail 1000
- webhookWorker: HMAC-SHA256 signing, X-Velo-Signature/Event/Delivery headers, 10s timeout, concurrency 10
- fireWebhookEvent(): queries active webhooks for project + workspace-level (project_id IS NULL), enqueues one job per match
- Registered in valkey.plugin.ts with graceful shutdown

### Webhook Triggers (Task 4)
- run-items.ts: fires run_item.failed on fail verdict (after withWorkspace, fire-and-forget)
- run-items.ts: fires run.completed when last item receives verdict (untested count = 0)
- runs.ts: fires run.completed on explicit abort (with aborted=true flag)
- All webhook calls are fire-and-forget with .catch(() => {})

## Architecture Decisions

1. **Separate route file for Linear webhook** -- linear-webhook.ts registered before session/auth plugins so the public endpoint doesn't go through auth hooks. This is cleaner than trying to bypass auth within the linearRoutes plugin.

2. **bare sql for fireWebhookEvent** -- Webhook matching needs to query across workspace context without RLS. Uses bare sql from db/client.ts directly.

3. **Abort fires run.completed** -- When a run is explicitly aborted, the run.completed webhook fires with an `aborted: true` flag so consumers can distinguish between natural completion and abort.

4. **Run completion detected in run-items.ts** -- After each verdict, stats are computed within the transaction. If untested count drops to 0, the run auto-completes and the webhook fires.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript compilation: PASS (npx tsc --noEmit)
- Tests: 149 passed, 37 todo/skipped, 0 failed
