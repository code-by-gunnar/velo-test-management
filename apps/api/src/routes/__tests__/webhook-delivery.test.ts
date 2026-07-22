import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import crypto from "node:crypto"
import { uuidv7 } from "uuidv7"

// INT-04: outbound webhook delivery — event dispatch (subscription filtering),
// HMAC signing, and retry semantics. `fireWebhookEvent` enqueues; `deliverWebhook`
// (extracted from the BullMQ worker) does the signed, SSRF-safe POST.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379"

// Mock the SSRF layer so deliverWebhook doesn't make a real network call.
vi.mock("../../lib/ssrf.js", () => ({
  safeFetch: vi.fn(),
  SsrfError: class SsrfError extends Error {},
  isPrivateUrl: vi.fn(() => false),
}))

const ssrf = await import("../../lib/ssrf.js")
const safeFetch = ssrf.safeFetch as unknown as ReturnType<typeof vi.fn>
const { deliverWebhook } = await import("../../lib/webhook-delivery.js")
const { fireWebhookEvent, webhookQueue } = await import("../../queues/webhook.queue.js")
const sql = (await import("../../db/client.js")).sql

describe("Webhook delivery (INT-04)", () => {
  const wsId = uuidv7()
  const projectId = uuidv7()
  const webhookId = uuidv7()
  const secret = "whsec_test_secret"
  const stamp = Date.now()
  const add = () => vi.mocked(webhookQueue.add)

  beforeAll(async () => {
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${wsId}::uuid, 'WH WS', ${`wh-${stamp}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${wsId}::uuid, 'WH Project', 'whp')`
    // Subscribed to run.completed + run_item.failed only (NOT run.created).
    await sql`INSERT INTO webhooks (id, workspace_id, project_id, endpoint_url, secret, events, active)
      VALUES (${webhookId}::uuid, ${wsId}::uuid, ${projectId}::uuid, 'https://example.test/hook',
              ${secret}, ${sql.array(["run.completed", "run_item.failed"])}, true)`

    // Intercept enqueue so no real BullMQ job is created.
    vi.spyOn(webhookQueue, "add").mockResolvedValue({ id: "job-1" } as never)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await webhookQueue.close()
    await sql`DELETE FROM webhooks WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM projects WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${wsId}::uuid`
    await sql.end()
  })

  it("fires run.completed to a subscribed webhook", async () => {
    add().mockClear()
    await fireWebhookEvent(wsId, projectId, "run.completed", { runId: "r1" })
    expect(add()).toHaveBeenCalledTimes(1)
    const jobData = add().mock.calls[0]![1]
    expect(jobData.event).toBe("run.completed")
    expect(jobData.webhookId).toBe(webhookId)
    expect(jobData.secret).toBe(secret)
  })

  it("fires run_item.failed to a subscribed webhook", async () => {
    add().mockClear()
    await fireWebhookEvent(wsId, projectId, "run_item.failed", { runItemId: "ri1" })
    expect(add()).toHaveBeenCalledTimes(1)
    expect(add().mock.calls[0]![1].event).toBe("run_item.failed")
  })

  it("does not fire for an unsubscribed event type", async () => {
    add().mockClear()
    await fireWebhookEvent(wsId, projectId, "run.created", { runId: "r2" })
    expect(add()).not.toHaveBeenCalled()
  })

  it("signs the payload with HMAC-SHA256 over the webhook secret", async () => {
    safeFetch.mockResolvedValueOnce({ status: 200 })
    const payload = { runId: "r1", status: "completed" }
    await deliverWebhook({ data: { webhookId, endpointUrl: "https://example.test/hook", secret, event: "run.completed", payload }, id: "job-42" })

    expect(safeFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = safeFetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }]
    expect(url).toBe("https://example.test/hook")
    const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex")
    expect(opts.headers["X-Velo-Signature"]).toBe(`sha256=${expected}`)
    expect(opts.headers["X-Velo-Event"]).toBe("run.completed")
    expect(opts.headers["X-Velo-Delivery"]).toBe("job-42")
  })

  it("rethrows on a failure response so BullMQ retries (queue: 5 attempts, exponential backoff)", async () => {
    safeFetch.mockResolvedValueOnce({ status: 500 })
    await expect(
      deliverWebhook({ data: { webhookId, endpointUrl: "https://example.test/hook", secret, event: "run.completed", payload: {} }, id: "job-err" })
    ).rejects.toThrow(/HTTP 500/)

    // The retry policy that makes the rethrow meaningful lives on the queue.
    const opts = webhookQueue.opts.defaultJobOptions
    expect(opts?.attempts).toBe(5)
    expect(opts?.backoff).toMatchObject({ type: "exponential", delay: 3000 })
  })
})
