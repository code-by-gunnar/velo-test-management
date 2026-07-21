import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import workspaceRoutes from "../workspaces.js"

// VEL-68: POST /workspaces/:id/seed writes sample suites + cases, so it must be
// editor+ — a viewer previously passed the membership check and could mutate the
// workspace.

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

describe("Seed endpoint RBAC (VEL-68)", () => {
  let workspaceId: string
  let projectId: string
  const userId = uuidv7()

  beforeAll(async () => {
    workspaceId = uuidv7()
    projectId = uuidv7()
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`seed-rbac-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Seed WS', ${`seed-ws-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'Seed Project', 'sdp')`
    await sql`INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${userId}::uuid, 'editor', true)`
  })

  afterAll(async () => {
    await sql`DELETE FROM test_cases WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM suites WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await sql.end()
  })

  async function seedAs(role: string) {
    const app = buildApp(userId, workspaceId, role)
    await app.register(workspaceRoutes)
    await app.ready()
    try {
      return await app.inject({ method: "POST", url: `/api/workspaces/${workspaceId}/seed` })
    } finally {
      await app.close()
    }
  }

  it("viewer CANNOT seed sample data (403 VIEWER_READONLY)", async () => {
    const res = await seedAs("viewer")
    expect(res.statusCode).toBe(403)
    expect((res.json() as { code?: string }).code).toBe("VIEWER_READONLY")
  })

  it("editor CAN seed sample data (201)", async () => {
    const res = await seedAs("editor")
    expect(res.statusCode).toBe(201)
    // Sample suites were created.
    const suites = await sql`SELECT id FROM suites WHERE workspace_id = ${workspaceId}::uuid`
    expect(suites.length).toBeGreaterThan(0)
  })
})
