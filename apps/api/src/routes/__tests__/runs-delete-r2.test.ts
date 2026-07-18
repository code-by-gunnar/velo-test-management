import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379"

// Mock only deleteR2Objects — path must resolve to the SAME module runs.ts imports
// (runs.ts: `../lib/r2.js` → src/lib/r2.js; from here: `../../lib/r2.js`).
const { deleteR2ObjectsMock } = vi.hoisted(() => ({
  deleteR2ObjectsMock: vi.fn(async (keys: string[]) => keys.length),
}))
vi.mock("../../lib/r2.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/r2.js")>()
  return { ...actual, deleteR2Objects: deleteR2ObjectsMock }
})

const sql = (await import("../../db/client.js")).sql
const runsRoutes = (await import("../runs.js")).default

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

describe("Run delete R2 cleanup (VEL-54 batch 2)", () => {
  let workspaceId: string
  let projectId: string
  let userId: string
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    workspaceId = uuidv7()
    projectId = uuidv7()
    userId = uuidv7()

    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`run-del-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Del WS', ${`del-ws-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'Del Project', 'dp')`

    app = buildApp(userId, workspaceId)
    await app.register(runsRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
  })

  it("best-effort deletes evidence R2 objects for the run's attachments on hard delete", async () => {
    deleteR2ObjectsMock.mockClear()

    const runId = uuidv7()
    const itemId = uuidv7()
    const r2Key = `evidence/${workspaceId}/${itemId}/screenshot.png`
    await sql`INSERT INTO test_runs (id, workspace_id, project_id, name, status)
      VALUES (${runId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'Run', 'active')`
    await sql`INSERT INTO run_items (id, workspace_id, run_id, status)
      VALUES (${itemId}::uuid, ${workspaceId}::uuid, ${runId}::uuid, 'fail')`
    await sql`INSERT INTO run_item_attachments (id, workspace_id, run_item_id, filename, r2_key, content_type, size_bytes)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${itemId}::uuid, 'screenshot.png', ${r2Key}, 'image/png', 1234)`

    const res = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/runs/${runId}`,
    })

    expect(res.statusCode).toBe(204)
    expect(deleteR2ObjectsMock).toHaveBeenCalledTimes(1)
    expect(deleteR2ObjectsMock.mock.calls[0]?.[0]).toEqual([r2Key])

    // Run row is gone.
    const rows = await sql`SELECT id FROM test_runs WHERE id = ${runId}::uuid`
    expect(rows).toHaveLength(0)
  })
})
