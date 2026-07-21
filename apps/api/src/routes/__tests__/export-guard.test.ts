import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"

// VEL-70: synchronous export must refuse (413) when a workspace exceeds the
// row cap, rather than buffering everything and risking an OOM. Set a tiny cap
// BEFORE importing the route so it's picked up at module load.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
// The route floors the cap at 1000 (prod footgun guard), so exercise the guard
// just above that floor.
process.env.EXPORT_MAX_ROWS = "1000"

const sql = (await import("../../db/client.js")).sql
const exportRoutes = (await import("../export.js")).default

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

describe("Export row-count guard (VEL-70)", () => {
  let workspaceId: string
  let projectId: string
  const userId = uuidv7()
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    workspaceId = uuidv7()
    projectId = uuidv7()
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`export-guard-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Export WS', ${`export-ws-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'Export Project', 'exp')`
    await sql`INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${userId}::uuid, 'admin', true)`
    // 1001 cases > cap of 1000.
    await sql`
      INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
      SELECT gen_random_uuid(), ${workspaceId}::uuid, ${projectId}::uuid, 'C' || g, 'low', g
      FROM generate_series(1, 1001) AS g`

    app = buildApp(userId, workspaceId)
    await app.register(exportRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM test_cases WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  it("returns 413 EXPORT_TOO_LARGE when the workspace exceeds the row cap", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/export?format=json`,
    })
    expect(res.statusCode).toBe(413)
    const body = res.json() as { code?: string; total_rows?: number; max_rows?: number }
    expect(body.code).toBe("EXPORT_TOO_LARGE")
    expect(body.total_rows).toBe(1001)
    expect(body.max_rows).toBe(1000)
  })
})
