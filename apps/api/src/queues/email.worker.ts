import { Worker } from "bullmq"
import { Resend } from "resend"
import { getBullMQWorkerConnectionOptions } from "../lib/valkey.js"
import type { EmailJobData } from "./email.queue.js"

const FROM = "Velo <noreply@velo.app>"

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured")
  }
  return new Resend(process.env.RESEND_API_KEY)
}

export const emailWorker = new Worker<EmailJobData>(
  "email",
  async (job) => {
    const { to, subject, type } = job.data

    console.log(`[email-worker] Processing job ${job.id}: type=${type} to=${to} subject=${subject}`)

    switch (type) {
      case "otp":
      case "password-reset":
      case "welcome": {
        // These types are handled via the email.ts lib directly from auth routes.
        // Worker receives them as a no-op fallback — log and skip.
        console.log(`[email-worker] type=${type} handled upstream — skipping worker send`)
        break
      }
      case "workspace-invite": {
        const { inviteUrl, workspaceName, inviterName } = job.data.payload as {
          inviteUrl: string
          workspaceName: string
          inviterName: string
        }
        const resend = getResend()
        await resend.emails.send({
          from: FROM,
          to,
          subject,
          text: `${inviterName} has invited you to join the ${workspaceName} workspace on Velo.\n\nAccept your invitation:\n${inviteUrl}\n\nThis invitation expires in 7 days.`,
        })
        break
      }
      default: {
        console.log(`[email-worker] Unknown job type: ${String(type)}`)
      }
    }
  },
  {
    // Worker connection is separate from the queue connection —
    // Workers use blocking Redis commands (BRPOP) and MUST have maxRetriesPerRequest: null
    connection: getBullMQWorkerConnectionOptions(),
    concurrency: 5,
  }
)

emailWorker.on("completed", (job) => {
  console.log(`[email-worker] Job ${job.id} completed`)
})

emailWorker.on("failed", (job, err) => {
  console.error(`[email-worker] Job ${job?.id} failed:`, err.message)
})
