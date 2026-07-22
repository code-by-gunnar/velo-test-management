import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import crypto from "node:crypto"
import { uuidv7 } from "uuidv7"

// DA-01 (INT / plan 03-04): the run SSE stream. The endpoint calls reply.hijack()
// and streams on reply.raw, which app.inject() can't capture — so this drives a
// real listening server with a streaming fetch. Auth is via a single-use Valkey
// ticket (VEL-42), minted here directly.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379"
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-auth-secret-runs-sse"

const sql = (await import("../../db/client.js")).sql
const { valkey } = await import("../../lib/valkey.js")
const sessionPlugin = (await import("../../plugins/session.plugin.js")).default
const authPlugin = (await import("../../plugins/auth.plugin.js")).default
const runsRoutes = (await import("../runs.js")).default

describe("Run SSE stream (DA-01)", () => {
  let app: ReturnType<typeof Fastify>
  let base: string
  const wsId = uuidv7()
  const userId = uuidv7()
  const projectId = uuidv7()
  const caseId = uuidv7()
  const runId = uuidv7()
  const stamp = Date.now()

  beforeAll(async () => {
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`sse-${stamp}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${wsId}::uuid, 'SSE WS', ${`sse-${stamp}`}, 'free')`
    await sql`INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active)
      VALUES (${uuidv7()}::uuid, ${wsId}::uuid, ${userId}::uuid, 'admin', true)`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${wsId}::uuid, 'SSE Project', 'ssp')`
    await sql`INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
      VALUES (${caseId}::uuid, ${wsId}::uuid, ${projectId}::uuid, 'C', 'low', 1000)`
    await sql`INSERT INTO test_runs (id, workspace_id, project_id, name, status)
      VALUES (${runId}::uuid, ${wsId}::uuid, ${projectId}::uuid, 'SSE Run', 'active')`
    await sql`INSERT INTO run_items (id, workspace_id, run_id, test_case_id, status)
      VALUES (${uuidv7()}::uuid, ${wsId}::uuid, ${runId}::uuid, ${caseId}::uuid, 'untested')`

    app = Fastify({ logger: false })
    app.decorate("valkey", valkey)
    await app.register(sessionPlugin)
    await app.register(authPlugin)
    await app.register(runsRoutes)
    base = await app.listen({ port: 0, host: "127.0.0.1" })
  })

  afterAll(async () => {
    await sql`DELETE FROM run_items WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM test_runs WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM test_cases WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM projects WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${wsId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  async function mintTicket(): Promise<string> {
    const ticket = crypto.randomBytes(16).toString("hex")
    await valkey.set(`sse:ticket:${ticket}`, JSON.stringify({ userId, workspaceId: wsId, runId }), "EX", 60)
    return ticket
  }

  it("returns text/event-stream and an initial run_update event, then a live pub/sub update", async () => {
    const ticket = await mintTicket()
    const ac = new AbortController()
    const res = await fetch(
      `${base}/api/workspaces/${wsId}/runs/${runId}/stream?ticket=${ticket}`,
      { headers: { Accept: "text/event-stream" }, signal: ac.signal }
    )

    // (1) content type
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")

    const reader = res.body!.getReader()
    const dec = new TextDecoder()

    // (2) initial stats event on connect — one untested item
    const first = dec.decode((await reader.read()).value)
    expect(first).toContain("run_update")
    expect(first).toContain('"untested":1')

    // (3) update event forwarded from Valkey pub/sub. Give the handler's
    // subscribe() a moment (it runs after the initial write), then publish.
    await new Promise((r) => setTimeout(r, 300))
    const marker = `passed-${stamp}`
    await valkey.publish(`run:${runId}`, JSON.stringify({ type: "run_update", runId, note: marker }))

    let got = ""
    for (let i = 0; i < 5 && !got.includes(marker); i++) {
      const chunk = await reader.read()
      if (chunk.value) got += dec.decode(chunk.value)
    }
    expect(got).toContain(marker)

    ac.abort()
    await reader.cancel().catch(() => {})
  })

  it("rejects a bogus ticket with 401", async () => {
    const res = await fetch(
      `${base}/api/workspaces/${wsId}/runs/${runId}/stream?ticket=not-a-real-ticket`,
      { headers: { Accept: "text/event-stream" } }
    )
    expect(res.status).toBe(401)
    await res.body?.cancel().catch(() => {})
  })

  it("rejects a single-use ticket on reuse (GETDEL)", async () => {
    const ticket = await mintTicket()
    const ac = new AbortController()
    const first = await fetch(
      `${base}/api/workspaces/${wsId}/runs/${runId}/stream?ticket=${ticket}`,
      { headers: { Accept: "text/event-stream" }, signal: ac.signal }
    )
    expect(first.status).toBe(200)
    ac.abort()
    await first.body?.cancel().catch(() => {})

    const reuse = await fetch(
      `${base}/api/workspaces/${wsId}/runs/${runId}/stream?ticket=${ticket}`,
      { headers: { Accept: "text/event-stream" } }
    )
    expect(reuse.status).toBe(401)
    await reuse.body?.cancel().catch(() => {})
  })
})
