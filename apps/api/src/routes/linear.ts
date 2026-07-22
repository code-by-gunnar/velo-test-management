import type { FastifyPluginAsync } from "fastify"
import { withWorkspace } from "../db/tenant.js"
import { recordAudit } from "../lib/audit-log.js"
import { encrypt } from "../lib/encryption.js"
import {
  getLinearOrganization,
  getLinearTeams,
} from "../lib/linear-client.js"
import { captureEvent } from "../lib/posthog.js"
import { requireAdmin } from "../plugins/require-admin.js"

// ── Linear connection management (API-key connect flow) ─────────────────────
// Self-hosted connects via a personal Linear API key entered in the UI — there
// is no OAuth app / browser callback. See CLAUDE.md "Linear API key > OAuth".

const linearRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard: every Linear route requires a valid session ───────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

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
          await recordAudit(tx, {
            action: "integration.connected",
            actorUserId: request.userId ?? null,
            targetType: "integration",
            targetId: "linear",
            metadata: { provider: "linear", rotated: true, org: org.name },
          })
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
        await recordAudit(tx, {
          action: "integration.connected",
          actorUserId: request.userId ?? null,
          targetType: "integration",
          targetId: "linear",
          metadata: { provider: "linear", rotated: false, org: org.name },
        })
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
        if (rows.length === 0) return "not_found" as const
        await recordAudit(tx, {
          action: "integration.disconnected",
          actorUserId: request.userId ?? null,
          targetType: "integration",
          targetId: "linear",
          metadata: { provider: "linear" },
        })
        return "deleted" as const
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
