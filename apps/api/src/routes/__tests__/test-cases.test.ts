import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import testCasesRoutes from "../test-cases.js"

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
  return app
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Test case routes integration (TC-01, TC-03)", () => {
  let workspaceA: string
  let workspaceB: string
  let projectA: string
  let projectB: string
  let suiteA: string
  let appA: ReturnType<typeof Fastify>
  let appB: ReturnType<typeof Fastify>
  const userId = uuidv7()

  beforeAll(async () => {
    workspaceA = uuidv7()
    workspaceB = uuidv7()
    projectA = uuidv7()
    projectB = uuidv7()
    suiteA = uuidv7()

    // Insert test user
    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`case-test-${Date.now()}@example.com`}, 'hash', true)
    `

    // Create workspaces + projects (superuser bypass for setup)
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier) VALUES
        (${workspaceA}::uuid, 'Cases WS A', ${`cases-ws-a-${Date.now()}`}, 'free'),
        (${workspaceB}::uuid, 'Cases WS B', ${`cases-ws-b-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO projects (id, workspace_id, name, project_key) VALUES
        (${projectA}::uuid, ${workspaceA}::uuid, 'Cases Project A', 'cpa'),
        (${projectB}::uuid, ${workspaceB}::uuid, 'Cases Project B', 'cpb')
    `
    await sql`
      INSERT INTO suites (id, workspace_id, project_id, name, position) VALUES
        (${suiteA}::uuid, ${workspaceA}::uuid, ${projectA}::uuid, 'Test Suite A', 1000)
    `

    appA = buildApp(userId, workspaceA)
    appB = buildApp(userId, workspaceB)

    await appA.register(testCasesRoutes)
    await appB.register(testCasesRoutes)

    await appA.ready()
    await appB.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM test_case_steps WHERE test_case_id IN (
      SELECT id FROM test_cases WHERE workspace_id IN (${workspaceA}::uuid, ${workspaceB}::uuid)
    )`
    await sql`DELETE FROM test_cases WHERE workspace_id IN (${workspaceA}::uuid, ${workspaceB}::uuid)`
    await sql`DELETE FROM suites WHERE workspace_id IN (${workspaceA}::uuid, ${workspaceB}::uuid)`
    await sql`DELETE FROM projects WHERE id IN (${projectA}::uuid, ${projectB}::uuid)`
    await sql`DELETE FROM workspaces WHERE id IN (${workspaceA}::uuid, ${workspaceB}::uuid)`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await appA.close()
    await appB.close()
    await sql.end()
  })

  // ── POST /cases ─────────────────────────────────────────────────────────────

  it("creates a test case with title, preconditions, priority, and steps in one transaction (TC-01)", async () => {
    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "Login with valid credentials",
        priority: "high",
        suite_id: suiteA,
        preconditions: "User has a registered account",
        steps: [
          { action: "Navigate to login page", expected_result: "Login page is shown" },
          { action: "Enter valid email and password", expected_result: "Fields are filled" },
          { action: "Click Sign In button", expected_result: "User is redirected to dashboard" },
        ],
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json() as {
      id: string
      title: string
      suite_id: string
      step_count: number
      preconditions: string
    }
    expect(body.title).toBe("Login with valid credentials")
    expect(body.suite_id).toBe(suiteA)
    expect(body.step_count).toBe(3)
    expect(body.preconditions).toBe("User has a registered account")
  })

  it("steps are stored in test_case_steps with correct step_order (increments of 1000)", async () => {
    const createRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "Step order test",
        priority: "low",
        steps: [
          { action: "First step" },
          { action: "Second step" },
          { action: "Third step" },
        ],
      },
    })
    const { id } = createRes.json() as { id: string }

    const getRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/${id}`,
    })
    const detail = getRes.json() as { steps: Array<{ step_order: number; action: string }> }
    expect(detail.steps[0]?.step_order).toBe(1000)
    expect(detail.steps[1]?.step_order).toBe(2000)
    expect(detail.steps[2]?.step_order).toBe(3000)
  })

  it("GET /cases/:id returns the test case with all steps ordered by step_order", async () => {
    const createRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "Case with ordered steps",
        priority: "medium",
        steps: [
          { action: "Step A", expected_result: "Result A" },
          { action: "Step B", expected_result: "Result B" },
        ],
      },
    })
    const { id } = createRes.json() as { id: string }

    const getRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/${id}`,
    })
    expect(getRes.statusCode).toBe(200)
    const detail = getRes.json() as {
      id: string
      title: string
      steps: Array<{ action: string; step_order: number }>
    }
    expect(detail.steps).toHaveLength(2)
    expect(detail.steps[0]?.action).toBe("Step A")
    expect(detail.steps[1]?.action).toBe("Step B")
    expect((detail.steps[0]?.step_order ?? 0) < (detail.steps[1]?.step_order ?? 0)).toBe(true)
  })

  // ── GET /cases ──────────────────────────────────────────────────────────────

  it("returns only cases where deleted_at IS NULL", async () => {
    const createRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "Case to be deleted",
        priority: "low",
        steps: [],
      },
    })
    const { id } = createRes.json() as { id: string }

    await appA.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/${id}`,
    })

    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
    })
    const cases = listRes.json() as Array<{ id: string }>
    expect(cases.find((c) => c.id === id)).toBeUndefined()
  })

  it("returns only cases from the requesting workspace (RLS isolation)", async () => {
    // Create a case in workspace B
    await appB.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceB}/projects/${projectB}/cases`,
      payload: {
        title: "Workspace B Exclusive Case",
        priority: "critical",
        steps: [],
      },
    })

    // Query from workspace A — must not see workspace B cases
    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
    })
    const cases = listRes.json() as Array<{ title: string }>
    const titles = cases.map((c) => c.title)
    expect(titles).not.toContain("Workspace B Exclusive Case")
  })

  it("filters by suite_id when query param provided", async () => {
    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "In Suite A (filter test)",
        priority: "medium",
        suite_id: suiteA,
        steps: [],
      },
    })
    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "No Suite (filter test)",
        priority: "medium",
        steps: [],
      },
    })

    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases?suite_id=${suiteA}`,
    })
    const cases = listRes.json() as Array<{ suite_id: string }>
    expect(cases.every((c) => c.suite_id === suiteA)).toBe(true)
  })

  // ── PUT /cases/:id ──────────────────────────────────────────────────────────

  it("replaces steps by deleting all existing and inserting new in same transaction", async () => {
    const createRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "Step replacement case",
        priority: "high",
        steps: [
          { action: "Original step 1" },
          { action: "Original step 2" },
        ],
      },
    })
    const { id } = createRes.json() as { id: string }

    const putRes = await appA.inject({
      method: "PUT",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/${id}`,
      payload: {
        title: "Step replacement case (updated)",
        priority: "critical",
        steps: [
          { action: "New step 1", expected_result: "New result 1" },
          { action: "New step 2", expected_result: "New result 2" },
          { action: "New step 3" },
        ],
      },
    })
    expect(putRes.statusCode).toBe(200)

    const getRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/${id}`,
    })
    const detail = getRes.json() as {
      title: string
      priority: string
      steps: Array<{ action: string }>
    }
    expect(detail.title).toBe("Step replacement case (updated)")
    expect(detail.priority).toBe("critical")
    expect(detail.steps).toHaveLength(3)
    expect(detail.steps[0]?.action).toBe("New step 1")
    expect(detail.steps.find((s) => s.action === "Original step 1")).toBeUndefined()
  })

  // ── DELETE /cases/:id ───────────────────────────────────────────────────────

  it("sets deleted_at = NOW(), does not hard delete (row remains in DB)", async () => {
    const createRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "Soft delete test case",
        priority: "low",
        steps: [],
      },
    })
    const { id } = createRes.json() as { id: string }

    const deleteRes = await appA.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/${id}`,
    })
    expect(deleteRes.statusCode).toBe(204)

    // Verify row still exists with deleted_at set
    const rows = await sql`SELECT deleted_at FROM test_cases WHERE id = ${id}::uuid`
    expect(rows.length).toBe(1)
    expect(rows[0]?.deleted_at).not.toBeNull()
  })

  // ── Tier limit ──────────────────────────────────────────────────────────────

  it("creates a case past the old 500-case cap (limits removed VEL-59)", async () => {
    const limitWsId = uuidv7()
    const limitProjId = uuidv7()

    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier) VALUES
        (${limitWsId}::uuid, 'Limit WS', ${`limit-ws-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO projects (id, workspace_id, name, project_key) VALUES
        (${limitProjId}::uuid, ${limitWsId}::uuid, 'Limit Project', 'lp1')
    `

    // Insert exactly 500 cases directly (bypass API for speed)
    const caseIds = Array.from({ length: 500 }, () => uuidv7())
    for (const caseId of caseIds) {
      await sql`
        INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
        VALUES (${caseId}::uuid, ${limitWsId}::uuid, ${limitProjId}::uuid, 'Bulk Case', 'low', 1000)
      `
    }

    const limitApp = buildApp(userId, limitWsId)
    await limitApp.register(testCasesRoutes)
    await limitApp.ready()

    const res = await limitApp.inject({
      method: "POST",
      url: `/api/workspaces/${limitWsId}/projects/${limitProjId}/cases`,
      payload: {
        title: "Case past the old cap",
        priority: "medium",
        steps: [],
      },
    })

    expect(res.statusCode).toBe(201)

    // Cleanup
    await limitApp.close()
    await sql`DELETE FROM test_cases WHERE workspace_id = ${limitWsId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${limitProjId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${limitWsId}::uuid`
  })

  it("GET /cases returns ALL cases past 500 — no silent truncation (VEL-66)", async () => {
    const wsId = uuidv7()
    const projId = uuidv7()

    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${wsId}::uuid, 'Big WS', ${`big-ws-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projId}::uuid, ${wsId}::uuid, 'Big Project', 'bp1')`

    // Bulk-insert 501 cases in one statement (generate_series) — fast, and
    // sidesteps the per-row N+1 create path (VEL-52) that timed out the auditor.
    await sql`
      INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
      SELECT gen_random_uuid(), ${wsId}::uuid, ${projId}::uuid, 'Bulk ' || g, 'low', g
      FROM generate_series(1, 501) AS g
    `

    const bigApp = buildApp(userId, wsId)
    await bigApp.register(testCasesRoutes)
    await bigApp.ready()

    const res = await bigApp.inject({
      method: "GET",
      url: `/api/workspaces/${wsId}/projects/${projId}/cases`,
    })
    expect(res.statusCode).toBe(200)
    const cases = res.json() as Array<{ id: string }>
    // The old hardcoded LIMIT 500 silently dropped case 501+. All must be returned.
    expect(cases.length).toBe(501)

    await bigApp.close()
    await sql`DELETE FROM test_cases WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${wsId}::uuid`
  })

  // ── Auth guard ─────────────────────────────────────────────────────────────

  it("GET /cases returns 401 when no session (userId empty)", async () => {
    const noAuthApp = Fastify({ logger: false })
    noAuthApp.decorateRequest("userId", "")
    noAuthApp.decorateRequest("workspaceId", "")
    noAuthApp.decorateRequest("userRole", "")
    await noAuthApp.register(testCasesRoutes)
    await noAuthApp.ready()

    const res = await noAuthApp.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
    })
    expect(res.statusCode).toBe(401)
    await noAuthApp.close()
  })

  it("GET /cases returns 403 when workspaceId param does not match session", async () => {
    const res = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceB}/projects/${projectB}/cases`,
    })
    expect(res.statusCode).toBe(403)
  })

  // ── TC-04: Drag-drop position reorder ──────────────────────────────────────

  it("PATCH /cases/:id/position updates a single test_case row position (TC-04)", async () => {
    // Create a case to move
    const createRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "Position update target",
        priority: "medium",
        steps: [],
      },
    })
    const { id: caseId } = createRes.json() as { id: string }

    // Set a specific mid-gap position
    const patchRes = await appA.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/${caseId}/position`,
      payload: { position: 1500 },
    })
    expect(patchRes.statusCode).toBe(204)

    // Verify only this row was updated
    const rows = await sql`
      SELECT position FROM test_cases WHERE id = ${caseId}::uuid
    `
    expect(rows[0]?.position).toBe(1500)
  })

  it("PATCH /cases/:id/position with -1 renumbers all cases in suite starting at 1000 (TC-04)", async () => {
    // Create 3 cases in suiteA
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const res = await appA.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
        payload: {
          title: `Renumber case ${i}`,
          priority: "low",
          suite_id: suiteA,
          steps: [],
        },
      })
      const { id } = res.json() as { id: string }
      ids.push(id)
    }

    // Send -1 to trigger renumber from any case in that suite
    const patchRes = await appA.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/${ids[0]}/position`,
      payload: { position: -1 },
    })
    expect(patchRes.statusCode).toBe(204)

    // Fetch all non-deleted cases in suiteA ordered by position
    const rows = await sql`
      SELECT id, position FROM test_cases
      WHERE suite_id = ${suiteA}::uuid
        AND deleted_at IS NULL
        AND workspace_id = ${workspaceA}::uuid
      ORDER BY position
    `

    // Each position must be a multiple of 1000, incrementing by 1000
    rows.forEach((row, idx) => {
      expect(row.position).toBe((idx + 1) * 1000)
    })
  })

  it("PATCH /cases/:id/position returns 403 when workspaceId param does not match session (TC-04)", async () => {
    const res = await appA.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceB}/projects/${projectB}/cases/some-id/position`,
      payload: { position: 500 },
    })
    expect(res.statusCode).toBe(403)
  })

  // ── TC-05: Bulk move, copy, delete ──────────────────────────────────────────

  it("action=move: updates suite_id for all selected case IDs (TC-05)", async () => {
    // Create two cases in no-suite (root)
    const c1Res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: { title: "Bulk move case 1", priority: "medium", steps: [] },
    })
    const c2Res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: { title: "Bulk move case 2", priority: "medium", steps: [] },
    })
    const { id: c1 } = c1Res.json() as { id: string }
    const { id: c2 } = c2Res.json() as { id: string }

    // Move both to suiteA
    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "move", case_ids: [c1, c2], target_suite_id: suiteA },
    })
    expect(res.statusCode).toBe(204)

    // Verify suite_id updated
    const rows = await sql`SELECT id, suite_id FROM test_cases WHERE id = ANY(${[c1, c2]}::uuid[])`
    expect(rows.every((r) => r.suite_id === suiteA)).toBe(true)
  })

  it("action=copy: creates new test_case rows with new UUIDs in target suite (TC-05)", async () => {
    // Create a case with steps in suiteA
    const srcRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "Bulk copy source case",
        priority: "high",
        suite_id: suiteA,
        steps: [
          { action: "Step 1", expected_result: "Result 1" },
          { action: "Step 2", expected_result: "Result 2" },
          { action: "Step 3" },
        ],
      },
    })
    const { id: srcId } = srcRes.json() as { id: string }

    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "copy", case_ids: [srcId], target_suite_id: null },
    })
    expect(res.statusCode).toBe(201)
    const { created } = res.json() as { created: number }
    expect(created).toBe(1)

    // Find the copied case (same title, different id, no suite)
    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
    })
    const allCases = listRes.json() as Array<{ id: string; title: string; suite_id: string | null }>
    const copied = allCases.find((c) => c.id !== srcId && c.title === "Bulk copy source case")
    expect(copied).toBeDefined()
    expect(copied!.id).not.toBe(srcId)
    expect(copied!.suite_id).toBeNull()
  })

  it("action=copy: copied case has same step count as source — 0 orphaned steps (TC-05, Pitfall 5)", async () => {
    // Create source case with 3 steps
    const srcRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "Pitfall 5 source case",
        priority: "critical",
        steps: [
          { action: "Action A", expected_result: "Expected A" },
          { action: "Action B", expected_result: "Expected B" },
          { action: "Action C" },
        ],
      },
    })
    const { id: srcId } = srcRes.json() as { id: string }

    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "copy", case_ids: [srcId], target_suite_id: suiteA },
    })

    // Find the copied case
    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases?suite_id=${suiteA}`,
    })
    const casesInSuite = listRes.json() as Array<{ id: string; title: string; step_count: number }>
    const copied = casesInSuite.find((c) => c.title === "Pitfall 5 source case")
    expect(copied).toBeDefined()

    // Verify step count equals source (critical: step_count=3, not 0)
    expect(copied!.step_count).toBe(3)

    // Also verify steps have the COPIED case's id (not original), via direct DB check
    const steps = await sql`SELECT test_case_id FROM test_case_steps WHERE test_case_id = ${copied!.id}::uuid`
    expect(steps).toHaveLength(3)
    // All steps must reference the NEW case id, not the source
    expect(steps.every((s) => s.test_case_id === copied!.id)).toBe(true)
  })

  it("action=duplicate: copies a case into its OWN suite titled 'Copy of {title}' with steps (VEL-18)", async () => {
    const srcRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "Regression login",
        priority: "high",
        suite_id: suiteA,
        steps: [
          { action: "Open login", expected_result: "Form shown" },
          { action: "Submit" },
        ],
      },
    })
    const { id: srcId } = srcRes.json() as { id: string }

    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "duplicate", case_ids: [srcId] },
    })
    expect(res.statusCode).toBe(201)
    expect((res.json() as { created: number }).created).toBe(1)

    // The duplicate lands in the SAME suite as its source, titled "Copy of …".
    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases?suite_id=${suiteA}`,
    })
    const inSuite = listRes.json() as Array<{ id: string; title: string; step_count: number; suite_id: string | null }>
    const dupe = inSuite.find((c) => c.title === "Copy of Regression login")
    expect(dupe).toBeDefined()
    expect(dupe!.id).not.toBe(srcId)
    expect(dupe!.suite_id).toBe(suiteA)
    expect(dupe!.step_count).toBe(2)
  })

  it("action=duplicate: preserves GWT step_type keywords on the copied steps", async () => {
    const srcRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "GWT checkout",
        priority: "medium",
        suite_id: suiteA,
        steps: [
          { step_type: "given", action: "a logged-in user" },
          { step_type: "when", action: "they check out" },
          { step_type: "then", action: "the order is placed" },
        ],
      },
    })
    const { id: srcId } = srcRes.json() as { id: string }

    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "duplicate", case_ids: [srcId] },
    })

    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases?suite_id=${suiteA}`,
    })
    const dupe = (listRes.json() as Array<{ id: string; title: string }>).find(
      (c) => c.title === "Copy of GWT checkout"
    )
    expect(dupe).toBeDefined()

    // Regression guard: the copy path used to drop step_type, silently losing
    // Given/When/Then keywords on GWT projects.
    const steps = await sql`
      SELECT step_type FROM test_case_steps WHERE test_case_id = ${dupe!.id}::uuid ORDER BY step_order
    `
    expect(steps.map((s) => s.step_type)).toEqual(["given", "when", "then"])
  })

  it("action=copy: preserves GWT step_type keywords on the copied steps", async () => {
    const srcRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: {
        title: "GWT copy source",
        priority: "medium",
        suite_id: suiteA,
        steps: [
          { step_type: "given", action: "a precondition" },
          { step_type: "then", action: "an outcome" },
        ],
      },
    })
    const { id: srcId } = srcRes.json() as { id: string }

    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "copy", case_ids: [srcId], target_suite_id: null },
    })

    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
    })
    const copied = (listRes.json() as Array<{ id: string; title: string; suite_id: string | null }>).find(
      (c) => c.id !== srcId && c.title === "GWT copy source" && c.suite_id === null
    )
    expect(copied).toBeDefined()

    const steps = await sql`
      SELECT step_type FROM test_case_steps WHERE test_case_id = ${copied!.id}::uuid ORDER BY step_order
    `
    expect(steps.map((s) => s.step_type)).toEqual(["given", "then"])
  })

  it("action=delete: sets deleted_at for selected cases, leaves others untouched (TC-05)", async () => {
    const d1Res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: { title: "Bulk delete case 1", priority: "low", steps: [] },
    })
    const d2Res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: { title: "Bulk delete case 2", priority: "low", steps: [] },
    })
    const keepRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: { title: "Bulk keep case", priority: "low", steps: [] },
    })
    const { id: d1 } = d1Res.json() as { id: string }
    const { id: d2 } = d2Res.json() as { id: string }
    const { id: keepId } = keepRes.json() as { id: string }

    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "delete", case_ids: [d1, d2] },
    })
    expect(res.statusCode).toBe(204)

    // d1 and d2 should have deleted_at set
    const deletedRows = await sql`SELECT id, deleted_at FROM test_cases WHERE id = ANY(${[d1, d2]}::uuid[])`
    expect(deletedRows.every((r) => r.deleted_at !== null)).toBe(true)

    // keepId must be untouched
    const keepRow = await sql`SELECT deleted_at FROM test_cases WHERE id = ${keepId}::uuid`
    expect(keepRow[0]?.deleted_at).toBeNull()
  })

  it("action=delete: records deleted_by (attribution for the recycle bin)", async () => {
    const mkRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: { title: "Attributed case", priority: "low", steps: [] },
    })
    const caseId = (mkRes.json() as { id: string }).id

    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "delete", case_ids: [caseId] },
    })

    const row = (await sql`SELECT deleted_by FROM test_cases WHERE id = ${caseId}::uuid`)[0] as
      | { deleted_by: string | null }
      | undefined
    expect(row?.deleted_by).toBe(userId)
  })

  it("action=restore: clears deleted_at so soft-deleted cases come back (Undo)", async () => {
    const mk = async (title: string) => {
      const res = await appA.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
        payload: { title, priority: "low", steps: [] },
      })
      return (res.json() as { id: string }).id
    }
    const r1 = await mk("Restore case 1")
    const r2 = await mk("Restore case 2")

    // Soft-delete both…
    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "delete", case_ids: [r1, r2] },
    })
    const afterDelete = await sql`SELECT deleted_at FROM test_cases WHERE id = ANY(${[r1, r2]}::uuid[])`
    expect(afterDelete.every((row) => row.deleted_at !== null)).toBe(true)

    // …then restore them.
    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "restore", case_ids: [r1, r2] },
    })
    expect(res.statusCode).toBe(204)

    const afterRestore = await sql`SELECT deleted_at FROM test_cases WHERE id = ANY(${[r1, r2]}::uuid[])`
    expect(afterRestore.every((row) => row.deleted_at === null)).toBe(true)
  })

  it("action=purge: permanently deletes a soft-deleted case but keeps its run history (VEL-31)", async () => {
    const mkRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: { title: "Case to purge", priority: "low", steps: [{ action: "do a thing", expected_result: "it works" }] },
    })
    const caseId = (mkRes.json() as { id: string }).id

    // A run item referencing this case, with an immutable title snapshot.
    const runId = uuidv7()
    const runItemId = uuidv7()
    await sql`
      INSERT INTO test_runs (id, workspace_id, project_id, name, status)
      VALUES (${runId}::uuid, ${workspaceA}::uuid, ${projectA}::uuid, 'Purge run', 'active')
    `
    await sql`
      INSERT INTO run_items (id, workspace_id, run_id, test_case_id, case_title, status)
      VALUES (${runItemId}::uuid, ${workspaceA}::uuid, ${runId}::uuid, ${caseId}::uuid, 'Case to purge', 'pass')
    `

    // A purge only fires on rows already in the recycle bin.
    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "delete", case_ids: [caseId] },
    })

    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "purge", case_ids: [caseId] },
    })
    expect(res.statusCode).toBe(204)

    // Case row + its steps are gone…
    expect((await sql`SELECT id FROM test_cases WHERE id = ${caseId}::uuid`).length).toBe(0)
    expect((await sql`SELECT id FROM test_case_steps WHERE test_case_id = ${caseId}::uuid`).length).toBe(0)
    // …but the run item survives, detached, with its snapshot intact.
    const item = (await sql`
      SELECT test_case_id, case_title FROM run_items WHERE id = ${runItemId}::uuid
    `)[0] as { test_case_id: string | null; case_title: string } | undefined
    expect(item?.test_case_id).toBeNull()
    expect(item?.case_title).toBe("Case to purge")
  })

  it("action=purge: leaves a case that is NOT soft-deleted untouched", async () => {
    const mkRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: { title: "Live case", priority: "low", steps: [] },
    })
    const caseId = (mkRes.json() as { id: string }).id

    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "purge", case_ids: [caseId] },
    })
    expect(res.statusCode).toBe(204)
    expect((await sql`SELECT id FROM test_cases WHERE id = ${caseId}::uuid`).length).toBe(1)
  })

  it("action=restore: reparents a case to root when its suite is still deleted (VEL-31)", async () => {
    // A soft-deleted suite with a soft-deleted case inside it.
    const deletedSuite = uuidv7()
    await sql`
      INSERT INTO suites (id, workspace_id, project_id, name, position, deleted_at)
      VALUES (${deletedSuite}::uuid, ${workspaceA}::uuid, ${projectA}::uuid, 'Gone suite', 1000, NOW())
    `
    const orphan = uuidv7()
    await sql`
      INSERT INTO test_cases (id, workspace_id, project_id, suite_id, title, priority, position, deleted_at)
      VALUES (${orphan}::uuid, ${workspaceA}::uuid, ${projectA}::uuid, ${deletedSuite}::uuid, 'Orphan case', 'low', 1000, NOW())
    `

    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "restore", case_ids: [orphan] },
    })

    const row = (await sql`SELECT deleted_at, suite_id FROM test_cases WHERE id = ${orphan}::uuid`)[0] as
      | { deleted_at: string | null; suite_id: string | null }
      | undefined
    expect(row?.deleted_at).toBeNull()
    expect(row?.suite_id).toBeNull() // reparented to root — its suite is still deleted
  })

  it("action=restore: keeps the suite when it is NOT deleted", async () => {
    const caseId = uuidv7()
    await sql`
      INSERT INTO test_cases (id, workspace_id, project_id, suite_id, title, priority, position, deleted_at)
      VALUES (${caseId}::uuid, ${workspaceA}::uuid, ${projectA}::uuid, ${suiteA}::uuid, 'Kept case', 'low', 1000, NOW())
    `
    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "restore", case_ids: [caseId] },
    })

    const row = (await sql`SELECT suite_id FROM test_cases WHERE id = ${caseId}::uuid`)[0] as
      | { suite_id: string | null }
      | undefined
    expect(row?.suite_id).toBe(suiteA) // suiteA is live → stays put
  })

  it("bulk endpoint returns 400 when case_ids is empty (TC-05)", async () => {
    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "move", case_ids: [], target_suite_id: suiteA },
    })
    expect(res.statusCode).toBe(400)
  })

  it("bulk endpoint returns 400 when target_suite_id missing for move/copy (TC-05)", async () => {
    const srcRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases`,
      payload: { title: "Missing target case", priority: "low", steps: [] },
    })
    const { id } = srcRes.json() as { id: string }

    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/cases/bulk`,
      payload: { action: "copy", case_ids: [id] }, // no target_suite_id
    })
    expect(res.statusCode).toBe(400)
  })
})
