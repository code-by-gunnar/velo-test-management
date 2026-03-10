import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import runsRoutes from "../runs.js"

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
    request.userRole = "admin"
  })
  return app
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Runs routes integration (TR-01, DA-03, TR-06, TR-07)", () => {
  let workspaceId: string
  let projectId: string
  let suiteAId: string
  let suiteBId: string
  let caseAId: string
  let caseBId: string
  let caseCId: string
  let userId: string
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    workspaceId = uuidv7()
    projectId = uuidv7()
    suiteAId = uuidv7()
    suiteBId = uuidv7()
    caseAId = uuidv7()
    caseBId = uuidv7()
    caseCId = uuidv7()
    userId = uuidv7()

    // Insert user
    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`runs-test-${Date.now()}@example.com`}, 'hash', true)
    `

    // Insert workspace
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Runs WS', ${`runs-ws-${Date.now()}`}, 'free')
    `

    // Insert project
    await sql`
      INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'Runs Project', 'rp')
    `

    // Insert two suites
    await sql`
      INSERT INTO suites (id, workspace_id, project_id, name, position)
      VALUES
        (${suiteAId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'Suite A', 1000),
        (${suiteBId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'Suite B', 2000)
    `

    // Insert 3 test cases: 2 in suite A, 1 in suite B
    await sql`
      INSERT INTO test_cases (id, workspace_id, project_id, suite_id, title, priority, position)
      VALUES
        (${caseAId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, ${suiteAId}::uuid, 'Case A1', 'high', 1000),
        (${caseBId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, ${suiteAId}::uuid, 'Case A2', 'medium', 2000),
        (${caseCId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, ${suiteBId}::uuid, 'Case B1', 'low', 1000)
    `

    app = buildApp(userId, workspaceId)
    await app.register(runsRoutes)
    await app.ready()
  })

  afterAll(async () => {
    // Clean up in FK-safe order
    await sql`DELETE FROM defects WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM run_items WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_runs WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_cases WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM suites WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  // ── TR-01: Create run ───────────────────────────────────────────────────────

  it("POST /runs creates a run with status=active, returns 201 with run id and item_count", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "My First Run", project_id: projectId },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { id: string; status: string; item_count: number; name: string }
    expect(body.id).toBeTruthy()
    expect(body.status).toBe("active")
    expect(body.item_count).toBe(3) // all 3 cases
    expect(body.name).toBe("My First Run")
  })

  it("POST /runs with suite_ids scopes cases to those suites only", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "Suite A Run", project_id: projectId, suite_ids: [suiteAId] },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { item_count: number }
    expect(body.item_count).toBe(2) // only cases in Suite A
  })

  it("POST /runs without suite_ids includes all project cases", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "All Cases Run", project_id: projectId },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { item_count: number }
    expect(body.item_count).toBe(3)
  })

  it("POST /runs snapshots case_title on run_items", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "Snapshot Run", project_id: projectId },
    })
    expect(createRes.statusCode).toBe(201)
    const { id: runId } = createRes.json() as { id: string }

    // Verify by querying run_items directly (bypass RLS with superuser connection)
    const items = await sql`
      SELECT case_title FROM run_items WHERE run_id = ${runId}::uuid ORDER BY created_at
    `
    const titles = items.map((i: { case_title: string | null }) => i.case_title)
    expect(titles).toContain("Case A1")
    expect(titles).toContain("Case A2")
    expect(titles).toContain("Case B1")
  })

  it("POST /runs returns 400 when no cases match scope", async () => {
    const emptySuiteId = uuidv7()
    // Insert an empty suite
    await sql`
      INSERT INTO suites (id, workspace_id, project_id, name, position)
      VALUES (${emptySuiteId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'Empty Suite', 9000)
    `
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "Empty Run", project_id: projectId, suite_ids: [emptySuiteId] },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string }
    expect(body.error).toMatch(/no test cases/i)
  })

  // ── DA-03: List runs with filters ───────────────────────────────────────────

  it("GET /runs?project_id=X returns runs with stats aggregation", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/runs?project_id=${projectId}`,
    })
    expect(res.statusCode).toBe(200)
    const runs = res.json() as Array<{
      id: string
      name: string
      total_items: number
      pass_count: number
      fail_count: number
      untested_count: number
    }>
    expect(runs.length).toBeGreaterThan(0)
    // Each run should have aggregated stats
    runs.forEach((r) => {
      expect(r).toHaveProperty("total_items")
      expect(r).toHaveProperty("pass_count")
      expect(r).toHaveProperty("fail_count")
      expect(r).toHaveProperty("untested_count")
    })
  })

  it("GET /runs?project_id=X&status=active filters by status", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/runs?project_id=${projectId}&status=active`,
    })
    expect(res.statusCode).toBe(200)
    const runs = res.json() as Array<{ status: string }>
    expect(runs.length).toBeGreaterThan(0)
    runs.forEach((r) => {
      expect(r.status).toBe("active")
    })
  })

  it("GET /runs?project_id=X&assigned_to=Y filters by assignee", async () => {
    // Create a run assigned to the user
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "Assigned Run", project_id: projectId, assigned_to: userId },
    })
    expect(createRes.statusCode).toBe(201)

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/runs?project_id=${projectId}&assigned_to=${userId}`,
    })
    expect(res.statusCode).toBe(200)
    const runs = res.json() as Array<{ assigned_to: string }>
    expect(runs.length).toBeGreaterThanOrEqual(1)
    runs.forEach((r) => {
      expect(r.assigned_to).toBe(userId)
    })
  })

  it("GET /runs returns 400 when project_id is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/runs`,
    })
    expect(res.statusCode).toBe(400)
  })

  // ── Run detail + abort ──────────────────────────────────────────────────────

  it("GET /runs/:id returns run with computed stats and items", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "Detail Run", project_id: projectId },
    })
    const { id: runId } = createRes.json() as { id: string }

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/runs/${runId}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      run: { id: string; total_items: number; untested_count: number }
      items: Array<{ id: string; case_title: string | null; status: string }>
    }
    expect(body.run.id).toBe(runId)
    expect(body.run.total_items).toBe(3)
    expect(body.run.untested_count).toBe(3)
    expect(body.items.length).toBe(3)
    body.items.forEach((item) => {
      expect(item.status).toBe("untested")
    })
  })

  it("PATCH /runs/:id/abort sets status to aborted", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "Abort Run", project_id: projectId },
    })
    const { id: runId } = createRes.json() as { id: string }

    const abortRes = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/runs/${runId}/abort`,
    })
    expect(abortRes.statusCode).toBe(200)
    const body = abortRes.json() as { status: string }
    expect(body.status).toBe("aborted")
  })

  it("PATCH /runs/:id/abort returns 400 when run is not active", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "Not Active Run", project_id: projectId },
    })
    const { id: runId } = createRes.json() as { id: string }

    // First abort succeeds
    await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/runs/${runId}/abort`,
    })

    // Second abort fails with 400 (not active)
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/runs/${runId}/abort`,
    })
    expect(res.statusCode).toBe(400)
  })

  // ── TR-07: Rerun failures ───────────────────────────────────────────────────

  it("POST /runs/:id/rerun-failures creates new run from failed items only", async () => {
    // Create a run
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "Source Run", project_id: projectId },
    })
    const { id: runId } = createRes.json() as { id: string }

    // Mark one item as fail via direct DB update (run-items routes not yet implemented)
    await sql`
      UPDATE run_items
      SET status = 'fail', executed_at = NOW(), executed_by = ${userId}::uuid
      WHERE run_id = ${runId}::uuid
        AND test_case_id = ${caseAId}::uuid
    `

    const rerunRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs/${runId}/rerun-failures`,
    })
    expect(rerunRes.statusCode).toBe(201)
    const body = rerunRes.json() as { id: string; item_count: number; status: string }
    expect(body.id).toBeTruthy()
    expect(body.item_count).toBe(1) // only the failed case
    expect(body.status).toBe("active")

    // Verify new run contains only the failed case
    const items = await sql`
      SELECT test_case_id FROM run_items WHERE run_id = ${body.id}::uuid
    `
    expect(items.length).toBe(1)
    expect((items[0] as { test_case_id: string }).test_case_id).toBe(caseAId)
  })

  it("POST /runs/:id/rerun-failures returns 400 when no failures exist", async () => {
    // Create a run with no failures (all untested)
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "No Fail Run", project_id: projectId },
    })
    const { id: runId } = createRes.json() as { id: string }

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs/${runId}/rerun-failures`,
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: string }
    expect(body.error).toMatch(/no failed items/i)
  })

  // ── TR-06: Execution history ────────────────────────────────────────────────

  it("GET /test-cases/:caseId/history returns execution history across runs", async () => {
    // Create a run with caseAId
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "History Run", project_id: projectId },
    })
    const { id: runId } = createRes.json() as { id: string }

    // Mark caseA as pass via direct DB update
    await sql`
      UPDATE run_items
      SET status = 'pass', executed_at = NOW(), executed_by = ${userId}::uuid
      WHERE run_id = ${runId}::uuid
        AND test_case_id = ${caseAId}::uuid
    `

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/test-cases/${caseAId}/history`,
    })
    expect(res.statusCode).toBe(200)
    const history = res.json() as Array<{
      run_item_id: string
      status: string
      run_id: string
      run_name: string
    }>
    expect(history.length).toBeGreaterThan(0)
    const passEntry = history.find((h) => h.run_id === runId && h.status === "pass")
    expect(passEntry).toBeTruthy()
    expect(passEntry?.run_name).toBe("History Run")
  })

  it("GET /test-cases/:caseId/history returns empty array for case with no executions", async () => {
    const neverExecutedId = uuidv7()
    // Create a test case with no run_items
    await sql`
      INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
      VALUES (${neverExecutedId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'Never Run', 'low', 99000)
    `
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/test-cases/${neverExecutedId}/history`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  // ── Auth / workspace isolation ──────────────────────────────────────────────

  it("POST /runs returns 401 when no session (userId empty)", async () => {
    const noAuthApp = Fastify({ logger: false })
    noAuthApp.decorateRequest("userId", "")
    noAuthApp.decorateRequest("workspaceId", "")
    noAuthApp.decorateRequest("userRole", "")
    await noAuthApp.register(runsRoutes)
    await noAuthApp.ready()

    const res = await noAuthApp.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/runs`,
      payload: { name: "Unauth Run", project_id: projectId },
    })
    expect(res.statusCode).toBe(401)
    await noAuthApp.close()
  })

  it("GET /runs returns 403 when workspaceId param does not match session", async () => {
    const otherWorkspaceId = uuidv7()
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${otherWorkspaceId}/runs?project_id=${projectId}`,
    })
    expect(res.statusCode).toBe(403)
  })

  it("GET /runs does NOT return runs from a different workspace (RLS isolation)", async () => {
    // Create a second workspace with its own project
    const otherWsId = uuidv7()
    const otherProjectId = uuidv7()
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${otherWsId}::uuid, 'Other WS', ${`other-ws-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${otherProjectId}::uuid, ${otherWsId}::uuid, 'Other Project', 'op')
    `

    // Create a test case in otherWs so we can create a run there
    const otherCaseId = uuidv7()
    await sql`
      INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
      VALUES (${otherCaseId}::uuid, ${otherWsId}::uuid, ${otherProjectId}::uuid, 'Other Case', 'low', 1000)
    `

    const otherApp = buildApp(userId, otherWsId)
    await otherApp.register(runsRoutes)
    await otherApp.ready()

    // Create a run in otherWs
    const otherRunRes = await otherApp.inject({
      method: "POST",
      url: `/api/workspaces/${otherWsId}/runs`,
      payload: { name: "Other WS Run", project_id: otherProjectId },
    })
    expect(otherRunRes.statusCode).toBe(201)

    // Query workspace A for otherProject's runs — should be empty because
    // RLS restricts to workspace_id from session (workspaceId != otherWsId)
    const queryRes = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/runs?project_id=${otherProjectId}`,
    })
    // RLS filters by workspace_id from SET LOCAL — workspace A cannot see workspace B's runs
    expect(queryRes.statusCode).toBe(200)
    expect(queryRes.json()).toEqual([])

    // Cleanup
    await otherApp.close()
    await sql`DELETE FROM run_items WHERE workspace_id = ${otherWsId}::uuid`
    await sql`DELETE FROM test_runs WHERE workspace_id = ${otherWsId}::uuid`
    await sql`DELETE FROM test_cases WHERE workspace_id = ${otherWsId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${otherProjectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${otherWsId}::uuid`
  })

  // ── DA-01: SSE (deferred to plan 03-04) ────────────────────────────────────

  it.todo("DA-01: GET /runs/:runId/stream returns Content-Type: text/event-stream (03-04)")
  it.todo("DA-01: GET /runs/:runId/stream sends initial stats event on connection (03-04)")
  it.todo("DA-01: GET /runs/:runId/stream receives update event via Valkey pub/sub (03-04)")
})
