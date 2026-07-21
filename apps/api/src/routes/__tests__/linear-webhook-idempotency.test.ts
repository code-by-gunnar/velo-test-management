import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import crypto from "node:crypto"
import type { Redis } from "iovalkey"

// VEL-69: the Linear webhook must mark a delivery "seen" only AFTER it has been
// processed successfully. Marking before processing meant a transient DB failure
// mid-update left the delivery flagged, so Linear's retries were dropped and the
// status sync was silently lost.
//
// This suite mocks db/client so processing (the defect UPDATE) fails on demand,
// letting us assert the ordering deterministically without a real DB.

const ORG_ID = "org-vel69"
const SECRET = "vel69-signing-secret"

// A tagged-template `sql` stub: the connection lookup succeeds; the defect
// UPDATE either succeeds or rejects depending on `failProcessing`.
let failProcessing = false
vi.mock("../../db/client.js", () => ({
  sql: (strings: TemplateStringsArray) => {
    const q = strings.join(" ")
    if (q.includes("FROM linear_connections")) {
      return Promise.resolve([
        { id: "conn-1", workspace_id: "00000000-0000-7000-8000-000000000001", webhook_signing_secret: SECRET },
      ])
    }
    if (q.includes("UPDATE defects")) {
      return failProcessing
        ? Promise.reject(new Error("transient DB failure"))
        : Promise.resolve([]) // no matching defect — still a successful, complete processing
    }
    return Promise.resolve([])
  },
}))

const linearWebhookRoutes = (await import("../linear-webhook.js")).default

describe("Linear webhook marks delivery seen only after processing (VEL-69)", () => {
  let app: ReturnType<typeof Fastify>
  const setSpy = vi.fn().mockResolvedValue("OK")
  const getSpy = vi.fn().mockResolvedValue(null)

  beforeAll(async () => {
    app = Fastify({ logger: false })
    app.decorate("valkey", {
      get: getSpy,
      set: setSpy,
      publish: vi.fn().mockResolvedValue(1),
    } as unknown as Redis)
    await app.register(linearWebhookRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  const sign = (raw: string) => crypto.createHmac("sha256", SECRET).update(raw).digest("hex")

  function issueUpdate(deliveryId: string) {
    return JSON.stringify({
      organizationId: ORG_ID,
      type: "Issue",
      action: "update",
      webhookId: "wh-1",
      deliveryId,
      data: { id: "ext-123", state: { name: "Done" } },
    })
  }

  function post(raw: string) {
    return app.inject({
      method: "POST",
      url: "/api/webhooks/linear",
      headers: { "content-type": "application/json", "linear-signature": sign(raw) },
      payload: raw,
    })
  }

  it("does NOT mark the delivery seen when processing fails (retry stays eligible)", async () => {
    failProcessing = true
    setSpy.mockClear()

    const res = await post(issueUpdate("delivery-fail"))

    // Processing threw → not a success; the delivery must remain un-flagged so a
    // Linear retry re-processes it.
    expect(res.statusCode).toBe(500)
    expect(setSpy).not.toHaveBeenCalled()
  })

  it("marks the delivery seen after processing succeeds", async () => {
    failProcessing = false
    setSpy.mockClear()

    const res = await post(issueUpdate("delivery-ok"))

    expect(res.statusCode).toBe(200)
    expect(setSpy).toHaveBeenCalledWith("linear:webhook:wh-1:delivery-ok", "1", "EX", 86400)
  })

  it("skips reprocessing a delivery already marked seen", async () => {
    failProcessing = false
    setSpy.mockClear()
    getSpy.mockResolvedValueOnce("1") // already seen

    const res = await post(issueUpdate("delivery-dupe"))

    expect(res.statusCode).toBe(200)
    // Short-circuits before processing → never re-marks.
    expect(setSpy).not.toHaveBeenCalled()
  })
})
