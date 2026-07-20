import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import multipart from "@fastify/multipart"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { uuidv7 } from "uuidv7"
import apiKeyRoutes from "../api-keys.js"
import ingestionRoutes from "../ingestion.js"

// Set required env vars for testing
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

// Mock storage — no real Cloudflare credentials in tests
vi.mock("../../lib/storage.js", () => ({
  storageEnabled: () => false,
  uploadObject: vi.fn().mockResolvedValue(undefined),
  getPresignedUrl: vi.fn().mockResolvedValue("https://r2.example.com/presigned-url"),
  buildIngestionKey: (_workspaceId: string, format: string, ingestionId: string) =>
    `ingestion/ws/${format}/${ingestionId}/payload.${format === "junit" ? "xml" : "json"}`,
}))

// Superuser SQL connection for test setup (bypasses RLS)
const sql = (await import("../../db/client.js")).sql

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, "fixtures")

const pytestXml = readFileSync(path.join(fixturesDir, "pytest-report.xml"))
const allureJson = readFileSync(path.join(fixturesDir, "allure-result.json"), "utf8")

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildApp(userId: string, workspaceId: string) {
  const app = Fastify({ logger: false })
  // Register multipart plugin — required for /ingest/junit and /ingest/allure multipart routes
  void app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })
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

// Build multipart body from a Buffer
function buildMultipartBody(fieldName: string, filename: string, content: Buffer, contentType = "application/octet-stream") {
  const boundary = "----TestBoundary"
  const parts = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`,
    `Content-Type: ${contentType}\r\n`,
    `\r\n`,
  ]
  const prefix = Buffer.from(parts.join(""), "utf8")
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8")
  return {
    body: Buffer.concat([prefix, content, suffix]),
    boundary,
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Ingestion routes (IN-01, IN-02, IN-04)", () => {
  let workspaceId: string
  let projectId: string
  let userId: string
  let rawApiKey: string
  let app: ReturnType<typeof Fastify>

  // Test cases for auto-mapping
  let matchedCaseId: string

  beforeAll(async () => {
    workspaceId = uuidv7()
    projectId = uuidv7()
    userId = uuidv7()
    matchedCaseId = uuidv7()

    // Insert user and workspace
    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`ingestion-test-${Date.now()}@example.com`}, 'hash', true)
    `
    await sql`
      INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Ingestion WS', ${`ingestion-ws-${Date.now()}`}, 'free')
    `
    await sql`
      INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'Ingestion Project', 'ip')
    `

    // Insert a test case that matches one of the pytest fixture names (by fullName or name)
    // pytest fixture has: classname=tests.test_login.TestLogin name=test_successful_login
    // => fullName = "tests.test_login.TestLogin.test_successful_login"
    await sql`
      INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
      VALUES (
        ${matchedCaseId}::uuid,
        ${workspaceId}::uuid,
        ${projectId}::uuid,
        ${"tests.test_login.TestLogin.test_successful_login"},
        'medium',
        1000
      )
    `

    // Build app with BOTH route plugins registered
    app = buildApp(userId, workspaceId)
    await app.register(apiKeyRoutes)
    await app.register(ingestionRoutes)
    await app.ready()

    // Create an API key for ingestion tests
    const createKeyRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/api-keys`,
      payload: { name: "Test CI Key" },
    })
    expect(createKeyRes.statusCode).toBe(201)
    const { key } = createKeyRes.json() as { key: string }
    rawApiKey = key
  })

  afterAll(async () => {
    await sql`DELETE FROM ci_ingestion_runs WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM run_items WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_runs WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM api_keys WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_cases WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  // ── POST /ingest/junit ─────────────────────────────────────────────────────

  it("POST /ingest/junit creates run + run_items from pytest XML", async () => {
    const { body } = buildMultipartBody("file", "pytest-report.xml", pytestXml, "application/xml")

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/junit`,
      headers: {
        authorization: `Bearer ${rawApiKey}`,
        "content-type": `multipart/form-data; boundary=----TestBoundary`,
      },
      body,
    })

    expect(res.statusCode).toBe(201)
    const result = res.json() as {
      ingestion_id: string
      run_id: string
      total_tests: number
      matched_tests: number
      unmatched_tests: number
    }
    expect(result.ingestion_id).toBeTruthy()
    expect(result.run_id).toBeTruthy()
    expect(result.total_tests).toBe(3) // pytest fixture has 3 tests
    expect(result.unmatched_tests).toBe(result.total_tests - result.matched_tests)
  })

  it("POST /ingest/junit auto-maps results to existing test cases by name", async () => {
    const { body } = buildMultipartBody("file", "pytest-report.xml", pytestXml, "application/xml")

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/junit`,
      headers: {
        authorization: `Bearer ${rawApiKey}`,
        "content-type": `multipart/form-data; boundary=----TestBoundary`,
      },
      body,
    })
    expect(res.statusCode).toBe(201)
    const { run_id, matched_tests } = res.json() as { run_id: string; matched_tests: number }

    // At least the matched test case should be linked
    expect(matched_tests).toBeGreaterThanOrEqual(1)

    // Verify in DB — the matched item has test_case_id set
    const items = await sql`
      SELECT test_case_id, case_title, status, source
      FROM run_items
      WHERE run_id = ${run_id}::uuid
      ORDER BY created_at
    `
    const typedItems = items as unknown as Array<{
      test_case_id: string | null
      case_title: string
      status: string
      source: string
    }>

    // Source should be 'ci' for all items
    typedItems.forEach((item) => {
      expect(item.source).toBe("ci")
    })

    // At least one item should map to the matched test case
    const linkedItem = typedItems.find((i) => i.test_case_id === matchedCaseId)
    expect(linkedItem).toBeTruthy()
  })

  it("POST /ingest/junit creates orphan run_items (null test_case_id) for unmatched names", async () => {
    const { body } = buildMultipartBody("file", "pytest-report.xml", pytestXml, "application/xml")

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/junit`,
      headers: {
        authorization: `Bearer ${rawApiKey}`,
        "content-type": `multipart/form-data; boundary=----TestBoundary`,
      },
      body,
    })
    expect(res.statusCode).toBe(201)
    const { run_id, unmatched_tests } = res.json() as { run_id: string; unmatched_tests: number }

    // There should be some unmatched items (the other 2 pytest tests don't match)
    expect(unmatched_tests).toBeGreaterThan(0)

    // Verify in DB — unmatched items have null test_case_id but non-null case_title
    const orphans = await sql`
      SELECT test_case_id, case_title FROM run_items
      WHERE run_id = ${run_id}::uuid
        AND test_case_id IS NULL
    `
    expect(orphans.length).toBe(unmatched_tests)
    orphans.forEach((item) => {
      expect((item as { case_title: string | null }).case_title).not.toBeNull()
    })
  })

  it("POST /ingest/junit returns 401 without API key", async () => {
    const { body } = buildMultipartBody("file", "pytest-report.xml", pytestXml, "application/xml")

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/junit`,
      headers: {
        "content-type": `multipart/form-data; boundary=----TestBoundary`,
      },
      body,
    })
    expect(res.statusCode).toBe(401)
  })

  it("POST /ingest/junit returns 401 with invalid API key", async () => {
    const { body } = buildMultipartBody("file", "pytest-report.xml", pytestXml, "application/xml")

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/junit`,
      headers: {
        authorization: "Bearer velo_thisisatotallyinvalidkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "content-type": `multipart/form-data; boundary=----TestBoundary`,
      },
      body,
    })
    expect(res.statusCode).toBe(401)
  })

  it("POST /ingest/junit returns 403 when API key belongs to different workspace", async () => {
    const otherWorkspaceId = uuidv7()
    const { body } = buildMultipartBody("file", "pytest-report.xml", pytestXml, "application/xml")

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${otherWorkspaceId}/projects/${projectId}/ingest/junit`,
      headers: {
        authorization: `Bearer ${rawApiKey}`,
        "content-type": `multipart/form-data; boundary=----TestBoundary`,
      },
      body,
    })
    expect(res.statusCode).toBe(403)
  })

  it("POST /ingest/junit returns 422 on malformed XML", async () => {
    const badXml = Buffer.from("<not valid xml><<<<")
    const { body } = buildMultipartBody("file", "bad.xml", badXml, "application/xml")

    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/junit`,
      headers: {
        authorization: `Bearer ${rawApiKey}`,
        "content-type": `multipart/form-data; boundary=----TestBoundary`,
      },
      body,
    })
    expect(res.statusCode).toBe(422)
    const error = res.json() as { error: string }
    expect(error.error).toMatch(/parse error/i)
  })

  // ── POST /ingest/allure ────────────────────────────────────────────────────

  it("POST /ingest/allure creates run + run_items from Allure JSON body", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/allure`,
      headers: {
        authorization: `Bearer ${rawApiKey}`,
        "content-type": "application/json",
      },
      payload: JSON.parse(allureJson),
    })

    expect(res.statusCode).toBe(201)
    const result = res.json() as {
      ingestion_id: string
      run_id: string
      total_tests: number
      matched_tests: number
      unmatched_tests: number
    }
    expect(result.ingestion_id).toBeTruthy()
    expect(result.run_id).toBeTruthy()
    expect(result.total_tests).toBe(4) // allure fixture has 4 results
    expect(result.total_tests).toBe(result.matched_tests + result.unmatched_tests)
  })

  it("POST /ingest/allure creates run with correct status mapping", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/allure`,
      headers: {
        authorization: `Bearer ${rawApiKey}`,
        "content-type": "application/json",
      },
      payload: JSON.parse(allureJson),
    })
    expect(res.statusCode).toBe(201)
    const { run_id } = res.json() as { run_id: string }

    const items = await sql`
      SELECT status, source FROM run_items WHERE run_id = ${run_id}::uuid ORDER BY created_at
    `
    const typedItems = items as unknown as Array<{ status: string; source: string }>

    // Allure fixture: passed, failed, broken, skipped => pass, fail, fail, skipped
    const statuses = typedItems.map((i) => i.status)
    expect(statuses).toContain("pass")
    expect(statuses).toContain("fail")
    expect(statuses).toContain("skipped")

    // All should be source=ci
    typedItems.forEach((item) => {
      expect(item.source).toBe("ci")
    })
  })

  it("POST /ingest/allure returns 422 on invalid JSON body", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingest/allure`,
      headers: {
        authorization: `Bearer ${rawApiKey}`,
        "content-type": "text/plain",
      },
      payload: "PK is a ZIP archive and should be rejected",
    })
    expect(res.statusCode).toBe(422)
  })

  // ── GET /ingestion-runs/:id/payload ────────────────────────────────────────

  it("GET /ingestion-runs/:id/payload returns 404 when not found", async () => {
    const fakeId = uuidv7()
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/ingestion-runs/${fakeId}/payload`,
    })
    expect(res.statusCode).toBe(404)
  })

  it("GET /ingestion-runs/:id/payload returns 401 when not authenticated", async () => {
    const noAuthApp = Fastify({ logger: false })
    noAuthApp.decorateRequest("userId", "")
    noAuthApp.decorateRequest("workspaceId", "")
    noAuthApp.decorateRequest("userRole", "")
    await noAuthApp.register(apiKeyRoutes)
    await noAuthApp.register(ingestionRoutes)
    await noAuthApp.ready()

    const fakeId = uuidv7()
    const res = await noAuthApp.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/ingestion-runs/${fakeId}/payload`,
    })
    expect(res.statusCode).toBe(401)
    await noAuthApp.close()
  })

  // ── GET /projects/:projectId/ingestion-runs — list ─────────────────────────

  it("GET /projects/:projectId/ingestion-runs returns list of ingestion runs", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/projects/${projectId}/ingestion-runs`,
    })
    expect(res.statusCode).toBe(200)
    const runs = res.json() as Array<{
      id: string
      format: string
      status: string
      total_tests: number
    }>
    expect(runs.length).toBeGreaterThan(0)
    runs.forEach((r) => {
      expect(r.id).toBeTruthy()
      expect(["junit", "allure"]).toContain(r.format)
      expect(r.status).toBeTruthy()
    })
  })
})
