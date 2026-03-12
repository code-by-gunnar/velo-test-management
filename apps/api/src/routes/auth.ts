import type { FastifyPluginAsync } from "fastify"
import type { TransactionSql, Sql } from "postgres"
import bcrypt from "bcrypt"
import crypto from "node:crypto"
import { uuidv7 } from "uuidv7"
import { sql } from "../db/client.js"
import { sendOtpEmail, sendPasswordResetEmail } from "../lib/email.js"

const BCRYPT_ROUNDS = 12
const OTP_EXPIRY_MINUTES = 15
const OTP_MAX_ATTEMPTS = 5
const RESET_EXPIRY_HOURS = 1

// Generate a cryptographically random 6-digit OTP string
function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999))
}

// Generate a secure random URL-safe token (for password reset links)
function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

const authRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /api/auth/signup ─────────────────────────────────────────────────
  // Creates user, sends OTP email. Hard block until OTP verified.
  fastify.post<{
    Body: { email: string; password: string; name?: string }
  }>("/api/auth/signup", {
    schema: {
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8, maxLength: 128 },
          name: { type: "string", maxLength: 255 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, name } = request.body

    // Check for existing user
    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`
    if (existing.length > 0) {
      return reply.status(409).send({ error: "Email already registered" })
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const userId = uuidv7()

    await sql`
      INSERT INTO users (id, email, password_hash, name, email_verified)
      VALUES (${userId}::uuid, ${email.toLowerCase()}, ${password_hash}, ${name ?? null}, false)
    `

    // Generate OTP and store hashed version
    const otp = generateOtp()
    const tokenHash = await bcrypt.hash(otp, 10)
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

    await sql`
      INSERT INTO verification_tokens (id, user_id, token_hash, expires_at, attempt_count)
      VALUES (${uuidv7()}::uuid, ${userId}::uuid, ${tokenHash}, ${expiresAt}, 0)
    `

    await sendOtpEmail(email, otp)

    return reply.status(201).send({ message: "Account created. Check your email for the verification code." })
  })

  // ── POST /api/auth/verify-otp ─────────────────────────────────────────────
  // Verifies the 6-digit OTP. Hard block: 5 wrong attempts invalidates the code.
  fastify.post<{
    Body: { email: string; code: string }
  }>("/api/auth/verify-otp", {
    schema: {
      body: {
        type: "object",
        required: ["email", "code"],
        properties: {
          email: { type: "string", format: "email" },
          code: { type: "string", minLength: 6, maxLength: 6, pattern: "^[0-9]{6}$" },
        },
      },
    },
  }, async (request, reply) => {
    const { email, code } = request.body

    const [user] = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`
    if (!user) {
      return reply.status(400).send({ error: "Invalid request" })
    }

    const [token] = await sql`
      SELECT id, token_hash, expires_at, attempt_count, used_at
      FROM verification_tokens
      WHERE user_id = ${user.id}::uuid
        AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (!token) {
      return reply.status(400).send({ error: "No pending verification. Request a new code." })
    }

    if (token.attempt_count >= OTP_MAX_ATTEMPTS) {
      return reply.status(400).send({ error: "Too many attempts. Request a new verification code." })
    }

    if (new Date(token.expires_at) < new Date()) {
      return reply.status(400).send({ error: "Code expired. Request a new verification code." })
    }

    const isValid = await bcrypt.compare(code, token.token_hash)

    if (!isValid) {
      // Increment attempt count
      await sql`
        UPDATE verification_tokens
        SET attempt_count = attempt_count + 1
        WHERE id = ${token.id}::uuid
      `
      const remaining = OTP_MAX_ATTEMPTS - (token.attempt_count + 1)
      return reply.status(400).send({
        error: remaining > 0
          ? `Incorrect code. ${remaining} attempt(s) remaining.`
          : "Too many attempts. Request a new verification code.",
      })
    }

    // Valid — mark token used and set user as verified
    // Cast tx to Sql to work around TypeScript's Omit<> not preserving call signatures
    await sql.begin(async (tx: TransactionSql) => {
      const q = tx as unknown as Sql
      await q`UPDATE verification_tokens SET used_at = NOW() WHERE id = ${token.id}::uuid`
      await q`UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = ${user.id}::uuid`
    })

    return reply.send({ message: "Email verified. You can now sign in." })
  })

  // ── POST /api/auth/verify-credentials ────────────────────────────────────
  // Called by Auth.js authorize() to verify email/password and return user object.
  // NOT a public route — called server-to-server from Next.js.
  fastify.post<{
    Body: { email: string; password: string }
  }>("/api/auth/verify-credentials", {
    schema: {
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string" },
          password: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body

    const [user] = await sql`
      SELECT u.id, u.email, u.name, u.password_hash, u.email_verified,
             wm.workspace_id, wm.role, w.slug AS workspace_slug
      FROM users u
      LEFT JOIN workspace_members wm ON wm.user_id = u.id AND wm.is_active = true
      LEFT JOIN workspaces w ON w.id = wm.workspace_id
      WHERE u.email = ${email.toLowerCase()}
      LIMIT 1
    `

    if (!user) return reply.status(401).send({ error: "Invalid credentials" })

    if (!user.password_hash) {
      return reply.status(401).send({ error: "Invalid credentials" })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return reply.status(401).send({ error: "Invalid credentials" })

    if (!user.email_verified) {
      return reply.status(403).send({ error: "Email not verified" })
    }

    return reply.send({
      id: user.id,
      email: user.email,
      name: user.name,
      workspace_id: user.workspace_id ?? null,
      workspace_slug: user.workspace_slug ?? null,
      role: user.role ?? null,
    })
  })

  // ── POST /api/auth/resend-otp ─────────────────────────────────────────────
  // Invalidates existing tokens and sends a fresh OTP.
  fastify.post<{
    Body: { email: string }
  }>("/api/auth/resend-otp", {
    schema: {
      body: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
        },
      },
    },
  }, async (request, reply) => {
    const { email } = request.body

    const [user] = await sql`
      SELECT id FROM users WHERE email = ${email.toLowerCase()} AND email_verified = false
    `
    if (!user) {
      // Return 200 to avoid email enumeration — don't confirm whether user exists
      return reply.send({ message: "If an account with that email exists, a new code has been sent." })
    }

    // Invalidate all existing tokens for this user
    await sql`
      UPDATE verification_tokens SET used_at = NOW()
      WHERE user_id = ${user.id}::uuid AND used_at IS NULL
    `

    const otp = generateOtp()
    const tokenHash = await bcrypt.hash(otp, 10)
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

    await sql`
      INSERT INTO verification_tokens (id, user_id, token_hash, expires_at, attempt_count)
      VALUES (${uuidv7()}::uuid, ${user.id}::uuid, ${tokenHash}, ${expiresAt}, 0)
    `

    await sendOtpEmail(email, otp)

    return reply.send({ message: "If an account with that email exists, a new code has been sent." })
  })

  // ── POST /api/auth/forgot-password ───────────────────────────────────────
  fastify.post<{
    Body: { email: string }
  }>("/api/auth/forgot-password", {
    schema: {
      body: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
        },
      },
    },
  }, async (request, reply) => {
    const { email } = request.body

    const [user] = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`

    if (user) {
      const token = generateResetToken()
      const tokenHash = await bcrypt.hash(token, 10)
      const expiresAt = new Date(Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000)

      // Invalidate existing reset tokens for this user
      await sql`
        UPDATE password_reset_tokens SET used_at = NOW()
        WHERE user_id = ${user.id}::uuid AND used_at IS NULL
      `

      await sql`
        INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
        VALUES (${uuidv7()}::uuid, ${user.id}::uuid, ${tokenHash}, ${expiresAt})
      `

      const resetUrl = `${process.env.WEB_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`
      await sendPasswordResetEmail(email, resetUrl)
    }

    // Always return 200 — never confirm whether the email exists
    return reply.send({ message: "If an account with that email exists, a reset link has been sent." })
  })

  // ── POST /api/auth/reset-password ────────────────────────────────────────
  fastify.post<{
    Body: { email: string; token: string; password: string }
  }>("/api/auth/reset-password", {
    schema: {
      body: {
        type: "object",
        required: ["email", "token", "password"],
        properties: {
          email: { type: "string", format: "email" },
          token: { type: "string", minLength: 64, maxLength: 64 },
          password: { type: "string", minLength: 8, maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, token, password } = request.body

    const [user] = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`
    if (!user) return reply.status(400).send({ error: "Invalid or expired reset link" })

    const [resetToken] = await sql`
      SELECT id, token_hash, expires_at
      FROM password_reset_tokens
      WHERE user_id = ${user.id}::uuid AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (!resetToken || new Date(resetToken.expires_at) < new Date()) {
      return reply.status(400).send({ error: "Invalid or expired reset link" })
    }

    const isValid = await bcrypt.compare(token, resetToken.token_hash)
    if (!isValid) return reply.status(400).send({ error: "Invalid or expired reset link" })

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS)

    // Cast tx to Sql to work around TypeScript's Omit<> not preserving call signatures
    await sql.begin(async (tx: TransactionSql) => {
      const q = tx as unknown as Sql
      await q`
        UPDATE users SET password_hash = ${password_hash}, updated_at = NOW()
        WHERE id = ${user.id}::uuid
      `
      await q`
        UPDATE password_reset_tokens SET used_at = NOW()
        WHERE id = ${resetToken.id}::uuid
      `
    })

    return reply.send({ message: "Password reset successfully. You can now sign in." })
  })
}

export default authRoutes
