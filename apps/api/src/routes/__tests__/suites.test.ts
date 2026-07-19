import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import suitesRoutes from "../suites.js"

// Set required env vars for testing
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

// Superuser SQL connection for test setup (bypasses RLS)
const sql = (await import("../../db/client.js")).sql

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildApp(userId: string, workspaceId: string) {
  const app = Fastify({ logger: false })
  // Simulate session plugin decoration
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

// ── Test data ─────────────────────────────────────────────────────────────────

describe("Suite routes integration (TC-01)", () => {
  let workspaceA: string
  let workspaceB: string
  let projectA: string
  let projectB: string
  let appA: ReturnType<typeof Fastify>
  let appB: ReturnType<typeof Fastify>
  const userId = uuidv7()

  beforeAll(async () => {
    workspaceA = uuidv7()
    workspaceB = uuidv7()
    projectA = uuidv7()
    projectB = uuidv7()

    // Insert a test user
    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`suite-test-${Date.now()}@example.com`}, 'hash', true)
    `

    // Create two workspaces + projects (superuser bypass for setup)
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier) VALUES
        (${workspaceA}::uuid, 'Suite WS A', ${`suite-ws-a-${Date.now()}`}, 'free'),
        (${workspaceB}::uuid, 'Suite WS B', ${`suite-ws-b-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO projects (id, workspace_id, name, project_key) VALUES
        (${projectA}::uuid, ${workspaceA}::uuid, 'Project A', 'pka'),
        (${projectB}::uuid, ${workspaceB}::uuid, 'Project B', 'pkb')
    `

    // Build two Fastify instances — one for each workspace
    appA = buildApp(userId, workspaceA)
    appB = buildApp(userId, workspaceB)

    await appA.register(suitesRoutes)
    await appB.register(suitesRoutes)

    await appA.ready()
    await appB.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM suites WHERE workspace_id IN (${workspaceA}::uuid, ${workspaceB}::uuid)`
    await sql`DELETE FROM projects WHERE id IN (${projectA}::uuid, ${projectB}::uuid)`
    await sql`DELETE FROM workspaces WHERE id IN (${workspaceA}::uuid, ${workspaceB}::uuid)`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await appA.close()
    await appB.close()
    await sql.end()
  })

  // ── GET /suites ─────────────────────────────────────────────────────────────

  it("GET /suites returns empty array when no suites exist", async () => {
    const res = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it("GET /suites returns 403 when workspaceId param does not match session", async () => {
    // appA session says workspaceA, but we request workspaceB
    const res = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceB}/projects/${projectA}/suites`,
    })
    expect(res.statusCode).toBe(403)
  })

  // ── POST /suites ────────────────────────────────────────────────────────────

  it("POST /suites creates a root suite with position 1000", async () => {
    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
      payload: { name: "Root Suite" },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { id: string; name: string; position: number; parent_id: string | null }
    expect(body.name).toBe("Root Suite")
    expect(body.position).toBe(1000)
    expect(body.parent_id).toBeNull()
  })

  it("POST /suites creates a second root suite with position 2000", async () => {
    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
      payload: { name: "Second Root Suite" },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { position: number }
    expect(body.position).toBe(2000)
  })

  it("GET /suites returns flat array with depth field", async () => {
    // Get all suites — should include root and children
    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
    })
    expect(listRes.statusCode).toBe(200)
    const suites = listRes.json() as Array<{ id: string; depth: number; name: string }>
    expect(suites.length).toBeGreaterThanOrEqual(2)
    // All root suites have depth 0
    suites.forEach((s) => {
      expect(s).toHaveProperty("depth")
      expect(s).toHaveProperty("id")
      expect(s).toHaveProperty("name")
    })
    const roots = suites.filter((s) => s.depth === 0)
    expect(roots.length).toBeGreaterThanOrEqual(2)
  })

  it("POST /suites creates a child suite with correct depth parent", async () => {
    // Get the first suite to use as parent
    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
    })
    const suites = listRes.json() as Array<{ id: string; depth: number }>
    const rootSuite = suites.find((s) => s.depth === 0)!

    const res = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
      payload: { name: "Child Suite", parent_id: rootSuite.id },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { parent_id: string; position: number }
    expect(body.parent_id).toBe(rootSuite.id)
    expect(body.position).toBe(1000) // first child
  })

  it("GET /suites recursive CTE returns child suites with depth 1", async () => {
    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
    })
    const suites = listRes.json() as Array<{ id: string; depth: number }>
    const children = suites.filter((s) => s.depth === 1)
    expect(children.length).toBeGreaterThanOrEqual(1)
  })

  // ── Workspace isolation (recursive CTE workspace_id on both branches) ────────

  it("Workspace A suites are NOT visible from Workspace B (RLS isolation)", async () => {
    // Create a suite in workspace A
    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
      payload: { name: "WS-A Exclusive Suite" },
    })

    // Create a suite in workspace B
    await appB.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceB}/projects/${projectB}/suites`,
      payload: { name: "WS-B Suite" },
    })

    // Query from workspace B's app — should only see workspace B suites
    const resB = await appB.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceB}/projects/${projectB}/suites`,
    })
    const suitesB = resB.json() as Array<{ name: string }>
    const names = suitesB.map((s) => s.name)
    expect(names).not.toContain("WS-A Exclusive Suite")
    expect(names).toContain("WS-B Suite")
  })

  // ── PATCH /suites/:id ───────────────────────────────────────────────────────

  it("PATCH /suites/:id renames the suite", async () => {
    // Create a suite to rename
    const createRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
      payload: { name: "Old Name" },
    })
    const { id } = createRes.json() as { id: string }

    const patchRes = await appA.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites/${id}`,
      payload: { name: "New Name" },
    })
    expect(patchRes.statusCode).toBe(200)
    const body = patchRes.json() as { name: string }
    expect(body.name).toBe("New Name")
  })

  // ── PATCH /suites/:id/position ──────────────────────────────────────────────

  it("PATCH /suites/:id/position updates the position", async () => {
    const createRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
      payload: { name: "Movable Suite" },
    })
    const { id } = createRes.json() as { id: string }

    const patchRes = await appA.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites/${id}/position`,
      payload: { position: 3500 },
    })
    expect(patchRes.statusCode).toBe(200)
    const body = patchRes.json() as { position: number }
    expect(body.position).toBe(3500)
  })

  // ── TC-04: Suite position renumber ───────────────────────────────────────────

  it("PATCH /suites/:id/position with -1 renumbers all sibling suites at 1000 increments (TC-04)", async () => {
    // Create 3 root suites in a fresh project for clean renumber test
    const renumWsId = uuidv7()
    const renumProjId = uuidv7()
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier) VALUES
        (${renumWsId}::uuid, 'Renum WS', ${`renum-ws-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO projects (id, workspace_id, name, project_key) VALUES
        (${renumProjId}::uuid, ${renumWsId}::uuid, 'Renum Project', 'rnp')
    `
    const renumApp = buildApp(userId, renumWsId)
    await renumApp.register(suitesRoutes)
    await renumApp.ready()

    const createdIds: string[] = []
    for (let i = 0; i < 3; i++) {
      const res = await renumApp.inject({
        method: "POST",
        url: `/api/workspaces/${renumWsId}/projects/${renumProjId}/suites`,
        payload: { name: `Sibling Suite ${i}` },
      })
      const { id } = res.json() as { id: string }
      createdIds.push(id)
    }

    // Trigger renumber via position = -1
    const patchRes = await renumApp.inject({
      method: "PATCH",
      url: `/api/workspaces/${renumWsId}/projects/${renumProjId}/suites/${createdIds[0]}/position`,
      payload: { position: -1 },
    })
    expect(patchRes.statusCode).toBe(204)

    // Verify all siblings are renumbered at 1000, 2000, 3000
    const rows = await sql`
      SELECT id, position FROM suites
      WHERE project_id = ${renumProjId}::uuid
        AND parent_id IS NULL
        AND workspace_id = ${renumWsId}::uuid
      ORDER BY position
    `
    rows.forEach((row, idx) => {
      expect(row.position).toBe((idx + 1) * 1000)
    })

    // Cleanup
    await renumApp.close()
    await sql`DELETE FROM suites WHERE workspace_id = ${renumWsId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${renumProjId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${renumWsId}::uuid`
  })

  it("PATCH /suites/:id/position returns 403 when workspaceId param does not match session (TC-04)", async () => {
    const res = await appA.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceB}/projects/${projectB}/suites/some-id/position`,
      payload: { position: 500 },
    })
    expect(res.statusCode).toBe(403)
  })

  // ── DELETE /suites/:id ──────────────────────────────────────────────────────

  it("DELETE /suites/:id hard-deletes the suite", async () => {
    const createRes = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
      payload: { name: "Suite to Delete" },
    })
    const { id } = createRes.json() as { id: string }

    const deleteRes = await appA.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites/${id}`,
    })
    expect(deleteRes.statusCode).toBe(204)

    // Verify it's gone from the list
    const listRes = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
    })
    const suites = listRes.json() as Array<{ id: string }>
    expect(suites.find((s) => s.id === id)).toBeUndefined()
  })

  // ── Suite description (Phase: suite descriptions) ──────────────────────────

  it("GET /suites includes a description field (null by default, set when created with one)", async () => {
    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
      payload: { name: "No Desc" },
    })
    await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
      payload: { name: "Has Desc", description: "covers login" },
    })

    const res = await appA.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
    })
    expect(res.statusCode).toBe(200)
    const suites = res.json() as Array<{ name: string; description: string | null }>
    expect(suites.find((s) => s.name === "No Desc")?.description).toBeNull()
    expect(suites.find((s) => s.name === "Has Desc")?.description).toBe("covers login")
  })

  it("PATCH updates description only, name only, and both; rejects empty body", async () => {
    const created = await appA.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
      payload: { name: "Original" },
    })
    const id = (created.json() as { id: string }).id

    const patchDesc = await appA.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites/${id}`,
      payload: { description: "now described" },
    })
    expect(patchDesc.statusCode).toBe(200)
    expect((patchDesc.json() as { description: string | null }).description).toBe("now described")
    expect((patchDesc.json() as { name: string }).name).toBe("Original")

    const patchName = await appA.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites/${id}`,
      payload: { name: "Renamed" },
    })
    expect((patchName.json() as { name: string }).name).toBe("Renamed")
    expect((patchName.json() as { description: string | null }).description).toBe("now described")

    const empty = await appA.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites/${id}`,
      payload: {},
    })
    expect(empty.statusCode).toBe(400)
  })

  it("GET /suites returns 401 when no session (userId empty)", async () => {
    const noAuthApp = Fastify({ logger: false })
    noAuthApp.decorateRequest("userId", "")
    noAuthApp.decorateRequest("workspaceId", "")
    noAuthApp.decorateRequest("userRole", "")
    // Don't set userId — leaves it as empty string (no session)
    await noAuthApp.register(suitesRoutes)
    await noAuthApp.ready()

    const res = await noAuthApp.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceA}/projects/${projectA}/suites`,
    })
    expect(res.statusCode).toBe(401)
    await noAuthApp.close()
  })
})
