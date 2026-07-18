import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"

// Mock both SDKs so key validation never hits the network. Anthropic/OpenAI
// validate via models.list; custom validates via chat.completions.create.
const { anthropicList, openaiList, openaiChat } = vi.hoisted(() => ({
  anthropicList: vi.fn(),
  openaiList: vi.fn(),
  openaiChat: vi.fn(),
}))
vi.mock("@anthropic-ai/sdk", () => ({ default: class { models = { list: anthropicList } } }))
vi.mock("openai", () => ({
  default: class {
    models = { list: openaiList }
    chat = { completions: { create: openaiChat } }
  },
}))

const sql = (await import("../../db/client.js")).sql
const { decrypt } = await import("../../lib/encryption.js")
const { resolveProviderKey } = await import("../../lib/ai.js")
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

describe("AI provider keys (per-workspace, multi-provider)", () => {
  let app: ReturnType<typeof Fastify>
  let workspaceId: string
  let userId: string
  const savedAnthropic = process.env.ANTHROPIC_API_KEY
  const savedOpenai = process.env.OPENAI_API_KEY

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
    anthropicList.mockReset()
    openaiList.mockReset()
    openaiChat.mockReset()
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENAI_API_KEY
    delete process.env.CUSTOM_AI_API_KEY
    delete process.env.CUSTOM_AI_BASE_URL
    delete process.env.CUSTOM_AI_MODEL
    await sql`DELETE FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid`
    await sql`UPDATE workspaces SET ai_provider = 'anthropic' WHERE id = ${workspaceId}::uuid`
  })

  afterEach(() => {
    if (savedAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = savedAnthropic
    if (savedOpenai === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = savedOpenai
  })

  afterAll(async () => {
    await app.close()
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
  })

  function putKey(provider: string, apiKey: string) {
    return app.inject({ method: "PUT", url: `/api/workspaces/${workspaceId}/ai/keys/${provider}`, payload: { api_key: apiKey } })
  }
  function getStatus() {
    return app.inject({ method: "GET", url: `/api/workspaces/${workspaceId}/ai/status` })
  }

  it("stores a validated Anthropic key (encrypted) and reports it configured", async () => {
    anthropicList.mockResolvedValue({ data: [] })
    const res = await putKey("anthropic", "sk-ant-valid")
    expect(res.statusCode).toBe(200)
    const body = res.json() as { active: string; providers: Record<"anthropic" | "openai", { configured: boolean; source: string | null }> }
    expect(body.active).toBe("anthropic")
    expect(body.providers.anthropic).toMatchObject({ configured: true, source: "workspace" })
    expect(anthropicList).toHaveBeenCalled()

    const rows = await sql`SELECT secret_enc FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid AND provider = 'anthropic'`
    expect(decrypt((rows[0] as { secret_enc: string }).secret_enc)).toBe("sk-ant-valid")
  })

  it("stores an OpenAI key independently of the Anthropic key", async () => {
    openaiList.mockResolvedValue({ data: [] })
    const res = await putKey("openai", "sk-openai-valid")
    expect(res.statusCode).toBe(200)
    const body = res.json() as { active: string; providers: Record<"anthropic" | "openai", { configured: boolean }> }
    expect(body.providers.openai.configured).toBe(true)
    expect(body.providers.anthropic.configured).toBe(false)
    // Configuring a key activates that provider.
    expect(body.active).toBe("openai")
    expect(openaiList).toHaveBeenCalled()
  })

  it("rejects an invalid key with 400 and stores nothing", async () => {
    anthropicList.mockRejectedValue(new Error("401 authentication_error"))
    const res = await putKey("anthropic", "sk-ant-bad")
    expect(res.statusCode).toBe(400)
    const rows = await sql`SELECT provider FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid`
    expect(rows).toHaveLength(0)
  })

  it("rejects an unknown provider with 400", async () => {
    const res = await putKey("gemini", "key")
    expect(res.statusCode).toBe(400)
  })

  it("switches the active provider", async () => {
    openaiList.mockResolvedValue({ data: [] })
    await putKey("openai", "sk-openai-valid")

    const res = await app.inject({
      method: "PUT",
      url: `/api/workspaces/${workspaceId}/ai/provider`,
      payload: { provider: "openai" },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { active: string }).active).toBe("openai")

    const status = await getStatus()
    expect((status.json() as { active: string }).active).toBe("openai")
  })

  it("falls back to the instance env key per provider", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-env"
    const status = await getStatus()
    const body = status.json() as { providers: Record<"anthropic" | "openai", { configured: boolean; source: string | null }> }
    expect(body.providers.openai).toMatchObject({ configured: true, source: "env" })
    expect(body.providers.anthropic.configured).toBe(false)
  })

  it("reports nothing configured when no keys exist", async () => {
    const status = await getStatus()
    const body = status.json() as { active: string; providers: Record<"anthropic" | "openai", { configured: boolean }> }
    expect(body.active).toBe("anthropic")
    expect(body.providers.anthropic.configured).toBe(false)
    expect(body.providers.openai.configured).toBe(false)
  })

  it("DELETE removes a provider key", async () => {
    anthropicList.mockResolvedValue({ data: [] })
    await putKey("anthropic", "sk-ant-valid")
    const res = await app.inject({ method: "DELETE", url: `/api/workspaces/${workspaceId}/ai/keys/anthropic` })
    expect(res.statusCode).toBe(200)
    const rows = await sql`SELECT provider FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid`
    expect(rows).toHaveLength(0)
  })

  it("forbids a non-admin from setting a key or switching provider (403)", async () => {
    anthropicList.mockResolvedValue({ data: [] })
    const viewerApp = buildApp(userId, workspaceId, "viewer")
    await viewerApp.register(aiRoutes)
    await viewerApp.ready()
    try {
      const put = await viewerApp.inject({
        method: "PUT",
        url: `/api/workspaces/${workspaceId}/ai/keys/anthropic`,
        payload: { api_key: "sk-ant-viewer" },
      })
      expect(put.statusCode).toBe(403)

      const prov = await viewerApp.inject({
        method: "PUT",
        url: `/api/workspaces/${workspaceId}/ai/provider`,
        payload: { provider: "openai" },
      })
      expect(prov.statusCode).toBe(403)

      const rows = await sql`SELECT provider FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid`
      expect(rows).toHaveLength(0)
    } finally {
      await viewerApp.close()
    }
  })

  it("resolveProviderKey prefers the workspace key over the env key", async () => {
    anthropicList.mockResolvedValue({ data: [] })
    process.env.ANTHROPIC_API_KEY = "sk-ant-env"
    await putKey("anthropic", "sk-ant-workspace-wins")

    const resolved = await resolveProviderKey(workspaceId, "anthropic")
    expect(resolved).toMatchObject({ key: "sk-ant-workspace-wins", source: "workspace" })
  })

  it("stores a custom OpenAI-compatible provider with base_url + model", async () => {
    openaiChat.mockResolvedValue({ choices: [{ message: { content: "ok" } }] })
    const res = await app.inject({
      method: "PUT",
      url: `/api/workspaces/${workspaceId}/ai/keys/custom`,
      payload: { api_key: "any-key", base_url: "http://host.docker.internal:11434/v1", model: "qwen2.5-coder" },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      active: string
      providers: Record<"anthropic" | "openai" | "custom", { configured: boolean; source: string | null; baseUrl: string | null; model: string | null }>
    }
    expect(body.active).toBe("custom")
    expect(body.providers.custom).toMatchObject({
      configured: true,
      source: "workspace",
      baseUrl: "http://host.docker.internal:11434/v1",
      model: "qwen2.5-coder",
    })
    // Validated via a minimal chat completion, not models.list.
    expect(openaiChat).toHaveBeenCalled()

    const rows = await sql`SELECT base_url, model FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid AND provider = 'custom'`
    expect(rows[0]).toMatchObject({ base_url: "http://host.docker.internal:11434/v1", model: "qwen2.5-coder" })
  })

  it("rejects a custom provider missing base_url or model with 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/workspaces/${workspaceId}/ai/keys/custom`,
      payload: { api_key: "any-key" },
    })
    expect(res.statusCode).toBe(400)
    const rows = await sql`SELECT provider FROM workspace_integration_secrets WHERE workspace_id = ${workspaceId}::uuid`
    expect(rows).toHaveLength(0)
  })
})
