import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import bcrypt from "bcrypt"

// Mock email queue to avoid real BullMQ connections during tests
vi.mock("../../queues/email.queue.js", () => ({
  emailQueue: { add: vi.fn().mockResolvedValue({ id: "mock-job-id" }) },
}))

// Mock Valkey to avoid real connections during tests
const mockValkeySet = vi.fn().mockResolvedValue("OK")
const mockValkeyDel = vi.fn().mockResolvedValue(1)
const mockValkeyGet = vi.fn().mockResolvedValue(null)
vi.mock("../../lib/valkey.js", () => ({
  valkey: {
    set: mockValkeySet,
    del: mockValkeyDel,
    get: mockValkeyGet,
  },
}))

// Set required env vars
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
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

describe("Members routes (USR-01 through USR-06)", () => {
  let workspaceId: string
  let adminUserId: string
  let editorUserId: string
  let adminApp: ReturnType<typeof Fastify>
  let editorApp: ReturnType<typeof Fastify>

  beforeAll(async () => {
    const { default: memberRoutes } = await import("../members.js")

    workspaceId = uuidv7()
    adminUserId = uuidv7()
    editorUserId = uuidv7()

    const adminEmail = `admin-${Date.now()}@example.com`
    const editorEmail = `editor-${Date.now()}@example.com`

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
      VALUES (${workspaceId}::uuid, 'Members WS', ${`members-ws-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO workspace_members (id, workspace_id, user_id, role)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${adminUserId}::uuid, 'admin')
    `
    await sql`
      INSERT INTO workspace_members (id, workspace_id, user_id, role)
      VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${editorUserId}::uuid, 'editor')
    `

    adminApp = buildApp(adminUserId, workspaceId, "admin")
    await adminApp.register(memberRoutes)
    await adminApp.ready()

    editorApp = buildApp(editorUserId, workspaceId, "editor")
    await editorApp.register(memberRoutes)
    await editorApp.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM workspace_invitations WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id IN (${adminUserId}::uuid, ${editorUserId}::uuid)`
    await adminApp.close()
    await editorApp.close()
    await sql.end()
  })

  // USR-01: Workspace admin can invite team members by email
  describe("POST /api/workspaces/:workspaceId/invitations (USR-01)", () => {
    it("returns 201 and queues invite email when admin invites valid email", async () => {
      const { emailQueue } = await import("../../queues/email.queue.js")
      const mockAdd = vi.mocked(emailQueue.add)
      mockAdd.mockClear()

      const res = await adminApp.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/invitations`,
        payload: { email: `new-member-${Date.now()}@example.com`, role: "editor" },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json() as {
        id: string; email: string; role: string; expires_at: string
        invite_url: string; email_sent: boolean
      }
      expect(body.id).toBeTruthy()
      expect(body.role).toBe("editor")
      expect(body.expires_at).toBeTruthy()
      // Self-host console mode (no SMTP in tests): the invite link is returned
      // so the admin can share it directly — the invitee can't read server logs.
      expect(body.invite_url).toContain("/accept-invite?token=")
      expect(body.email_sent).toBe(false)
      expect(mockAdd).toHaveBeenCalledWith(
        "workspace-invite",
        expect.objectContaining({
          type: "workspace-invite",
        })
      )
    })

    it("returns 403 when non-admin tries to invite", async () => {
      const res = await editorApp.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/invitations`,
        payload: { email: "someone@example.com", role: "editor" },
      })
      expect(res.statusCode).toBe(403)
    })

    it("returns 409 when inviting email that is already an active member", async () => {
      const rows = await sql`SELECT email FROM users WHERE id = ${adminUserId}::uuid`
      const adminEmail = (rows[0] as { email: string }).email

      const res = await adminApp.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/invitations`,
        payload: { email: adminEmail, role: "editor" },
      })
      expect(res.statusCode).toBe(409)
    })

    it("invalidates previous pending invite for same email on re-invite", async () => {
      const reInviteEmail = `reinvite-${Date.now()}@example.com`

      const first = await adminApp.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/invitations`,
        payload: { email: reInviteEmail, role: "editor" },
      })
      expect(first.statusCode).toBe(201)
      const firstId = (first.json() as { id: string }).id

      const second = await adminApp.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/invitations`,
        payload: { email: reInviteEmail, role: "viewer" },
      })
      expect(second.statusCode).toBe(201)
      const secondId = (second.json() as { id: string }).id
      expect(secondId).not.toBe(firstId)

      // Old invite must have accepted_at set (invalidated)
      const old = await sql`
        SELECT accepted_at FROM workspace_invitations WHERE id = ${firstId}::uuid
      `
      expect((old[0] as { accepted_at: Date | null }).accepted_at).not.toBeNull()
    })
  })

  // USR-02: Invited user accepts an invitation
  describe("POST /api/workspaces/:workspaceId/invitations/accept (USR-02)", () => {
    it("returns 200 and adds user to workspace_members when token is valid", async () => {
      const acceptEmail = `accept-${Date.now()}@example.com`
      const acceptUserId = uuidv7()

      await sql`
        INSERT INTO users (id, email, password_hash, email_verified)
        VALUES (${acceptUserId}::uuid, ${acceptEmail}, 'hash', true)
      `

      // Insert an invitation with a known token for this user's email
      const rawToken = "testtoken" + Date.now()
      const tokenHash = await bcrypt.hash(rawToken, 10)
      const inviteId = uuidv7()
      await sql`
        INSERT INTO workspace_invitations (id, workspace_id, email, role, token_hash, invited_by, expires_at)
        VALUES (
          ${inviteId}::uuid,
          ${workspaceId}::uuid,
          ${acceptEmail},
          'editor',
          ${tokenHash},
          ${adminUserId}::uuid,
          NOW() + INTERVAL '7 days'
        )
      `

      const acceptApp = buildApp(acceptUserId, workspaceId, "viewer")
      const { default: memberRoutes } = await import("../members.js")
      await acceptApp.register(memberRoutes)
      await acceptApp.ready()

      const acceptRes = await acceptApp.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/invitations/accept`,
        payload: { token: rawToken },
      })

      expect(acceptRes.statusCode).toBe(200)
      const body = acceptRes.json() as { workspace_id: string; role: string }
      expect(body.workspace_id).toBe(workspaceId)
      expect(body.role).toBe("editor")

      // Verify member was added to workspace_members
      const member = await sql`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${acceptUserId}::uuid AND is_active = true
      `
      expect(member.length).toBe(1)
      expect((member[0] as { role: string }).role).toBe("editor")

      await acceptApp.close()
      await sql`DELETE FROM workspace_members WHERE user_id = ${acceptUserId}::uuid`
      await sql`DELETE FROM users WHERE id = ${acceptUserId}::uuid`
    })

    it("returns 400 when token is expired", async () => {
      const expiredEmail = `expired-${Date.now()}@example.com`
      const expiredUserId = uuidv7()

      await sql`
        INSERT INTO users (id, email, password_hash, email_verified)
        VALUES (${expiredUserId}::uuid, ${expiredEmail}, 'hash', true)
      `

      const rawToken = "expiredtoken" + Date.now()
      const tokenHash = await bcrypt.hash(rawToken, 10)
      await sql`
        INSERT INTO workspace_invitations (id, workspace_id, email, role, token_hash, expires_at)
        VALUES (
          ${uuidv7()}::uuid,
          ${workspaceId}::uuid,
          ${expiredEmail},
          'editor',
          ${tokenHash},
          NOW() - INTERVAL '1 day'
        )
      `

      const expiredApp = buildApp(expiredUserId, workspaceId, "viewer")
      const { default: memberRoutes } = await import("../members.js")
      await expiredApp.register(memberRoutes)
      await expiredApp.ready()

      const res = await expiredApp.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/invitations/accept`,
        payload: { token: rawToken },
      })

      expect(res.statusCode).toBe(400)

      await expiredApp.close()
      await sql`DELETE FROM users WHERE id = ${expiredUserId}::uuid`
    })

    it("returns 400 when token is invalid", async () => {
      const invalidEmail = `invalid-${Date.now()}@example.com`
      const invalidUserId = uuidv7()

      await sql`
        INSERT INTO users (id, email, password_hash, email_verified)
        VALUES (${invalidUserId}::uuid, ${invalidEmail}, 'hash', true)
      `

      const realToken = "realtoken" + Date.now()
      const tokenHash = await bcrypt.hash(realToken, 10)
      await sql`
        INSERT INTO workspace_invitations (id, workspace_id, email, role, token_hash, expires_at)
        VALUES (
          ${uuidv7()}::uuid,
          ${workspaceId}::uuid,
          ${invalidEmail},
          'editor',
          ${tokenHash},
          NOW() + INTERVAL '7 days'
        )
      `

      const invalidApp = buildApp(invalidUserId, workspaceId, "viewer")
      const { default: memberRoutes } = await import("../members.js")
      await invalidApp.register(memberRoutes)
      await invalidApp.ready()

      const res = await invalidApp.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/invitations/accept`,
        payload: { token: "wrongtoken" },
      })

      expect(res.statusCode).toBe(400)

      await invalidApp.close()
      await sql`DELETE FROM users WHERE id = ${invalidUserId}::uuid`
    })

    it("returns 409 when user is already a member", async () => {
      const rows = await sql`SELECT email FROM users WHERE id = ${adminUserId}::uuid`
      const email = (rows[0] as { email: string }).email

      const rawToken = "duptoken" + Date.now()
      const tokenHash = await bcrypt.hash(rawToken, 10)
      await sql`
        INSERT INTO workspace_invitations (id, workspace_id, email, role, token_hash, expires_at)
        VALUES (
          ${uuidv7()}::uuid,
          ${workspaceId}::uuid,
          ${email},
          'editor',
          ${tokenHash},
          NOW() + INTERVAL '7 days'
        )
      `

      const res = await adminApp.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/invitations/accept`,
        payload: { token: rawToken },
      })

      expect(res.statusCode).toBe(409)
    })
  })

  // USR-05: Viewer seats unlimited, editor seats capped
  describe("Editor seat cap (USR-05)", () => {
    it("allows unlimited viewer invitations on free tier", async () => {
      const res = await adminApp.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/invitations`,
        payload: { email: `viewer-${Date.now()}@example.com`, role: "viewer" },
      })
      expect(res.statusCode).toBe(201)
    })

    it("rejects editor invitation when free tier cap reached", async () => {
      const capWsId = uuidv7()
      const capAdminId = uuidv7()
      await sql`
        INSERT INTO users (id, email, password_hash, email_verified)
        VALUES (${capAdminId}::uuid, ${`cap-admin-${Date.now()}@example.com`}, 'hash', true)
      `
      await sql`
        INSERT INTO workspaces (id, name, slug, plan_tier)
        VALUES (${capWsId}::uuid, 'Cap WS', ${`cap-ws-${Date.now()}`}, 'free')
      `
      await sql`
        INSERT INTO workspace_members (id, workspace_id, user_id, role)
        VALUES (${uuidv7()}::uuid, ${capWsId}::uuid, ${capAdminId}::uuid, 'admin')
      `

      const editorIds: string[] = []
      for (let i = 0; i < 3; i++) {
        const editorId = uuidv7()
        editorIds.push(editorId)
        await sql`
          INSERT INTO users (id, email, password_hash, email_verified)
          VALUES (${editorId}::uuid, ${`cap-editor${i}-${Date.now()}@example.com`}, 'hash', true)
        `
        await sql`
          INSERT INTO workspace_members (id, workspace_id, user_id, role)
          VALUES (${uuidv7()}::uuid, ${capWsId}::uuid, ${editorId}::uuid, 'editor')
        `
      }

      const capApp = buildApp(capAdminId, capWsId, "admin")
      const { default: memberRoutes } = await import("../members.js")
      await capApp.register(memberRoutes)
      await capApp.ready()

      const res = await capApp.inject({
        method: "POST",
        url: `/api/workspaces/${capWsId}/invitations`,
        payload: { email: `over-cap-${Date.now()}@example.com`, role: "editor" },
      })
      expect(res.statusCode).toBe(403)
      const body = res.json() as { code: string }
      expect(body.code).toBe("TIER_LIMIT_EXCEEDED")

      await capApp.close()
      for (const editorId of editorIds) {
        await sql`DELETE FROM workspace_members WHERE user_id = ${editorId}::uuid`
        await sql`DELETE FROM users WHERE id = ${editorId}::uuid`
      }
      await sql`DELETE FROM workspace_members WHERE workspace_id = ${capWsId}::uuid`
      await sql`DELETE FROM workspaces WHERE id = ${capWsId}::uuid`
      await sql`DELETE FROM users WHERE id = ${capAdminId}::uuid`
    })
  })

  // USR-06: Plan tier limits enforced at API layer
  describe("Tier limit enforcement (USR-06)", () => {
    it("returns 403 with TIER_LIMIT_EXCEEDED when editor cap exceeded", async () => {
      const tierWsId = uuidv7()
      const tierAdminId = uuidv7()
      await sql`
        INSERT INTO users (id, email, password_hash, email_verified)
        VALUES (${tierAdminId}::uuid, ${`tier-admin-${Date.now()}@example.com`}, 'hash', true)
      `
      await sql`
        INSERT INTO workspaces (id, name, slug, plan_tier)
        VALUES (${tierWsId}::uuid, 'Tier WS', ${`tier-ws-${Date.now()}`}, 'free')
      `
      await sql`
        INSERT INTO workspace_members (id, workspace_id, user_id, role)
        VALUES (${uuidv7()}::uuid, ${tierWsId}::uuid, ${tierAdminId}::uuid, 'admin')
      `

      const editorIds: string[] = []
      for (let i = 0; i < 3; i++) {
        const editorId = uuidv7()
        editorIds.push(editorId)
        await sql`
          INSERT INTO users (id, email, password_hash, email_verified)
          VALUES (${editorId}::uuid, ${`tier-editor${i}-${Date.now()}@example.com`}, 'hash', true)
        `
        await sql`
          INSERT INTO workspace_members (id, workspace_id, user_id, role)
          VALUES (${uuidv7()}::uuid, ${tierWsId}::uuid, ${editorId}::uuid, 'editor')
        `
      }

      const tierApp = buildApp(tierAdminId, tierWsId, "admin")
      const { default: memberRoutes } = await import("../members.js")
      await tierApp.register(memberRoutes)
      await tierApp.ready()

      const res = await tierApp.inject({
        method: "POST",
        url: `/api/workspaces/${tierWsId}/invitations`,
        payload: { email: `over-cap-${Date.now()}@example.com`, role: "editor" },
      })

      expect(res.statusCode).toBe(403)
      const body = res.json() as { code: string; error: string }
      expect(body.code).toBe("TIER_LIMIT_EXCEEDED")
      expect(body.error.toLowerCase()).toContain("upgrade")

      await tierApp.close()
      for (const editorId of editorIds) {
        await sql`DELETE FROM workspace_members WHERE user_id = ${editorId}::uuid`
        await sql`DELETE FROM users WHERE id = ${editorId}::uuid`
      }
      await sql`DELETE FROM workspace_members WHERE workspace_id = ${tierWsId}::uuid`
      await sql`DELETE FROM workspaces WHERE id = ${tierWsId}::uuid`
      await sql`DELETE FROM users WHERE id = ${tierAdminId}::uuid`
    })

    it("error includes upgrade prompt message", async () => {
      // Covered by the test above — documented here for USR-06 traceability
      expect(true).toBe(true)
    })
  })

  // USR-03: Admin can change member role
  describe("PATCH /api/workspaces/:workspaceId/members/:userId (USR-03)", () => {
    it("returns 200 and updates role when admin changes role to viewer", async () => {
      mockValkeyDel.mockClear()

      const res = await adminApp.inject({
        method: "PATCH",
        url: `/api/workspaces/${workspaceId}/members/${editorUserId}`,
        payload: { role: "viewer" },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json() as { user_id: string; role: string }
      expect(body.user_id).toBe(editorUserId)
      expect(body.role).toBe("viewer")

      // Verify DB updated
      const rows = await sql`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${editorUserId}::uuid
      `
      expect((rows[0] as { role: string }).role).toBe("viewer")

      // Restore editor role for other tests
      await sql`
        UPDATE workspace_members SET role = 'editor', updated_at = NOW()
        WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${editorUserId}::uuid
      `
    })

    it("busts Valkey role cache key on success", async () => {
      mockValkeyDel.mockClear()

      await adminApp.inject({
        method: "PATCH",
        url: `/api/workspaces/${workspaceId}/members/${editorUserId}`,
        payload: { role: "viewer" },
      })

      expect(mockValkeyDel).toHaveBeenCalledWith(
        `member_role:${workspaceId}:${editorUserId}`
      )

      // Restore editor role
      await sql`
        UPDATE workspace_members SET role = 'editor', updated_at = NOW()
        WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${editorUserId}::uuid
      `
    })

    it("returns 403 when non-admin tries to change role", async () => {
      const res = await editorApp.inject({
        method: "PATCH",
        url: `/api/workspaces/${workspaceId}/members/${adminUserId}`,
        payload: { role: "viewer" },
      })
      expect(res.statusCode).toBe(403)
    })

    it("returns 400 when demoting the last admin (VEL-54 last-admin protection)", async () => {
      // adminUserId is the only admin in this workspace — demoting them (here,
      // self-demotion) would leave zero admins.
      const res = await adminApp.inject({
        method: "PATCH",
        url: `/api/workspaces/${workspaceId}/members/${adminUserId}`,
        payload: { role: "viewer" },
      })
      expect(res.statusCode).toBe(400)
      expect((JSON.parse(res.body) as { error: string }).error).toMatch(/last admin/i)
      const [m] = await sql`SELECT role FROM workspace_members WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${adminUserId}::uuid`
      expect((m as { role: string }).role).toBe("admin")
    })

    it("returns 403 TIER_LIMIT_EXCEEDED when upgrading to editor at free tier cap", async () => {
      const capWsId = uuidv7()
      const capAdminId = uuidv7()
      const targetUserId = uuidv7()

      await sql`
        INSERT INTO users (id, email, password_hash, email_verified)
        VALUES (${capAdminId}::uuid, ${`role-cap-admin-${Date.now()}@example.com`}, 'hash', true)
      `
      await sql`
        INSERT INTO users (id, email, password_hash, email_verified)
        VALUES (${targetUserId}::uuid, ${`role-cap-target-${Date.now()}@example.com`}, 'hash', true)
      `
      await sql`
        INSERT INTO workspaces (id, name, slug, plan_tier)
        VALUES (${capWsId}::uuid, 'Role Cap WS', ${`role-cap-ws-${Date.now()}`}, 'free')
      `
      await sql`
        INSERT INTO workspace_members (id, workspace_id, user_id, role)
        VALUES (${uuidv7()}::uuid, ${capWsId}::uuid, ${capAdminId}::uuid, 'admin')
      `
      // Add viewer who will be the upgrade target
      await sql`
        INSERT INTO workspace_members (id, workspace_id, user_id, role)
        VALUES (${uuidv7()}::uuid, ${capWsId}::uuid, ${targetUserId}::uuid, 'viewer')
      `
      // Fill editor cap (3 editors)
      const editorIds: string[] = []
      for (let i = 0; i < 3; i++) {
        const editorId = uuidv7()
        editorIds.push(editorId)
        await sql`
          INSERT INTO users (id, email, password_hash, email_verified)
          VALUES (${editorId}::uuid, ${`role-cap-editor${i}-${Date.now()}@example.com`}, 'hash', true)
        `
        await sql`
          INSERT INTO workspace_members (id, workspace_id, user_id, role)
          VALUES (${uuidv7()}::uuid, ${capWsId}::uuid, ${editorId}::uuid, 'editor')
        `
      }

      const capApp = buildApp(capAdminId, capWsId, "admin")
      const { default: memberRoutes } = await import("../members.js")
      await capApp.register(memberRoutes)
      await capApp.ready()

      const res = await capApp.inject({
        method: "PATCH",
        url: `/api/workspaces/${capWsId}/members/${targetUserId}`,
        payload: { role: "editor" },
      })
      expect(res.statusCode).toBe(403)
      const body = res.json() as { code: string }
      expect(body.code).toBe("TIER_LIMIT_EXCEEDED")

      await capApp.close()
      for (const editorId of editorIds) {
        await sql`DELETE FROM workspace_members WHERE user_id = ${editorId}::uuid`
        await sql`DELETE FROM users WHERE id = ${editorId}::uuid`
      }
      await sql`DELETE FROM workspace_members WHERE workspace_id = ${capWsId}::uuid`
      await sql`DELETE FROM workspaces WHERE id = ${capWsId}::uuid`
      await sql`DELETE FROM users WHERE id IN (${capAdminId}::uuid, ${targetUserId}::uuid)`
    })
  })

  // USR-04: Admin can deactivate a member with immediate session invalidation
  describe("PATCH /api/workspaces/:workspaceId/members/:userId/deactivate (USR-04)", () => {
    let deactivateTargetId: string

    beforeAll(async () => {
      deactivateTargetId = uuidv7()
      await sql`
        INSERT INTO users (id, email, password_hash, email_verified)
        VALUES (${deactivateTargetId}::uuid, ${`deactivate-target-${Date.now()}@example.com`}, 'hash', true)
      `
      await sql`
        INSERT INTO workspace_members (id, workspace_id, user_id, role)
        VALUES (${uuidv7()}::uuid, ${workspaceId}::uuid, ${deactivateTargetId}::uuid, 'viewer')
      `
    })

    afterAll(async () => {
      await sql`DELETE FROM workspace_members WHERE user_id = ${deactivateTargetId}::uuid`
      await sql`DELETE FROM users WHERE id = ${deactivateTargetId}::uuid`
    })

    it("returns 200 and sets is_active=false when admin deactivates a member", async () => {
      mockValkeySet.mockClear()
      mockValkeyDel.mockClear()

      const res = await adminApp.inject({
        method: "PATCH",
        url: `/api/workspaces/${workspaceId}/members/${deactivateTargetId}/deactivate`,
      })

      expect(res.statusCode).toBe(200)

      // Verify DB updated
      const rows = await sql`
        SELECT is_active FROM workspace_members
        WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${deactivateTargetId}::uuid
      `
      expect((rows[0] as { is_active: boolean }).is_active).toBe(false)
    })

    it("sets Valkey blocklist key with 30-day TTL on deactivation", async () => {
      // Re-activate for this test
      await sql`
        UPDATE workspace_members SET is_active = true, updated_at = NOW()
        WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${deactivateTargetId}::uuid
      `
      mockValkeySet.mockClear()

      await adminApp.inject({
        method: "PATCH",
        url: `/api/workspaces/${workspaceId}/members/${deactivateTargetId}/deactivate`,
      })

      expect(mockValkeySet).toHaveBeenCalledWith(
        `deactivated:${workspaceId}:${deactivateTargetId}`,
        "1",
        "EX",
        60 * 60 * 24 * 30
      )
    })

    it("busts Valkey role cache on deactivation", async () => {
      await sql`
        UPDATE workspace_members SET is_active = true, updated_at = NOW()
        WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${deactivateTargetId}::uuid
      `
      mockValkeyDel.mockClear()

      await adminApp.inject({
        method: "PATCH",
        url: `/api/workspaces/${workspaceId}/members/${deactivateTargetId}/deactivate`,
      })

      expect(mockValkeyDel).toHaveBeenCalledWith(
        `member_role:${workspaceId}:${deactivateTargetId}`
      )
    })

    it("returns 403 when non-admin tries to deactivate", async () => {
      const res = await editorApp.inject({
        method: "PATCH",
        url: `/api/workspaces/${workspaceId}/members/${deactivateTargetId}/deactivate`,
      })
      expect(res.statusCode).toBe(403)
    })

    it("returns 400 when admin tries to deactivate themselves", async () => {
      const res = await adminApp.inject({
        method: "PATCH",
        url: `/api/workspaces/${workspaceId}/members/${adminUserId}/deactivate`,
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // GET /invitations
  describe("GET /api/workspaces/:workspaceId/invitations (admin)", () => {
    it("returns pending invitations for admin", async () => {
      await adminApp.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/invitations`,
        payload: { email: `list-test-${Date.now()}@example.com`, role: "viewer" },
      })

      const res = await adminApp.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/invitations`,
      })

      expect(res.statusCode).toBe(200)
      const invitations = res.json() as Array<{
        id: string
        email: string
        role: string
        expires_at: string
      }>
      expect(Array.isArray(invitations)).toBe(true)
      expect(invitations.length).toBeGreaterThan(0)
      invitations.forEach((inv) => {
        expect(inv.id).toBeTruthy()
        expect(inv.email).toBeTruthy()
        expect(inv.role).toBeTruthy()
        expect((inv as { token_hash?: string }).token_hash).toBeUndefined()
      })
    })

    it("returns 403 when non-admin tries to list invitations", async () => {
      const res = await editorApp.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/invitations`,
      })
      expect(res.statusCode).toBe(403)
    })
  })
})
