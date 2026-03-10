import { Queue } from "bullmq"
import { getBullMQConnectionOptions } from "../lib/valkey.js"

export interface EmailJobData {
  to: string
  subject: string
  type: "otp" | "password-reset" | "welcome" | "workspace-invite"
  payload: Record<string, unknown>
}

/**
 * Email queue — used by auth routes to dispatch OTP and password reset emails.
 * Processed by emailWorker in email.worker.ts.
 */
export const emailQueue = new Queue<EmailJobData>("email", {
  connection: getBullMQConnectionOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    // Jobs are removed after completion to avoid Valkey memory growth
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
})
