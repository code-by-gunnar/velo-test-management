import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import type { FastifyRequest } from "fastify"
import { hkdfSync } from "node:crypto"
import { EncryptJWT } from "jose"
import { uuidv7 } from "uuidv7"

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379"
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-auth-secret-session-fail-closed"

const sql = (await import("../../db/client.js")).sql
const { valkey } = await import("../../lib/valkey.js")
const sessionPlugin = (await import("../session.plugin.js")).default

// Replicate the plugin's Auth.js key derivation so we can mint a valid JWE.
function deriveKey(secret: string, cookieName: string): Uint8Array {
  return new Uint8Array(
    hkdfSync("sha256", Buffer.from(secret), cookieName, `Auth.js Generated Encryption Key (${cookieName})`, 64)
  )
}

async function mintToken(payload: Record<string, unknown>): Promise<string> {
  const key = deriveKey(process.env.AUTH_SECRET as string, "authjs.session-token")
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256CBC-HS512" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .encrypt(key)
}

describe("session plugin fail-closed on missing membership (VEL-54)", () => {
  let app: ReturnType<typeof Fastify>
  let userId: string
  let deniedWsId: string
  let allowedWsId: string

  beforeAll(async () => {
    userId = uuidv7()
    deniedWsId = uuidv7()
    allowedWsId = uuidv7()

    await sql`INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`sess-${Date.now()}@example.com`}, 'hash', true)`
    await sql`INSERT INTO workspaces (id, name, slug, plan_tier) VALUES
      (${deniedWsId}::uuid, 'Denied WS', ${`denied-${Date.now()}`}, 'free'),
      (${allowedWsId}::uuid, 'Allowed WS', ${`allowed-${Date.now()}`}, 'free')`
    // Active membership ONLY in the allowed workspace — none in the denied one
    // (simulates a hard-deleted membership row with no deactivation blocklist entry).
    await sql`INSERT INTO workspace_members (id, workspace_id, user_id, role, is_active)
      VALUES (${uuidv7()}::uuid, ${allowedWsId}::uuid, ${userId}::uuid, 'editor', true)`

    app = Fastify({ logger: false })
    await app.register(sessionPlugin)
    app.get("/whoami", async (req: FastifyRequest) => ({ userId: req.userId, role: req.userRole }))
    await app.ready()
  })

  afterAll(async () => {
    await valkey.del(
      `member_role:${allowedWsId}:${userId}`,
      `member_role:${deniedWsId}:${userId}`,
      `deactivated:${allowedWsId}:${userId}`,
      `deactivated:${deniedWsId}:${userId}`
    )
    await app.close()
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await sql`DELETE FROM workspaces WHERE id IN (${deniedWsId}::uuid, ${allowedWsId}::uuid)`
  })

  async function whoami(workspaceId: string) {
    const token = await mintToken({ id: userId, workspace_id: workspaceId, role: "admin" })
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { authorization: `Bearer ${token}`, "x-token-secure": "0" },
    })
    return res.json() as { userId: string; role: string | null }
  }

  it("denies a JWT whose workspace membership row no longer exists", async () => {
    await valkey.del(`member_role:${deniedWsId}:${userId}`)
    const who = await whoami(deniedWsId)
    // Fail closed — session context cleared, even though the JWT carried role "admin".
    expect(who.userId).toBe("")
    expect(who.role).toBeNull()
  })

  it("allows an active member and uses the live DB role, not the JWT role", async () => {
    await valkey.del(`member_role:${allowedWsId}:${userId}`)
    const who = await whoami(allowedWsId)
    expect(who.userId).toBe(userId)
    // JWT claimed "admin"; DB says "editor" — live role wins.
    expect(who.role).toBe("editor")
  })
})
