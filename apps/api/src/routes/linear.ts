import crypto from "node:crypto"
import type { FastifyPluginAsync } from "fastify"
import { withWorkspace } from "../db/tenant.js"
import { encrypt, decrypt } from "../lib/encryption.js"
import {
  exchangeCodeForTokens,
  getLinearOrganization,
  getLinearTeams,
  createLinearWebhook,
} from "../lib/linear-client.js"

// UUID validation (any version)
const UUID_ANY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_ANY_RE.test(value)
}

// ── Linear OAuth + management routes ────────────────────────────────────────
// Base path: /api/workspaces/:workspaceId/linear/*
// All handlers:
//   1. Check session (401 if no userId)
//   2. Verify request.workspaceId matches :workspaceId param (403 if mismatch)
//   3. Use withWorkspace for every DB query
//   4. reply.send() called AFTER withWorkspace completes

const linearRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard ────────────────────────────────────────────────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── GET /linear/auth — Generate Linear OAuth authorization URL ────────────
  fastify.get<{
    Params: { workspaceId: string }
  }>(
    "/api/workspaces/:workspaceId/linear/auth",
    async (request, reply) => {
      const { workspaceId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const clientId = process.env.LINEAR_CLIENT_ID
      const redirectUri = process.env.LINEAR_REDIRECT_URI

      if (!clientId || !redirectUri) {
        return reply.status(500).send({ error: "Linear OAuth is not configured" })
      }

      // Generate CSRF state token, store in Valkey with 10-min TTL
      const state = crypto.randomBytes(32).toString("hex")
      const stateKey = `linear:oauth:state:${state}`
      await fastify.valkey.set(stateKey, JSON.stringify({
        workspaceId,
        userId: request.userId,
      }), "EX", 600) // 10 minutes

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "read,write,issues:create",
        state,
        // Pass actor to hint which Linear team to authorize
        actor: "application",
      })

      const url = `https://linear.app/oauth/authorize?${params.toString()}`

      return reply.send({ url })
    }
  )

  // ── GET /linear/callback — OAuth callback handler ────────────────────────
  // This receives the code+state from Linear after user authorizes.
  // In practice, the frontend redirects here, and we return JSON with teams.
  fastify.get<{
    Params: { workspaceId: string }
    Querystring: { code?: string; state?: string; error?: string }
  }>(
    "/api/workspaces/:workspaceId/linear/callback",
    async (request, reply) => {
      const { workspaceId } = request.params
      const { code, state, error: oauthError } = request.query

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      // Handle OAuth error (user denied, etc.)
      if (oauthError) {
        return reply.status(400).send({ error: `Linear OAuth error: ${oauthError}` })
      }

      if (!code || !state) {
        return reply.status(400).send({ error: "Missing code or state parameter" })
      }

      // Validate CSRF state against Valkey
      const stateKey = `linear:oauth:state:${state}`
      const stateData = await fastify.valkey.get(stateKey)

      if (!stateData) {
        return reply.status(400).send({ error: "Invalid or expired OAuth state" })
      }

      // Delete state immediately (one-time use)
      await fastify.valkey.del(stateKey)

      const parsed = JSON.parse(stateData) as { workspaceId: string; userId: string }
      if (parsed.workspaceId !== workspaceId) {
        return reply.status(400).send({ error: "OAuth state workspace mismatch" })
      }

      // Exchange code for tokens
      const redirectUri = process.env.LINEAR_REDIRECT_URI
      if (!redirectUri) {
        return reply.status(500).send({ error: "LINEAR_REDIRECT_URI not configured" })
      }

      const tokens = await exchangeCodeForTokens(code, redirectUri)

      // Fetch org info + teams
      const org = await getLinearOrganization(tokens.access_token)
      const teams = await getLinearTeams(tokens.access_token)

      // Store encrypted tokens in linear_connections
      const encAccessToken = encrypt(tokens.access_token)

      // Check for existing connection and insert
      const result = await withWorkspace(workspaceId, async (tx) => {
        const existing = await tx.unsafe(`
          SELECT id FROM linear_connections
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
        `)

        if (existing.length > 0) {
          return "exists" as const
        }

        await tx.unsafe(`
          INSERT INTO linear_connections (
            id, workspace_id, access_token_enc, linear_org_id, linear_org_name,
            team_id, team_name, connected_by
          ) VALUES (
            gen_random_uuid(),
            current_setting('app.workspace_id', true)::uuid,
            '${encAccessToken.replace(/'/g, "''")}',
            '${org.id.replace(/'/g, "''")}',
            '${org.name.replace(/'/g, "''")}',
            'pending',
            NULL,
            '${request.userId}'
          )
        `)

        return "created" as const
      })

      if (result === "exists") {
        return reply.status(409).send({
          error: "Workspace already has a Linear connection. Disconnect first to reconnect.",
        })
      }

      // Register webhook with Linear for inbound status sync
      const appUrl = process.env.APP_URL ?? process.env.WEB_URL
      if (appUrl) {
        try {
          const apiBase = process.env.API_URL ?? `${appUrl}`
          const webhookUrl = `${apiBase.replace(/\/$/, "")}/api/webhooks/linear`
          const webhook = await createLinearWebhook(
            tokens.access_token,
            webhookUrl,
            ["Issue"]
          )

          // Store the webhook signing secret
          await withWorkspace(workspaceId, async (tx) => {
            await tx.unsafe(`
              UPDATE linear_connections
              SET webhook_signing_secret = '${webhook.secret.replace(/'/g, "''")}'
              WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
            `)
          })
        } catch (err) {
          // Webhook registration failure is non-fatal — log and continue
          fastify.log.warn(
            { err, workspaceId },
            "Linear webhook registration failed — inbound sync will not work"
          )
        }
      }

      return reply.send({
        connected: true,
        org: { id: org.id, name: org.name },
        teams,
      })
    }
  )

  // ── POST /linear/team — Set the default team after OAuth ──────────────────
  fastify.post<{
    Params: { workspaceId: string }
    Body: { team_id: string; team_name: string }
  }>(
    "/api/workspaces/:workspaceId/linear/team",
    {
      schema: {
        body: {
          type: "object",
          required: ["team_id", "team_name"],
          properties: {
            team_id: { type: "string", minLength: 1 },
            team_name: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params
      const { team_id, team_name } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const safeTeamId = team_id.replace(/'/g, "''")
      const safeTeamName = team_name.replace(/'/g, "''")

      const result = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx.unsafe(`
          UPDATE linear_connections
          SET team_id = '${safeTeamId}', team_name = '${safeTeamName}'
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id
        `)
        return rows.length > 0 ? "updated" as const : "not_found" as const
      })

      if (result === "not_found") {
        return reply.status(404).send({ error: "No Linear connection found for this workspace" })
      }

      return reply.send({ updated: true, team_id, team_name })
    }
  )

  // ── GET /linear/status — Return connection info ──────────────────────────
  fastify.get<{
    Params: { workspaceId: string }
  }>(
    "/api/workspaces/:workspaceId/linear/status",
    async (request, reply) => {
      const { workspaceId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const connection = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx.unsafe(`
          SELECT linear_org_name, team_name, connected_by, connected_at
          FROM linear_connections
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
        `)
        return rows.length > 0 ? rows[0] : null
      })

      if (!connection) {
        return reply.send({ connected: false })
      }

      return reply.send({
        connected: true,
        orgName: (connection as Record<string, unknown>).linear_org_name,
        teamName: (connection as Record<string, unknown>).team_name,
        connectedAt: (connection as Record<string, unknown>).connected_at,
        connectedBy: (connection as Record<string, unknown>).connected_by,
      })
    }
  )

  // ── DELETE /linear/disconnect — Remove connection ────────────────────────
  fastify.delete<{
    Params: { workspaceId: string }
  }>(
    "/api/workspaces/:workspaceId/linear/disconnect",
    async (request, reply) => {
      const { workspaceId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx.unsafe(`
          DELETE FROM linear_connections
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id
        `)
        return rows.length > 0 ? "deleted" as const : "not_found" as const
      })

      if (result === "not_found") {
        return reply.status(404).send({ error: "No Linear connection found" })
      }

      return reply.send({ disconnected: true })
    }
  )
}

export default linearRoutes
