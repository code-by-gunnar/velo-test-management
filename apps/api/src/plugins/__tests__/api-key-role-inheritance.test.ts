import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import crypto from "node:crypto"
import { uuidv7 } from "uuidv7"

// VEL-63: an API key must act with its CREATOR's live workspace role, not a
// blanket "api_key" role that bypasses requireEditor. A viewer who mints a key
// must NOT gain write access through /api/v1.
//
// Integration test — requires the test PostgreSQL + Valkey (session plugin runs
// as a global hook). Whole suite runs as superuser, so RLS never blocks the
// role-resolution query; that's the same caveat as every other tenant test.

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379"
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-auth-secret-api-key-role"

const sql = (await import("../../db/client.js")).sql
const sessionPlugin = (await import("../session.plugin.js")).default
const authPlugin = (await import("../auth.plugin.js")).default
const { requireEditor } = await import("../require-editor.js")

function makeKey() {
  const raw = "velo_" + crypto.randomBytes(32).toString("hex")
  const hash = crypto.createHash("sha256").update(raw).digest("hex")
  const prefix = raw.slice(0, 8)
  return { raw, hash, prefix }
}

describe("API key inherits creator's live workspace role (VEL-63)", () => {
  let app: ReturnType<typeof Fastify>
  const wsId = uuidv7()
  const adminU = uuidv7()
  const editorU = uuidv7()
  const viewerU = uuidv7()
  const orphanU = uuidv7()
  const k = { admin: makeKey(), editor: makeKey(), viewer: makeKey(), orphan: makeKey() }
  const stamp = Date.now()

  beforeAll(async () => {
    await sql`INSERT INTO users (id, email, password_hash, email_verified) VALUES
      (${adminU}::uuid,  ${`vel63-admin-${stamp}@example.com`},  'hash', true),
      (${editorU}::uuid, ${`vel63-editor-${stamp}@example.com`}, 'hash', true),
      (${viewerU}::uuid, ${`vel63-viewer-${stamp}@example.com`}, 'hash', true),
      (${orphanU}::uuid, ${`vel63-orphan-${stamp}@example.com`}, 'hash', true)`

    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${wsId}::uuid, 'VEL63 WS', ${`vel63-${stamp}`}, 'free')`

    // admin/editor/viewer are active members; orphan has NO membership row
    // (its key's created_by user was removed from the workspace).
    await sql`INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active) VALUES
      (${uuidv7()}::uuid, ${wsId}::uuid, ${adminU}::uuid,  'admin',  true),
      (${uuidv7()}::uuid, ${wsId}::uuid, ${editorU}::uuid, 'editor', true),
      (${uuidv7()}::uuid, ${wsId}::uuid, ${viewerU}::uuid, 'viewer', true)`

    await sql`INSERT INTO api_keys (id, workspace_id, name, key_prefix, key_hash, created_by) VALUES
      (${uuidv7()}::uuid, ${wsId}::uuid, 'admin key',  ${k.admin.prefix},  ${k.admin.hash},  ${adminU}::uuid),
      (${uuidv7()}::uuid, ${wsId}::uuid, 'editor key', ${k.editor.prefix}, ${k.editor.hash}, ${editorU}::uuid),
      (${uuidv7()}::uuid, ${wsId}::uuid, 'viewer key', ${k.viewer.prefix}, ${k.viewer.hash}, ${viewerU}::uuid),
      (${uuidv7()}::uuid, ${wsId}::uuid, 'orphan key', ${k.orphan.prefix}, ${k.orphan.hash}, ${orphanU}::uuid)`

    app = Fastify({ logger: false })
    await app.register(sessionPlugin)
    await app.register(authPlugin)
    // A write route gated exactly like the content routes under /api/v1.
    app.post(
      "/protected-write",
      { preHandler: [app.requireAuth, requireEditor] },
      async () => ({ ok: true })
    )
    await app.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM api_keys WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${wsId}::uuid`
    await sql`DELETE FROM users WHERE id IN (${adminU}::uuid, ${editorU}::uuid, ${viewerU}::uuid, ${orphanU}::uuid)`
    await app.close()
    await sql.end()
  })

  function write(rawKey: string) {
    return app.inject({
      method: "POST",
      url: "/protected-write",
      headers: { authorization: `Bearer ${rawKey}` },
    })
  }

  it("viewer's API key is DENIED write access (403) — the escalation is closed", async () => {
    const res = await write(k.viewer.raw)
    expect(res.statusCode).toBe(403)
    expect((res.json() as { code?: string }).code).toBe("VIEWER_READONLY")
  })

  it("editor's API key CAN write (200)", async () => {
    const res = await write(k.editor.raw)
    expect(res.statusCode).toBe(200)
  })

  it("admin's API key CAN write (200)", async () => {
    const res = await write(k.admin.raw)
    expect(res.statusCode).toBe(200)
  })

  it("key whose creator is no longer a member fails closed (403)", async () => {
    const res = await write(k.orphan.raw)
    expect(res.statusCode).toBe(403)
  })
})
