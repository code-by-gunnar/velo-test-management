import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import runsRoutes from "../runs.js"
import runItemsRoutes from "../run-items.js"

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
  // Mock valkey.publish so run-items route can fire-and-forget without a real Valkey
  app.decorate("valkey", {
    publish: vi.fn().mockResolvedValue(1),
  })
  return app
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Run item routes integration (TR-02, TR-04)", () => {
  let workspaceId: string
  let projectId: string
  let caseId1: string
  let caseId2: string
  let runId: string
  let itemId1: string
  let itemId2: string
  let app: ReturnType<typeof Fastify>
  const userId = uuidv7()

  beforeAll(async () => {
    workspaceId = uuidv7()
    projectId = uuidv7()
    caseId1 = uuidv7()
    caseId2 = uuidv7()

    // Insert test user
    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`run-items-test-${Date.now()}@example.com`}, 'hash', true)
    `

    // Create workspace and project
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'RunItems WS', ${`run-items-ws-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'RunItems Project', 'rip')
    `

    // Create two test cases for the project
    await sql`
      INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
      VALUES
        (${caseId1}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'Login test', 'high', 1000),
        (${caseId2}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'Logout test', 'medium', 2000)
    `

    // Build app with both routes
    app = buildApp(userId, workspaceId)
    await app.register(runsRoutes)
    await app.register(runItemsRoutes)
    await app.ready()

    // Create a run (this snapshots test cases into run_items)
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { project_id: projectId, name: "Sprint 1 Run" },
    })
    expect(res.statusCode).toBe(201)
    const run = JSON.parse(res.body) as { id: string; item_count: number }
    runId = run.id
    expect(run.item_count).toBe(2)

    // Look up run items for this run
    const items = await sql`
      SELECT id FROM run_items WHERE run_id = ${runId}::uuid ORDER BY created_at
    `
    itemId1 = (items[0] as unknown as { id: string }).id
    itemId2 = (items[1] as unknown as { id: string }).id
  })

  afterAll(async () => {
    await sql`DELETE FROM run_item_step_comments WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM run_items WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_runs WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_cases WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  // ── TR-02: Execute item ────────────────────────────────────────────────────

  it("TR-02: PATCH run-items/:id with status=pass returns 200 and sets executed_at", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId1}`,
      payload: { status: "pass" },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as {
      itemId: string
      status: string
      runId: string
      stats: { pass: number; total: number }
    }
    expect(body.status).toBe("pass")
    expect(body.runId).toBe(runId)
    expect(body.stats.pass).toBe(1)
    expect(body.stats.total).toBe(2)

    // Verify executed_at is set in DB
    const rows = await sql`SELECT executed_at FROM run_items WHERE id = ${itemId1}::uuid`
    expect((rows[0] as unknown as { executed_at: Date | null }).executed_at).not.toBeNull()
  })

  it("TR-02: PATCH run-items/:id with status=fail returns 200", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId1}`,
      payload: { status: "fail" },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { status: string }
    expect(body.status).toBe("fail")
  })

  it("TR-02: PATCH run-items/:id with status=blocked returns 200", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId1}`,
      payload: { status: "blocked" },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { status: string }
    expect(body.status).toBe("blocked")
  })

  it("TR-02: PATCH run-items/:id with status=skipped returns 200", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId1}`,
      payload: { status: "skipped" },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { status: string }
    expect(body.status).toBe("skipped")
  })

  it("TR-02: PATCH with invalid status (untested) returns 400", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId1}`,
      payload: { status: "untested" },
    })
    expect(res.statusCode).toBe(400)
  })

  it("TR-02: marking last untested item auto-completes run (status=completed)", async () => {
    // itemId1 is currently 'skipped'; mark itemId2 as pass to exhaust untested items
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId2}`,
      payload: { status: "pass" },
    })
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body) as { stats: { untested: number } }
    expect(body.stats.untested).toBe(0)

    // Verify run status in DB
    const runs = await sql`SELECT status, completed_at FROM test_runs WHERE id = ${runId}::uuid`
    const run = runs[0] as unknown as { status: string; completed_at: Date | null }
    expect(run.status).toBe("completed")
    expect(run.completed_at).not.toBeNull()
  })

  it("TR-02: Valkey publish is called after status update", async () => {
    // Get the mocked valkey from the app
    const valkeyMock = (app as unknown as { valkey: { publish: ReturnType<typeof vi.fn> } }).valkey
    expect(valkeyMock.publish).toHaveBeenCalled()
    const lastCall = valkeyMock.publish.mock.calls[valkeyMock.publish.mock.calls.length - 1] as [
      string,
      string,
    ]
    expect(lastCall[0]).toMatch(/^run:/)
    const payload = JSON.parse(lastCall[1]) as { type: string; runId: string }
    expect(payload.type).toBe("run_update")
    expect(payload.runId).toBeDefined()
  })

  // ── TR-04: Case-level comment ───────────────────────────────────────────────

  it("TR-04: PATCH run-items/:id/comment returns 204 and persists comment", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId1}/comment`,
      payload: { comment: "Login works on Chrome but fails on Safari" },
    })
    expect(res.statusCode).toBe(204)

    // Verify comment in DB
    const rows = await sql`SELECT comment FROM run_items WHERE id = ${itemId1}::uuid`
    expect((rows[0] as unknown as { comment: string }).comment).toBe(
      "Login works on Chrome but fails on Safari"
    )
  })

  // ── TR-04: Step-level comments ─────────────────────────────────────────────

  it("TR-04: POST run-items/:id/step-comments with step_order returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId1}/step-comments`,
      payload: { step_order: 1, comment: "User clicked wrong button" },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body) as {
      id: string
      run_item_id: string
      step_order: number
      comment: string
    }
    expect(body.step_order).toBe(1)
    expect(body.comment).toBe("User clicked wrong button")
    expect(body.run_item_id).toBe(itemId1)
  })

  it("TR-04: GET run-items/:id/step-comments returns comments ordered by step_order", async () => {
    // Add a second comment at step 2
    await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId1}/step-comments`,
      payload: { step_order: 2, comment: "Step 2 issue" },
    })

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId1}/step-comments`,
    })
    expect(res.statusCode).toBe(200)
    const comments = JSON.parse(res.body) as Array<{ step_order: number; comment: string }>
    expect(comments.length).toBeGreaterThanOrEqual(2)
    // Ordered by step_order ascending
    expect(comments[0]!.step_order).toBeLessThanOrEqual(comments[1]!.step_order)
  })

  it("TR-04: POST step-comments without step_order returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId1}/step-comments`,
      payload: { comment: "Missing step_order" },
    })
    expect(res.statusCode).toBe(400)
  })

  it("TR-04: POST step-comments with step_order=0 returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/run-items/${itemId1}/step-comments`,
      payload: { step_order: 0, comment: "Zero step_order is invalid" },
    })
    expect(res.statusCode).toBe(400)
  })
})
