import fp from "fastify-plugin"
import type { FastifyPluginAsync } from "fastify"
import { valkey } from "../lib/valkey.js"
import { emailQueue } from "../queues/email.queue.js"
import { emailWorker } from "../queues/email.worker.js"

declare module "fastify" {
  interface FastifyInstance {
    valkey: typeof valkey
    emailQueue: typeof emailQueue
  }
}

const valkeyPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate fastify with valkey and queues so route handlers can access them
  fastify.decorate("valkey", valkey)
  fastify.decorate("emailQueue", emailQueue)

  // Graceful shutdown: close Valkey connections and BullMQ workers when server closes
  fastify.addHook("onClose", async () => {
    await emailWorker.close()
    await emailQueue.close()
    await valkey.quit()
    console.log("[valkey] connections closed")
  })
}

export default fp(valkeyPlugin, { name: "valkey" })
