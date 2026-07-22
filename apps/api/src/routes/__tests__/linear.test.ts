import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"

// INT-01: Linear connection status/disconnect + defect → Linear auto-filing.
//
// Scope notes (VEL-73):
// - The OAuth /linear/auth + /linear/callback routes were removed as dead code
//   (connect is API-key-only — see CLAUDE.md), so there's nothing to cover there.
// - Inbound webhook status-sync (INT-02: signature verification + idempotency)
//   is already covered in linear-webhook.test.ts + linear-webhook-idempotency.test.ts.
// This file covers what's current and untested: status, disconnect, and the
// defect auto-file path (with the Linear client mocked — no real API calls).
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379"

vi.mock("../../lib/linear-client.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createLinearIssue: vi.fn(async () => ({ identifier: "BUG-1", url: "https://linear.app/velo/issue/BUG-1" })),
  getLinearBugLabelId: vi.fn(async () => null),
  createLinearAttachmentLink: vi.fn(async () => undefined),
}))
vi.mock("../../lib/encryption.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  decrypt: vi.fn(() => "fake-linear-token"),
}))
vi.mock("../../lib/storage.js", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  storageEnabled: () => false,
}))

const sql = (await import("../../db/client.js")).sql
const linearClient = await import("../../lib/linear-client.js")
const createLinearIssue = linearClient.createLinearIssue as unknown as ReturnType<typeof vi.fn>
const defectRoutes = (await import("../defects.js")).default
const linearRoutes = (await import("../linear.js")).default

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

describe("Linear connection + defect auto-file (INT-01)", () => {
  let app: ReturnType<typeof Fastify>
  const wsId = uuidv7()
  const userId = uuidv7()
  const projectId = uuidv7()
  const caseId = uuidv7()
  const runId = uuidv7()
  const itemId = uuidv7()
  const stamp = Date.now()

  beforeAll(async () => {
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`linear-${stamp}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${wsId}::uuid, 'Linear WS', ${`linear-${stamp}`}, 'free')`
    await sql`INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active)
      VALUES (${uuidv7()}::uuid, ${wsId}::uuid, ${userId}::uuid, 'admin', true)`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${wsId}::uuid, 'Linear Project', 'lnp')`
    await sql`INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
      VALUES (${caseId}::uuid, ${wsId}::uuid, ${projectId}::uuid, 'Login case', 'high', 1000)`
    await sql`INSERT INTO test_runs (id, workspace_id, project_id, name, status)
      VALUES (${runId}::uuid, ${wsId}::uuid, ${projectId}::uuid, 'Run', 'active')`
    await sql`INSERT INTO run_items (id, workspace_id, run_id, test_case_id, status)
      VALUES (${itemId}::uuid, ${wsId}::uuid, ${runId}::uuid, ${caseId}::uuid, 'fail')`

    app = buildApp(userId, wsId)
    await app.register(defectRoutes)
    await app.register(linearRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM defects WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM linear_connections WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM run_items WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM test_runs WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM test_cases WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM projects WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${wsId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  async function connect() {
    await sql`INSERT INTO linear_connections (id, workspace_id, access_token_enc, api_key_enc, linear_org_id, linear_org_name, team_id, team_name, connected_by)
      VALUES (${uuidv7()}::uuid, ${wsId}::uuid, NULL, 'enc-key', 'org1', 'Acme', 'team-123', 'Eng', ${userId}::uuid)`
  }
  const disconnectDb = () => sql`DELETE FROM linear_connections WHERE workspace_id = ${wsId}::uuid`

  const fileDefect = (body: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: `/api/workspaces/${wsId}/defects`,
      headers: { "content-type": "application/json" },
      payload: body,
    })

  it("GET /linear/status reports disconnected then connected", async () => {
    await disconnectDb()
    const off = await app.inject({ method: "GET", url: `/api/workspaces/${wsId}/linear/status` })
    expect(off.statusCode).toBe(200)
    expect((off.json() as { connected: boolean }).connected).toBe(false)

    await connect()
    const on = await app.inject({ method: "GET", url: `/api/workspaces/${wsId}/linear/status` })
    expect((on.json() as { connected: boolean }).connected).toBe(true)
    await disconnectDb()
  })

  it("DELETE /linear/disconnect removes the connection", async () => {
    await connect()
    const res = await app.inject({ method: "DELETE", url: `/api/workspaces/${wsId}/linear/disconnect` })
    expect(res.statusCode).toBe(200)
    const [row] = await sql`SELECT count(*)::int AS n FROM linear_connections WHERE workspace_id = ${wsId}::uuid`
    expect((row as { n: number }).n).toBe(0)
  })

  it("POST defect with Linear connected creates a Linear issue and sets external_id/url", async () => {
    await connect()
    createLinearIssue.mockClear()
    const res = await fileDefect({ run_item_id: itemId, title: "Login fails on Safari", description: "Steps: ..." })
    expect(res.statusCode).toBe(201)

    // The Linear client was called with the defect's title + description.
    expect(createLinearIssue).toHaveBeenCalledTimes(1)
    const [, issueInput] = createLinearIssue.mock.calls[0] as [string, { title: string; description?: string; teamId: string }]
    expect(issueInput.title).toBe("Login fails on Safari")
    expect(issueInput.description).toBe("Steps: ...")
    expect(issueInput.teamId).toBe("team-123")

    // The link is persisted on the defect.
    const [row] = await sql`SELECT external_id, external_url, external_status FROM defects WHERE run_item_id = ${itemId}::uuid ORDER BY created_at DESC LIMIT 1`
    const d = row as { external_id: string; external_url: string; external_status: string }
    expect(d.external_id).toBe("BUG-1")
    expect(d.external_url).toContain("linear.app")
    expect(d.external_status).toBe("Todo")

    await sql`DELETE FROM defects WHERE workspace_id = ${wsId}::uuid`
    await disconnectDb()
  })

  it("POST defect without Linear connected saves locally only (no external_id, no Linear call)", async () => {
    await disconnectDb()
    createLinearIssue.mockClear()
    const res = await fileDefect({ run_item_id: itemId, title: "Local-only defect" })
    expect(res.statusCode).toBe(201)
    expect(createLinearIssue).not.toHaveBeenCalled()

    const [row] = await sql`SELECT external_id FROM defects WHERE run_item_id = ${itemId}::uuid ORDER BY created_at DESC LIMIT 1`
    expect((row as { external_id: string | null }).external_id).toBeNull()
    await sql`DELETE FROM defects WHERE workspace_id = ${wsId}::uuid`
  })
})
