import crypto from "node:crypto"
import type { FastifyPluginAsync } from "fastify"
import { withWorkspace } from "../db/tenant.js"
import { sql } from "../db/client.js"
import { encrypt } from "../lib/encryption.js"
import {
  exchangeCodeForTokens,
  getLinearOrganization,
  getLinearTeams,
  createLinearWebhook,
} from "../lib/linear-client.js"
import { captureEvent } from "../lib/posthog.js"
import { requireAdmin } from "../plugins/require-admin.js"

// Extend Fastify route config to support skipAuth flag
declare module "fastify" {
  interface FastifyContextConfig {
    skipAuth?: boolean
  }
}

// Helper: look up workspace slug by ID (non-tenant, bare sql)
async function getWorkspaceSlug(workspaceId: string): Promise<string> {
  const rows = await sql`SELECT slug FROM workspaces WHERE id = ${workspaceId}::uuid`
  return (rows[0]?.slug as string) ?? "unknown"
}

// ── Linear OAuth + management routes ────────────────────────────────────────

const linearRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard (skips routes with skipAuth config) ──────────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (request.routeOptions?.config?.skipAuth) return
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── GET /linear/auth — Generate Linear OAuth authorization URL ────────────
  // The redirect_uri is a FIXED path (not per-workspace) because Linear OAuth
  // apps only allow specific registered callback URLs. The workspaceId is
  // carried in the `state` parameter and validated on callback.
  fastify.get<{
    Params: { workspaceId: string }
  }>(
    "/api/workspaces/:workspaceId/linear/auth",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { workspaceId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const clientId = process.env.LINEAR_CLIENT_ID
      if (!clientId) {
        return reply.status(503).send({ error: "Linear integration is not available yet" })
      }

      // Fixed callback URL — workspaceId passed via state, not the URL path
      const apiBase = (process.env.API_URL ?? process.env.WEB_URL ?? "").replace(/\/$/, "")
      const redirectUri = `${apiBase}/api/linear/callback`

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
      })

      const url = `https://linear.app/oauth/authorize?${params.toString()}`

      return reply.send({ url })
    }
  )

  // ── GET /linear/callback — OAuth callback handler (FIXED path) ──────────
  // Linear redirects here after user authorizes. workspaceId comes from
  // the state parameter (stored in Valkey during /auth). This endpoint
  // does NOT require session auth — the user may have a different cookie
  // state after the redirect. We validate via the CSRF state token instead.
  // After processing, redirects the browser to the frontend settings page.
  fastify.get<{
    Querystring: { code?: string; state?: string; error?: string }
  }>(
    "/api/linear/callback",
    { config: { skipAuth: true } },
    async (request, reply) => {
      const { code, state, error: oauthError } = request.query
      const webUrl = (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/$/, "")

      // Handle OAuth error (user denied, etc.)
      if (oauthError || !code || !state) {
        return reply.redirect(`${webUrl}/app?linear_error=${oauthError ?? "missing_params"}`)
      }

      // Validate CSRF state against Valkey
      const stateKey = `linear:oauth:state:${state}`
      const stateData = await fastify.valkey.get(stateKey)

      if (!stateData) {
        return reply.redirect(`${webUrl}/app?linear_error=invalid_state`)
      }

      // Delete state immediately (one-time use)
      await fastify.valkey.del(stateKey)

      const parsed = JSON.parse(stateData) as { workspaceId: string; userId: string }
      const workspaceId = parsed.workspaceId

      // Build the redirect URI (must match what was sent to Linear in /auth)
      const apiBase = (process.env.API_URL ?? process.env.WEB_URL ?? "").replace(/\/$/, "")
      const redirectUri = `${apiBase}/api/linear/callback`

      try {
        const tokens = await exchangeCodeForTokens(code, redirectUri)

        // Fetch org info + teams in parallel (independent API calls)
        const [org, teams] = await Promise.all([
          getLinearOrganization(tokens.access_token),
          getLinearTeams(tokens.access_token),
        ])

        // Store encrypted tokens in linear_connections
        const encAccessToken = encrypt(tokens.access_token)

        const result = await withWorkspace(workspaceId, async (tx) => {
          const existing = await tx`
            SELECT id FROM linear_connections
            WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
          `

          if (existing.length > 0) {
            return "exists" as const
          }

          await tx`
            INSERT INTO linear_connections (
              id, workspace_id, access_token_enc, linear_org_id, linear_org_name,
              team_id, team_name, connected_by
            ) VALUES (
              gen_random_uuid(),
              current_setting('app.workspace_id', true)::uuid,
              ${encAccessToken},
              ${org.id},
              ${org.name},
              'pending',
              ${null},
              ${parsed.userId}::uuid
            )
          `

          return "created" as const
        })

        if (result === "exists") {
          return reply.redirect(`${webUrl}/app?linear_error=already_connected`)
        }

        // Register webhook with Linear for inbound status sync
        try {
          const webhookUrl = `${apiBase}/api/webhooks/linear`
          const webhook = await createLinearWebhook(
            tokens.access_token,
            webhookUrl,
            ["Issue"]
          )

          await withWorkspace(workspaceId, async (tx) => {
            await tx`
              UPDATE linear_connections
              SET webhook_signing_secret = ${webhook.secret}
              WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
            `
          })
        } catch (err) {
          fastify.log.warn({ err, workspaceId }, "Linear webhook registration failed")
        }

        // Cache teams in Valkey for the frontend team-selection step (5 min TTL)
        await fastify.valkey.set(
          `linear:teams:${workspaceId}`,
          JSON.stringify(teams),
          "EX", 300
        )

        captureEvent(parsed.userId, "linear_connected", { workspace_id: workspaceId })

        // Redirect back to frontend settings with success flag
        // Frontend will detect this and show team selection
        const slug = await getWorkspaceSlug(workspaceId)
        return reply.redirect(`${webUrl}/app/${slug}/settings?tab=integrations&linear_callback=success`)
      } catch (err) {
        fastify.log.error({ err, workspaceId }, "Linear OAuth callback failed")
        return reply.redirect(`${webUrl}/app?linear_error=exchange_failed`)
      }
    }
  )

  // ── GET /linear/teams — Retrieve cached teams for selection step ─────────
  fastify.get<{
    Params: { workspaceId: string }
  }>(
    "/api/workspaces/:workspaceId/linear/teams",
    async (request, reply) => {
      const { workspaceId } = request.params
      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const cached = await fastify.valkey.get(`linear:teams:${workspaceId}`)
      if (!cached) {
        return reply.status(404).send({ error: "No pending team selection" })
      }

      const teams = JSON.parse(cached) as Array<{ id: string; name: string }>
      return reply.send({ teams })
    }
  )

  // ── POST /linear/team — Set the default team after OAuth ──────────────────
  fastify.post<{
    Params: { workspaceId: string }
    Body: { team_id: string; team_name?: string }
  }>(
    "/api/workspaces/:workspaceId/linear/team",
    {
      preHandler: [requireAdmin],
      schema: {
        body: {
          type: "object",
          required: ["team_id"],
          properties: {
            team_id: { type: "string", minLength: 1 },
            team_name: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params
      const { team_id } = request.body
      let { team_name } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      // If team_name not provided, look it up from cached teams
      if (!team_name) {
        const cached = await fastify.valkey.get(`linear:teams:${workspaceId}`)
        if (cached) {
          const teams = JSON.parse(cached) as Array<{ id: string; name: string }>
          const match = teams.find(t => t.id === team_id)
          team_name = match?.name ?? team_id
        } else {
          team_name = team_id
        }
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          UPDATE linear_connections
          SET team_id = ${team_id}, team_name = ${team_name}
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id
        `
        return rows.length > 0 ? "updated" as const : "not_found" as const
      })

      if (result === "not_found") {
        return reply.status(404).send({ error: "No Linear connection found for this workspace" })
      }

      // Clean up cached teams
      await fastify.valkey.del(`linear:teams:${workspaceId}`)

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
        const rows = await tx`
          SELECT linear_org_name, team_id, team_name, connected_by, connected_at, api_key_enc
          FROM linear_connections
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
        `
        return rows.length > 0 ? rows[0] as Record<string, unknown> : null
      })

      if (!connection) {
        return reply.send({ connected: false })
      }

      const teamId = connection.team_id as string
      const needsTeamSelection = teamId === "pending"

      return reply.send({
        connected: true,
        org_name: connection.linear_org_name,
        team_id: needsTeamSelection ? null : teamId,
        team_name: needsTeamSelection ? null : connection.team_name,
        connected_at: connection.connected_at,
        connected_by: connection.connected_by,
        needs_team_selection: needsTeamSelection,
        has_api_key: Boolean(connection.api_key_enc),
      })
    }
  )

  // ── PUT /linear/api-key — Connect (or rotate) via a Linear API key ────────
  // This is the primary connect path for self-hosted instances: no OAuth app,
  // no browser callback. Upserts the connection — creates it from the key alone
  // if none exists (access_token_enc stays NULL; api_key_enc carries the
  // credential, which is what every consumer prefers anyway), or rotates the key
  // on an existing connection. After this, the user picks a default team.
  fastify.put<{
    Params: { workspaceId: string }
    Body: { api_key: string }
  }>(
    "/api/workspaces/:workspaceId/linear/api-key",
    {
      preHandler: [requireAdmin],
      schema: {
        body: {
          type: "object",
          required: ["api_key"],
          properties: {
            api_key: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params
      const { api_key } = request.body

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      // Validate the key AND fetch org + teams in one go — a valid key authenticates
      // and gives us everything the connection row + team-selection step need.
      let org: { id: string; name: string }
      let teams: Array<{ id: string; name: string }>
      try {
        [org, teams] = await Promise.all([
          getLinearOrganization(api_key),
          getLinearTeams(api_key),
        ])
      } catch {
        return reply.status(400).send({ error: "Invalid API key — could not authenticate with Linear" })
      }

      const encApiKey = encrypt(api_key)

      const result = await withWorkspace(workspaceId, async (tx) => {
        const existing = await tx`
          SELECT team_id FROM linear_connections
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
        `

        if (existing.length > 0) {
          // Rotate the key + refresh org info; keep the chosen team.
          await tx`
            UPDATE linear_connections
            SET api_key_enc = ${encApiKey}, linear_org_id = ${org.id}, linear_org_name = ${org.name}
            WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
          `
          return { created: false, teamId: (existing[0] as { team_id: string }).team_id }
        }

        // New API-key-only connection: no OAuth token, team pending.
        await tx`
          INSERT INTO linear_connections (
            id, workspace_id, access_token_enc, api_key_enc, linear_org_id, linear_org_name,
            team_id, team_name, connected_by
          ) VALUES (
            gen_random_uuid(),
            current_setting('app.workspace_id', true)::uuid,
            ${null},
            ${encApiKey},
            ${org.id},
            ${org.name},
            'pending',
            ${null},
            ${request.userId}::uuid
          )
        `
        return { created: true, teamId: "pending" }
      })

      // Cache teams for the selection step (5 min TTL), mirroring the OAuth flow.
      await fastify.valkey.set(`linear:teams:${workspaceId}`, JSON.stringify(teams), "EX", 300)

      if (result.created) {
        captureEvent(request.userId, "linear_connected", { workspace_id: workspaceId })
      }

      return reply.send({
        saved: true,
        connected: true,
        needs_team_selection: result.teamId === "pending",
        teams,
      })
    }
  )

  // ── DELETE /linear/disconnect — Remove connection ────────────────────────
  fastify.delete<{
    Params: { workspaceId: string }
  }>(
    "/api/workspaces/:workspaceId/linear/disconnect",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { workspaceId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const result = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          DELETE FROM linear_connections
          WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
          RETURNING id
        `
        return rows.length > 0 ? "deleted" as const : "not_found" as const
      })

      if (result === "not_found") {
        return reply.status(404).send({ error: "No Linear connection found" })
      }

      captureEvent(request.userId as string, "linear_disconnected", { workspace_id: workspaceId })

      return reply.send({ disconnected: true })
    }
  )
}

export default linearRoutes
