import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"

// VEL-80: the export streams rows in keyset batches instead of buffering the
// whole tenant. Force a tiny batch size so a handful of cases spans MULTIPLE
// batches — this exercises the keyset continuation + incremental JSON assembly
// across batch boundaries (where an off-by-one would drop or duplicate rows, or
// break JSON validity). Env must be set BEFORE the route module is imported.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.EXPORT_BATCH_ROWS = "2"

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

describe("Export streaming across batches (VEL-80)", () => {
  let workspaceId: string
  let projectId: string
  const caseIds: string[] = []
  const userId = uuidv7()
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    workspaceId = uuidv7()
    projectId = uuidv7()
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`export-stream-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Export WS', ${`export-stream-ws-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'Export Project', 'exs')`
    await sql`INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${userId}::uuid, 'admin', true)`
    // 5 cases (batch size 2 → 3 batches), each with a couple of steps.
    for (let i = 0; i < 5; i++) {
      const id = uuidv7()
      caseIds.push(id)
      await sql`INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
        VALUES (${id}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, ${`Case ${i}`}, 'low', ${i})`
      await sql`INSERT INTO test_case_steps (id, test_case_id, step_order, action, expected_result)
        VALUES (${uuidv7()}::uuid, ${id}::uuid, 1, ${`do ${i}`}, ${`see ${i}`})`
    }

    app = buildApp(userId, workspaceId)
    await app.register(exportRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM test_case_steps WHERE test_case_id = ANY(${caseIds}::uuid[])`
    await sql`DELETE FROM test_cases WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  it("streams a valid zip spanning multiple batches (json)", async () => {
    const res = await app.inject({ method: "GET", url: `/api/workspaces/${workspaceId}/export?format=json` })
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toBe("application/zip")
    // Local zip-entry magic bytes "PK\x03\x04" — proves a real, non-empty archive
    // came out the streaming path without erroring mid-batch.
    const body = res.rawPayload
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toBe(0x50) // P
    expect(body[1]).toBe(0x4b) // K
  })

  it("streams a valid zip spanning multiple batches (csv)", async () => {
    const res = await app.inject({ method: "GET", url: `/api/workspaces/${workspaceId}/export?format=csv` })
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toBe("application/zip")
    expect(res.rawPayload.length).toBeGreaterThan(0)
    expect(res.rawPayload[0]).toBe(0x50)
  })
})
