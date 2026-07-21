import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import webhookRoutes from "../webhooks.js"

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"

const sql = (await import("../../db/client.js")).sql

function buildApp(userId: string, workspaceId: string, role: string) {
  const app = Fastify({ logger: false })
  app.decorateRequest("userId", "")
  app.decorateRequest("workspaceId", "")
  app.decorateRequest("userRole", "")
  app.addHook("preHandler", async (request) => {
    request.userId = userId
    request.workspaceId = workspaceId
    request.userRole = role
  })
  return app
}

// ── Webhook RBAC (VEL-67) ─────────────────────────────────────────────────────
// Webhooks push run/defect data to an external URL, so create/update/delete/test
// are admin-only. GET (read) stays available to any member.

describe("Webhook CRUD RBAC (VEL-67)", () => {
  let workspaceId: string
  let projectId: string
  let webhookId: string
  const userId = uuidv7()
  const PUBLIC_URL = "https://example.com/hook"

  beforeAll(async () => {
    workspaceId = uuidv7()
    projectId = uuidv7()
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`wh-rbac-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'WH WS', ${`wh-ws-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'WH Project', 'whp')`
    // A pre-existing webhook for the update/delete/test admin-required checks.
    webhookId = uuidv7()
    await sql`INSERT INTO webhooks (id, workspace_id, project_id, endpoint_url, secret, events, active)
      VALUES (${webhookId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, ${PUBLIC_URL}, 'sekret', ${["run.completed"]}::text[], true)`
  })

  afterAll(async () => {
    await sql`DELETE FROM webhooks WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await sql.end()
  })

  async function withRole<T>(role: string, fn: (app: ReturnType<typeof Fastify>) => Promise<T>): Promise<T> {
    const app = buildApp(userId, workspaceId, role)
    await app.register(webhookRoutes)
    await app.ready()
    try {
      return await fn(app)
    } finally {
      await app.close()
    }
  }

  const base = () => `/api/workspaces/${workspaceId}/projects/${projectId}/webhooks`

  it("viewer CANNOT create a webhook (403 ADMIN_REQUIRED)", async () => {
    await withRole("viewer", async (app) => {
      const res = await app.inject({
        method: "POST",
        url: base(),
        payload: { endpoint_url: PUBLIC_URL, events: ["run.completed"] },
      })
      expect(res.statusCode).toBe(403)
      expect((res.json() as { code?: string }).code).toBe("ADMIN_REQUIRED")
    })
  })

  it("editor CANNOT create a webhook (403) — admin-only, not merely non-viewer", async () => {
    await withRole("editor", async (app) => {
      const res = await app.inject({
        method: "POST",
        url: base(),
        payload: { endpoint_url: PUBLIC_URL, events: ["run.completed"] },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  it("viewer CANNOT update / delete / test a webhook (403)", async () => {
    await withRole("viewer", async (app) => {
      const patch = await app.inject({ method: "PATCH", url: `${base()}/${webhookId}`, payload: { active: false } })
      expect(patch.statusCode).toBe(403)
      const del = await app.inject({ method: "DELETE", url: `${base()}/${webhookId}` })
      expect(del.statusCode).toBe(403)
      const test = await app.inject({ method: "POST", url: `${base()}/${webhookId}/test` })
      expect(test.statusCode).toBe(403)
    })
  })

  it("viewer CAN still list webhooks (GET is not gated)", async () => {
    await withRole("viewer", async (app) => {
      const res = await app.inject({ method: "GET", url: base() })
      expect(res.statusCode).toBe(200)
      expect(Array.isArray(res.json())).toBe(true)
    })
  })

  it("admin CAN create a webhook (201)", async () => {
    await withRole("admin", async (app) => {
      const res = await app.inject({
        method: "POST",
        url: base(),
        payload: { endpoint_url: PUBLIC_URL, events: ["run.completed"] },
      })
      expect(res.statusCode).toBe(201)
    })
  })
})

// ── Webhook Delivery (tracked under VEL-73) ──────────────────────────────────

describe("Webhook Delivery", () => {
  it.todo("fires run.completed webhook when run status changes to completed") // INT-04
  it.todo("fires run_item.failed webhook when verdict is fail") // INT-04
  it.todo("signs payload with HMAC-SHA256 using webhook secret") // INT-04
  it.todo("retries with exponential backoff on delivery failure") // INT-04
  it.todo("does not fire for unsubscribed event types") // INT-04
})
