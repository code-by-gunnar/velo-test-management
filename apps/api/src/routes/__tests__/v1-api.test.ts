import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import cookie from "@fastify/cookie"
import crypto, { hkdfSync } from "node:crypto"
import { EncryptJWT } from "jose"
import { uuidv7 } from "uuidv7"

// INT-03: the /api/v1 surface — unified auth (session OR API key), the RBAC that
// flows from it, and the per-API-key rate limiter. Integration test against the
// test PostgreSQL + Valkey; the whole suite runs as superuser (RLS never blocks
// the role-resolution queries — same caveat as every tenant test).
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379"
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-auth-secret-v1-api-int03"
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? crypto.randomBytes(32).toString("hex")

const sql = (await import("../../db/client.js")).sql
const { valkey } = await import("../../lib/valkey.js")
const sessionPlugin = (await import("../../plugins/session.plugin.js")).default
const authPlugin = (await import("../../plugins/auth.plugin.js")).default
const v1Routes = (await import("../v1.js")).default

// Mint an Auth.js-compatible JWE the session plugin will decrypt (same HKDF key
// derivation, "dir" + A256CBC-HS512, plain cookie name).
function deriveKey(secret: string, cookieName: string): Uint8Array {
  return new Uint8Array(
    hkdfSync("sha256", Buffer.from(secret), cookieName, `Auth.js Generated Encryption Key (${cookieName})`, 64)
  )
}
async function mintSession(payload: Record<string, unknown>): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256CBC-HS512" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .encrypt(deriveKey(process.env.AUTH_SECRET!, "authjs.session-token"))
}

function makeKey() {
  const raw = "velo_" + crypto.randomBytes(32).toString("hex")
  return { raw, hash: crypto.createHash("sha256").update(raw).digest("hex"), prefix: raw.slice(0, 8) }
}

describe("v1 API — unified auth, RBAC, rate limiting (INT-03)", () => {
  let app: ReturnType<typeof Fastify>
  const wsId = uuidv7()
  const adminU = uuidv7()
  const projectId = uuidv7()
  const stamp = Date.now()
  const adminKey = makeKey()
  const revokedKey = makeKey()

  beforeAll(async () => {
    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${adminU}::uuid, ${`v1-admin-${stamp}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier)
      VALUES (${wsId}::uuid, 'V1 WS', ${`v1-${stamp}`}, 'free')`
    await sql`INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active)
      VALUES (${uuidv7()}::uuid, ${wsId}::uuid, ${adminU}::uuid, 'admin', true)`
    await sql`INSERT INTO projects (id, workspace_id, name, project_key)
      VALUES (${projectId}::uuid, ${wsId}::uuid, 'V1 Project', 'v1p')`
    await sql`INSERT INTO api_keys (id, workspace_id, name, key_prefix, key_hash, created_by) VALUES
      (${uuidv7()}::uuid, ${wsId}::uuid, 'v1 key', ${adminKey.prefix}, ${adminKey.hash}, ${adminU}::uuid),
      (${uuidv7()}::uuid, ${wsId}::uuid, 'revoked', ${revokedKey.prefix}, ${revokedKey.hash}, ${adminU}::uuid)`
    await sql`UPDATE api_keys SET revoked_at = NOW() WHERE key_prefix = ${revokedKey.prefix}`

    app = Fastify({ logger: false })
    app.decorate("valkey", valkey)
    await app.register(cookie)
    await app.register(sessionPlugin)
    await app.register(authPlugin)
    await app.register(v1Routes)
    await app.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM api_keys WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM projects WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspace_members WHERE workspace_id = ${wsId}::uuid`
    await sql`DELETE FROM workspaces WHERE id = ${wsId}::uuid`
    await sql`DELETE FROM users WHERE id = ${adminU}::uuid`
    await app.close()
    await sql.end()
  })

  const projectsUrl = () => `/api/v1/workspaces/${wsId}/projects`
  const withKey = (raw: string) => ({ authorization: `Bearer ${raw}` })

  // ── Unified auth middleware ────────────────────────────────────────────────
  describe("Unified Auth Middleware", () => {
    it("accepts Auth.js session cookie", async () => {
      const token = await mintSession({ id: adminU, workspace_id: wsId, role: "admin" })
      const res = await app.inject({
        method: "GET",
        url: projectsUrl(),
        cookies: { "authjs.session-token": token },
      })
      expect(res.statusCode).toBe(200)
    })

    it("accepts API key Bearer token", async () => {
      const res = await app.inject({ method: "GET", url: projectsUrl(), headers: withKey(adminKey.raw) })
      expect(res.statusCode).toBe(200)
    })

    it("returns 401 with no credentials", async () => {
      const res = await app.inject({ method: "GET", url: projectsUrl() })
      expect(res.statusCode).toBe(401)
    })

    it("rejects a revoked API key (401 — an invalid credential is unauthenticated, not 403)", async () => {
      const res = await app.inject({ method: "GET", url: projectsUrl(), headers: withKey(revokedKey.raw) })
      expect(res.statusCode).toBe(401)
    })
  })

  // ── /api/v1 routes reachable via API key ───────────────────────────────────
  describe("/api/v1 routes via API key", () => {
    it("GET /workspaces/:wid/projects lists projects", async () => {
      const res = await app.inject({ method: "GET", url: projectsUrl(), headers: withKey(adminKey.raw) })
      expect(res.statusCode).toBe(200)
      const list = res.json() as Array<{ id: string }>
      expect(list.some((p) => p.id === projectId)).toBe(true)
    })

    it("PATCH /workspaces/:wid/projects/:pid updates project", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/workspaces/${wsId}/projects/${projectId}`,
        headers: { ...withKey(adminKey.raw), "content-type": "application/json" },
        payload: { name: "V1 Renamed" },
      })
      expect(res.statusCode).toBe(200)
      const [row] = await sql`SELECT name FROM projects WHERE id = ${projectId}::uuid`
      expect((row as { name: string }).name).toBe("V1 Renamed")
    })

    it("DELETE /workspaces/:wid/projects/:pid soft-deletes project", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/workspaces/${wsId}/projects/${projectId}`,
        headers: withKey(adminKey.raw),
      })
      expect([200, 204]).toContain(res.statusCode)
      const [row] = await sql`SELECT deleted_at FROM projects WHERE id = ${projectId}::uuid`
      expect((row as { deleted_at: Date | null }).deleted_at).not.toBeNull()
      // restore so later assertions / other tests see a live project
      await sql`UPDATE projects SET deleted_at = NULL WHERE id = ${projectId}::uuid`
    })

    it("GET /workspaces/:wid/members lists workspace members", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/workspaces/${wsId}/members`,
        headers: withKey(adminKey.raw),
      })
      expect(res.statusCode).toBe(200)
      const members = res.json() as Array<{ user_id?: string; id?: string }>
      expect(members.length).toBeGreaterThanOrEqual(1)
    })

    it("PATCH /workspaces/:wid updates workspace settings", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/workspaces/${wsId}`,
        headers: { ...withKey(adminKey.raw), "content-type": "application/json" },
        payload: { name: "V1 WS Renamed" },
      })
      expect(res.statusCode).toBe(200)
      const [row] = await sql`SELECT name FROM workspaces WHERE id = ${wsId}::uuid`
      expect((row as { name: string }).name).toBe("V1 WS Renamed")
    })
  })

  // ── Rate limiting (per API key, 100/min) ───────────────────────────────────
  describe("Rate limiting", () => {
    const windowId = () => Math.floor(Date.now() / 60_000)
    const bucketOf = async (rawKey: string): Promise<string> => {
      const [row] = await sql`SELECT id FROM api_keys WHERE key_prefix = ${rawKey.slice(0, 8)}`
      return `ratelimit:${(row as { id: string }).id}:${windowId()}`
    }

    it("allows requests under the 100/min limit (with X-RateLimit headers)", async () => {
      const res = await app.inject({ method: "GET", url: projectsUrl(), headers: withKey(adminKey.raw) })
      expect(res.statusCode).toBe(200)
      expect(res.headers["x-ratelimit-limit"]).toBe("100")
      expect(Number(res.headers["x-ratelimit-remaining"])).toBeGreaterThanOrEqual(0)
    })

    it("returns 429 with Retry-After when the limit is exceeded", async () => {
      // Seed the current window's counter to the max so the next request trips it.
      await valkey.set(await bucketOf(adminKey.raw), "100", "EX", 120)
      const res = await app.inject({ method: "GET", url: projectsUrl(), headers: withKey(adminKey.raw) })
      expect(res.statusCode).toBe(429)
      expect(res.headers["retry-after"]).toBeTruthy()
      await valkey.del(await bucketOf(adminKey.raw))
    })

    it("rate limit is per API key, not global", async () => {
      // adminKey saturated; a distinct key in the same window is unaffected.
      const otherKey = makeKey()
      await sql`INSERT INTO api_keys (id, workspace_id, name, key_prefix, key_hash, created_by)
        VALUES (${uuidv7()}::uuid, ${wsId}::uuid, 'other', ${otherKey.prefix}, ${otherKey.hash}, ${adminU}::uuid)`
      await valkey.set(await bucketOf(adminKey.raw), "100", "EX", 120)

      const blocked = await app.inject({ method: "GET", url: projectsUrl(), headers: withKey(adminKey.raw) })
      const allowed = await app.inject({ method: "GET", url: projectsUrl(), headers: withKey(otherKey.raw) })
      expect(blocked.statusCode).toBe(429)
      expect(allowed.statusCode).toBe(200)

      await valkey.del(await bucketOf(adminKey.raw))
    })
  })
})
