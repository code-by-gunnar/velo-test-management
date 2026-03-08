import { Worker } from "bullmq"
import { createWorkerConnection } from "../lib/valkey.js"
import type { EmailJobData } from "./email.queue.js"

// Worker connection is separate from the queue connection —
// Workers use blocking Redis commands (BRPOP) and MUST have maxRetriesPerRequest: null
const workerConnection = createWorkerConnection()

export const emailWorker = new Worker<EmailJobData>(
  "email",
  async (job) => {
    const { to, subject, type } = job.data

    // Resend SDK integration is wired in Plan 4 (auth plan).
    // For now, log the job data so the worker is testable without Resend credentials.
    console.log(`[email-worker] Processing job ${job.id}: type=${type} to=${to} subject=${subject}`)

    // TODO (Plan 4): import and call Resend here
    // const resend = new Resend(process.env.RESEND_API_KEY)
    // await resend.emails.send({ from: "noreply@velo.app", to, subject, ... })
  },
  {
    connection: workerConnection,
    concurrency: 5,
  }
)

emailWorker.on("completed", (job) => {
  console.log(`[email-worker] Job ${job.id} completed`)
})

emailWorker.on("failed", (job, err) => {
  console.error(`[email-worker] Job ${job?.id} failed:`, err.message)
})
