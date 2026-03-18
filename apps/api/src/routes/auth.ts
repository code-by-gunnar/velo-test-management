import type { FastifyPluginAsync } from "fastify"
import type { TransactionSql, Sql } from "postgres"
import bcrypt from "bcrypt"
import crypto from "node:crypto"
import { uuidv7 } from "uuidv7"
import rateLimit from "@fastify/rate-limit"
import { sql } from "../db/client.js"
import { sendOtpEmail, sendPasswordResetEmail } from "../lib/email.js"
import { emailQueue } from "../queues/email.queue.js"
import { captureEvent } from "../lib/posthog.js"

const BCRYPT_ROUNDS = 12
const OTP_EXPIRY_MINUTES = 15
const OTP_MAX_ATTEMPTS = 5
const RESET_EXPIRY_HOURS = 1
/** Guard for server-to-server routes (verify-credentials, oauth-signin) */
function requireInternalSecret(request: { headers: Record<string, string | undefined> }): boolean {
  const secret = process.env.INTERNAL_API_SECRET ?? ""
  if (!secret) return false // no secret configured = block
  return request.headers["x-internal-secret"] === secret
}

// Generate a cryptographically random 6-digit OTP string
function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999))
}

// Generate a secure random URL-safe token (for password reset links)
function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

const authRoutes: FastifyPluginAsync = async (fastify) => {

  // Rate limit all auth endpoints by IP
  await fastify.register(rateLimit, {
    max: 10,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
  })

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
    const existing = await sql`SELECT id, email_verified FROM users WHERE email = ${email.toLowerCase()}`
    if (existing.length > 0) {
      const existingUser = existing[0] as { id: string; email_verified: boolean }
      if (!existingUser.email_verified) {
        // Unverified account exists — resend OTP so the user can complete signup
        const otp = generateOtp()
        const tokenHash = await bcrypt.hash(otp, 10)
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

        // Invalidate old tokens and create new one
        await sql`DELETE FROM verification_tokens WHERE user_id = ${existingUser.id}::uuid`
        await sql`
          INSERT INTO verification_tokens (id, user_id, token_hash, expires_at, attempt_count)
          VALUES (${uuidv7()}::uuid, ${existingUser.id}::uuid, ${tokenHash}, ${expiresAt}, 0)
        `
        await sendOtpEmail(email, otp)
      }
      // Generic response for both verified and unverified (prevents enumeration)
      return reply.send({ message: "If this email is not already registered, a verification code has been sent." })
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
    captureEvent(userId, "user_signed_up", { method: "email" })

    return reply.status(201).send({ message: "If this email is not already registered, a verification code has been sent." })
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
    captureEvent(user.id as string, "email_verified")

    // Enqueue welcome email — 24 hours after verification (fire-and-forget)
    emailQueue.add("welcome-email", {
      to: email,
      subject: "Welcome to Velo — here's how to get started",
      type: "welcome" as const,
      payload: { userName: user.name ?? email.split("@")[0] ?? "there" },
    }, {
      delay: 24 * 60 * 60 * 1000, // 24 hours
      jobId: `welcome-${user.id}`, // Prevents duplicate welcome emails
    }).catch(() => {
      // Non-fatal — don't fail verification if email queue is down
    })

    return reply.send({ message: "Email verified. You can now sign in." })
  })

  // ── POST /api/auth/verify-credentials ────────────────────────────────────
  // Called by Auth.js authorize() to verify email/password and return user object.
  // NOT a public route — protected by INTERNAL_API_SECRET header.
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
    if (!requireInternalSecret(request as unknown as { headers: Record<string, string | undefined> })) {
      return reply.status(403).send({ error: "Forbidden" })
    }
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

    captureEvent(user.id as string, "user_signed_in", { method: "email" })

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

  // ── POST /api/auth/oauth-signin ───────────────────────────────────────────
  // Called by Auth.js signIn callback to resolve or provision an OAuth user.
  // Handles 5 paths: returning user, auto-link, JIT provision, unverified email
  // block, and second-provider block.
  // NOT a public route — called server-to-server from Next.js.
  fastify.post<{
    Body: {
      provider: "google" | "github"
      providerAccountId: string
      email: string
      name?: string | null
      image?: string | null
    }
  }>("/api/auth/oauth-signin", {
    schema: {
      body: {
        type: "object",
        required: ["provider", "providerAccountId", "email"],
        properties: {
          provider: { type: "string", enum: ["google", "github"] },
          providerAccountId: { type: "string", maxLength: 255 },
          email: { type: "string", format: "email" },
          name: { type: "string", maxLength: 255, nullable: true },
          image: { type: "string", maxLength: 2048, nullable: true },
        },
      },
    },
  }, async (request, reply) => {
    if (!requireInternalSecret(request as unknown as { headers: Record<string, string | undefined> })) {
      return reply.status(403).send({ error: "Forbidden" })
    }
    const { provider, providerAccountId, email, name, image } = request.body

    let resolvedUser: {
      id: string
      email: string
      name: string | null
      workspace_id: string | null
      workspace_slug: string | null
      role: string | null
    } | null = null
    let errorCode: "unverified_email" | "provider_conflict" | null = null
    let isNewUser = false

    await sql.begin(async (tx: TransactionSql) => {
      const q = tx as unknown as Sql

      // Step 1: Returning user check — look up by provider + providerAccountId
      const [existingOAuth] = await q`
        SELECT u.id, u.email, u.name,
               wm.workspace_id, wm.role, w.slug AS workspace_slug
        FROM user_oauth_accounts oa
        JOIN users u ON u.id = oa.user_id
        LEFT JOIN workspace_members wm ON wm.user_id = u.id AND wm.is_active = true
        LEFT JOIN workspaces w ON w.id = wm.workspace_id
        WHERE oa.provider = ${provider}
          AND oa.provider_account_id = ${providerAccountId}
        LIMIT 1
      `
      if (existingOAuth) {
        resolvedUser = {
          id: existingOAuth.id,
          email: existingOAuth.email,
          name: existingOAuth.name ?? null,
          workspace_id: existingOAuth.workspace_id ?? null,
          workspace_slug: existingOAuth.workspace_slug ?? null,
          role: existingOAuth.role ?? null,
        }
        return
      }

      // Step 2: Email lookup — check for an existing user with this email
      const [existingUser] = await q`
        SELECT id, email, name, email_verified
        FROM users
        WHERE email = ${email.toLowerCase()}
        LIMIT 1
      `

      // Step 3: Unverified email guard
      if (existingUser && !existingUser.email_verified) {
        errorCode = "unverified_email"
        return
      }

      // Step 4: Second-provider guard
      if (existingUser) {
        const [otherProvider] = await q`
          SELECT id FROM user_oauth_accounts
          WHERE user_id = ${existingUser.id}::uuid
            AND provider != ${provider}
          LIMIT 1
        `
        if (otherProvider) {
          errorCode = "provider_conflict"
          return
        }
      }

      // Step 5: Auto-link or JIT provision
      let userId: string
      if (existingUser) {
        // Auto-link: mark email as verified (provider has verified it)
        userId = existingUser.id
        if (image) {
          await q`
            UPDATE users
            SET email_verified = true, avatar_url = COALESCE(avatar_url, ${image}), updated_at = NOW()
            WHERE id = ${userId}::uuid
          `
        } else {
          await q`
            UPDATE users
            SET email_verified = true, updated_at = NOW()
            WHERE id = ${userId}::uuid
          `
        }
      } else {
        // JIT provision: create a new user
        userId = uuidv7()
        isNewUser = true
        await q`
          INSERT INTO users (id, email, name, email_verified, password_hash, avatar_url)
          VALUES (
            ${userId}::uuid,
            ${email.toLowerCase()},
            ${name ?? null},
            true,
            NULL,
            ${image ?? null}
          )
        `
      }

      // Step 6: Insert oauth account (idempotent — ON CONFLICT DO NOTHING)
      await q`
        INSERT INTO user_oauth_accounts (id, user_id, provider, provider_account_id)
        VALUES (
          ${uuidv7()}::uuid,
          ${userId}::uuid,
          ${provider},
          ${providerAccountId}
        )
        ON CONFLICT (provider, provider_account_id) DO NOTHING
      `

      // Step 7: Fetch full user with workspace fields for response
      // fullUser is always defined here — we just inserted or verified the user row exists
      const rows = await q`
        SELECT u.id, u.email, u.name,
               wm.workspace_id, wm.role, w.slug AS workspace_slug
        FROM users u
        LEFT JOIN workspace_members wm ON wm.user_id = u.id AND wm.is_active = true
        LEFT JOIN workspaces w ON w.id = wm.workspace_id
        WHERE u.id = ${userId}::uuid
        LIMIT 1
      `
      const fullUser = rows[0]
      if (fullUser) {
        resolvedUser = {
          id: fullUser.id as string,
          email: fullUser.email as string,
          name: (fullUser.name as string | null) ?? null,
          workspace_id: (fullUser.workspace_id as string | null) ?? null,
          workspace_slug: (fullUser.workspace_slug as string | null) ?? null,
          role: (fullUser.role as string | null) ?? null,
        }
      }
    })

    // Handle error codes captured inside transaction (reply.send must be outside sql.begin)
    if (errorCode === "unverified_email") {
      return reply.status(409).send({
        error: "unverified_email",
        message: "An account with this email exists but hasn't been verified. Please verify your email first.",
      })
    }
    if (errorCode === "provider_conflict") {
      return reply.status(409).send({
        error: "provider_conflict",
        message: "This account is already linked to a different sign-in method.",
      })
    }

    if (isNewUser) {
      captureEvent(resolvedUser!.id, "user_signed_up", { method: provider })
    }
    captureEvent(resolvedUser!.id, "user_signed_in", { method: provider })

    return reply.send({
      id: resolvedUser!.id,
      email: resolvedUser!.email,
      name: resolvedUser!.name,
      workspace_id: resolvedUser!.workspace_id,
      workspace_slug: resolvedUser!.workspace_slug,
      role: resolvedUser!.role,
    })
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
