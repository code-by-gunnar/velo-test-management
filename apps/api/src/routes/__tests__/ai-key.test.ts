import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"

// Mock the Anthropic SDK so key validation (models.list) never hits the network.
const { modelsListMock } = vi.hoisted(() => ({ modelsListMock: vi.fn() }))
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    models = { list: modelsListMock }
  },
}))

const sql = (await import("../../db/client.js")).sql
const { decrypt } = await import("../../lib/encryption.js")
const { resolveAnthropicKey } = await import("../../lib/anthropic.js")
const aiRoutes = (await import("../ai.js")).default

function buildApp(userId: string, workspaceId: string, role = "admin") {
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

describe("AI provider key (per-workspace Anthropic key)", () => {
  let app: ReturnType<typeof Fastify>
  let workspaceId: string
  let userId: string
  const savedEnvKey = process.env.ANTHROPIC_API_KEY

  beforeAll(async () => {
    workspaceId = uuidv7()
    userId = uuidv7()
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`ai-key-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'AI WS', ${`ai-ws-${Date.now()}`}, 'free')`

    app = buildApp(userId, workspaceId)
    await app.register(aiRoutes)
    await app.ready()
  })

  beforeEach(async () => {
    modelsListMock.mockReset()
    delete process.env.ANTHROPIC_API_KEY
    await sql`DELETE FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid`
  })

  afterEach(() => {
    if (savedEnvKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = savedEnvKey
  })

  afterAll(async () => {
    await app.close()
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
  })

  async function putKey(apiKey: string) {
    return app.inject({ method: "PUT", url: `/api/workspaces/${workspaceId}/ai/api-key`, payload: { api_key: apiKey } })
  }
  async function getStatus() {
    return app.inject({ method: "GET", url: `/api/workspaces/${workspaceId}/ai/status` })
  }

  it("stores a validated workspace key (encrypted) and reports source=workspace", async () => {
    modelsListMock.mockResolvedValue({ data: [{ id: "claude-sonnet-4-5" }] })

    const res = await putKey("sk-ant-valid")
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ saved: true, configured: true, source: "workspace" })
    expect(modelsListMock).toHaveBeenCalled()

    const rows = await sql`SELECT secret_enc, provider FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid`
    expect(rows).toHaveLength(1)
    expect((rows[0] as { provider: string }).provider).toBe("anthropic")
    expect(decrypt((rows[0] as { secret_enc: string }).secret_enc)).toBe("sk-ant-valid")

    const status = await getStatus()
    expect(status.json()).toMatchObject({ configured: true, source: "workspace" })
  })

  it("rejects an invalid key with 400 and stores nothing", async () => {
    modelsListMock.mockRejectedValue(new Error("401 authentication_error"))

    const res = await putKey("sk-ant-bad")
    expect(res.statusCode).toBe(400)

    const rows = await sql`SELECT provider FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid`
    expect(rows).toHaveLength(0)
  })

  it("rotates the key on a second save without creating a duplicate row", async () => {
    modelsListMock.mockResolvedValue({ data: [] })
    await putKey("sk-ant-first")
    await putKey("sk-ant-second")

    const rows = await sql`SELECT secret_enc FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid`
    expect(rows).toHaveLength(1)
    expect(decrypt((rows[0] as { secret_enc: string }).secret_enc)).toBe("sk-ant-second")
  })

  it("falls back to the instance env key when no workspace key is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-default"
    const status = await getStatus()
    expect(status.json()).toMatchObject({ configured: true, source: "env" })
  })

  it("reports not configured when neither workspace nor env key exists", async () => {
    const status = await getStatus()
    expect(status.json()).toMatchObject({ configured: false, source: null })
  })

  it("DELETE removes the workspace key and reports the remaining coverage", async () => {
    modelsListMock.mockResolvedValue({ data: [] })
    await putKey("sk-ant-workspace")

    // env key present → after delete, coverage falls back to env
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-default"
    const res = await app.inject({ method: "DELETE", url: `/api/workspaces/${workspaceId}/ai/api-key` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ removed: true, configured: true, source: "env" })

    const rows = await sql`SELECT provider FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid`
    expect(rows).toHaveLength(0)
  })

  it("forbids a non-admin from setting or removing the workspace key (403)", async () => {
    modelsListMock.mockResolvedValue({ data: [] })
    const viewerApp = buildApp(userId, workspaceId, "viewer")
    await viewerApp.register(aiRoutes)
    await viewerApp.ready()
    try {
      const put = await viewerApp.inject({
        method: "PUT",
        url: `/api/workspaces/${workspaceId}/ai/api-key`,
        payload: { api_key: "sk-ant-viewer" },
      })
      expect(put.statusCode).toBe(403)

      const del = await viewerApp.inject({
        method: "DELETE",
        url: `/api/workspaces/${workspaceId}/ai/api-key`,
      })
      expect(del.statusCode).toBe(403)

      // Nothing was written.
      const rows = await sql`SELECT provider FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid`
      expect(rows).toHaveLength(0)
    } finally {
      await viewerApp.close()
    }
  })

  it("resolveAnthropicKey prefers the workspace key over the env key", async () => {
    modelsListMock.mockResolvedValue({ data: [] })
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-default"
    await putKey("sk-ant-workspace-wins")

    const resolved = await resolveAnthropicKey(workspaceId)
    expect(resolved).toEqual({ key: "sk-ant-workspace-wins", source: "workspace" })
  })
})
