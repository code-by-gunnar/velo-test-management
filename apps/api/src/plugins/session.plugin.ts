import fp from "fastify-plugin"
import type { FastifyPluginAsync } from "fastify"
import { hkdfSync } from "crypto"
import { jwtDecrypt } from "jose"

// Extend FastifyRequest with session data
declare module "fastify" {
  interface FastifyRequest {
    userId: string
    workspaceId: string | null
    userRole: string | null
  }
}

// Auth.js v5 encrypts the session JWT using JWE (A256CBC-HS512, dir).
// The encryption key is derived from AUTH_SECRET via HKDF-SHA256.
// We replicate that derivation here so we can decode the token directly
// without an HTTP round-trip to the Next.js session endpoint.
//
// Key derivation matches @auth/core/jwt.ts getDerivedEncryptionKey():
//   hkdf("sha256", AUTH_SECRET, salt="", info="Auth.js Generated Encryption Key", 32)

function deriveKey(secret: string): Uint8Array {
  return new Uint8Array(
    hkdfSync("sha256", Buffer.from(secret), "", "Auth.js Generated Encryption Key", 32)
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

  const encKey = deriveKey(rawSecret)

  // Pre-handler hook: decode Auth.js session token for every request
  fastify.addHook("preHandler", async (request) => {
    // Token comes from the Next.js gateway via Authorization: Bearer (preferred),
    // or directly from the browser cookie (for future direct-API use).
    const authHeader = request.headers["authorization"]
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
    const cookieToken =
      request.cookies?.["__Secure-authjs.session-token"] ??
      request.cookies?.["authjs.session-token"]
    const token = bearerToken ?? cookieToken
    if (!token) return

    try {
      const { payload } = await jwtDecrypt(token, encKey, { clockTolerance: 15 })

      const id = payload["id"] as string | undefined
      if (id) {
        request.userId = id
        request.workspaceId = (payload["workspace_id"] as string | null | undefined) ?? null
        request.userRole = (payload["role"] as string | null | undefined) ?? null
      }
    } catch {
      // Decryption failure = invalid/expired token → continue unauthenticated
    }
  })
}

export default fp(sessionPlugin, { name: "session" })
