import { describe, it } from "vitest"

// Ingestion routes will be implemented in plan 04-03
// import { buildApp } from "../../server.js"

describe("POST /ingest/junit", () => {
  // IN-01: JUnit XML ingestion endpoint
  // IN-04: R2 raw payload storage

  it.todo("creates run + run_items from JUnit XML")

  it.todo("auto-maps results to existing test cases by name")

  it.todo("creates orphan run_items with null test_case_id for unmatched cases")

  it.todo("uploads raw payload to R2 before parsing")

  it.todo("returns 401 without API key")

  it.todo("returns 403 with invalid API key")
})

describe("POST /ingest/allure", () => {
  // IN-02: Allure JSON ingestion endpoint
  // IN-04: R2 raw payload storage

  it.todo("creates run + run_items from Allure JSON")

  it.todo("uploads raw JSON to R2")
})

describe("GET /ingestion-runs/:id/payload", () => {
  // IN-04: Presigned R2 URL for raw payload retrieval

  it.todo("returns presigned R2 URL for raw payload")
})
