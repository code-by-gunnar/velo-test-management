import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import type { Redis } from "iovalkey"
import runsRoutes from "../runs.js"
import defectsRoutes from "../defects.js"

// Set required env vars for testing
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

// Superuser SQL connection for test setup (bypasses RLS)
const sql = (await import("../../db/client.js")).sql

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildApp(userId: string, workspaceId: string) {
  const app = Fastify({ logger: false })
  app.decorateRequest("userId", "")
  app.decorateRequest("workspaceId", "")
  app.decorateRequest("userRole", "")
  app.addHook("preHandler", async (request) => {
    request.userId = userId
    request.workspaceId = workspaceId
    request.userRole = "editor"
  })
  // Mock valkey for runs route (not used by defects but runs route needs it)
  // Cast through unknown: the mock only needs publish(); full Redis type not required in tests
  app.decorate("valkey", { publish: vi.fn().mockResolvedValue(1) } as unknown as Redis)
  return app
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Defect routes integration (TR-05)", () => {
  let workspaceId: string
  let projectId: string
  let caseId: string
  let runId: string
  let itemId: string
  let app: ReturnType<typeof Fastify>
  const userId = uuidv7()

  beforeAll(async () => {
    workspaceId = uuidv7()
    projectId = uuidv7()
    caseId = uuidv7()

    // Insert test user
    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`defects-test-${Date.now()}@example.com`}, 'hash', true)
    `

    // Create workspace and project
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Defects WS', ${`defects-ws-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'Defects Project', 'dfp')
    `

    // Create a test case
    await sql`
      INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
      VALUES (${caseId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'Payment flow test', 'critical', 1000)
    `

    // Build app with runs and defects routes
    app = buildApp(userId, workspaceId)
    await app.register(runsRoutes)
    await app.register(defectsRoutes)
    await app.ready()

    // Create a run to get a run item
    const runRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { project_id: projectId, name: "Defect test run" },
    })
    expect(runRes.statusCode).toBe(201)
    const run = JSON.parse(runRes.body) as { id: string }
    runId = run.id

    // Get the run item id
    const items = await sql`SELECT id FROM run_items WHERE run_id = ${runId}::uuid`
    itemId = (items[0] as unknown as { id: string }).id
  })

  afterAll(async () => {
    await sql`DELETE FROM defects WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM run_items WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_runs WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_cases WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  // ── TR-05: File defect ─────────────────────────────────────────────────────

  it("TR-05: POST /defects with run_item_id and title returns 201 with defect record", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/defects`,
      payload: {
        run_item_id: itemId,
        title: "Payment button not responding on mobile",
      },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body) as {
      id: string
      workspace_id: string
      run_item_id: string
      title: string
      external_id: string | null
      external_url: string | null
    }
    expect(body.id).toBeDefined()
    expect(body.workspace_id).toBe(workspaceId)
    expect(body.run_item_id).toBe(itemId)
    expect(body.title).toBe("Payment button not responding on mobile")
    // Linear integration is Phase 5 — external fields should be null
    expect(body.external_id).toBeNull()
    expect(body.external_url).toBeNull()
  })

  it("TR-05: POST /defects without title returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/defects`,
      payload: { run_item_id: itemId },
    })
    expect(res.statusCode).toBe(400)
  })

  it("TR-05: POST /defects without run_item_id returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/defects`,
      payload: { title: "Missing run_item_id" },
    })
    expect(res.statusCode).toBe(400)
  })

  it("TR-05: POST /defects with invalid run_item_id UUID returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/defects`,
      payload: { run_item_id: "not-a-uuid", title: "Some defect" },
    })
    expect(res.statusCode).toBe(400)
  })

  it("TR-05: GET /defects returns all defects for the workspace", async () => {
    // Create a second defect
    await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/defects`,
      payload: { run_item_id: itemId, title: "Second defect" },
    })

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/defects`,
    })
    expect(res.statusCode).toBe(200)
    const defects = JSON.parse(res.body) as Array<{ id: string; title: string }>
    expect(defects.length).toBeGreaterThanOrEqual(2)
  })

  it("TR-05: GET /defects?run_item_id=X returns only defects for that item", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/defects?run_item_id=${itemId}`,
    })
    expect(res.statusCode).toBe(200)
    const defects = JSON.parse(res.body) as Array<{ run_item_id: string }>
    expect(defects.length).toBeGreaterThanOrEqual(1)
    // All returned defects should be for this item
    for (const d of defects) {
      expect(d.run_item_id).toBe(itemId)
    }
  })

  it("TR-05: workspace isolation — defects from workspace A not visible to workspace B", async () => {
    // Build a second app for a different workspace
    const workspaceB = uuidv7()
    const appB = buildApp(userId, workspaceB)
    await appB.register(defectsRoutes)
    await appB.ready()

    try {
      await sql`
        INSERT INTO workspaces (id, name, slug, plan_tier)
        VALUES (${workspaceB}::uuid, 'Defects WS B', ${`defects-ws-b-${Date.now()}`}, 'free')
      `

      const res = await appB.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceB}/defects`,
      })
      expect(res.statusCode).toBe(200)
      const defects = JSON.parse(res.body) as Array<unknown>
      // Should see 0 defects — workspace B has none
      expect(defects.length).toBe(0)
    } finally {
      await appB.close()
      await sql`DELETE FROM workspaces WHERE id = ${workspaceB}::uuid`
    }
  })
})
