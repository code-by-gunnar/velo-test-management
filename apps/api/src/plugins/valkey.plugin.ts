import fp from "fastify-plugin"
import type { FastifyPluginAsync } from "fastify"
import { valkey } from "../lib/valkey.js"
import { emailQueue } from "../queues/email.queue.js"
import { emailWorker } from "../queues/email.worker.js"
import { webhookQueue } from "../queues/webhook.queue.js"
import { webhookWorker } from "../queues/webhook.worker.js"
import { lifecycleQueue } from "../queues/lifecycle.queue.js"
import { lifecycleWorker } from "../queues/lifecycle.worker.js"

declare module "fastify" {
  interface FastifyInstance {
    valkey: typeof valkey
    emailQueue: typeof emailQueue
    webhookQueue: typeof webhookQueue
    lifecycleQueue: typeof lifecycleQueue
  }
}

const valkeyPlugin: FastifyPluginAsync = async (fastify) => {
  // Decorate fastify with valkey and queues so route handlers can access them
  fastify.decorate("valkey", valkey)
  fastify.decorate("emailQueue", emailQueue)
  fastify.decorate("webhookQueue", webhookQueue)
  fastify.decorate("lifecycleQueue", lifecycleQueue)

  // Graceful shutdown: close Valkey connections and BullMQ workers when server closes
  fastify.addHook("onClose", async () => {
    await lifecycleWorker.close()
    await lifecycleQueue.close()
    await webhookWorker.close()
    await webhookQueue.close()
    await emailWorker.close()
    await emailQueue.close()
    await valkey.quit()
    console.log("[valkey] connections closed")
  })
}

export default fp(valkeyPlugin, { name: "valkey" })
