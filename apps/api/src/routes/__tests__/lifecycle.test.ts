import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockLifecycleAdd = vi.fn().mockResolvedValue({ id: "mock-lc-job" })
const mockLifecycleGetJob = vi.fn().mockResolvedValue({ remove: vi.fn() })
vi.mock("../../queues/lifecycle.queue.js", () => ({
  lifecycleQueue: {
    add: mockLifecycleAdd,
    getJob: mockLifecycleGetJob,
  },
}))

vi.mock("../../queues/email.queue.js", () => ({
  emailQueue: { add: vi.fn().mockResolvedValue({ id: "mock-email-job" }) },
}))

vi.mock("../../lib/email.js", () => ({
  sendLifecycleEmails: vi.fn().mockResolvedValue(undefined),
  sendOtpEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}))

vi.mock("../../lib/valkey.js", () => ({
  valkey: {
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    keys: vi.fn().mockResolvedValue([]),
  },
  getBullMQConnectionOptions: vi.fn(),
  getBullMQWorkerConnectionOptions: vi.fn(),
}))

vi.mock("../../lib/audit-log.js", () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

const sql = (await import("../../db/client.js")).sql

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildApp(userId: string) {
  const app = Fastify({ logger: false })
  app.decorateRequest("userId", "")
  app.decorateRequest("workspaceId", "")
  app.decorateRequest("userRole", "")
  app.addHook("preHandler", async (request) => {
    request.userId = userId
  })
  return app
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Lifecycle routes (WLC-01, WLC-02, WLC-05)", () => {
  let workspaceId: string
  let adminUserId: string
  let editorUserId: string
  let adminApp: ReturnType<typeof Fastify>
  let editorApp: ReturnType<typeof Fastify>

  beforeAll(async () => {
    const { default: lifecycleRoutes } = await import("../lifecycle.js")

    workspaceId = uuidv7()
    adminUserId = uuidv7()
    editorUserId = uuidv7()

    const adminEmail = `lc-admin-${Date.now()}@example.com`
    const editorEmail = `lc-editor-${Date.now()}@example.com`

    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${adminUserId}::uuid, ${adminEmail}, 'hash', true)
    `
    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${editorUserId}::uuid, ${editorEmail}, 'hash', true)
    `
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Lifecycle Test WS', ${`lc-test-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO workspace_members (id, workspace_id, user_id, role)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${adminUserId}::uuid, 'admin')
    `
    await sql`
      INSERT INTO workspace_members (id, workspace_id, user_id, role)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${editorUserId}::uuid, 'editor')
    `

    adminApp = buildApp(adminUserId)
    await adminApp.register(lifecycleRoutes)
    await adminApp.ready()

    editorApp = buildApp(editorUserId)
    await editorApp.register(lifecycleRoutes)
    await editorApp.ready()
  })

  afterAll(async () => {
    await adminApp.close()
    await editorApp.close()
    // Clean up -- clear deletion state first, then delete
    await sql`UPDATE workspaces SET deletion_status = NULL WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id IN (${adminUserId}::uuid, ${editorUserId}::uuid)`
    await sql.end()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects non-admin deletion request with 403", async () => {
    const res = await editorApp.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/lifecycle/request-deletion`,
    })
    expect(res.statusCode).toBe(403)
  })

  it("allows admin to request workspace deletion", async () => {
    const res = await adminApp.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/lifecycle/request-deletion`,
    })
    expect(res.statusCode).toBe(200)

    const body = res.json() as {
      deletion_status: string
      deletion_scheduled_at: string
    }
    expect(body.deletion_status).toBe("pending_deletion")
    expect(body.deletion_scheduled_at).toBeTruthy()

    // Verify DB state
    const [ws] = await sql`
      SELECT deletion_status, deletion_job_id FROM workspaces WHERE id = ${workspaceId}::uuid
    `
    expect((ws as { deletion_status: string }).deletion_status).toBe("pending_deletion")
    expect((ws as { deletion_job_id: string }).deletion_job_id).toBe(`ws-delete:${workspaceId}`)

    // Verify lifecycle queue was called
    expect(mockLifecycleAdd).toHaveBeenCalledWith(
      "workspace-delete",
      expect.objectContaining({ type: "workspace-delete", workspaceId }),
      expect.objectContaining({ jobId: `ws-delete:${workspaceId}` })
    )
  })

  it("rejects duplicate deletion request with 409", async () => {
    const res = await adminApp.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/lifecycle/request-deletion`,
    })
    expect(res.statusCode).toBe(409)
  })

  it("returns deletion status for any member", async () => {
    const res = await editorApp.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/lifecycle/status`,
    })
    expect(res.statusCode).toBe(200)

    const body = res.json() as { deletion_status: string; deletion_scheduled_at: string }
    expect(body.deletion_status).toBe("pending_deletion")
    expect(body.deletion_scheduled_at).toBeTruthy()
  })

  it("allows admin to cancel deletion", async () => {
    const res = await adminApp.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/lifecycle/cancel-deletion`,
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { deletion_status: null }).deletion_status).toBeNull()

    // Verify DB state cleared
    const [ws] = await sql`
      SELECT deletion_status, deletion_job_id, deletion_scheduled_at
      FROM workspaces WHERE id = ${workspaceId}::uuid
    `
    expect((ws as { deletion_status: null }).deletion_status).toBeNull()
    expect((ws as { deletion_job_id: null }).deletion_job_id).toBeNull()
    expect((ws as { deletion_scheduled_at: null }).deletion_scheduled_at).toBeNull()
  })

  it("rejects cancel when not pending with 409", async () => {
    const res = await adminApp.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/lifecycle/cancel-deletion`,
    })
    expect(res.statusCode).toBe(409)
  })

  it("returns null status after cancellation", async () => {
    const res = await adminApp.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/lifecycle/status`,
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { deletion_status: null }).deletion_status).toBeNull()
  })
})
