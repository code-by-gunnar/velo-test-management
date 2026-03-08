import { describe, it, expect, beforeAll, afterAll } from "vitest"
import postgres from "postgres"
import { sql } from "../client.js"
import { uuidv7 } from "uuidv7"

// RLS only applies to non-superuser roles — use DATABASE_URL_APP (velo_app role)
const appSql = postgres(process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL!, { max: 2 })

async function withWorkspaceApp<T>(workspaceId: string, fn: (tx: typeof appSql) => Promise<T>): Promise<T> {
  return appSql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL app.workspace_id = '${workspaceId}'`)
    return fn(tx as unknown as typeof appSql)
  }) as Promise<T>
}

// Integration test — requires DATABASE_URL pointing to a PostgreSQL 16 test DB
// with RLS policies applied (migration 0001_rls_policies.sql must have run)
// IMPORTANT: The DATABASE_URL must use a non-superuser role for RLS to take effect

describe("PostgreSQL RLS cross-workspace isolation (INFRA-06)", () => {
  let workspaceA: string
  let workspaceB: string
  let projectA: string
  let projectB: string

  beforeAll(async () => {
    workspaceA = uuidv7()
    workspaceB = uuidv7()
    projectA = uuidv7()
    projectB = uuidv7()

    // Create two workspaces and one project each (bypass RLS as superuser for setup)
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES
        (${workspaceA}::uuid, 'Workspace A', ${`test-ws-a-${Date.now()}`}, 'free'),
        (${workspaceB}::uuid, 'Workspace B', ${`test-ws-b-${Date.now()}`}, 'free')
    `

    await sql`
      INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES
        (${projectA}::uuid, ${workspaceA}::uuid, 'Project A', 'proj-a'),
        (${projectB}::uuid, ${workspaceB}::uuid, 'Project B', 'proj-b')
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM projects WHERE id IN (${projectA}::uuid, ${projectB}::uuid)`
    await sql`DELETE FROM workspaces WHERE id IN (${workspaceA}::uuid, ${workspaceB}::uuid)`
    await sql.end()
    await appSql.end()
  })

  it("withWorkspaceApp(A) can see Workspace A project but not Workspace B project (INFRA-06)", async () => {
    const projects = await withWorkspaceApp(workspaceA, async (tx) =>
      tx`SELECT id FROM projects WHERE id IN (${projectA}::uuid, ${projectB}::uuid)`
    )

    const ids = (projects as unknown as Array<{ id: string }>).map((p) => p.id)
    expect(ids).toContain(projectA)
    expect(ids).not.toContain(projectB)
  })

  it("withWorkspaceApp(B) can see Workspace B project but not Workspace A project", async () => {
    const projects = await withWorkspaceApp(workspaceB, async (tx) =>
      tx`SELECT id FROM projects WHERE id IN (${projectA}::uuid, ${projectB}::uuid)`
    )

    const ids = (projects as unknown as Array<{ id: string }>).map((p) => p.id)
    expect(ids).toContain(projectB)
    expect(ids).not.toContain(projectA)
  })

  it("SET LOCAL workspace_id is cleared after transaction ends — no bleed between requests", async () => {
    await withWorkspaceApp(workspaceA, async (tx) => {
      await tx`SELECT 1`
    })

    // Outside any transaction, current_setting returns null/empty
    const rows = await sql`SELECT current_setting('app.workspace_id', true) AS ws`
    expect(rows[0]?.ws == null || rows[0]?.ws === "").toBe(true)
  })
})
