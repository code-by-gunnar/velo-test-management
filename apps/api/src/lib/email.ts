import { Resend } from "resend"

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY environment variable is required")
}

export const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.FROM_EMAIL ?? "noreply@velo.app"

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Your Velo verification code",
    text: `Your verification code is: ${code}\n\nThis code expires in 15 minutes. If you did not request this, ignore this email.`,
  })
  if (error) throw new Error(`Failed to send OTP email: ${error.message}`)
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your Velo password",
    text: `Click the link below to reset your password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request a password reset, ignore this email.`,
  })
  if (error) throw new Error(`Failed to send password reset email: ${error.message}`)
}
