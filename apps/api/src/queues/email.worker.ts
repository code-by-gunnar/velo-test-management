import { Worker } from "bullmq"
import { getBullMQWorkerConnectionOptions } from "../lib/valkey.js"
import { sendMail } from "../lib/mailer.js"
import {
  welcomeEmail,
  workspaceInviteEmail,
  workspaceDeletionRequestedEmail,
  workspaceDeletionWarningEmail,
  workspaceDeletionCompletedEmail,
  userErasureRequestedEmail,
  userErasureWarningEmail,
  userErasureCompletedEmail,
} from "../lib/email-templates.js"
import type { EmailJobData } from "./email.queue.js"

export const emailWorker = new Worker<EmailJobData>(
  "email",
  async (job) => {
    const { to, subject, type } = job.data

    console.log(`[email-worker] Processing job ${job.id}: type=${type} to=${to} subject=${subject}`)

    switch (type) {
      case "otp":
      case "password-reset": {
        // These types are handled via the email.ts lib directly from auth routes.
        console.log(`[email-worker] type=${type} handled upstream — skipping worker send`)
        break
      }
      case "welcome": {
        const { userName } = job.data.payload as { userName: string }
        const webUrl = process.env.WEB_URL ?? "http://localhost:3000"
        await sendMail({
          to,
          subject,
          html: welcomeEmail(userName),
          text: `Hey ${userName.split(" ")[0]},\n\nThanks for joining Velo. I built Velo because QA teams deserve better than spreadsheets and clunky legacy tools.\n\nThree things to try first:\n\n1. Create a test case — our keyboard-first editor lets you write a complete case in under 30 seconds.\n2. Import from CSV — drag and drop a CSV file and Velo maps your columns automatically.\n3. Import from Linear — paste a Linear issue ID and our AI converts the spec into structured test cases.\n\nOpen Velo: ${webUrl}\n\nIf you have questions or feedback, just hit reply — I read every email.\n\nGunnar\nFounder, Velo`,
          ...(process.env.SUPPORT_EMAIL ? { replyTo: process.env.SUPPORT_EMAIL } : {}),
        })
        break
      }
      case "workspace-invite": {
        const { inviteUrl, workspaceName, inviterName } = job.data.payload as {
          inviteUrl: string
          workspaceName: string
          inviterName: string
        }
        await sendMail({
          to,
          subject,
          html: workspaceInviteEmail(inviterName, workspaceName, inviteUrl),
          text: `${inviterName} has invited you to join the ${workspaceName} workspace on Velo.\n\nAccept your invitation:\n${inviteUrl}\n\nThis invitation expires in 7 days.`,
        })
        break
      }
      case "workspace-deletion-requested": {
        const { workspaceName, scheduledDate, exportUrl } = job.data.payload as {
          workspaceName: string
          scheduledDate: string
          exportUrl: string
        }
        await sendMail({
          to,
          subject,
          html: workspaceDeletionRequestedEmail(workspaceName, scheduledDate, exportUrl),
          text: `The workspace "${workspaceName}" has been scheduled for deletion on ${scheduledDate}. Export your data before then: ${exportUrl}`,
        })
        break
      }
      case "workspace-deletion-warning": {
        const { workspaceName, scheduledDate, timeRemaining, cancelUrl } = job.data.payload as {
          workspaceName: string
          scheduledDate: string
          timeRemaining: string
          cancelUrl: string
        }
        await sendMail({
          to,
          subject,
          html: workspaceDeletionWarningEmail(workspaceName, scheduledDate, timeRemaining, cancelUrl),
          text: `Reminder: The workspace "${workspaceName}" will be deleted in ${timeRemaining} (${scheduledDate}). Cancel from workspace settings: ${cancelUrl}`,
        })
        break
      }
      case "workspace-deletion-completed": {
        const { workspaceName } = job.data.payload as { workspaceName: string }
        await sendMail({
          to,
          subject,
          html: workspaceDeletionCompletedEmail(workspaceName),
          text: `The workspace "${workspaceName}" and all associated data have been permanently deleted.`,
        })
        break
      }
      case "user-erasure-requested": {
        const { scheduledDate, cancelUrl } = job.data.payload as {
          scheduledDate: string
          cancelUrl: string
        }
        await sendMail({
          to,
          subject,
          html: userErasureRequestedEmail(scheduledDate, cancelUrl),
          text: `Your personal data is scheduled for erasure on ${scheduledDate}. Cancel from profile settings: ${cancelUrl}`,
        })
        break
      }
      case "user-erasure-warning": {
        const { scheduledDate, timeRemaining } = job.data.payload as {
          scheduledDate: string
          timeRemaining: string
        }
        await sendMail({
          to,
          subject,
          html: userErasureWarningEmail(scheduledDate, timeRemaining),
          text: `Your personal data will be erased in ${timeRemaining} (${scheduledDate}). Cancel from profile settings.`,
        })
        break
      }
      case "user-erasure-completed": {
        await sendMail({
          to,
          subject,
          html: userErasureCompletedEmail(),
          text: `Your personal data has been permanently erased from Velo. You may register a new account at any time.`,
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
