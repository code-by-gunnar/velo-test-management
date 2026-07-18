import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"

// SMTP transport — provider-agnostic (Gmail app password, SES, Mailgun,
// smtp.resend.com, a local relay, anything). Email is OPTIONAL: with no
// SMTP_HOST configured the app runs in console mode — messages are logged
// instead of sent, and flows that need out-of-band delivery (invitations)
// surface their links in the UI instead.

export function emailEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST) && process.env.NODE_ENV !== "development"
}

const FROM = () => process.env.FROM_EMAIL ?? "Velo <velo@localhost>"

let transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 587)
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Implicit TLS on 465; STARTTLS is negotiated automatically on 587/25
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      ...(process.env.SMTP_USER
        ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } }
        : {}),
    })
  }
  return transporter
}

export interface MailInput {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

// Sends via SMTP when configured; logs the text body in console mode.
// Throws on SMTP failure so callers/BullMQ retain their retry semantics.
export async function sendMail(input: MailInput): Promise<void> {
  if (!emailEnabled()) {
    process.stdout.write(
      `\n[email:console] To: ${input.to} | Subject: ${input.subject}\n${input.text}\n\n`
    )
    return
  }
  await getTransporter().sendMail({
    from: FROM(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  })
}
