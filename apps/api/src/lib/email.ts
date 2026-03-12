import { Resend } from "resend"
import { otpEmail, passwordResetEmail } from "./email-templates.js"
import { emailQueue } from "../queues/email.queue.js"
import type { EmailJobData } from "../queues/email.queue.js"

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY environment variable is required")
}

export const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.FROM_EMAIL ?? "Velo <noreply@runvelo.app>"

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    process.stdout.write(`\n[dev] OTP for ${to}: ${code}\n\n`)
    return
  }
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Your Velo verification code",
    html: otpEmail(code),
    text: `Your verification code is: ${code}\n\nThis code expires in 15 minutes. If you did not request this, ignore this email.`,
  })
  if (error) throw new Error(`Failed to send OTP email: ${error.message}`)
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your Velo password",
    html: passwordResetEmail(resetUrl),
    text: `Click the link below to reset your password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request a password reset, ignore this email.`,
  })
  if (error) throw new Error(`Failed to send password reset email: ${error.message}`)
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
