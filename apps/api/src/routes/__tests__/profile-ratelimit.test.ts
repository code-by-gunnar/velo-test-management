import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import { uuidv7 } from "uuidv7"
import profileRoutes from "../profile.js"

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"

const sql = (await import("../../db/client.js")).sql

function buildApp(userId: string) {
  const app = Fastify({ logger: false })
  app.decorateRequest("userId", "")
  app.decorateRequest("workspaceId", "")
  app.decorateRequest("userRole", "")
  // Set userId in onRequest so it's available to the rate-limit keyGenerator
  // (which runs in onRequest), mirroring the session plugin in the real app.
  app.addHook("onRequest", async (request) => {
    request.userId = userId
  })
  return app
}

describe("Profile change-email rate limiting (VEL-49 / audit #13)", () => {
  let userId: string
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    userId = uuidv7()
    await sql`
      INSERT INTO users (id, email, password_hash, email_verified)
      VALUES (${userId}::uuid, ${`rl-owner-${Date.now()}@example.com`}, 'hash', true)
    `
    app = buildApp(userId)
    await app.register(profileRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await sql`DELETE FROM verification_tokens WHERE user_id = ${userId}::uuid`
    await sql`DELETE FROM users WHERE id = ${userId}::uuid`
    await app.close()
    await sql.end()
  })

  it("throttles repeated OTP sends with 429 once the per-user cap is exceeded", async () => {
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/me/change-email",
        payload: { email: `rl-target-${i}-${userId.slice(0, 8)}@example.com` },
      })
      statuses.push(res.statusCode)
    }
    // Early requests succeed, then the limiter kicks in — no unbounded OTP sends.
    expect(statuses[0]).toBe(200)
    expect(statuses).toContain(429)
  })
})
