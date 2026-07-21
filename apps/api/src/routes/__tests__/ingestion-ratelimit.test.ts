import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import multipart from "@fastify/multipart"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { uuidv7 } from "uuidv7"
import type { Redis } from "iovalkey"

// VEL-60: the standalone /ingest/* path (registered in server.ts with no v1
// limiter) must throttle per API key so a compromised/looping CI key can't flood
// raw-payload uploads. Set a low limit BEFORE importing the route so the module
// picks it up at load.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"
process.env.INGEST_RATE_LIMIT = "3"

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

// In-memory fixed-window counter — enough for enforceRateLimit (incr + expire).
function mockValkey(): Redis {
  const store = new Map<string, number>()
  return {
    incr: async (k: string) => {
      const v = (store.get(k) ?? 0) + 1
      store.set(k, v)
      return v
    },
    expire: async () => 1,
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

function multipartBody(content: Buffer) {
  const boundary = "----TestBoundary"
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="r.xml"\r\nContent-Type: application/xml\r\n\r\n`,
    "utf8"
  )
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8")
  return Buffer.concat([prefix, content, suffix])
}

describe("Ingestion per-key rate limit (VEL-60)", () => {
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
      VALUES (${userId}::uuid, ${`ingest-rl-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Ingest RL WS', ${`ingest-rl-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'RL Project', 'rlp')`

    app = buildApp(userId, workspaceId, mockValkey())
    await app.register(apiKeyRoutes)
    await app.register(ingestionRoutes)
    await app.ready()

    const keyRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "RL Key" },
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

  function ingest() {
    return app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/junit`,
      headers: {
        authorization: `Bearer ${rawApiKey}`,
        "content-type": "multipart/form-data; boundary=----TestBoundary",
      },
      body: multipartBody(pytestXml),
    })
  }

  it("allows requests up to the limit, then returns 429 with Retry-After", async () => {
    // INGEST_RATE_LIMIT=3 → first 3 succeed, 4th throttled.
    const r1 = await ingest()
    const r2 = await ingest()
    const r3 = await ingest()
    expect(r1.statusCode).toBe(201)
    expect(r2.statusCode).toBe(201)
    expect(r3.statusCode).toBe(201)
    expect(r3.headers["x-ratelimit-remaining"]).toBe("0")

    const r4 = await ingest()
    expect(r4.statusCode).toBe(429)
    expect(r4.headers["retry-after"]).toBeTruthy()
    expect((r4.json() as { error: string }).error).toMatch(/rate limit/i)
  })
})
