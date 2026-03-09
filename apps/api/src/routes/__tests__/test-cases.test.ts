import { describe, it, expect } from "vitest"

// TC-01: Create + retrieve test cases
describe("POST /api/workspaces/:wid/projects/:pid/cases", () => {
  it.todo("creates a test case with title, preconditions, priority, and steps in one transaction")
  it.todo("steps are stored in test_case_steps with correct step_order")
  it.todo("returns 403 when test_cases count >= 500 (Free tier limit)")
})

describe("GET /api/workspaces/:wid/projects/:pid/cases", () => {
  it.todo("returns only cases where deleted_at IS NULL")
  it.todo("returns only cases from the requesting workspace (RLS isolation)")
  it.todo("filters by suite_id when query param provided")
})

describe("PUT /api/workspaces/:wid/projects/:pid/cases/:id", () => {
  it.todo("replaces steps by deleting all existing and inserting new in same transaction")
})

describe("DELETE /api/workspaces/:wid/projects/:pid/cases/:id", () => {
  it.todo("sets deleted_at = NOW(), does not hard delete")
})

// TC-04: Drag-drop position reorder
describe("PATCH /api/workspaces/:wid/projects/:pid/cases/:id/position", () => {
  it.todo("updates a single test_case row position without touching other rows")
  it.todo("when gap collapses, renumber all cases in suite starting at 1000 increments")
})

// TC-05: Bulk move and copy
describe("POST /api/workspaces/:wid/projects/:pid/cases/bulk", () => {
  it.todo("action=move: updates suite_id for all selected case IDs")
  it.todo("action=copy: creates new test_case rows with new UUIDs in target suite")
  it.todo("action=copy: copies all test_case_steps with correct new test_case_id references")
  it.todo("copied cases have correct step_order and 0 orphaned steps")
})
