import { describe, it } from "vitest"

// API key routes will be implemented in plan 04-03
// import { buildApp } from "../../server.js"

describe("API Keys CRUD", () => {
  // IN-01: API key authentication for CI ingestion

  it.todo("POST creates key and returns raw key once")

  it.todo("GET lists keys without exposing hash")

  it.todo("DELETE revokes key by setting revoked_at")

  it.todo("revoked key returns 403 on ingestion attempt")
})
