import crypto from "node:crypto"
import type { FastifyPluginAsync } from "fastify"
import bcrypt from "bcrypt"
import { uuidv7 } from "uuidv7"
import { sql } from "../db/client.js"
import { withWorkspace } from "../db/tenant.js"
import { emailQueue } from "../queues/email.queue.js"
import { emailEnabled } from "../lib/mailer.js"
import { valkey } from "../lib/valkey.js"
import { captureEvent } from "../lib/posthog.js"

// ── Helper ────────────────────────────────────────────────────────────────────

function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("hex") // 64-char hex string
}

// ── Member / Invitation Routes ────────────────────────────────────────────────

const memberRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Auth guard ───────────────────────────────────────────────────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── POST /api/workspaces/:workspaceId/invitations ─────────────────────────
  // Admin sends an invitation email to a new team member.
  fastify.post<{
    Params: { workspaceId: string }
    Body: { email: string; role: "admin" | "editor" | "viewer" }
  }>(
    "/api/workspaces/:workspaceId/invitations",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "role"],
          properties: {
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["admin", "editor", "viewer"] },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId
      const { workspaceId } = request.params
      const { email, role } = request.body

      // Admin guard — workspace_members is RLS-scoped (VEL-43)
      const memberRows = await withWorkspace(workspaceId, async (tx) => tx`
        SELECT wm.role, w.name AS workspace_name
        FROM workspace_members wm
        INNER JOIN workspaces w ON w.id = wm.workspace_id
        WHERE wm.workspace_id = ${workspaceId}::uuid
          AND wm.user_id = ${userId}::uuid
          AND wm.is_active = true
      `)
      if (memberRows.length === 0 || (memberRows[0] as { role: string }).role !== "admin") {
        return reply.status(403).send({ error: "Admin access required" })
      }

      const workspaceName = (memberRows[0] as { workspace_name: string }).workspace_name

      // Check if email is already an active member (workspace_members RLS-scoped — VEL-43)
      const existingMember = await withWorkspace(workspaceId, async (tx) => tx`
        SELECT wm.id
        FROM workspace_members wm
        INNER JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = ${workspaceId}::uuid
          AND u.email = ${email}
          AND wm.is_active = true
      `)
      if (existingMember.length > 0) {
        return reply.status(409).send({ error: "User is already an active member of this workspace" })
      }

      // Look up inviter name
      const inviterRows = await sql`SELECT name FROM users WHERE id = ${userId}::uuid`
      const inviterName = (inviterRows[0] as { name: string | null } | undefined)?.name ?? "A team member"

      // Generate and hash invite token
      const token = generateInviteToken()
      const tokenHash = await bcrypt.hash(token, 10)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      // Invalidate prior pending invites + insert the new one (tenant-scoped —
      // workspace_invitations is RLS-forced, so both statements need the
      // workspace context; bare sql here 500s under the velo_app role)
      const inviteId = uuidv7()
      await withWorkspace(workspaceId, async (tx) => {
        await tx`
          UPDATE workspace_invitations
          SET accepted_at = NOW()
          WHERE workspace_id = ${workspaceId}::uuid
            AND email = ${email}
            AND accepted_at IS NULL
        `
        await tx`
          INSERT INTO workspace_invitations (id, workspace_id, email, role, token_hash, invited_by, expires_at)
          VALUES (
            ${inviteId}::uuid,
            ${workspaceId}::uuid,
            ${email},
            ${role},
            ${tokenHash},
            ${userId}::uuid,
            ${expiresAt.toISOString()}
          )
        `
      })

      // Queue invitation email
      const inviteUrl = `${process.env.WEB_URL ?? "http://localhost:3000"}/accept-invite?token=${token}&workspace=${workspaceId}`
      await emailQueue.add("workspace-invite", {
        to: email,
        subject: `You've been invited to join ${workspaceName} on Velo`,
        type: "workspace-invite",
        payload: {
          inviteUrl,
          workspaceName,
          inviterName,
        },
      })

      captureEvent(userId as string, "member_invited", { workspace_id: workspaceId, role })

      return reply.status(201).send({
        id: inviteId,
        email,
        role,
        expires_at: expiresAt.toISOString(),
        // Always returned so the admin can copy the link (this is an
        // admin-only route). email_sent tells the UI whether the invitee
        // will also receive it by email or the link must be shared manually.
        invite_url: inviteUrl,
        email_sent: emailEnabled(),
      })
    }
  )

  // ── POST /api/workspaces/:workspaceId/invitations/accept ──────────────────
  // Authenticated user accepts an invitation and joins the workspace.
  fastify.post<{
    Params: { workspaceId: string }
    Body: { token: string }
  }>(
    "/api/workspaces/:workspaceId/invitations/accept",
    {
      schema: {
        body: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.userId
      const { workspaceId } = request.params
      const { token } = request.body

      // Look up the accepting user's email
      const userRows = await sql`SELECT email FROM users WHERE id = ${userId}::uuid`
      if (userRows.length === 0) {
        return reply.status(401).send({ error: "User not found" })
      }
      const userEmail = (userRows[0] as { email: string }).email

      // Look up pending invitations for this workspace + email (not yet accepted)
      // Use withWorkspace to satisfy RLS policy on workspace_invitations
      const invitations = await withWorkspace(workspaceId, async (tx) => {
        return tx`
          SELECT id, token_hash, role, expires_at
          FROM workspace_invitations
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
            AND email = ${userEmail}
            AND accepted_at IS NULL
          ORDER BY created_at DESC
        `
      })

      if (invitations.length === 0) {
        return reply.status(400).send({ error: "No valid invitation found for your email address" })
      }

      // Find the invitation with a matching token (check most recent first)
      let matchedInvitation: { id: string; role: string; expires_at: Date } | null = null

      for (const inv of invitations) {
        const row = inv as { id: string; token_hash: string; role: string; expires_at: Date }
        const tokenMatch = await bcrypt.compare(token, row.token_hash)
        if (tokenMatch) {
          matchedInvitation = { id: row.id, role: row.role, expires_at: row.expires_at }
          break
        }
      }

      if (!matchedInvitation) {
        return reply.status(400).send({ error: "Invalid invitation token" })
      }

      // Check expiry
      if (new Date(matchedInvitation.expires_at) < new Date()) {
        return reply.status(400).send({ error: "Invitation has expired" })
      }

      // Accept the invitation — mark accepted and add to workspace_members
      let result: { workspace_id: string; role: string } | "already_member" | null = null

      result = await withWorkspace(workspaceId, async (tx) => {
        // Mark invitation as accepted
        await tx`
          UPDATE workspace_invitations
          SET accepted_at = NOW()
          WHERE id = ${matchedInvitation!.id}::uuid
        `

        // Check if user already has a membership row (may be deactivated)
        const existingMember = await tx`
          SELECT id, is_active FROM workspace_members
          WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${userId}::uuid
        `

        if (existingMember.length > 0) {
          const member = existingMember[0] as unknown as { id: string; is_active: boolean }
          if (!member.is_active) {
            // Reactivate deactivated member with the invited role
            await tx`
              UPDATE workspace_members
              SET is_active = true, role = ${matchedInvitation!.role}, updated_at = NOW()
              WHERE id = ${member.id}::uuid
            `

            // Clear the deactivation blocklist in Valkey (best-effort)
            try {
              await fastify.valkey.del(`deactivated:${workspaceId}:${userId}`)
            } catch { /* Valkey failure is non-fatal */ }

            return { workspace_id: workspaceId, role: matchedInvitation!.role }
          }
          // Already an active member
          return "already_member" as const
        }

        // New member — insert
        const memberId = uuidv7()
        await tx`
          INSERT INTO workspace_members (id, workspace_id, user_id, role)
          VALUES (${memberId}::uuid, ${workspaceId}::uuid, ${userId}::uuid, ${matchedInvitation!.role})
        `

        return { workspace_id: workspaceId, role: matchedInvitation!.role }
      })

      if (result === "already_member") {
        return reply.status(409).send({ error: "You are already an active member of this workspace" })
      }

      return reply.send(result)
    }
  )

  // ── PATCH /api/workspaces/:workspaceId/members/:userId ───────────────────
  // Admin changes a member's role (USR-03).
  fastify.patch<{
    Params: { workspaceId: string; userId: string }
    Body: { role: "admin" | "editor" | "viewer" }
  }>(
    "/api/workspaces/:workspaceId/members/:userId",
    {
      schema: {
        body: {
          type: "object",
          required: ["role"],
          properties: {
            role: { type: "string", enum: ["admin", "editor", "viewer"] },
          },
        },
      },
    },
    async (request, reply) => {
      const callerId = request.userId
      const { workspaceId, userId: targetUserId } = request.params
      const { role } = request.body

      // Admin guard — workspace_members is RLS-scoped (VEL-43)
      const memberRows = await withWorkspace(workspaceId, async (tx) => tx`
        SELECT role
        FROM workspace_members
        WHERE workspace_id = ${workspaceId}::uuid
          AND user_id = ${callerId}::uuid
          AND is_active = true
      `)
      if (memberRows.length === 0 || (memberRows[0] as { role: string }).role !== "admin") {
        return reply.status(403).send({ error: "Admin access required" })
      }

      // Prevent removing the last admin — demoting the sole active admin (incl.
      // self-demotion) would leave the workspace with no one who can manage it.
      if (role !== "admin") {
        const admins = await withWorkspace(workspaceId, async (tx) => tx`
          SELECT user_id FROM workspace_members
          WHERE workspace_id = ${workspaceId}::uuid AND role = 'admin' AND is_active = true
        `) as unknown as Array<{ user_id: string }>
        if (admins.length === 1 && admins[0]?.user_id === targetUserId) {
          return reply.status(400).send({ error: "Cannot remove the last admin. Promote another member to admin first." })
        }
      }

      // Update role in DB — workspace_members is RLS-scoped (VEL-43)
      const updated = await withWorkspace(workspaceId, async (tx) => tx`
        UPDATE workspace_members
        SET role = ${role}, updated_at = NOW()
        WHERE workspace_id = ${workspaceId}::uuid
          AND user_id = ${targetUserId}::uuid
          AND is_active = true
        RETURNING user_id, role
      `)

      if (updated.length === 0) {
        return reply.status(404).send({ error: "Member not found or inactive" })
      }

      // Bust Valkey role cache so new role takes effect within 60s
      await valkey.del(`member_role:${workspaceId}:${targetUserId}`)

      const row = updated[0] as { user_id: string; role: string }
      return reply.send({ user_id: row.user_id, role: row.role })
    }
  )

  // ── PATCH /api/workspaces/:workspaceId/members/:userId/deactivate ─────────
  // Admin deactivates a member with immediate session invalidation (USR-04).
  fastify.patch<{
    Params: { workspaceId: string; userId: string }
  }>(
    "/api/workspaces/:workspaceId/members/:userId/deactivate",
    async (request, reply) => {
      const callerId = request.userId
      const { workspaceId, userId: targetUserId } = request.params

      // Admin guard — workspace_members is RLS-scoped (VEL-43)
      const memberRows = await withWorkspace(workspaceId, async (tx) => tx`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${workspaceId}::uuid
          AND user_id = ${callerId}::uuid
          AND is_active = true
      `)
      if (memberRows.length === 0 || (memberRows[0] as { role: string }).role !== "admin") {
        return reply.status(403).send({ error: "Admin access required" })
      }

      // Prevent self-deactivation
      if (callerId === targetUserId) {
        return reply.status(400).send({ error: "You cannot deactivate your own account" })
      }

      // Prevent deactivating the last admin (defence-in-depth alongside the
      // self-deactivation guard above).
      const activeAdmins = await withWorkspace(workspaceId, async (tx) => tx`
        SELECT user_id FROM workspace_members
        WHERE workspace_id = ${workspaceId}::uuid AND role = 'admin' AND is_active = true
      `) as unknown as Array<{ user_id: string }>
      if (activeAdmins.length === 1 && activeAdmins[0]?.user_id === targetUserId) {
        return reply.status(400).send({ error: "Cannot deactivate the last admin." })
      }

      // Set Valkey blocklist BEFORE returning 200 (atomic ordering)
      // 30-day TTL covers max JWT lifetime — deactivated users are rejected on next request
      await valkey.set(
        `deactivated:${workspaceId}:${targetUserId}`,
        "1",
        "EX",
        60 * 60 * 24 * 30
      )

      // Update is_active in DB — workspace_members is RLS-scoped (VEL-43)
      await withWorkspace(workspaceId, async (tx) => tx`
        UPDATE workspace_members
        SET is_active = false, updated_at = NOW()
        WHERE workspace_id = ${workspaceId}::uuid
          AND user_id = ${targetUserId}::uuid
      `)

      // Bust Valkey role cache
      await valkey.del(`member_role:${workspaceId}:${targetUserId}`)

      captureEvent(callerId as string, "member_deactivated", { workspace_id: workspaceId, target_user_id: targetUserId })

      return reply.send({ deactivated: true })
    }
  )

  // ── GET /api/workspaces/:workspaceId/invitations ──────────────────────────
  // Admin lists pending (not accepted, not expired) invitations.
  fastify.get<{
    Params: { workspaceId: string }
  }>("/api/workspaces/:workspaceId/invitations", async (request, reply) => {
    const userId = request.userId
    const { workspaceId } = request.params

    // Admin guard — workspace_members is RLS-scoped (VEL-43)
    const memberRows = await withWorkspace(workspaceId, async (tx) => tx`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${workspaceId}::uuid
        AND user_id = ${userId}::uuid
        AND is_active = true
    `)
    if (memberRows.length === 0 || (memberRows[0] as { role: string }).role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" })
    }

    // Return pending invitations (not accepted, not expired)
    const invitations = await withWorkspace(workspaceId, async (tx) =>
      tx`
        SELECT id, email, role, invited_by, expires_at, created_at
        FROM workspace_invitations
        WHERE workspace_id = ${workspaceId}::uuid
          AND accepted_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
      `
    )

    return reply.send(invitations)
  })
}

export default memberRoutes
