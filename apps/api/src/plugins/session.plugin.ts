import fp from "fastify-plugin"
import type { FastifyPluginAsync } from "fastify"
import { hkdfSync } from "crypto"
import { jwtDecrypt } from "jose"
import { valkey } from "../lib/valkey.js"

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

    // SSE routes: EventSource cannot set custom headers, so also accept token from
    // query parameter (?token=...). Only used by the /stream endpoint.
    const queryToken = (request.query as Record<string, string | undefined>)?.token

    const token = bearerToken ?? cookieToken ?? queryToken ?? null
    if (!token) return

    // Try the HTTPS key first (production), fall back to plain (dev)
    let payload: Record<string, unknown> | null = null
    for (const key of [secureKey, plainKey]) {
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

    // Check deactivation blocklist (USR-04: immediate session invalidation)
    if (id && request.workspaceId) {
      try {
        const isBlocked = await valkey.get(`deactivated:${request.workspaceId}:${id}`)
        if (isBlocked) {
          // Clear session context — requireAuth will return 401
          request.userId = ""
          request.workspaceId = null
          request.userRole = null
          return
        }
      } catch {
        // Fail open: if Valkey is down, allow the request through.
        // The membership check in individual routes is the secondary guard.
      }
    }
  })
}

export default fp(sessionPlugin, { name: "session" })
