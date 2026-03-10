import { describe, it } from "vitest"

// ── Webhook CRUD ──────────────────────────────────────────────────────────────

describe("Webhook CRUD", () => {
  it.todo("POST creates webhook with endpoint, events, and auto-generated secret") // INT-04
  it.todo("GET lists webhooks for project") // INT-04
  it.todo("PATCH updates endpoint or events") // INT-04
  it.todo("DELETE removes webhook") // INT-04
  it.todo("POST /test sends test payload to endpoint") // INT-04
})

// ── Webhook Delivery ──────────────────────────────────────────────────────────

describe("Webhook Delivery", () => {
  it.todo("fires run.completed webhook when run status changes to completed") // INT-04
  it.todo("fires run_item.failed webhook when verdict is fail") // INT-04
  it.todo("signs payload with HMAC-SHA256 using webhook secret") // INT-04
  it.todo("retries with exponential backoff on delivery failure") // INT-04
  it.todo("does not fire for unsubscribed event types") // INT-04
})
