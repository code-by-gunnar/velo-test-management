import type { FastifyPluginAsync } from "fastify"
import type { TransactionSql, Sql } from "postgres"
import rateLimit from "@fastify/rate-limit"
import bcrypt from "bcrypt"
import crypto from "node:crypto"
import { uuidv7 } from "uuidv7"
import { sql } from "../db/client.js"
import { uploadObject, getPresignedUrl, storageEnabled } from "../lib/storage.js"
import { sendOtpEmail } from "../lib/email.js"

const OTP_EXPIRY_MINUTES = 15
const OTP_MAX_ATTEMPTS = 5

const AVATAR_MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

// Map MIME type to file extension
function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg": return "jpg"
    case "image/png":  return "png"
    case "image/webp": return "webp"
    default:           return "bin"
  }
}

const profileRoutes: FastifyPluginAsync = async (fastify) => {

  // Rate limiter, opt-in per route (global: false). Only outbound-email routes
  // opt in — GET /api/me etc. are polled and must not be throttled (VEL-49).
  await fastify.register(rateLimit, { global: false })

  // ── Auth guard ────────────────────────────────────────────────────────────
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: "Unauthorized" })
    }
  })

  // Throttle OTP sends per user (falling back to IP) so an authenticated user
  // can't email-bomb arbitrary addresses or burn the email provider's quota.
  const otpRateLimit = {
    rateLimit: {
      max: 3,
      timeWindow: "10 minutes",
      keyGenerator: (request: { userId?: string; ip: string }) => request.userId || request.ip,
    },
  }

  // ── GET /api/me ───────────────────────────────────────────────────────────
  // Returns the current user's profile. No workspace scoping.
  fastify.get("/api/me", async (request, reply) => {
    const [user] = await sql`
      SELECT id, email, name, avatar_url
      FROM users
      WHERE id = ${request.userId}::uuid
    `

    if (!user) return reply.status(404).send({ error: "User not found" })

    return reply.send(user)
  })

  // ── PATCH /api/me ─────────────────────────────────────────────────────────
  // Update name only. Email changes go through the OTP flow below.
  fastify.patch<{
    Body: { name: string }
  }>("/api/me", {
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { name } = request.body

    const rows = await sql`
      UPDATE users
      SET name = ${name}, updated_at = NOW()
      WHERE id = ${request.userId}::uuid
      RETURNING id, email, name, avatar_url
    `

    if (rows.length === 0) return reply.status(404).send({ error: "User not found" })

    return reply.send(rows[0])
  })

  // ── POST /api/me/change-email ───────────────────────────────────────────
  // Step 1: Request email change. Sends OTP to the NEW email address.
  fastify.post<{
    Body: { email: string }
  }>("/api/me/change-email", {
    config: otpRateLimit,
    schema: {
      body: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email", maxLength: 255 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const newEmail = request.body.email.toLowerCase()

    // Check current email — no-op if same
    const [currentUser] = await sql`SELECT email FROM users WHERE id = ${request.userId}::uuid`
    if (!currentUser) return reply.status(404).send({ error: "User not found" })
    if ((currentUser as { email: string }).email === newEmail) {
      return reply.status(400).send({ error: "This is already your email" })
    }

    // Check if new email is taken by another user
    const [existing] = await sql`SELECT id FROM users WHERE email = ${newEmail}`
    if (existing) {
      return reply.status(409).send({ error: "Email already in use" })
    }

    // Invalidate any existing verification tokens for this user
    await sql`
      UPDATE verification_tokens
      SET used_at = NOW()
      WHERE user_id = ${request.userId}::uuid AND used_at IS NULL
    `

    // Generate OTP and store with the new email in a metadata-friendly way
    // We store the pending email in the token_hash row so verify can apply it
    const otp = String(crypto.randomInt(100000, 999999))
    const tokenHash = await bcrypt.hash(otp, 10)
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
    const tokenId = uuidv7()

    // Store the pending new email alongside the token
    // We use a convention: store as a separate pending_email row in verification_tokens
    // Since the table doesn't have a pending_email column, we'll store it in users table
    await sql`
      UPDATE users SET pending_email = ${newEmail}, updated_at = NOW()
      WHERE id = ${request.userId}::uuid
    `

    await sql`
      INSERT INTO verification_tokens (id, user_id, token_hash, expires_at, attempt_count)
      VALUES (${tokenId}::uuid, ${request.userId}::uuid, ${tokenHash}, ${expiresAt}, 0)
    `

    await sendOtpEmail(newEmail, otp)

    return reply.send({ message: "Verification code sent to your new email" })
  })

  // ── POST /api/me/verify-email-change ────────────────────────────────────
  // Step 2: Verify OTP and apply the email change.
  fastify.post<{
    Body: { code: string }
  }>("/api/me/verify-email-change", {
    schema: {
      body: {
        type: "object",
        required: ["code"],
        properties: {
          code: { type: "string", minLength: 6, maxLength: 6, pattern: "^[0-9]{6}$" },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { code } = request.body

    // Get the latest unused token for this user
    const [token] = await sql`
      SELECT id, token_hash, expires_at, attempt_count
      FROM verification_tokens
      WHERE user_id = ${request.userId}::uuid
        AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (!token) {
      return reply.status(400).send({ error: "No pending verification. Request a new code." })
    }

    if (token.attempt_count >= OTP_MAX_ATTEMPTS) {
      return reply.status(400).send({ error: "Too many attempts. Request a new code." })
    }

    if (new Date(token.expires_at as string) < new Date()) {
      return reply.status(400).send({ error: "Code expired. Request a new code." })
    }

    const isValid = await bcrypt.compare(code, token.token_hash as string)

    if (!isValid) {
      await sql`
        UPDATE verification_tokens
        SET attempt_count = attempt_count + 1
        WHERE id = ${token.id}::uuid
      `
      const remaining = OTP_MAX_ATTEMPTS - ((token.attempt_count as number) + 1)
      return reply.status(400).send({
        error: remaining > 0
          ? `Incorrect code. ${remaining} attempt(s) remaining.`
          : "Too many attempts. Request a new code.",
      })
    }

    // Get the pending email
    const [user] = await sql`
      SELECT pending_email FROM users WHERE id = ${request.userId}::uuid
    `
    const pendingEmail = (user as { pending_email: string | null })?.pending_email
    if (!pendingEmail) {
      return reply.status(400).send({ error: "No email change pending" })
    }

    // Apply: update email, clear pending_email, mark token used
    await sql.begin(async (tx: TransactionSql) => {
      const q = tx as unknown as Sql
      await q`UPDATE verification_tokens SET used_at = NOW() WHERE id = ${token.id}::uuid`
      await q`
        UPDATE users
        SET email = ${pendingEmail}, pending_email = NULL, updated_at = NOW()
        WHERE id = ${request.userId}::uuid
      `
    })

    return reply.send({ message: "Email updated", email: pendingEmail })
  })

  // ── POST /api/me/avatar ───────────────────────────────────────────────────
  // Upload avatar image to R2 and store the key in users.avatar_url.
  fastify.post("/api/me/avatar", async (request, reply) => {
    if (!storageEnabled()) {
      return reply.status(503).send({ error: "File storage is not configured" })
    }

    const data = await request.file({ limits: { fileSize: AVATAR_MAX_BYTES } })
    if (!data) {
      return reply.status(400).send({ error: "No file uploaded" })
    }

    if (!AVATAR_ALLOWED_TYPES.has(data.mimetype)) {
      return reply.status(415).send({
        error: "Unsupported file type. Allowed: image/jpeg, image/png, image/webp",
      })
    }

    let buffer: Buffer
    try {
      buffer = await data.toBuffer()
    } catch {
      // toBuffer throws when the stream exceeds the fileSize limit
      return reply.status(413).send({ error: "File exceeds the 2 MB limit" })
    }

    if (buffer.byteLength > AVATAR_MAX_BYTES) {
      return reply.status(413).send({ error: "File exceeds the 2 MB limit" })
    }

    const ext = extFromMime(data.mimetype)
    const key = `avatars/${request.userId}/${Date.now()}.${ext}`

    await uploadObject(key, buffer, data.mimetype)

    await sql`
      UPDATE users
      SET avatar_url = ${key}, updated_at = NOW()
      WHERE id = ${request.userId}::uuid
    `

    return reply.status(200).send({ avatar_url: key })
  })

  // ── GET /api/me/avatar-url ────────────────────────────────────────────────
  // Returns a 1-hour presigned download URL for the user's avatar, or null.
  fastify.get("/api/me/avatar-url", async (request, reply) => {
    const [user] = await sql`
      SELECT avatar_url
      FROM users
      WHERE id = ${request.userId}::uuid
    `

    if (!user || !(user as { avatar_url: string | null }).avatar_url) {
      return reply.send({ url: null })
    }

    const avatarKey = (user as { avatar_url: string }).avatar_url

    // External URLs (OAuth profile pictures) are returned directly
    if (avatarKey.startsWith("https://")) {
      return reply.send({ url: avatarKey })
    }

    // R2 keys are presigned for 1-hour access
    const url = await getPresignedUrl(avatarKey)
    return reply.send({ url })
  })
}

export default profileRoutes
