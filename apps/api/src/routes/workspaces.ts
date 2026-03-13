import type { FastifyPluginAsync } from "fastify"
import type postgres from "postgres"
import { uuidv7 } from "uuidv7"
import { sql } from "../db/client.js"
import { withWorkspace } from "../db/tenant.js"

// postgres.js TransactionSql has its call signatures omitted by TypeScript's Omit<>.
// Cast tx through unknown to postgres.Sql to enable template tag calls inside sql.begin().
type Sql = postgres.Sql

// Free tier limits (WORK-03)
const FREE_TIER_LIMITS = {
  max_editors: 3,
  max_projects: 1,
  max_test_cases: 500,
} as const

// Generate a URL-safe slug from a workspace name
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63)
}

const workspaceRoutes: FastifyPluginAsync = async (fastify) => {

  // ── Auth guard: all workspace routes require a valid session ──────────────
  // Without this, unauthenticated requests hit workspace queries with userId = ""
  // which causes a PostgreSQL UUID cast error instead of a clean 401.
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // ── POST /api/workspaces ──────────────────────────────────────────────────
  // Creates a workspace and makes the current user its admin.
  // This is called from the onboarding wizard (step 1).
  fastify.post<{
    Body: { name: string; slug?: string }
  }>("/api/workspaces", {
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 255 },
          slug: { type: "string", minLength: 2, maxLength: 63, pattern: "^[a-z0-9-]+$" },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.userId  // decorated by session plugin

    const { name, slug: requestedSlug } = request.body
    const slug = requestedSlug ?? slugify(name)

    // Check slug uniqueness
    const existing = await sql`SELECT id FROM workspaces WHERE slug = ${slug}`
    if (existing.length > 0) {
      return reply.status(409).send({ error: "Workspace URL is already taken", field: "slug" })
    }

    const workspaceId = uuidv7()
    const memberId = uuidv7()

    await sql.begin(async (rawTx) => {
      const tx = rawTx as unknown as Sql
      await tx`
        INSERT INTO workspaces (id, name, slug, plan_tier)
        VALUES (${workspaceId}::uuid, ${name}, ${slug}, 'free')
      `
      await tx`
        INSERT INTO workspace_members (id, workspace_id, user_id, role)
        VALUES (${memberId}::uuid, ${workspaceId}::uuid, ${userId}::uuid, 'admin')
      `
    })

    return reply.status(201).send({
      id: workspaceId,
      name,
      slug,
      plan_tier: "free",
    })
  })

  // ── GET /api/workspaces/:slug ─────────────────────────────────────────────
  fastify.get<{ Params: { slug: string } }>(
    "/api/workspaces/:slug",
    async (request, reply) => {
      const userId = request.userId
      const { slug } = request.params

      const rows = await sql`
        SELECT w.id, w.name, w.slug, w.plan_tier
        FROM workspaces w
        INNER JOIN workspace_members wm ON wm.workspace_id = w.id
        WHERE w.slug = ${slug}
          AND wm.user_id = ${userId}::uuid
          AND wm.is_active = true
      `

      if (rows.length === 0) return reply.status(404).send({ error: "Workspace not found" })

      return reply.send(rows[0])
    }
  )

  // ── PATCH /api/workspaces/:id/slug ────────────────────────────────────────
  // Allows editing the workspace slug ONE time after creation.
  fastify.patch<{
    Params: { id: string }
    Body: { slug: string }
  }>("/api/workspaces/:id/slug", {
    schema: {
      body: {
        type: "object",
        required: ["slug"],
        properties: {
          slug: { type: "string", minLength: 2, maxLength: 63, pattern: "^[a-z0-9-]+$" },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.userId
    const { id } = request.params
    const { slug } = request.body

    // Verify user is admin of this workspace
    const member = await sql`
      SELECT wm.role FROM workspace_members wm
      WHERE wm.workspace_id = ${id}::uuid
        AND wm.user_id = ${userId}::uuid
        AND wm.is_active = true
    `
    if (member.length === 0 || member[0]?.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" })
    }

    const workspace = await sql`SELECT slug_edited FROM workspaces WHERE id = ${id}::uuid`
    if (workspace.length === 0) return reply.status(404).send({ error: "Workspace not found" })

    if (workspace[0]?.slug_edited) {
      return reply.status(400).send({ error: "Workspace URL can only be changed once" })
    }

    // Check slug uniqueness
    const existing = await sql`SELECT id FROM workspaces WHERE slug = ${slug} AND id != ${id}::uuid`
    if (existing.length > 0) {
      return reply.status(409).send({ error: "Workspace URL is already taken" })
    }

    await sql`
      UPDATE workspaces
      SET slug = ${slug}, slug_edited = true, updated_at = NOW()
      WHERE id = ${id}::uuid
    `

    return reply.send({ slug })
  })

  // ── POST /api/workspaces/:workspaceId/projects ────────────────────────────
  // Creates a project within a workspace. Enforces Free tier limit.
  fastify.post<{
    Params: { workspaceId: string }
    Body: { name: string; project_key: string; description?: string; test_format?: string }
  }>("/api/workspaces/:workspaceId/projects", {
    schema: {
      body: {
        type: "object",
        required: ["name", "project_key"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          project_key: { type: "string", minLength: 1, maxLength: 20, pattern: "^[a-z0-9-]+$" },
          description: { type: "string", maxLength: 2000 },
          test_format: { type: "string", enum: ["steps", "gwt"] },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.userId
    const { workspaceId } = request.params
    const { name, project_key, description, test_format } = request.body

    // Verify user is admin or editor in this workspace
    const memberRows = await sql`
      SELECT wm.role, w.plan_tier FROM workspace_members wm
      INNER JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.workspace_id = ${workspaceId}::uuid
        AND wm.user_id = ${userId}::uuid
        AND wm.is_active = true
    `

    if (memberRows.length === 0) return reply.status(403).send({ error: "Access denied" })
    const member = memberRows[0]!
    if (member.role === "viewer") return reply.status(403).send({ error: "Viewers cannot create projects" })

    // WORK-03: Enforce Free tier project limit
    if (member.plan_tier === "free") {
      const countRows = await withWorkspace(workspaceId, async (tx) =>
        tx`SELECT COUNT(*) AS n FROM projects WHERE workspace_id = ${workspaceId}::uuid`
      )
      if (parseInt(countRows[0]?.n ?? "0") >= FREE_TIER_LIMITS.max_projects) {
        return reply.status(403).send({
          error: `Free tier allows ${FREE_TIER_LIMITS.max_projects} project. Upgrade to Starter to add more.`,
          code: "TIER_LIMIT_EXCEEDED",
          limit: "max_projects",
        })
      }
    }

    // Check project_key uniqueness within workspace
    const existingKey = await withWorkspace(workspaceId, async (tx) =>
      tx`SELECT id FROM projects WHERE workspace_id = ${workspaceId}::uuid AND project_key = ${project_key}`
    )
    if (existingKey.length > 0) {
      return reply.status(409).send({ error: "Project key already used in this workspace", field: "project_key" })
    }

    const projectId = uuidv7()

    await withWorkspace(workspaceId, async (tx) => {
      await tx`
        INSERT INTO projects (id, workspace_id, name, project_key, description, test_format)
        VALUES (${projectId}::uuid, ${workspaceId}::uuid, ${name}, ${project_key}, ${description ?? null}, ${test_format ?? 'steps'})
      `
    })

    return reply.status(201).send({
      id: projectId,
      workspace_id: workspaceId,
      name,
      project_key,
      description: description ?? null,
      test_format: test_format ?? 'steps',
    })
  })

  // ── POST /api/workspaces/:workspaceId/seed ───────────────────────────────
  // Called by the onboarding wizard when "Load sample data" is checked.
  // Creates 2 sample suites + 5 sample test cases (all editable from day one).
  // Idempotent — if sample data already exists for this workspace, returns 200 without re-seeding.
  fastify.post<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/seed",
    async (request, reply) => {
      const userId = request.userId
      const { workspaceId } = request.params

      // Verify user is a member of this workspace
      const member = await sql`
        SELECT id FROM workspace_members
        WHERE workspace_id = ${workspaceId}::uuid
          AND user_id = ${userId}::uuid
          AND is_active = true
      `
      if (member.length === 0) return reply.status(403).send({ error: "Access denied" })

      // Idempotency check — only seed if no suites exist yet
      const existing = await withWorkspace(workspaceId, async (tx) =>
        tx`SELECT id FROM suites WHERE workspace_id = ${workspaceId}::uuid LIMIT 1`
      )
      if (existing.length > 0) return reply.send({ message: "Already seeded" })

      // Get the first project in this workspace to attach suites to
      const projectRows = await withWorkspace(workspaceId, async (tx) =>
        tx`SELECT id FROM projects WHERE workspace_id = ${workspaceId}::uuid ORDER BY created_at ASC LIMIT 1`
      )
      if (projectRows.length === 0) return reply.status(400).send({ error: "No project found to seed" })

      const project = projectRows[0]!
      const suiteAId = uuidv7()
      const suiteBId = uuidv7()

      await withWorkspace(workspaceId, async (tx) => {
        // Create 2 sample suites
        await tx`
          INSERT INTO suites (id, workspace_id, project_id, name, position)
          VALUES
            (${suiteAId}::uuid, ${workspaceId}::uuid, ${project.id}::uuid, 'Login & Authentication', 1000),
            (${suiteBId}::uuid, ${workspaceId}::uuid, ${project.id}::uuid, 'Dashboard & Navigation', 2000)
        `

        // Create 5 sample test cases across the two suites
        const cases = [
          { suite: suiteAId, title: "User can sign in with valid credentials", priority: "high", pos: 1000 },
          { suite: suiteAId, title: "User sees error on invalid password", priority: "medium", pos: 2000 },
          { suite: suiteAId, title: "User can reset password via email", priority: "medium", pos: 3000 },
          { suite: suiteBId, title: "Dashboard loads within 2 seconds", priority: "high", pos: 1000 },
          { suite: suiteBId, title: "Sidebar collapses and state persists on refresh", priority: "low", pos: 2000 },
        ]

        for (const tc of cases) {
          const caseId = uuidv7()
          await tx`
            INSERT INTO test_cases (id, workspace_id, suite_id, project_id, title, priority, position)
            VALUES (
              ${caseId}::uuid, ${workspaceId}::uuid, ${tc.suite}::uuid,
              ${project.id}::uuid, ${tc.title}, ${tc.priority}, ${tc.pos}
            )
          `
        }
      })

      return reply.status(201).send({ message: "Sample data created" })
    }
  )

  // ── GET /api/workspaces/:workspaceId/projects ─────────────────────────────
  fastify.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/projects",
    async (request, reply) => {
      const { workspaceId } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const projects = await withWorkspace(workspaceId, async (tx) =>
        tx`
          SELECT id, name, project_key, description, created_at
          FROM projects
          WHERE workspace_id = ${workspaceId}::uuid
            AND deleted_at IS NULL
          ORDER BY created_at ASC
        `
      )

      return reply.send(projects)
    }
  )

  // ── GET /api/workspaces/:workspaceId/projects/by-key/:projectKey ─────────
  // Fast single-row lookup by human-readable project key.
  // Used by SSR pages to resolve projectKey → UUID without fetching all projects.
  fastify.get<{ Params: { workspaceId: string; projectKey: string } }>(
    "/api/workspaces/:workspaceId/projects/by-key/:projectKey",
    async (request, reply) => {
      const { workspaceId, projectKey } = request.params

      if (request.workspaceId !== workspaceId) {
        return reply.status(403).send({ error: "Forbidden" })
      }

      const project = await withWorkspace(workspaceId, async (tx) => {
        const rows = await tx`
          SELECT id, name, project_key, description, created_at
          FROM projects
          WHERE workspace_id = ${workspaceId}::uuid
            AND project_key = ${projectKey}
            AND deleted_at IS NULL
          LIMIT 1
        `
        return rows.length > 0 ? rows[0] : null
      })

      if (!project) {
        return reply.status(404).send({ error: "Project not found" })
      }

      return reply.send(project)
    }
  )

  // ── PATCH /api/workspaces/:workspaceId — update workspace name ────────────
  fastify.patch<{
    Params: { workspaceId: string }
    Body: { name: string }
  }>("/api/workspaces/:workspaceId", {
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 255 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.userId
    const { workspaceId } = request.params
    const { name } = request.body

    if (request.workspaceId !== workspaceId) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    // Verify user is admin
    const member = await sql`
      SELECT role FROM workspace_members
      WHERE workspace_id = ${workspaceId}::uuid
        AND user_id = ${userId}::uuid
        AND is_active = true
    `
    if (member.length === 0 || member[0]?.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" })
    }

    await sql`
      UPDATE workspaces
      SET name = ${name}, updated_at = NOW()
      WHERE id = ${workspaceId}::uuid
    `

    return reply.send({ id: workspaceId, name })
  })

  // ── PATCH /api/workspaces/:workspaceId/projects/:projectId — update project ─
  fastify.patch<{
    Params: { workspaceId: string; projectId: string }
    Body: { name?: string; project_key?: string }
  }>("/api/workspaces/:workspaceId/projects/:projectId", {
    schema: {
      body: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          project_key: { type: "string", minLength: 1, maxLength: 20, pattern: "^[a-z0-9-]+$" },
        },
      },
    },
  }, async (request, reply) => {
    const { workspaceId, projectId } = request.params
    const { name, project_key } = request.body

    if (request.workspaceId !== workspaceId) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    if (!name && !project_key) {
      return reply.status(400).send({ error: "At least one of name or project_key required" })
    }

    // If changing project_key, check uniqueness within workspace
    if (project_key) {
      const existing = await withWorkspace(workspaceId, async (tx) =>
        tx`SELECT id FROM projects
           WHERE workspace_id = ${workspaceId}::uuid
             AND project_key = ${project_key}
             AND id != ${projectId}::uuid
             AND deleted_at IS NULL`
      )
      if (existing.length > 0) {
        return reply.status(409).send({ error: "Project key already used in this workspace", field: "project_key" })
      }
    }

    const result = await withWorkspace(workspaceId, async (tx) => {
      const nameFrag = name ? tx`name = ${name},` : tx``
      const keyFrag = project_key ? tx`project_key = ${project_key},` : tx``

      const rows = await tx`
        UPDATE projects
        SET ${nameFrag} ${keyFrag} updated_at = NOW()
        WHERE id = ${projectId}::uuid
          AND workspace_id = current_setting('app.workspace_id', true)::uuid
          AND deleted_at IS NULL
        RETURNING id, name, project_key, description
      `
      return rows.length > 0 ? rows[0] : null
    })

    if (!result) {
      return reply.status(404).send({ error: "Project not found" })
    }

    return reply.send(result)
  })

  // ── DELETE /api/workspaces/:workspaceId/projects/:projectId — soft delete ──
  fastify.delete<{
    Params: { workspaceId: string; projectId: string }
  }>("/api/workspaces/:workspaceId/projects/:projectId", async (request, reply) => {
    const { workspaceId, projectId } = request.params

    if (request.workspaceId !== workspaceId) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    const result = await withWorkspace(workspaceId, async (tx) => {
      const rows = await tx`
        UPDATE projects
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${projectId}::uuid
          AND workspace_id = current_setting('app.workspace_id', true)::uuid
          AND deleted_at IS NULL
        RETURNING id
      `
      return rows.length > 0 ? "ok" : "not_found"
    })

    if (result === "not_found") {
      return reply.status(404).send({ error: "Project not found" })
    }

    return reply.status(204).send()
  })

  // ── GET /api/workspaces/:workspaceId/members — read-only member list ───────
  fastify.get<{
    Params: { workspaceId: string }
  }>("/api/workspaces/:workspaceId/members", async (request, reply) => {
    const { workspaceId } = request.params

    if (request.workspaceId !== workspaceId) {
      return reply.status(403).send({ error: "Forbidden" })
    }

    const members = await withWorkspace(workspaceId, async (tx) => {
      return tx`
        SELECT
          wm.user_id,
          u.email,
          wm.role,
          wm.created_at AS joined_at
        FROM workspace_members wm
        INNER JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = current_setting('app.workspace_id', true)::uuid
          AND wm.is_active = true
        ORDER BY wm.created_at ASC
      `
    })

    return reply.send(members)
  })
}

export default workspaceRoutes
