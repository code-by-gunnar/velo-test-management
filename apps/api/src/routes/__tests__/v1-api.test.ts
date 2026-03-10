import { describe, it } from "vitest"

// ── Unified Auth Middleware ───────────────────────────────────────────────────

describe("Unified Auth Middleware", () => {
  it.todo("accepts Auth.js session cookie") // INT-03
  it.todo("accepts API key Bearer token") // INT-03
  it.todo("returns 401 with no credentials") // INT-03
  it.todo("returns 403 with revoked API key") // INT-03
})

// ── /api/v1/ Routes ──────────────────────────────────────────────────────────

describe("/api/v1/ Routes", () => {
  it.todo("GET /api/v1/workspaces/:wid/projects lists projects via API key") // INT-03
  it.todo("PATCH /api/v1/workspaces/:wid/projects/:pid updates project") // INT-03
  it.todo("DELETE /api/v1/workspaces/:wid/projects/:pid soft-deletes project") // INT-03
  it.todo("GET /api/v1/workspaces/:wid/members lists workspace members") // INT-03
  it.todo("PATCH /api/v1/workspaces/:wid updates workspace settings") // INT-03
})

// ── Rate Limiting ─────────────────────────────────────────────────────────────

describe("Rate Limiting", () => {
  it.todo("allows requests under 100/min limit") // INT-03
  it.todo("returns 429 with Retry-After when rate exceeded") // INT-03
  it.todo("rate limit is per API key, not global") // INT-03
})
