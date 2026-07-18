import { otpEmail, passwordResetEmail } from "./email-templates.js"
import { sendMail } from "./mailer.js"
import { emailQueue } from "../queues/email.queue.js"
import type { EmailJobData } from "../queues/email.queue.js"

// All sends go through lib/mailer.ts (SMTP via nodemailer, or console mode
// when SMTP is not configured). OTPs are safe to log in console mode — that
// is the intended self-hosted no-email workflow.

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await sendMail({
    to,
    subject: "Your Velo verification code",
    html: otpEmail(code),
    text: `Your verification code is: ${code}\n\nThis code expires in 15 minutes. If you did not request this, ignore this email.`,
  })
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendMail({
    to,
    subject: "Reset your Velo password",
    html: passwordResetEmail(resetUrl),
    text: `Click the link below to reset your password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request a password reset, ignore this email.`,
  })
}

/**
 * Batch-enqueue lifecycle email jobs -- one per recipient.
 * Fire-and-forget from the caller's perspective. Each email is an independent
 * job with BullMQ retry semantics, so partial failures don't block the batch.
 */
export async function sendLifecycleEmails(
  recipients: string[],
  subject: string,
  type: EmailJobData["type"],
  payload: Record<string, unknown>
): Promise<void> {
  await Promise.all(
    recipients.map((to) =>
      emailQueue.add(type, { to, subject, type, payload })
    )
  )
}
