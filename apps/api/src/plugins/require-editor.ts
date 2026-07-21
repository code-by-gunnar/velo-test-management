import type { FastifyReply, FastifyRequest } from "fastify"

/**
 * Fastify preHandler that restricts write operations to editors and admins.
 * Attach to any route that modifies data (POST/PUT/PATCH/DELETE on content).
 *
 * Positive allowlist (fails closed): only "admin" and "editor" may write.
 * A denylist that blocked just "viewer" let any *other* role string through —
 * notably the old blanket "api_key" role (VEL-63) and a null role from a key
 * whose creator is no longer a member. Anything outside the allowlist is denied.
 *
 * Depends on session.plugin.ts / auth.plugin.ts having already set request.userRole.
 */
export async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  if (!request.userId) {
    return reply.status(401).send({ error: "Unauthorized" })
  }
  if (request.userRole !== "admin" && request.userRole !== "editor") {
    return reply.status(403).send({
      error: "Viewers have read-only access",
      code: "VIEWER_READONLY",
    })
  }
}
