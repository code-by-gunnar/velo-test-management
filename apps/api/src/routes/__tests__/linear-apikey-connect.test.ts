import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import { getLinearOrganization, getLinearTeams } from "../../lib/linear-client.js"

// Real encryption; only the Linear network client is mocked. Mock path is two
// levels up to match the module id linear.ts resolves (vi.mock path gotcha).
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379"

vi.mock("../../lib/linear-client.js", () => ({
  getLinearOrganization: vi.fn(),
  getLinearTeams: vi.fn(),
  // Present so linear.ts's other imports resolve under the mock.
  exchangeCodeForTokens: vi.fn(),
  createLinearWebhook: vi.fn(),
}))

const sql = (await import("../../db/client.js")).sql
const { valkey } = await import("../../lib/valkey.js")
const { decrypt } = await import("../../lib/encryption.js")
const linearRoutes = (await import("../linear.js")).default

const mockGetOrg = vi.mocked(getLinearOrganization)
const mockGetTeams = vi.mocked(getLinearTeams)

function buildApp(userId: string, workspaceId: string) {
  const app = Fastify({ logger: false })
  app.decorate("valkey", valkey)
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

describe("Linear API-key-only connect (PUT /linear/api-key upsert)", () => {
  let app: ReturnType<typeof Fastify>
  let workspaceId: string
  let userId: string

  beforeAll(async () => {
    workspaceId = uuidv7()
    userId = uuidv7()
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`linear-key-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Linear WS', ${`linear-ws-${Date.now()}`}, 'free')`

    app = buildApp(userId, workspaceId)
    await app.register(linearRoutes)
    await app.ready()
  })

  beforeEach(async () => {
    mockGetOrg.mockReset()
    mockGetTeams.mockReset()
    await sql`DELETE FROM linear_connections WHERE workspace_id = ${workspaceId}::uuid`
    await valkey.del(`linear:teams:${workspaceId}`)
  })

  afterAll(async () => {
    await valkey.del(`linear:teams:${workspaceId}`)
    await app.close()
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
  })

  async function putKey(apiKey: string) {
    return app.inject({
      method: "PUT",
      url: `/api/workspaces/${workspaceId}/linear/api-key`,
      payload: { api_key: apiKey },
    })
  }

  it("creates a connection from just an API key (no OAuth), caches teams, needs team selection", async () => {
    mockGetOrg.mockResolvedValue({ id: "org-1", name: "Acme" })
    mockGetTeams.mockResolvedValue([
      { id: "team-a", name: "Team A" },
      { id: "team-b", name: "Team B" },
    ])

    const res = await putKey("lin_api_valid_key")
    expect(res.statusCode).toBe(200)
    const body = res.json() as { connected: boolean; needs_team_selection: boolean; teams?: Array<{ id: string }> }
    expect(body.connected).toBe(true)
    expect(body.needs_team_selection).toBe(true)
    expect(body.teams?.map((t) => t.id)).toEqual(["team-a", "team-b"])

    // Validated + fetched teams via the raw key
    expect(mockGetOrg).toHaveBeenCalledWith("lin_api_valid_key")
    expect(mockGetTeams).toHaveBeenCalledWith("lin_api_valid_key")

    // Row created: api_key_enc set, access_token_enc NULL, team pending
    const rows = await sql`SELECT access_token_enc, api_key_enc, team_id, linear_org_id, linear_org_name, connected_by
      FROM linear_connections WHERE workspace_id = ${workspaceId}::uuid`
    expect(rows).toHaveLength(1)
    const row = rows[0] as Record<string, unknown>
    expect(row.access_token_enc).toBeNull()
    expect(row.team_id).toBe("pending")
    expect(row.linear_org_id).toBe("org-1")
    expect(row.linear_org_name).toBe("Acme")
    expect(row.connected_by).toBe(userId)
    expect(decrypt(row.api_key_enc as string)).toBe("lin_api_valid_key")

    // Teams cached for the selection step
    const cached = await valkey.get(`linear:teams:${workspaceId}`)
    expect(JSON.parse(cached as string)).toHaveLength(2)
  })

  it("rejects an invalid key with 400 and creates no connection", async () => {
    mockGetOrg.mockRejectedValue(new Error("401 Unauthorized"))

    const res = await putKey("lin_api_bad_key")
    expect(res.statusCode).toBe(400)

    const rows = await sql`SELECT id FROM linear_connections WHERE workspace_id = ${workspaceId}::uuid`
    expect(rows).toHaveLength(0)
  })

  it("rotates the key on an existing connection instead of creating a duplicate", async () => {
    mockGetOrg.mockResolvedValue({ id: "org-1", name: "Acme" })
    mockGetTeams.mockResolvedValue([{ id: "team-a", name: "Team A" }])

    await putKey("lin_api_first")
    const second = await putKey("lin_api_second")
    expect(second.statusCode).toBe(200)

    const rows = await sql`SELECT api_key_enc FROM linear_connections WHERE workspace_id = ${workspaceId}::uuid`
    expect(rows).toHaveLength(1)
    expect(decrypt((rows[0] as { api_key_enc: string }).api_key_enc)).toBe("lin_api_second")
  })

  it("selecting a team moves the connection to fully connected", async () => {
    mockGetOrg.mockResolvedValue({ id: "org-1", name: "Acme" })
    mockGetTeams.mockResolvedValue([{ id: "team-a", name: "Team A" }])
    await putKey("lin_api_valid")

    const teamRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/linear/team`,
      payload: { team_id: "team-a" },
    })
    expect(teamRes.statusCode).toBe(200)

    const statusRes = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/linear/status`,
    })
    const status = statusRes.json() as { connected: boolean; needs_team_selection: boolean; team_name: string | null; has_api_key: boolean }
    expect(status.connected).toBe(true)
    expect(status.needs_team_selection).toBe(false)
    expect(status.team_name).toBe("Team A")
    expect(status.has_api_key).toBe(true)
  })
})
