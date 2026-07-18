import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379"

// Mock captureEvent — path must resolve to the SAME module reports.ts imports
// (reports.ts: `../lib/posthog.js` → src/lib/posthog.js; from here: `../../lib/posthog.js`).
const { captureEventMock } = vi.hoisted(() => ({ captureEventMock: vi.fn() }))
vi.mock("../../lib/posthog.js", () => ({ captureEvent: captureEventMock }))

const sql = (await import("../../db/client.js")).sql
const reportsRoutes = (await import("../reports.js")).default
const { valkey } = await import("../../lib/valkey.js")

function buildApp(userId: string, workspaceId: string) {
  const app = Fastify({ logger: false })
  app.decorate("valkey", valkey)
  app.decorateRequest("userId", "")
  app.decorateRequest("workspaceId", "")
  app.addHook("preHandler", async (request) => {
    request.userId = userId
    request.workspaceId = workspaceId
  })
  return app
}

describe("Reports route (VEL-54 batch 2)", () => {
  let workspaceId: string
  let userId: string
  let viewProjectId: string
  let ciProjectId: string
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    workspaceId = uuidv7()
    userId = uuidv7()
    viewProjectId = uuidv7()
    ciProjectId = uuidv7()

    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`reports-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Reports WS', ${`reports-ws-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${viewProjectId}::uuid, ${workspaceId}::uuid, 'View Project', 'vp'),
             (${ciProjectId}::uuid, ${workspaceId}::uuid, 'CI Project', 'cp')`

    // View project: a completed run with one item (enough to produce a report).
    const viewRunId = uuidv7()
    await sql`INSERT INTO test_runs (id, workspace_id, project_id, name, status, completed_at)
      VALUES (${viewRunId}::uuid, ${workspaceId}::uuid, ${viewProjectId}::uuid, 'View Run', 'completed', NOW())`
    await sql`INSERT INTO run_items (id, workspace_id, run_id, status, executed_at)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${viewRunId}::uuid, 'pass', NOW())`

    // CI project: a CI-ingested failing item. Ingestion never sets run_items.executed_at,
    // so it stays NULL; the run carries completed_at instead.
    const ciSuiteId = uuidv7()
    const ciCaseId = uuidv7()
    await sql`INSERT INTO suites (id, workspace_id, project_id, name, position)
      VALUES (${ciSuiteId}::uuid, ${workspaceId}::uuid, ${ciProjectId}::uuid, 'CI Suite', 1000)`
    await sql`INSERT INTO test_cases (id, workspace_id, project_id, suite_id, title, priority, position)
      VALUES (${ciCaseId}::uuid, ${workspaceId}::uuid, ${ciProjectId}::uuid, ${ciSuiteId}::uuid, 'Flaky CI Case', 'high', 1000)`
    const ciRunId = uuidv7()
    await sql`INSERT INTO test_runs (id, workspace_id, project_id, name, status, completed_at)
      VALUES (${ciRunId}::uuid, ${workspaceId}::uuid, ${ciProjectId}::uuid, 'CI Run', 'completed', NOW())`
    await sql`INSERT INTO run_items (id, workspace_id, run_id, test_case_id, status, executed_at)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${ciRunId}::uuid, ${ciCaseId}::uuid, 'fail', NULL)`

    app = buildApp(userId, workspaceId)
    await app.register(reportsRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await valkey.del(`reports:${workspaceId}:${viewProjectId}`, `reports:${workspaceId}:${ciProjectId}`)
    await app.close()
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
  })

  it("fires report_viewed on every request, including cache hits (not just cache misses)", async () => {
    captureEventMock.mockClear()
    const url = `/api/workspaces/${workspaceId}/projects/${viewProjectId}/reports`

    const first = await app.inject({ method: "GET", url }) // cache miss — computes + caches
    const second = await app.inject({ method: "GET", url }) // cache hit — returns cached payload

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)

    const views = captureEventMock.mock.calls.filter(([, event]) => event === "report_viewed")
    expect(views).toHaveLength(2)
  })

  it("counts CI-ingested failures (executed_at NULL) as fragile via completed_at fallback", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/projects/${ciProjectId}/reports`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { fragile_cases: Array<{ case_title: string; last_failed_at: string | null }> }
    const flaky = body.fragile_cases.find((c) => c.case_title === "Flaky CI Case")
    expect(flaky).toBeDefined()
    expect(flaky?.last_failed_at).not.toBeNull()
  })
})
