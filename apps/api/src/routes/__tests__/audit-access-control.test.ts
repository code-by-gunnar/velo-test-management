import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import workspacesRoutes from "../workspaces.js"
import runsRoutes from "../runs.js"

// Audit 2026-07-18 findings #1 and #2:
//   #1 — SSE stream endpoint must 404 on a run belonging to another workspace
//        (previously subscribed to the global run:{id} channel regardless).
//   #2 — Project PATCH requires editor, project DELETE requires admin
//        (previously any member, including viewers, could rename/delete).

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

// Superuser SQL connection for test setup (bypasses RLS)
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

describe("Audit fixes: project role guards (#2) and cross-tenant SSE (#1)", () => {
  const wsAId = uuidv7()
  const wsBId = uuidv7()
  const projectAId = uuidv7()
  const foreignRunId = uuidv7()
  const userAId = uuidv7()
  const userBId = uuidv7()

  beforeAll(async () => {
    const stamp = Date.now()
    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES
        (${userAId}::uuid, ${`audit-a-${stamp}@example.com`}, 'hash', true),
        (${userBId}::uuid, ${`audit-b-${stamp}@example.com`}, 'hash', true)
    `
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES
        (${wsAId}::uuid, 'Audit WS A', ${`audit-ws-a-${stamp}`}, 'free'),
        (${wsBId}::uuid, 'Audit WS B', ${`audit-ws-b-${stamp}`}, 'free')
    `
    await sql`
      INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectAId}::uuid, ${wsAId}::uuid, 'Audit Project', 'audit')
    `
    // Run living in workspace B — the foreign run for the SSE test
    await sql`
      INSERT INTO test_runs (id, workspace_id, project_id, name, status)
      VALUES (${foreignRunId}::uuid, ${wsBId}::uuid, ${projectAId}::uuid, 'Foreign Run', 'active')
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM test_runs WHERE workspace_id = ${wsBId}::uuid`
    await sql`DELETE FROM projects WHERE workspace_id = ${wsAId}::uuid`
    await sql`DELETE FROM workspaces WHERE id IN (${wsAId}::uuid, ${wsBId}::uuid)`
    await sql`DELETE FROM users WHERE id IN (${userAId}::uuid, ${userBId}::uuid)`
    await sql.end()
  })

  // ── #2: PATCH project — viewer blocked, editor allowed ─────────────────────

  it("PATCH project returns 403 VIEWER_READONLY for viewer role", async () => {
    const app = buildApp(userAId, wsAId, "viewer")
    await app.register(workspacesRoutes)
    await app.ready()
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${wsAId}/projects/${projectAId}`,
      payload: { name: "Renamed by viewer" },
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { code?: string }).code).toBe("VIEWER_READONLY")
    await app.close()
  })

  it("PATCH project succeeds for editor role", async () => {
    const app = buildApp(userAId, wsAId, "editor")
    await app.register(workspacesRoutes)
    await app.ready()
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${wsAId}/projects/${projectAId}`,
      payload: { name: "Renamed by editor" },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { name: string }).name).toBe("Renamed by editor")
    await app.close()
  })

  // ── #2: DELETE project — editor blocked, admin allowed ─────────────────────

  it("DELETE project returns 403 ADMIN_REQUIRED for editor role", async () => {
    const app = buildApp(userAId, wsAId, "editor")
    await app.register(workspacesRoutes)
    await app.ready()
    const res = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${wsAId}/projects/${projectAId}`,
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { code?: string }).code).toBe("ADMIN_REQUIRED")
    await app.close()
  })

  it("DELETE project succeeds for admin role", async () => {
    const app = buildApp(userAId, wsAId, "admin")
    await app.register(workspacesRoutes)
    await app.ready()
    const res = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${wsAId}/projects/${projectAId}`,
    })
    expect([200, 204]).toContain(res.statusCode)
    await app.close()
  })

  // ── #1: SSE stream — foreign run must 404 before any subscription ──────────

  it("GET /runs/:runId/stream returns 404 for a run in another workspace", async () => {
    // User A (workspace A) requests workspace A's stream URL with workspace B's run ID.
    // The workspaceId param check passes (A === A); ownership of the run must be
    // verified via RLS before SSE headers are written or any channel is subscribed.
    const app = buildApp(userAId, wsAId, "admin")
    await app.register(runsRoutes)
    await app.ready()
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${wsAId}/runs/${foreignRunId}/stream`,
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
