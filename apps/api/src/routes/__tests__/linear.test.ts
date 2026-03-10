import { describe, it } from "vitest"

// ── Linear OAuth ──────────────────────────────────────────────────────────────

describe("Linear OAuth", () => {
  it.todo("GET /linear/auth returns redirect URL to Linear OAuth") // INT-01
  it.todo("GET /linear/callback exchanges code for tokens and stores connection") // INT-01
  it.todo("GET /linear/status returns connection status for workspace") // INT-01
  it.todo("DELETE /linear/disconnect removes connection") // INT-01
  it.todo("returns 409 if workspace already connected") // INT-01
})

// ── Linear Issue Creation ─────────────────────────────────────────────────────

describe("Linear Issue Creation", () => {
  it.todo("POST defect with Linear connected creates Linear issue and sets external_id/url") // INT-01
  it.todo("POST defect without Linear connected creates defect locally only") // INT-01
  it.todo("populates title from case name and description from defect body") // INT-01
})

// ── Linear Webhook Receiver ───────────────────────────────────────────────────

describe("Linear Webhook Receiver", () => {
  it.todo("POST /linear/webhook updates defect external_status on issue state change") // INT-02
  it.todo("rejects webhook with invalid signature") // INT-02
  it.todo("idempotency key prevents duplicate status updates") // INT-02
  it.todo("ignores webhook for unknown external_id") // INT-02
})
