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
    const token = request.cookies?.["authjs.session-token"]
    if (!token) return

    try {
      // Forward the session cookie to Next.js auth endpoint for decryption
      const sessionRes = await fetch(
        `${process.env.WEB_URL}/api/auth/session`,
        {
          headers: { Cookie: `authjs.session-token=${token}` },
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
