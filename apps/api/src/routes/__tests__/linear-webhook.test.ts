import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import crypto from "node:crypto"
import { uuidv7 } from "uuidv7"
import type { Redis } from "iovalkey"
import linearWebhookRoutes from "../linear-webhook.js"

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"

const sql = (await import("../../db/client.js")).sql

function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate("valkey", {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    publish: vi.fn().mockResolvedValue(1),
  } as unknown as Redis)
  return app
}

describe("Linear inbound webhook signature verification (VEL-48 / audit #12)", () => {
  let workspaceId: string
  let orgId: string
  const secret = "test-signing-secret-123"
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    workspaceId = uuidv7()
    orgId = `org-${Date.now()}`
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'LW WS', ${`lw-ws-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO linear_connections (id, workspace_id, access_token_enc, linear_org_id, team_id, webhook_signing_secret)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, 'enc', ${orgId}, 'team-1', ${secret})
    `
    app = buildApp()
    await app.register(linearWebhookRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM linear_connections WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await app.close()
    await sql.end()
  })

  const sign = (raw: string) => crypto.createHmac("sha256", secret).update(raw).digest("hex")

  function post(raw: string, signature?: string) {
    return app.inject({
      method: "POST",
      url: "/api/webhooks/linear",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "linear-signature": signature } : {}),
      },
      payload: raw,
    })
  }

  it("returns 400 when the Linear-Signature header is missing", async () => {
    const res = await post(JSON.stringify({ organizationId: orgId }))
    expect(res.statusCode).toBe(400)
  })

  it("returns 400 (not 500) on a wrong-length signature — length guard before timingSafeEqual", async () => {
    const res = await post(JSON.stringify({ organizationId: orgId, type: "Ping" }), "deadbeef")
    expect(res.statusCode).toBe(400)
  })

  it("verifies the HMAC over the RAW request bytes (whitespace preserved) → 200", async () => {
    // Whitespace that JSON.stringify(parsed) would NOT reproduce — proves the
    // HMAC is computed over the raw bytes, not a re-serialization of the body.
    const raw = `{"organizationId": "${orgId}",   "type": "Ping"}`
    const res = await post(raw, sign(raw))
    expect(res.statusCode).toBe(200)
  })

  it("returns 400 on a correct-length but invalid signature", async () => {
    const raw = JSON.stringify({ organizationId: orgId, type: "Ping" })
    const wrong = crypto.createHmac("sha256", "wrong-secret").update(raw).digest("hex")
    const res = await post(raw, wrong)
    expect(res.statusCode).toBe(400)
  })
})
