---
phase: 04-notifications-verification
plan: 03
subsystem: api-tests
tags: [integration-tests, lifecycle, erasure, gdpr, vitest]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [lifecycle-tests, erasure-tests, ci-verification]
  affects: [apps/api]
tech_stack:
  added: []
  patterns: [fastify-inject, vi-mock, pipeline-mock]
key_files:
  created:
    - apps/api/src/routes/__tests__/lifecycle.test.ts
    - apps/api/src/routes/__tests__/erasure.test.ts
  modified: []
decisions: []
metrics:
  duration: 2m
  completed: "2026-03-12T13:15:30Z"
  tasks_completed: 3
  tasks_total: 3
---

# Phase 04 Plan 03: Integration Tests & CI Verification Summary

Integration tests for lifecycle and erasure GDPR routes with full CI verification passing.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Lifecycle route integration tests | 90f96a1 | apps/api/src/routes/__tests__/lifecycle.test.ts |
| 2 | Erasure route integration tests | 90f96a1 | apps/api/src/routes/__tests__/erasure.test.ts |
| 3 | Full CI verification | -- | lint + typecheck + test all green |

## What Was Built

### Lifecycle Tests (7 tests)
- Admin guard: rejects non-admin deletion request with 403
- Request deletion: admin gets 200, DB columns set, queue job enqueued
- Idempotency: duplicate request returns 409
- Status endpoint: any member can read deletion status
- Cancel deletion: admin clears all deletion columns, queue job removed
- Cancel guard: 409 when not pending
- Post-cancel: status returns null after cancellation

### Erasure Tests (6 tests)
- Request erasure: user gets 201, DB row created, lifecycle queue called, Valkey pipeline blocklist set
- Idempotency: duplicate request returns 409
- Status endpoint: returns has_pending_erasure=true with scheduled_at
- Cancel erasure: status set to cancelled, Valkey pipeline blocklist cleared
- Cancel guard: 404 when no pending erasure
- Post-cancel: has_pending_erasure=false after cancellation

### Mocking Strategy
- BullMQ lifecycle queue: add/getJob mocked with vi.fn()
- BullMQ email queue: add mocked
- Valkey: set/del/get/keys + pipeline (set/del/exec) mocked
- Email: sendLifecycleEmails mocked (fire-and-forget async, not asserted on response)
- Audit log: logAuditEvent mocked

### CI Results
- Lint: zero errors, zero warnings (apps/api + apps/web)
- Typecheck: zero errors (apps/api + apps/web)
- Tests: 18 files passed, 185 tests passed, 3 files skipped (linear, v1-api, webhooks -- pre-existing)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `pnpm --recursive lint` -- zero errors
- `pnpm --recursive typecheck` -- zero errors
- `cd apps/api && pnpm test` -- 18 files passed, 185 tests passed
- lifecycle.test.ts: 7 tests passing
- erasure.test.ts: 6 tests passing

## Self-Check: PASSED
