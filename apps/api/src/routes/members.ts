import crypto from "node:crypto"
import type { FastifyPluginAsync } from "fastify"
import bcrypt from "bcrypt"
import { uuidv7 } from "uuidv7"
import { sql } from "../db/client.js"
import { withWorkspace } from "../db/tenant.js"
import { emailQueue } from "../queues/email.queue.js"

// Free tier limits — mirrors workspaces.ts constant
const FREE_TIER_LIMITS = {
  max_editors: 3,
} as const

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

      // Admin guard — use bare sql (pre-RLS context)
      const memberRows = await sql`
        SELECT wm.role, w.plan_tier, w.name AS workspace_name
        FROM workspace_members wm
        INNER JOIN workspaces w ON w.id = wm.workspace_id
        WHERE wm.workspace_id = ${workspaceId}::uuid
          AND wm.user_id = ${userId}::uuid
          AND wm.is_active = true
      `
      if (memberRows.length === 0 || (memberRows[0] as { role: string }).role !== "admin") {
        return reply.status(403).send({ error: "Admin access required" })
      }

      const planTier = (memberRows[0] as { plan_tier: string }).plan_tier
      const workspaceName = (memberRows[0] as { workspace_name: string }).workspace_name

      // Editor seat cap — only for free tier and editor role
      if (role === "editor" && planTier === "free") {
        const countRows = await sql`
          SELECT COUNT(*) AS n
          FROM workspace_members
          WHERE workspace_id = ${workspaceId}::uuid
            AND role = 'editor'
            AND is_active = true
        `
        const editorCount = parseInt((countRows[0] as { n: string }).n ?? "0")
        if (editorCount >= FREE_TIER_LIMITS.max_editors) {
          return reply.status(403).send({
            error: `Free tier allows ${FREE_TIER_LIMITS.max_editors} editors. Upgrade to Starter to invite more.`,
            code: "TIER_LIMIT_EXCEEDED",
            limit: "max_editors",
          })
        }
      }

      // Check if email is already an active member
      const existingMember = await sql`
        SELECT wm.id
        FROM workspace_members wm
        INNER JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = ${workspaceId}::uuid
          AND u.email = ${email}
          AND wm.is_active = true
      `
      if (existingMember.length > 0) {
        return reply.status(409).send({ error: "User is already an active member of this workspace" })
      }

      // Look up inviter name
      const inviterRows = await sql`SELECT name FROM users WHERE id = ${userId}::uuid`
      const inviterName = (inviterRows[0] as { name: string | null } | undefined)?.name ?? "A team member"

      // Invalidate prior pending invites for this email
      await sql`
        UPDATE workspace_invitations
        SET accepted_at = NOW()
        WHERE workspace_id = ${workspaceId}::uuid
          AND email = ${email}
          AND accepted_at IS NULL
      `

      // Generate and hash invite token
      const token = generateInviteToken()
      const tokenHash = await bcrypt.hash(token, 10)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      // Insert invitation (tenant-scoped)
      const inviteId = uuidv7()
      await withWorkspace(workspaceId, async (tx) => {
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

      return reply.status(201).send({
        id: inviteId,
        email,
        role,
        expires_at: expiresAt.toISOString(),
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
      const invitations = await sql`
        SELECT id, token_hash, role, expires_at
        FROM workspace_invitations
        WHERE workspace_id = ${workspaceId}::uuid
          AND email = ${userEmail}
          AND accepted_at IS NULL
        ORDER BY created_at DESC
      `

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

      try {
        result = await withWorkspace(workspaceId, async (tx) => {
          // Mark invitation as accepted
          await tx`
            UPDATE workspace_invitations
            SET accepted_at = NOW()
            WHERE id = ${matchedInvitation!.id}::uuid
          `

          // Insert workspace_members row
          const memberId = uuidv7()
          await tx`
            INSERT INTO workspace_members (id, workspace_id, user_id, role)
            VALUES (${memberId}::uuid, ${workspaceId}::uuid, ${userId}::uuid, ${matchedInvitation!.role})
          `

          return { workspace_id: workspaceId, role: matchedInvitation!.role }
        })
      } catch (err: unknown) {
        // Unique constraint violation — user is already a member
        if (
          err instanceof Error &&
          "code" in err &&
          (err as { code: string }).code === "23505"
        ) {
          result = "already_member"
        } else {
          throw err
        }
      }

      if (result === "already_member") {
        return reply.status(409).send({ error: "You are already a member of this workspace" })
      }

      return reply.send(result)
    }
  )

  // ── GET /api/workspaces/:workspaceId/invitations ──────────────────────────
  // Admin lists pending (not accepted, not expired) invitations.
  fastify.get<{
    Params: { workspaceId: string }
  }>("/api/workspaces/:workspaceId/invitations", async (request, reply) => {
    const userId = request.userId
    const { workspaceId } = request.params

    // Admin guard
    const memberRows = await sql`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${workspaceId}::uuid
        AND user_id = ${userId}::uuid
        AND is_active = true
    `
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
