import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import type { Redis } from "iovalkey"
import defectsRoutes from "../defects.js"
import { createLinearIssue } from "../../lib/linear-client.js"

// Real encryption (set a valid key + store a genuinely-encrypted token). Only the
// Linear network client is mocked. Paths are relative to this test file
// (src/routes/__tests__), so lib is two levels up — matching what defects.js
// resolves, otherwise the mock would register under a different module id.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"

vi.mock("../../lib/linear-client.js", () => ({
  createLinearIssue: vi.fn(),
  createLinearAttachmentLink: vi.fn().mockResolvedValue(undefined),
  getLinearBugLabelId: vi.fn().mockResolvedValue(null),
}))

const sql = (await import("../../db/client.js")).sql
const { encrypt } = await import("../../lib/encryption.js")
const mockCreateIssue = vi.mocked(createLinearIssue)

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
  app.decorate("valkey", { publish: vi.fn().mockResolvedValue(1) } as unknown as Redis)
  return app
}

describe("Defect Linear link-persist (VEL-51 / audit #16)", () => {
  let workspaceId: string, projectId: string, caseId: string, runId: string, itemId: string
  const userId = uuidv7()
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    workspaceId = uuidv7(); projectId = uuidv7(); caseId = uuidv7(); runId = uuidv7(); itemId = uuidv7()
    await sql`INSERT INTO users (id, email, password_hash, email_verified) VALUES (${userId}::uuid, ${`dl-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier) VALUES (${workspaceId}::uuid, 'DL WS', ${`dl-ws-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key) VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'DL Proj', 'dlp')`
    await sql`INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position) VALUES (${caseId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'Case', 'high', 1000)`
    await sql`INSERT INTO test_runs (id, workspace_id, project_id, name, status) VALUES (${runId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'Run', 'active')`
    await sql`INSERT INTO run_items (id, workspace_id, run_id, test_case_id, status) VALUES (${itemId}::uuid, ${workspaceId}::uuid, ${runId}::uuid, ${caseId}::uuid, 'fail')`
    await sql`
      INSERT INTO linear_connections (id, workspace_id, access_token_enc, api_key_enc, linear_org_id, team_id)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${encrypt("fake-token")}, ${encrypt("fake-token")}, ${`org-${Date.now()}`}, 'team-real')
    `
    app = buildApp(userId, workspaceId)
    await app.register(defectsRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM defects WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM linear_connections WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM run_items WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_runs WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_cases WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  it("persists external_id/url to the defect when the Linear issue is created", async () => {
    mockCreateIssue.mockResolvedValueOnce({ id: "issue-ok", identifier: "VEL-901", url: "https://linear.app/velodev/issue/VEL-901" })
    const res = await app.inject({
      method: "POST", url: `/api/workspaces/${workspaceId}/defects`,
      payload: { run_item_id: itemId, title: "linked defect" },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body) as { id: string; external_id: string | null; external_url: string | null }
    expect(body.external_id).toBe("VEL-901")
    expect(body.external_url).toBe("https://linear.app/velodev/issue/VEL-901")
    const [row] = await sql`SELECT external_id FROM defects WHERE id = ${body.id}::uuid`
    expect((row as { external_id: string | null }).external_id).toBe("VEL-901")
  })

  it("surfaces the Linear issue identity with link_persist_failed when the persist fails (no silent orphan)", async () => {
    // 300-char identifier overflows external_id varchar(255) → the persist UPDATE
    // fails on every retry. The issue exists in Linear, so the response must
    // still expose its identity instead of looking like a Linear-create failure.
    mockCreateIssue.mockResolvedValueOnce({ id: "issue-bad", identifier: "V".repeat(300), url: "https://linear.app/velodev/issue/BAD" })
    const res = await app.inject({
      method: "POST", url: `/api/workspaces/${workspaceId}/defects`,
      payload: { run_item_id: itemId, title: "orphan-prone defect" },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body) as { id: string; external_url: string | null; link_persist_failed?: boolean }
    expect(body.link_persist_failed).toBe(true)
    expect(body.external_url).toBe("https://linear.app/velodev/issue/BAD")
    const [row] = await sql`SELECT external_id FROM defects WHERE id = ${body.id}::uuid`
    expect((row as { external_id: string | null }).external_id).toBeNull()
  })
})
