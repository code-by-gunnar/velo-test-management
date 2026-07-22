import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import multipart from "@fastify/multipart"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { uuidv7 } from "uuidv7"
import type { Redis } from "iovalkey"

// VEL-79: a retried CI upload (runner retry, network blip, re-run of the same
// pipeline) must NOT create a duplicate run. When the caller sends an
// Idempotency-Key, a repeat within the TTL replays the first response instead of
// ingesting again.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

vi.mock("../../lib/storage.js", () => ({
  storageEnabled: () => false,
  uploadObject: vi.fn().mockResolvedValue(undefined),
  getPresignedUrl: vi.fn().mockResolvedValue("https://r2.example.com/presigned-url"),
  buildIngestionKey: (_ws: string, format: string, id: string) => `ingestion/ws/${format}/${id}/payload.xml`,
}))

const sql = (await import("../../db/client.js")).sql
const apiKeyRoutes = (await import("../api-keys.js")).default
const ingestionRoutes = (await import("../ingestion.js")).default

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pytestXml = readFileSync(path.join(__dirname, "fixtures", "pytest-report.xml"))
const allureJson = readFileSync(path.join(__dirname, "fixtures", "allure-result.json"))

// In-memory valkey: incr/expire feed the throttle; get/set back idempotency.
function mockValkey(): Redis {
  const nums = new Map<string, number>()
  const strs = new Map<string, string>()
  return {
    incr: async (k: string) => {
      const v = (nums.get(k) ?? 0) + 1
      nums.set(k, v)
      return v
    },
    expire: async () => 1,
    get: async (k: string) => strs.get(k) ?? null,
    set: async (k: string, v: string) => {
      strs.set(k, String(v))
      return "OK"
    },
  } as unknown as Redis
}

function buildApp(userId: string, workspaceId: string, valkey: Redis) {
  const app = Fastify({ logger: false })
  void app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })
  app.decorate("valkey", valkey)
  app.decorateRequest("userId", userId)
  app.decorateRequest("workspaceId", workspaceId)
  app.decorateRequest("userRole", "admin")
  app.addHook("preHandler", async (request) => {
    request.userId = userId
    request.workspaceId = workspaceId
    request.userRole = "admin"
  })
  return app
}

function multipartBody(content: Buffer, filename: string, contentType: string) {
  const boundary = "----TestBoundary"
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    "utf8"
  )
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8")
  return Buffer.concat([prefix, content, suffix])
}

describe("Ingestion idempotency key (VEL-79)", () => {
  let workspaceId: string
  let projectId: string
  let userId: string
  let rawApiKey: string
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    workspaceId = uuidv7()
    projectId = uuidv7()
    userId = uuidv7()

    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`ingest-idem-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Ingest Idem WS', ${`ingest-idem-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'Idem Project', 'idp')`

    app = buildApp(userId, workspaceId, mockValkey())
    await app.register(apiKeyRoutes)
    await app.register(ingestionRoutes)
    await app.ready()

    const keyRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "Idem Key" },
    })
    rawApiKey = (keyRes.json() as { key: string }).key
  })

  afterAll(async () => {
    await sql`DELETE FROM ci_ingestion_runs WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM run_items WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_runs WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM api_keys WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  function ingestJunit(idempotencyKey?: string) {
    const headers: Record<string, string> = {
      authorization: `Bearer ${rawApiKey}`,
      "content-type": "multipart/form-data; boundary=----TestBoundary",
    }
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey
    return app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/junit`,
      headers,
      body: multipartBody(pytestXml, "r.xml", "application/xml"),
    })
  }

  async function runCount(): Promise<number> {
    const rows = await sql`SELECT COUNT(*)::int AS n FROM test_runs WHERE project_id = ${projectId}::uuid`
    return (rows[0] as unknown as { n: number }).n
  }

  it("replays the first response for a repeated Idempotency-Key — no duplicate run", async () => {
    const before = await runCount()

    const r1 = await ingestJunit("pipeline-run-42")
    expect(r1.statusCode).toBe(201)
    const first = r1.json() as { ingestion_id: string; run_id: string; total_tests: number }

    const r2 = await ingestJunit("pipeline-run-42")
    expect(r2.statusCode).toBe(201)
    const replay = r2.json() as { ingestion_id: string; run_id: string; total_tests: number }

    // Same run + ingestion identity returned, flagged as a replay.
    expect(replay.run_id).toBe(first.run_id)
    expect(replay.ingestion_id).toBe(first.ingestion_id)
    expect(replay.total_tests).toBe(first.total_tests)
    expect(r2.headers["idempotency-replayed"]).toBe("true")

    // Exactly ONE new run was created across the two calls.
    expect(await runCount()).toBe(before + 1)
  })

  it("a different Idempotency-Key creates a new run", async () => {
    const before = await runCount()
    const r = await ingestJunit("pipeline-run-99")
    expect(r.statusCode).toBe(201)
    expect(r.headers["idempotency-replayed"]).toBeUndefined()
    expect(await runCount()).toBe(before + 1)
  })

  it("no Idempotency-Key ingests every time (unchanged behaviour)", async () => {
    const before = await runCount()
    const r1 = await ingestJunit()
    const r2 = await ingestJunit()
    expect(r1.statusCode).toBe(201)
    expect(r2.statusCode).toBe(201)
    expect((r1.json() as { run_id: string }).run_id).not.toBe((r2.json() as { run_id: string }).run_id)
    expect(await runCount()).toBe(before + 2)
  })

  it("the same key on the allure endpoint also replays", async () => {
    const key = "shared-pipeline-7"
    const allureBody = () => ({
      method: "POST" as const,
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/allure`,
      headers: {
        authorization: `Bearer ${rawApiKey}`,
        "content-type": "multipart/form-data; boundary=----TestBoundary",
        "idempotency-key": key,
      },
      body: multipartBody(allureJson, "a.json", "application/json"),
    })
    const before = await runCount()
    const a1 = await app.inject(allureBody())
    const a2 = await app.inject(allureBody())
    expect(a1.statusCode).toBe(201)
    expect(a2.statusCode).toBe(201)
    expect((a2.json() as { run_id: string }).run_id).toBe((a1.json() as { run_id: string }).run_id)
    expect(a2.headers["idempotency-replayed"]).toBe("true")
    expect(await runCount()).toBe(before + 1)
  })
})
