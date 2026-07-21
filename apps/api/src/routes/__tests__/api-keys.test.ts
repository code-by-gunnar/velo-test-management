import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import apiKeyRoutes, { verifyApiKey } from "../api-keys.js"

// Set required env vars for testing
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

// Superuser SQL connection for test setup (bypasses RLS)
const sql = (await import("../../db/client.js")).sql

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Test suite ────────────────────────────────────────────────────────────────

describe("API Keys routes (IN-01)", () => {
  let workspaceId: string
  let userId: string
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    workspaceId = uuidv7()
    userId = uuidv7()

    // Insert user and workspace
    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`api-keys-test-${Date.now()}@example.com`}, 'hash', true)
    `
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'API Keys WS', ${`api-keys-ws-${Date.now()}`}, 'free')
    `

    app = buildApp(userId, workspaceId)
    await app.register(apiKeyRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM api_keys WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  // ── POST /api-keys — create key ────────────────────────────────────────────

  it("POST creates API key and returns raw key starting with velo_", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "CI Key" },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { id: string; name: string; key: string; prefix: string }
    expect(body.id).toBeTruthy()
    expect(body.name).toBe("CI Key")
    expect(body.key).toMatch(/^velo_/)
    expect(body.key).toHaveLength(69) // "velo_" + 64 hex chars
    expect(body.prefix).toBe(body.key.slice(0, 8))
  })

  it("POST returns 401 when not authenticated", async () => {
    const noAuthApp = Fastify({ logger: false })
    noAuthApp.decorateRequest("userId", "")
    noAuthApp.decorateRequest("workspaceId", "")
    noAuthApp.decorateRequest("userRole", "")
    await noAuthApp.register(apiKeyRoutes)
    await noAuthApp.ready()

    const res = await noAuthApp.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "Test" },
    })
    expect(res.statusCode).toBe(401)
    await noAuthApp.close()
  })

  it("POST returns 403 when workspaceId param does not match session", async () => {
    const otherWsId = uuidv7()
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${otherWsId}/api-keys`,
      payload: { name: "Test" },
    })
    expect(res.statusCode).toBe(403)
  })

  it("POST returns 403 for a viewer — key management is admin-only (VEL-63)", async () => {
    const viewerApp = buildApp(userId, workspaceId, "viewer")
    await viewerApp.register(apiKeyRoutes)
    await viewerApp.ready()

    const res = await viewerApp.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "Viewer Key" },
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { code?: string }).code).toBe("ADMIN_REQUIRED")
    await viewerApp.close()
  })

  it("POST returns 403 for an editor — key management is admin-only (VEL-63)", async () => {
    const editorApp = buildApp(userId, workspaceId, "editor")
    await editorApp.register(apiKeyRoutes)
    await editorApp.ready()

    const res = await editorApp.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "Editor Key" },
    })
    expect(res.statusCode).toBe(403)
    await editorApp.close()
  })

  // ── GET /api-keys — list keys ──────────────────────────────────────────────

  it("GET lists keys without exposing key_hash", async () => {
    // Create a key first
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "Listed Key" },
    })
    expect(createRes.statusCode).toBe(201)

    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/api-keys`,
    })
    expect(res.statusCode).toBe(200)
    const keys = res.json() as Array<{
      id: string
      name: string
      prefix: string
      created_at: string
      revoked_at: string | null
      key_hash?: string
      key?: string
    }>
    expect(keys.length).toBeGreaterThan(0)
    // Must not expose hash or raw key
    keys.forEach((k) => {
      expect(k.key_hash).toBeUndefined()
      expect(k.key).toBeUndefined()
      expect(k.prefix).toBeTruthy()
    })
  })

  // ── DELETE /api-keys/:keyId — revoke key ──────────────────────────────────

  it("DELETE revokes key by setting revoked_at", async () => {
    // Create a key to revoke
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "Revoke Me" },
    })
    expect(createRes.statusCode).toBe(201)
    const { id: keyId } = createRes.json() as { id: string }

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/api-keys/${keyId}`,
    })
    expect(delRes.statusCode).toBe(204)

    // Verify revoked_at is set in DB
    const rows = await sql`
      SELECT revoked_at FROM api_keys WHERE id = ${keyId}::uuid
    `
    expect(rows.length).toBe(1)
    expect((rows[0] as { revoked_at: Date | null }).revoked_at).not.toBeNull()
  })

  it("DELETE returns 404 when key not found or already revoked", async () => {
    const nonExistentId = uuidv7()
    const res = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/api-keys/${nonExistentId}`,
    })
    expect(res.statusCode).toBe(404)
  })

  // ── verifyApiKey helper ────────────────────────────────────────────────────

  it("verifyApiKey returns workspaceId and keyId for valid active key", async () => {
    // Create a key via the route
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "Verify Key" },
    })
    const { key: rawKey, id: keyId } = createRes.json() as { key: string; id: string }

    const result = await verifyApiKey(rawKey)
    expect(result).not.toBeNull()
    expect(result!.workspaceId).toBe(workspaceId)
    expect(result!.keyId).toBe(keyId)
  })

  it("verifyApiKey returns null for revoked key", async () => {
    // Create a key
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "Revoke Verify Key" },
    })
    const { key: rawKey, id: keyId } = createRes.json() as { key: string; id: string }

    // Revoke it
    await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/api-keys/${keyId}`,
    })

    const result = await verifyApiKey(rawKey)
    expect(result).toBeNull()
  })

  it("verifyApiKey returns null for invalid key", async () => {
    const result = await verifyApiKey("velo_thisisafakekeythatdoesnotexist0000000000000000000000000000000")
    expect(result).toBeNull()
  })

  it("verifyApiKey returns null for empty string", async () => {
    const result = await verifyApiKey("")
    expect(result).toBeNull()
  })
})
