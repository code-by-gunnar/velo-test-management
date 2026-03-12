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

const mockPipelineSet = vi.fn().mockReturnThis()
const mockPipelineDel = vi.fn().mockReturnThis()
const mockPipelineExec = vi.fn().mockResolvedValue([])
vi.mock("../../lib/valkey.js", () => ({
  valkey: {
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    keys: vi.fn().mockResolvedValue([]),
    pipeline: vi.fn().mockReturnValue({
      set: mockPipelineSet,
      del: mockPipelineDel,
      exec: mockPipelineExec,
    }),
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

describe("Erasure routes (UER-01, UER-02, UER-04)", () => {
  let workspaceId: string
  let userId: string
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    const { default: erasureRoutes } = await import("../erasure.js")

    workspaceId = uuidv7()
    userId = uuidv7()

    const userEmail = `erasure-user-${Date.now()}@example.com`

    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${userEmail}, 'hash', true)
    `
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Erasure Test WS', ${`erasure-test-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO workspace_members (id, workspace_id, user_id, role)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${userId}::uuid, 'admin')
    `

    app = buildApp(userId)
    await app.register(erasureRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    // Clean up erasure requests first
    await sql`DELETE FROM user_erasure_requests WHERE user_id = ${userId}::uuid`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await sql.end()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("allows user to request erasure", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/me/request-erasure",
    })
    expect(res.statusCode).toBe(201)

    const body = res.json() as {
      status: string
      scheduled_at: string
      erasure_request_id: string
    }
    expect(body.status).toBe("pending")
    expect(body.scheduled_at).toBeTruthy()
    expect(body.erasure_request_id).toBeTruthy()

    // Verify DB state
    const [row] = await sql`
      SELECT status, job_id FROM user_erasure_requests WHERE user_id = ${userId}::uuid
    `
    expect((row as { status: string }).status).toBe("pending")
    expect((row as { job_id: string }).job_id).toBe(`user-erase:${userId}`)

    // Verify lifecycle queue called
    expect(mockLifecycleAdd).toHaveBeenCalledWith(
      "user-erasure",
      expect.objectContaining({ type: "user-erasure", userId }),
      expect.objectContaining({ jobId: `user-erase:${userId}` })
    )

    // Verify Valkey blocklist was set (pipeline used for workspace blocklisting)
    expect(mockPipelineSet).toHaveBeenCalled()
    expect(mockPipelineExec).toHaveBeenCalled()
  })

  it("rejects duplicate erasure request with 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/me/request-erasure",
    })
    expect(res.statusCode).toBe(409)
  })

  it("returns erasure status for user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/me/erasure-status",
    })
    expect(res.statusCode).toBe(200)

    const body = res.json() as {
      has_pending_erasure: boolean
      status: string
      scheduled_at: string
    }
    expect(body.has_pending_erasure).toBe(true)
    expect(body.status).toBe("pending")
    expect(body.scheduled_at).toBeTruthy()
  })

  it("allows user to cancel erasure", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/me/cancel-erasure",
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { status: string }).status).toBe("cancelled")

    // Verify DB state
    const [row] = await sql`
      SELECT status FROM user_erasure_requests
      WHERE user_id = ${userId}::uuid
      ORDER BY requested_at DESC LIMIT 1
    `
    expect((row as { status: string }).status).toBe("cancelled")

    // Verify Valkey blocklist was cleared (pipeline used)
    expect(mockPipelineDel).toHaveBeenCalled()
  })

  it("rejects cancel when no pending erasure with 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/me/cancel-erasure",
    })
    expect(res.statusCode).toBe(404)
  })

  it("returns no pending erasure after cancellation", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/me/erasure-status",
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { has_pending_erasure: boolean }).has_pending_erasure).toBe(false)
  })
})
