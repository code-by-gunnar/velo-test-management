import { describe, it } from "vitest"

// TR-02: Execute run item (mark verdict)
describe("PATCH /api/workspaces/:wid/run-items/:itemId", () => {
  it.todo("updates run_item status to 'pass' and sets executed_by + executed_at")
  it.todo("updates run_item status to 'fail'")
  it.todo("updates run_item status to 'blocked'")
  it.todo("updates run_item status to 'skipped'")
  it.todo("recomputes run status to 'completed' when all items have verdicts")
  it.todo("keeps run status as 'active' when untested items remain")
  it.todo("publishes run_update to Valkey channel run:{runId}")
  it.todo("returns 400 for invalid status value")
})

// TR-04: Case-level comment
describe("PATCH /api/workspaces/:wid/run-items/:itemId/comment", () => {
  it.todo("sets the comment field on the run_item")
  it.todo("allows empty string to clear existing comment")
})

// TR-04: Step-level comment
describe("POST /api/workspaces/:wid/run-items/:itemId/step-comments", () => {
  it.todo("creates a run_item_step_comment with step_order and comment text")
  it.todo("returns 400 when step_order is missing")
})

describe("GET /api/workspaces/:wid/run-items/:itemId/step-comments", () => {
  it.todo("returns all step comments for the run_item ordered by step_order")
})
