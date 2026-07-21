import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import { Readable } from "node:stream"
import { uuidv7 } from "uuidv7"

// VEL-77: evidence must be reachable on any host. When storage is private/bundled
// (MinIO), the listing hands back a same-origin proxy URL and the new download
// endpoint streams the object through the app — no browser-reachable storage host.

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

// Controllable storage mock — no real MinIO in tests.
const storage = {
  storageEnabled: vi.fn(() => true),
  shouldProxyDownloads: vi.fn(() => true),
  getObjectStream: vi.fn(async () => ({
    body: Readable.from([Buffer.from("PNGBYTES")]),
    contentType: "image/png",
    contentLength: 8,
  })),
  getPresignedUrl: vi.fn(async () => "https://cloud.example.com/presigned"),
  uploadObject: vi.fn(async () => undefined),
  deleteObjects: vi.fn(async () => 0),
}
vi.mock("../../lib/storage.js", () => storage)

const sql = (await import("../../db/client.js")).sql
const attachmentRoutes = (await import("../run-item-attachments.js")).default

function buildApp(userId: string, workspaceId: string, role = "editor") {
  const app = Fastify({ logger: false })
  app.decorateRequest("userId", "")
  app.decorateRequest("workspaceId", "")
  app.decorateRequest("userRole", "")
  app.addHook("preHandler", async (request) => {
    request.userId = userId
    request.workspaceId = workspaceId
    request.userRole = role
  })
  return app
}

describe("Run-item attachment download proxy (VEL-77)", () => {
  let app: ReturnType<typeof Fastify>
  const userId = uuidv7()
  const workspaceId = uuidv7()
  const projectId = uuidv7()
  const caseId = uuidv7()
  const runId = uuidv7()
  const itemId = uuidv7()
  const attachmentId = uuidv7()

  beforeAll(async () => {
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`att-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${workspaceId}::uuid, 'Att WS', ${`att-ws-${Date.now()}`}, 'free')`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${workspaceId}::uuid, 'Att Project', 'atp')`
    await sql`INSERT INTO test_cases (id, workspace_id, project_id, title, priority, position)
      VALUES (${caseId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'C', 'low', 1000)`
    await sql`INSERT INTO test_runs (id, workspace_id, project_id, name, status)
      VALUES (${runId}::uuid, ${workspaceId}::uuid, ${projectId}::uuid, 'Run', 'active')`
    await sql`INSERT INTO run_items (id, workspace_id, run_id, test_case_id, status)
      VALUES (${itemId}::uuid, ${workspaceId}::uuid, ${runId}::uuid, ${caseId}::uuid, 'untested')`
    await sql`INSERT INTO run_item_attachments (id, workspace_id, run_item_id, filename, r2_key, content_type, size_bytes)
      VALUES (${attachmentId}::uuid, ${workspaceId}::uuid, ${itemId}::uuid, 'shot.png', ${`evidence/${workspaceId}/${itemId}/x.png`}, 'image/png', 8)`

    app = buildApp(userId, workspaceId)
    await app.register(attachmentRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM run_item_attachments WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM run_items WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_runs WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM test_cases WHERE workspace_id = ${workspaceId}::uuid`
    await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  const base = () => `/api/workspaces/${workspaceId}/run-items/${itemId}/attachments`

  it("listing returns a same-origin proxy URL when storage is private (proxy mode)", async () => {
    storage.shouldProxyDownloads.mockReturnValue(true)
    const res = await app.inject({ method: "GET", url: base() })
    expect(res.statusCode).toBe(200)
    const list = res.json() as Array<{ id: string; url: string }>
    expect(list[0]?.url).toBe(
      `/api/backend/workspaces/${workspaceId}/run-items/${itemId}/attachments/${attachmentId}/download`
    )
    expect(storage.getPresignedUrl).not.toHaveBeenCalled()
  })

  it("listing returns a presigned URL when a public cloud endpoint is configured", async () => {
    storage.shouldProxyDownloads.mockReturnValue(false)
    const res = await app.inject({ method: "GET", url: base() })
    expect(res.statusCode).toBe(200)
    const list = res.json() as Array<{ url: string }>
    expect(list[0]?.url).toBe("https://cloud.example.com/presigned")
    storage.shouldProxyDownloads.mockReturnValue(true)
  })

  it("download streams an image inline with nosniff + sandbox CSP", async () => {
    const res = await app.inject({ method: "GET", url: `${base()}/${attachmentId}/download` })
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toContain("image/png")
    expect(res.headers["content-disposition"]).toContain("inline")
    expect(res.headers["x-content-type-options"]).toBe("nosniff")
    expect(res.headers["content-security-policy"]).toContain("sandbox")
    expect(res.body).toBe("PNGBYTES")
    expect(storage.getObjectStream).toHaveBeenCalled()
  })

  it("download forces a dangerous stored content-type to an octet-stream download (XSS defense)", async () => {
    // An attachment whose stored content_type is text/html must NOT be served
    // inline same-origin — that would execute in the app origin. VEL-77.
    const evilId = uuidv7()
    await sql`INSERT INTO run_item_attachments (id, workspace_id, run_item_id, filename, r2_key, content_type, size_bytes)
      VALUES (${evilId}::uuid, ${workspaceId}::uuid, ${itemId}::uuid, 'evil.html', ${`evidence/${workspaceId}/${itemId}/evil.html`}, 'text/html', 8)`

    const res = await app.inject({ method: "GET", url: `${base()}/${evilId}/download` })
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toBe("application/octet-stream")
    expect(res.headers["content-disposition"]).toContain("attachment")
    expect(res.headers["x-content-type-options"]).toBe("nosniff")

    await sql`DELETE FROM run_item_attachments WHERE id = ${evilId}::uuid`
  })

  it("download 404s for an attachment not in this item/workspace", async () => {
    const res = await app.inject({ method: "GET", url: `${base()}/${uuidv7()}/download` })
    expect(res.statusCode).toBe(404)
  })

  it("download 403s when the workspace param doesn't match the session", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/workspaces/${uuidv7()}/run-items/${itemId}/attachments/${attachmentId}/download`,
    })
    expect(res.statusCode).toBe(403)
  })
})
