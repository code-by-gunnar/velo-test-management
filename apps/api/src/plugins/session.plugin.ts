import fp from "fastify-plugin"
import type { FastifyPluginAsync } from "fastify"
import { hkdfSync } from "crypto"
import { jwtDecrypt } from "jose"
import { valkey } from "../lib/valkey.js"
import { sql } from "../db/client.js"

// Extend FastifyRequest with session data
declare module "fastify" {
  interface FastifyRequest {
    userId: string
    workspaceId: string | null
    userRole: string | null
  }
}

// Auth.js v5 (@auth/core ≥ 0.34) derives the JWE encryption key using:
//   HKDF-SHA256(secret, salt=cookieName, info="Auth.js Generated Encryption Key (cookieName)", 64 bytes)
//
// The salt IS the cookie name. On HTTPS (Vercel production) the cookie is
// "__Secure-authjs.session-token"; on HTTP (local dev) it's "authjs.session-token".
// Key length is 64 bytes — A256CBC-HS512 needs a 512-bit key.
// (Our earlier implementation used empty salt + 32 bytes, which derived a different key.)

function deriveKey(secret: string, cookieName: string): Uint8Array {
  return new Uint8Array(
    hkdfSync(
      "sha256",
      Buffer.from(secret),
      cookieName,
      `Auth.js Generated Encryption Key (${cookieName})`,
      64
    )
  )
}

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("userId", "")
  fastify.decorateRequest("workspaceId", null)
  fastify.decorateRequest("userRole", null)

  const rawSecret = process.env.AUTH_SECRET
  if (!rawSecret) {
    fastify.log.warn("AUTH_SECRET not set — all requests will be unauthenticated")
    return
  }

  // Pre-derive keys for both HTTPS and HTTP cookie names
  const secureKey = deriveKey(rawSecret, "__Secure-authjs.session-token")
  const plainKey  = deriveKey(rawSecret, "authjs.session-token")

  // Pre-handler hook: decode Auth.js session token for every request
  fastify.addHook("preHandler", async (request) => {
    // Token comes from the Next.js gateway via Authorization: Bearer (preferred),
    // or directly from the browser cookie (for future direct-API use).
    const authHeader = request.headers["authorization"]
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
    const cookieToken =
      request.cookies?.["__Secure-authjs.session-token"] ??
      request.cookies?.["authjs.session-token"]

    // Note: the SSE /stream endpoint does NOT accept the session token in the
    // URL anymore (VEL-42 — it leaked into logs/history). It authenticates with
    // a single-use stream ticket resolved inside its own handler instead.
    const token = bearerToken ?? cookieToken ?? null
    if (!token) return

    // Select key based on gateway hint (avoids trial-and-error decryption).
    // x-token-secure: "1" = __Secure- cookie (production), "0" = plain (dev).
    // Falls back to trying both keys when hint is absent (direct API callers).
    const secureHint = request.headers["x-token-secure"] as string | undefined
    const keysToTry = secureHint === "1" ? [secureKey]
      : secureHint === "0" ? [plainKey]
      : [secureKey, plainKey]

    let payload: Record<string, unknown> | null = null
    for (const key of keysToTry) {
      try {
        const result = await jwtDecrypt(token, key, {
          clockTolerance: 15,
          keyManagementAlgorithms: ["dir"],
          contentEncryptionAlgorithms: ["A256CBC-HS512", "A256GCM"],
        })
        payload = result.payload as Record<string, unknown>
        break
      } catch {
        // Try next key
      }
    }

    if (!payload) return

    const id = payload["id"] as string | undefined
    if (id) {
      request.userId = id
      request.workspaceId = (payload["workspace_id"] as string | null | undefined) ?? null
      request.userRole = (payload["role"] as string | null | undefined) ?? null
    }

    // Batch Valkey lookups into a single pipeline round trip:
    // 1. Deactivation blocklist (USR-04: immediate session invalidation)
    // 2. Live role cache (60s TTL — JWT role may be stale after admin change)
    if (id && request.workspaceId) {
      try {
        const blockKey = `deactivated:${request.workspaceId}:${id}`
        const roleKey = `member_role:${request.workspaceId}:${id}`

        const results = await valkey.pipeline().get(blockKey).get(roleKey).exec()

        // Result shape: [[err, val], [err, val]]
        const isBlocked = results?.[0]?.[1] as string | null
        const cachedRole = results?.[1]?.[1] as string | null

        if (isBlocked) {
          // Clear session context — requireAuth will return 401
          request.userId = ""
          request.workspaceId = null
          request.userRole = null
          return
        }

        if (cachedRole) {
          request.userRole = cachedRole
        } else {
          // Cache miss — query DB and populate cache
          const rows = await sql`
            SELECT role FROM workspace_members
            WHERE workspace_id = ${request.workspaceId}::uuid
              AND user_id = ${id}::uuid
              AND is_active = true
          `
          if (rows.length > 0) {
            const liveRole = (rows[0] as { role: string }).role
            request.userRole = liveRole
            await valkey.set(roleKey, liveRole, "EX", 60)
          } else {
            // No active membership row — the row was hard-deleted (or deactivated)
            // without a Valkey blocklist entry, so the deactivation check above
            // couldn't catch it. Fail closed: the JWT's role claim is stale and the
            // user no longer belongs to this workspace, so clear session context
            // rather than trust the token (VEL-54 / audit low-priority).
            request.userId = ""
            request.workspaceId = null
            request.userRole = null
            return
          }
        }
      } catch (err) {
        // Fail closed for deactivation check — deny access if Valkey is down
        // rather than allowing potentially deactivated users through
        request.log.warn({ err }, "Valkey/DB unavailable during session check — denying access")
        request.userId = ""
        request.workspaceId = null
        request.userRole = null
      }
    }
  })
}

export default fp(sessionPlugin, { name: "session" })
