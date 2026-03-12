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
    // Note: sql.end() is called in the OAuth signin describe block afterAll
    // to avoid closing the connection before subsequent describe blocks run
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

describe("OAuth signin (INF-08)", () => {
  const app = Fastify({ logger: false })
  const ts = Date.now()

  beforeAll(async () => {
    await app.register(authRoutes)
    await app.ready()
  })

  afterAll(async () => {
    const { sql } = await import("../../db/client.js")
    // Remove all oauth accounts created by these tests
    await sql`
      DELETE FROM user_oauth_accounts
      WHERE provider_account_id LIKE ${"test-" + ts + "%"}
    `
    // Remove all users created by these tests (cascades oauth accounts too)
    await sql`
      DELETE FROM users
      WHERE email LIKE ${"oauth-%-" + ts + "@test.com"}
         OR email LIKE ${"oauth-null-pw-" + ts + "@test.com"}
    `
    await app.close()
    await sql.end()
  })

  it("Path 1: new user — JIT provisions user and returns 200 with null workspace fields (INF-08)", async () => {
    const email = `oauth-new-${ts}@test.com`
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/oauth-signin",
      payload: {
        provider: "google",
        providerAccountId: `test-${ts}-new`,
        email,
        name: "New OAuth User",
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, unknown>
    expect(body).toHaveProperty("id")
    expect(body).toHaveProperty("email", email)
    expect(body).toHaveProperty("name", "New OAuth User")
    expect(body).toHaveProperty("workspace_id", null)
    expect(body).toHaveProperty("workspace_slug", null)
    expect(body).toHaveProperty("role", null)
  })

  it("Path 2: returning user — same provider+providerAccountId returns same user.id (idempotent) (INF-08)", async () => {
    const email = `oauth-returning-${ts}@test.com`
    const payload = {
      provider: "github",
      providerAccountId: `test-${ts}-returning`,
      email,
      name: "Returning OAuth User",
    }

    const res1 = await app.inject({ method: "POST", url: "/api/auth/oauth-signin", payload })
    expect(res1.statusCode).toBe(200)
    const body1 = res1.json() as Record<string, unknown>

    const res2 = await app.inject({ method: "POST", url: "/api/auth/oauth-signin", payload })
    expect(res2.statusCode).toBe(200)
    const body2 = res2.json() as Record<string, unknown>

    expect(body1.id).toBe(body2.id)
  })

  it("Path 3: auto-link — OAuth with same email as existing credentials user returns existing user.id (INF-08)", async () => {
    const { sql } = await import("../../db/client.js")
    const { uuidv7 } = await import("uuidv7")
    const email = `oauth-autolink-${ts}@test.com`

    // Create a pre-existing verified credentials user
    const existingUserId = uuidv7()
    await sql`
      INSERT INTO users (id, email, password_hash, name, email_verified)
      VALUES (${existingUserId}::uuid, ${email}, ${"$2b$12$fakehash"}, ${"Creds User"}, true)
    `

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/oauth-signin",
      payload: {
        provider: "google",
        providerAccountId: `test-${ts}-autolink`,
        email,
        name: "Creds User",
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, unknown>
    expect(body.id).toBe(existingUserId)
  })

  it("Path 4: unverified email — returns 409 with error code 'unverified_email' (INF-08)", async () => {
    const { sql } = await import("../../db/client.js")
    const { uuidv7 } = await import("uuidv7")
    const email = `oauth-unverified-${ts}@test.com`

    // Create an unverified user
    await sql`
      INSERT INTO users (id, email, password_hash, name, email_verified)
      VALUES (${uuidv7()}::uuid, ${email}, ${"$2b$12$fakehash"}, ${"Unverified User"}, false)
    `

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/oauth-signin",
      payload: {
        provider: "google",
        providerAccountId: `test-${ts}-unverified`,
        email,
        name: "Unverified User",
      },
    })
    expect(res.statusCode).toBe(409)
    const body = res.json() as Record<string, unknown>
    expect(body.error).toBe("unverified_email")
  })

  it("Path 5: second provider — returns 409 with error code 'provider_conflict' (INF-08)", async () => {
    const { sql } = await import("../../db/client.js")
    const { uuidv7 } = await import("uuidv7")
    const email = `oauth-conflict-${ts}@test.com`

    // Create a user already linked to google
    const existingUserId = uuidv7()
    await sql`
      INSERT INTO users (id, email, password_hash, name, email_verified)
      VALUES (${existingUserId}::uuid, ${email}, NULL, ${"Conflict User"}, true)
    `
    await sql`
      INSERT INTO user_oauth_accounts (id, user_id, provider, provider_account_id)
      VALUES (${uuidv7()}::uuid, ${existingUserId}::uuid, ${"google"}, ${"test-" + ts + "-conflict-google"})
    `

    // Now try to sign in via github with the same email — should conflict
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/oauth-signin",
      payload: {
        provider: "github",
        providerAccountId: `test-${ts}-conflict-github`,
        email,
        name: "Conflict User",
      },
    })
    expect(res.statusCode).toBe(409)
    const body = res.json() as Record<string, unknown>
    expect(body.error).toBe("provider_conflict")
  })

  it("Guard: null password_hash — verify-credentials returns 401 (not TypeError) (INF-08)", async () => {
    const { sql } = await import("../../db/client.js")
    const { uuidv7 } = await import("uuidv7")
    const email = `oauth-null-pw-${ts}@test.com`

    // Insert a user with NULL password_hash (OAuth-only user)
    await sql`
      INSERT INTO users (id, email, password_hash, name, email_verified)
      VALUES (${uuidv7()}::uuid, ${email}, NULL, ${"OAuth Only User"}, true)
    `

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/verify-credentials",
      payload: { email, password: "anything" },
    })
    expect(res.statusCode).toBe(401)
    // Must not be a 500 TypeError from bcrypt.compare(undefined, ...)
    expect(res.statusCode).not.toBe(500)
  })

  it("Schema: invalid provider — returns 400 validation error (INF-08)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/oauth-signin",
      payload: {
        provider: "apple",
        providerAccountId: "some-id",
        email: `oauth-apple-${ts}@test.com`,
        name: null,
      },
    })
    expect(res.statusCode).toBe(400)
  })
})
