import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"

// VEL-72 (admin view): GET /audit-log surfaces the append-only trail to admins.
// requireAdmin reads request.userRole; the read is workspace-scoped (RLS) and
// resolves actor UUIDs to names via joins.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"

const sql = (await import("../../db/client.js")).sql
const auditLogRoutes = (await import("../audit-log.js")).default

interface AuditEntryRow {
  action: string
  actor_user_name: string | null
  target_type: string | null
  metadata: unknown
}

function buildApp(userId: string, workspaceId: string, role: string) {
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

describe("Audit log admin view (VEL-72)", () => {
  const wsId = uuidv7()
  const otherWsId = uuidv7()
  const userId = uuidv7()
  const stamp = Date.now()

  beforeAll(async () => {
    await sql`INSERT INTO users (id, email, name, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`audit-view-${stamp}@example.com`}, 'Ada Admin', 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${wsId}::uuid, 'Audit WS', ${`audit-view-${stamp}`}, 'free')`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${otherWsId}::uuid, 'Other WS', ${`audit-other-${stamp}`}, 'free')`
    await sql`INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active)
      VALUES (${uuidv7()}::uuid, ${wsId}::uuid, ${userId}::uuid, 'admin', true)`

    // Two entries in our workspace + one in another workspace (must not leak).
    await sql`INSERT INTO audit_log (workspace_id, actor_user_id, action, target_type, target_id, metadata)
      VALUES (${wsId}::uuid, ${userId}::uuid, 'api_key.created', 'api_key', ${uuidv7()}, ${sql.json({ name: "CI key" })})`
    await sql`INSERT INTO audit_log (workspace_id, actor_user_id, action, target_type, target_id, metadata)
      VALUES (${wsId}::uuid, ${userId}::uuid, 'role.changed', 'user', ${uuidv7()}, ${sql.json({ from: "viewer", to: "editor" })})`
    await sql`INSERT INTO audit_log (workspace_id, actor_user_id, action, target_type, target_id)
      VALUES (${otherWsId}::uuid, ${userId}::uuid, 'workspace.exported', 'workspace', ${otherWsId})`
  })

  afterAll(async () => {
    await sql`DELETE FROM audit_log WHERE workspace_id IN (${wsId}::uuid, ${otherWsId}::uuid)`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspaces WHERE id IN (${wsId}::uuid, ${otherWsId}::uuid)`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await sql.end()
  })

  it("admin GET returns this workspace's entries, newest first, with actor name resolved", async () => {
    const app = buildApp(userId, wsId, "admin")
    await app.register(auditLogRoutes)
    await app.ready()
    try {
      const res = await app.inject({ method: "GET", url: `/api/workspaces/${wsId}/audit-log` })
      expect(res.statusCode).toBe(200)
      const entries = (res.json() as { entries: AuditEntryRow[] }).entries
      expect(entries).toHaveLength(2)
      // Newest first — role.changed was inserted after api_key.created.
      expect(entries[0]!.action).toBe("role.changed")
      expect(entries[0]!.actor_user_name).toBe("Ada Admin")
      expect(entries.map((e) => e.action)).not.toContain("workspace.exported") // other WS, isolated
      // metadata round-trips as an object
      expect((entries[1]!.metadata as { name?: string }).name).toBe("CI key")
    } finally {
      await app.close()
    }
  })

  it("respects the limit param", async () => {
    const app = buildApp(userId, wsId, "admin")
    await app.register(auditLogRoutes)
    await app.ready()
    try {
      const res = await app.inject({ method: "GET", url: `/api/workspaces/${wsId}/audit-log?limit=1` })
      expect(res.statusCode).toBe(200)
      expect((res.json() as { entries: AuditEntryRow[] }).entries).toHaveLength(1)
    } finally {
      await app.close()
    }
  })

  it("denies a non-admin with 403 ADMIN_REQUIRED", async () => {
    const app = buildApp(userId, wsId, "viewer")
    await app.register(auditLogRoutes)
    await app.ready()
    try {
      const res = await app.inject({ method: "GET", url: `/api/workspaces/${wsId}/audit-log` })
      expect(res.statusCode).toBe(403)
      expect((res.json() as { code?: string }).code).toBe("ADMIN_REQUIRED")
    } finally {
      await app.close()
    }
  })
})
