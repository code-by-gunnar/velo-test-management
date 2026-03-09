import fp from "fastify-plugin"
import type { FastifyPluginAsync } from "fastify"

// Extend FastifyRequest with session data
declare module "fastify" {
  interface FastifyRequest {
    userId: string
    workspaceId: string | null
    userRole: string | null
  }
}

// Auth.js v5 JWT is stored in the 'authjs.session-token' cookie.
// To decode it server-side in Fastify, we forward the cookie to the Next.js
// /api/auth/session endpoint and read the decoded session object.
// This avoids reimplementing JWE decryption in Fastify.

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("userId", "")
  fastify.decorateRequest("workspaceId", null)
  fastify.decorateRequest("userRole", null)

  // Pre-handler hook: decode Auth.js session token for every request
  fastify.addHook("preHandler", async (request) => {
    // Auth.js v5 uses __Secure- prefix on HTTPS (production/preview), plain name on HTTP (dev)
    const secureName = "__Secure-authjs.session-token"
    const plainName = "authjs.session-token"
    const token = request.cookies?.[secureName] ?? request.cookies?.[plainName]
    if (!token) return

    // Forward with the same cookie name that was received so Next.js can decrypt it
    const cookieName = request.cookies?.[secureName] ? secureName : plainName

    try {
      // Forward the session cookie to Next.js auth endpoint for decryption
      const sessionRes = await fetch(
        `${process.env.WEB_URL}/api/auth/session`,
        {
          headers: { Cookie: `${cookieName}=${token}` },
        }
      )

      if (!sessionRes.ok) return

      const session = await sessionRes.json() as {
        user?: { id: string; workspace_id?: string; role?: string }
      }

      if (session?.user?.id) {
        request.userId = session.user.id
        request.workspaceId = session.user.workspace_id ?? null
        request.userRole = session.user.role ?? null
      }
    } catch {
      // Session decode failure = unauthenticated — continue without session
    }
  })
}

export default fp(sessionPlugin, { name: "session" })
