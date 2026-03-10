import { describe, it } from "vitest"

// TR-01: Create run with case snapshot
describe("POST /api/workspaces/:wid/runs", () => {
  it.todo("creates a run with name, project_id, assigned_to and status='active'")
  it.todo("snapshots matching test cases into run_items with status='untested'")
  it.todo("snapshots case_title on each run_item from test_cases.title at creation time")
  it.todo("scopes to selected suite_ids when provided")
  it.todo("includes all project cases when no suite_ids provided")
  it.todo("returns 400 when no test cases match the scope")
})

// TR-01 + DA-03: List runs with filters
describe("GET /api/workspaces/:wid/runs", () => {
  it.todo("returns runs for the project with item counts and stats")
  it.todo("filters by status query param")
  it.todo("filters by assigned_to query param")
  it.todo("does NOT return runs from a different workspace (RLS isolation)")
})

// TR-06: Execution history for a test case
describe("GET /api/workspaces/:wid/test-cases/:caseId/history", () => {
  it.todo("returns run_items for the case across all runs, ordered by executed_at DESC")
  it.todo("includes run name and executor name in each history entry")
})

// TR-07: Rerun failures
describe("POST /api/workspaces/:wid/runs/:runId/rerun-failures", () => {
  it.todo("creates a new run containing only failed items from source run")
  it.todo("new run name is prefixed with 'Rerun: '")
  it.todo("returns 400 when source run has no failed items")
})

// DA-01: SSE stream
describe("GET /api/workspaces/:wid/runs/:runId/stream (SSE)", () => {
  it.todo("returns Content-Type: text/event-stream")
  it.todo("sends initial stats event on connection")
  it.todo("receives update event when a run_item status changes via Valkey pub/sub")
})

// Run detail + abort
describe("GET /api/workspaces/:wid/runs/:runId", () => {
  it.todo("returns run metadata with computed stats (pass/fail/blocked/skipped/untested counts)")
  it.todo("returns 404 for non-existent run")
})

describe("PATCH /api/workspaces/:wid/runs/:runId/abort", () => {
  it.todo("sets run status to 'aborted' and completed_at to NOW()")
  it.todo("returns 400 if run is already completed or aborted")
})
