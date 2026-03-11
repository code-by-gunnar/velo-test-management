import type { FastifyReply, FastifyRequest } from "fastify"

/**
 * Fastify preHandler that restricts access to admin-role users only.
 * Attach to routes that require admin privileges (delete runs, manage members, etc.).
 *
 * Depends on session.plugin.ts having already set request.userRole.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.userId) {
    return reply.status(401).send({ error: "Unauthorized" })
  }
  if (request.userRole !== "admin") {
    return reply.status(403).send({
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    })
  }
}
