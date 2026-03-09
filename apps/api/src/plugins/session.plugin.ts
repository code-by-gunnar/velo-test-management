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

// Auth.js v5 JWT is stored in the 'authjs.session-token' cookie (name pinned in auth.ts,
// SameSite=None so browsers send it cross-origin to this Railway API).
// We forward the cookie to the Next.js /api/auth/session endpoint for JWE decryption
// rather than reimplementing decryption here.

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("userId", "")
  fastify.decorateRequest("workspaceId", null)
  fastify.decorateRequest("userRole", null)

  // Pre-handler hook: decode Auth.js session token for every request
  fastify.addHook("preHandler", async (request) => {
    // Cookie name is pinned to "authjs.session-token" in auth.ts (no __Secure- prefix)
    // so browsers send it cross-origin with SameSite=None; Secure.
    const allCookieKeys = Object.keys(request.cookies ?? {})
    const token = request.cookies?.["authjs.session-token"]

    request.log.info({
      msg: "session-plugin",
      cookieKeys: allCookieKeys,
      hasToken: !!token,
      webUrl: process.env.WEB_URL ?? "(unset)",
      path: request.url,
    })

    if (!token) return

    try {
      // Forward the session cookie to Next.js auth endpoint for decryption
      const sessionRes = await fetch(
        `${process.env.WEB_URL}/api/auth/session`,
        {
          headers: { Cookie: `authjs.session-token=${token}` },
        }
      )

      const rawBody = await sessionRes.text()
      request.log.info({
        msg: "session-endpoint-response",
        status: sessionRes.status,
        body: rawBody.slice(0, 200),
      })

      if (!sessionRes.ok) return

      const session = JSON.parse(rawBody) as {
        user?: { id: string; workspace_id?: string; role?: string }
      }

      if (session?.user?.id) {
        request.userId = session.user.id
        request.workspaceId = session.user.workspace_id ?? null
        request.userRole = session.user.role ?? null
      }
    } catch (err) {
      request.log.error({ msg: "session-plugin-error", err: String(err) })
    }
  })
}

export default fp(sessionPlugin, { name: "session" })
