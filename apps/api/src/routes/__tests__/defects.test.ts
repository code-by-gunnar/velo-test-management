import { describe, it } from "vitest"

// TR-05: File defect from failed run item
describe("POST /api/workspaces/:wid/defects", () => {
  it.todo("creates a local defect record linked to a run_item_id")
  it.todo("stores title and optional description")
  it.todo("returns 400 when run_item_id is missing")
  it.todo("returns 400 when title is missing")
})

describe("GET /api/workspaces/:wid/defects", () => {
  it.todo("returns defects for the workspace, optionally filtered by run_item_id")
})
