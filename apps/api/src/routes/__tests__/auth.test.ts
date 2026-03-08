import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import authRoutes from "../auth.js"

// Integration test — requires DATABASE_URL to point to a test database
// The CI workflow provides PostgreSQL 16 as a service
//
// Mock the email module to avoid real Resend API calls during tests
vi.mock("../../lib/email.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

// Also mock the Resend constructor so the RESEND_API_KEY guard doesn't throw
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "mock-id" }) },
  })),
}))

// Set required env vars for testing
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://velo:velo@localhost:5432/velo_test"
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "re_test_mock"
process.env.WEB_URL = process.env.WEB_URL ?? "http://localhost:3000"

describe("Auth routes integration (AUTH-01, AUTH-02, AUTH-04)", () => {
  const app = Fastify({ logger: false })
  const testEmail = `test-${Date.now()}@example.com`
  const testPassword = "TestPassword123!"

  beforeAll(async () => {
    await app.register(authRoutes)
    await app.ready()
  })

  afterAll(async () => {
    // Clean up test user — import sql lazily to avoid module-level env check failures
    const { sql } = await import("../../db/client.js")
    await sql`DELETE FROM users WHERE email = ${testEmail}`
    await app.close()
    await sql.end()
  })

  it("POST /api/auth/signup creates a user and returns 201 (AUTH-01)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: testEmail, password: testPassword, name: "Test User" },
    })
    expect(res.statusCode).toBe(201)
    expect((res.json() as { message: string }).message).toContain("Check your email")
  })

  it("POST /api/auth/signup returns 409 for duplicate email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { email: testEmail, password: testPassword },
    })
    expect(res.statusCode).toBe(409)
  })

  it("POST /api/auth/verify-credentials returns 403 before email verification", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/verify-credentials",
      payload: { email: testEmail, password: testPassword },
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { error: string }).error).toContain("not verified")
  })

  it("POST /api/auth/verify-credentials returns 401 for wrong password", async () => {
    // First verify the email directly in DB to test credentials check
    const { sql } = await import("../../db/client.js")
    await sql`UPDATE users SET email_verified = true WHERE email = ${testEmail}`

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/verify-credentials",
      payload: { email: testEmail, password: "WrongPassword!" },
    })
    expect(res.statusCode).toBe(401)
  })

  it("POST /api/auth/verify-credentials returns user with workspace_id and role fields (AUTH-05)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/verify-credentials",
      payload: { email: testEmail, password: testPassword },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, unknown>
    expect(body).toHaveProperty("id")
    expect(body).toHaveProperty("email", testEmail)
    // No workspace yet — workspace_id should be null until onboarding
    expect(body).toHaveProperty("workspace_id", null)
    expect(body).toHaveProperty("role", null)
  })

  it("POST /api/auth/forgot-password always returns 200 (no email enumeration) (AUTH-04)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/forgot-password",
      payload: { email: "nonexistent@example.com" },
    })
    expect(res.statusCode).toBe(200)
  })
})
