import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { uuidv7 } from "uuidv7"

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"

const sql = (await import("../../db/client.js")).sql
const { purgeExpiredRecycleBin } = await import("../recycle-bin-sweep.js")

describe("purgeExpiredRecycleBin (VEL-31 lifecycle sweep)", () => {
  let workspaceId: string
  let projectId: string

  beforeAll(async () => {
    workspaceId = uuidv7()
    projectId = uuidv7()
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Sweep WS', ${`sweep-ws-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'Sweep Project', 'sw')`
  })

  afterAll(async () => {
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
  })

  const mkCase = async (title: string, deletedDaysAgo: number | null) => {
    const id = uuidv7()
    await sql`
      INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position, deleted_at)
      VALUES (${id}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, ${title}, 'low', 1000,
        ${deletedDaysAgo === null ? null : sql`NOW() - (${deletedDaysAgo} * INTERVAL '1 day')`})
    `
    return id
  }
  const mkSuite = async (name: string, deletedDaysAgo: number | null) => {
    const id = uuidv7()
    await sql`
      INSERT INTO suites (id, workspace_id, project_id, name, position, deleted_at)
      VALUES (${id}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, ${name}, 1000,
        ${deletedDaysAgo === null ? null : sql`NOW() - (${deletedDaysAgo} * INTERVAL '1 day')`})
    `
    return id
  }
  const mkRun = async (name: string, deletedDaysAgo: number | null) => {
    const id = uuidv7()
    await sql`
      INSERT INTO test_runs (id, workspace_id, project_id, name, status, deleted_at)
      VALUES (${id}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, ${name}, 'active',
        ${deletedDaysAgo === null ? null : sql`NOW() - (${deletedDaysAgo} * INTERVAL '1 day')`})
    `
    return id
  }
  const exists = async (table: string, id: string) => {
    const rows = await sql`SELECT 1 FROM ${sql(table)} WHERE id = ${id}::uuid`
    return rows.length > 0
  }

  it("purges items older than the retention window, keeps recent + live ones", async () => {
    const expiredSuite = await mkSuite("Expired suite", 40)
    const expiredCase = await mkCase("Expired case", 40)
    const expiredRun = await mkRun("Expired run", 40)

    const recentSuite = await mkSuite("Recent suite", 1)
    const recentCase = await mkCase("Recent case", 1)
    const recentRun = await mkRun("Recent run", 1)

    const liveSuite = await mkSuite("Live suite", null)
    const liveCase = await mkCase("Live case", null)
    const liveRun = await mkRun("Live run", null)

    // A run item in a LIVE run that referenced the expired case — must survive
    // the case purge, detached, with its title snapshot intact.
    const runItemId = uuidv7()
    await sql`
      INSERT INTO run_items (id, workspace_id, run_id, test_case_id, case_title, status)
      VALUES (${runItemId}::uuid, ${workspaceId}::uuid, ${liveRun}::uuid, ${expiredCase}::uuid, 'Expired case', 'pass')
    `
    // A run item inside the EXPIRED run — must be cascade-deleted with it.
    const expiredRunItemId = uuidv7()
    await sql`
      INSERT INTO run_items (id, workspace_id, run_id, status)
      VALUES (${expiredRunItemId}::uuid, ${workspaceId}::uuid, ${expiredRun}::uuid, 'fail')
    `

    const result = await purgeExpiredRecycleBin(30)

    // Expired rows are gone.
    expect(await exists("suites", expiredSuite)).toBe(false)
    expect(await exists("test_cases", expiredCase)).toBe(false)
    expect(await exists("test_runs", expiredRun)).toBe(false)
    expect(await exists("run_items", expiredRunItemId)).toBe(false)

    // Recent (within window) + live rows survive.
    expect(await exists("suites", recentSuite)).toBe(true)
    expect(await exists("test_cases", recentCase)).toBe(true)
    expect(await exists("test_runs", recentRun)).toBe(true)
    expect(await exists("suites", liveSuite)).toBe(true)
    expect(await exists("test_cases", liveCase)).toBe(true)
    expect(await exists("test_runs", liveRun)).toBe(true)

    // The live run's item survives, detached from the purged case.
    const item = (await sql`
      SELECT test_case_id, case_title FROM run_items WHERE id = ${runItemId}::uuid
    `)[0] as { test_case_id: string | null; case_title: string } | undefined
    expect(item?.test_case_id).toBeNull()
    expect(item?.case_title).toBe("Expired case")

    // Reported counts reflect at least the rows we created.
    expect(result.runs).toBeGreaterThanOrEqual(1)
    expect(result.cases).toBeGreaterThanOrEqual(1)
    expect(result.suites).toBeGreaterThanOrEqual(1)
  })
})
