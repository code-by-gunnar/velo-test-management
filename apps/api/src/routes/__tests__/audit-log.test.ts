import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import { recordAudit } from "../../lib/audit-log.js"

// VEL-72: workspace-scoped, append-only security audit trail. These tests run as
// the SUPERUSER test role, so RLS isolation + append-only are NOT enforced here
// (superusers bypass RLS even with FORCE — verified live as velo_app against the
// compose stack, per the RLS lesson in CLAUDE.md). What they assert is the
// functional contract: recordAudit writes a correctly-shaped, workspace-scoped
// row, and a real route emits one through its withWorkspace transaction.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

const sql = (await import("../../db/client.js")).sql
const { withWorkspace } = await import("../../db/tenant.js")
const apiKeyRoutes = (await import("../api-keys.js")).default

function buildApp(userId: string, workspaceId: string) {
  const app = Fastify({ logger: false })
  app.decorateRequest("userId", "")
  app.decorateRequest("workspaceId", "")
  app.decorateRequest("userRole", "")
  app.addHook("preHandler", async (request) => {
    request.userId = userId
    request.workspaceId = workspaceId
    request.userRole = "admin" // api-key create/revoke are requireAdmin (VEL-63)
  })
  return app
}

describe("Security audit trail (VEL-72)", () => {
  let app: ReturnType<typeof Fastify>
  const userId = uuidv7()
  const otherUserId = uuidv7()
  const workspaceId = uuidv7()
  const otherWorkspaceId = uuidv7()

  beforeAll(async () => {
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`audit-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Audit WS', ${`audit-ws-${Date.now()}`}, 'free')`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${otherWorkspaceId}::uuid, 'Other WS', ${`audit-other-${Date.now()}`}, 'free')`

    app = buildApp(userId, workspaceId)
    await app.register(apiKeyRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM audit_log WHERE workspace_id IN (${workspaceId}::uuid, ${otherWorkspaceId}::uuid)`
    await sql`DELETE FROM api_keys WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM workspaces WHERE id IN (${workspaceId}::uuid, ${otherWorkspaceId}::uuid)`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  it("recordAudit writes a scoped, structured row (metadata jsonb round-trips)", async () => {
    await withWorkspace(workspaceId, async (tx) => {
      await recordAudit(tx, {
        action: "role.changed",
        actorUserId: userId,
        targetType: "user",
        targetId: otherUserId,
        metadata: { role: "editor", promoted: false, count: 3 },
      })
    })

    const rows = await sql`
      SELECT workspace_id, actor_user_id, actor_api_key_id, action, target_type, target_id, metadata
      FROM audit_log WHERE workspace_id = ${workspaceId}::uuid AND action = 'role.changed'
    ` as unknown as Array<Record<string, unknown>>

    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.workspace_id).toBe(workspaceId)
    expect(row.actor_user_id).toBe(userId)
    expect(row.actor_api_key_id).toBeNull()
    expect(row.target_type).toBe("user")
    expect(row.target_id).toBe(otherUserId)
    // jsonb comes back already parsed (not a string scalar — the double-encode trap)
    expect(row.metadata).toEqual({ role: "editor", promoted: false, count: 3 })
  })

  it("takes the row's workspace from app.workspace_id, not a caller-supplied value", async () => {
    // Recorded under otherWorkspaceId's context → lands in that workspace only.
    await withWorkspace(otherWorkspaceId, async (tx) => {
      await recordAudit(tx, { action: "workspace.exported", targetType: "workspace", targetId: otherWorkspaceId })
    })
    const here = await sql`SELECT 1 FROM audit_log WHERE workspace_id = ${workspaceId}::uuid AND action = 'workspace.exported'`
    const there = await sql`SELECT 1 FROM audit_log WHERE workspace_id = ${otherWorkspaceId}::uuid AND action = 'workspace.exported'`
    expect(here).toHaveLength(0)
    expect(there).toHaveLength(1)
  })

  it("API-key create then revoke each emit an audit row through the real route", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "Audited Key" },
    })
    expect(createRes.statusCode).toBe(201)
    const keyId = (createRes.json() as { id: string }).id

    const created = await sql`
      SELECT action, target_id, actor_user_id, metadata FROM audit_log
      WHERE workspace_id = ${workspaceId}::uuid AND action = 'api_key.created' AND target_id = ${keyId}
    ` as unknown as Array<Record<string, unknown>>
    expect(created).toHaveLength(1)
    expect(created[0]!.actor_user_id).toBe(userId)
    expect(created[0]!.metadata).toEqual({ name: "Audited Key" })

    const revokeRes = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/api-keys/${keyId}`,
    })
    expect(revokeRes.statusCode).toBe(204)

    const revoked = await sql`
      SELECT action, target_id FROM audit_log
      WHERE workspace_id = ${workspaceId}::uuid AND action = 'api_key.revoked' AND target_id = ${keyId}
    ` as unknown as Array<Record<string, unknown>>
    expect(revoked).toHaveLength(1)
  })
})
