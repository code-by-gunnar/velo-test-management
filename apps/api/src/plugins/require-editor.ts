import type { FastifyReply, FastifyRequest } from "fastify"

/**
 * Fastify preHandler that blocks viewer-role users from write operations.
 * Attach to any route that modifies data (POST/PUT/PATCH/DELETE on content).
 *
 * Depends on session.plugin.ts having already set request.userRole.
 */
export async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  if (!request.userId) {
    return reply.status(401).send({ error: "Unauthorized" })
  }
  if (request.userRole === "viewer") {
    return reply.status(403).send({
      error: "Viewers have read-only access",
      code: "VIEWER_READONLY",
    })
  }
}
