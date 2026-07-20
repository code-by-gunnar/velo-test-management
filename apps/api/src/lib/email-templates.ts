// Branded HTML email templates — "Clean Elevation" design language.
// All styles are inlined and use a system font stack: email clients (Gmail,
// Outlook, Yahoo) strip <style>/@font-face, so webfonts and SVG images never
// render. The logo is therefore a raster PNG, and the type is system fonts.

const IRIS = "#5B5BD6" // primary brand — matches the app
const PAGE_BG = "#E8EDF2" // mist
const CARD_BG = "#FFFFFF"
const TEXT_PRIMARY = "#2D2926" // brand ink
const TEXT_SECONDARY = "#6B7280" // gray-500 (meets contrast floor on white)
const BORDER = "#E5E7EB" // gray-200

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

// Logo hosted on the web app's public folder — email clients block data URIs
// and refuse SVG <img>, so this is a transparent PNG.
const WEB_URL = process.env.WEB_URL ?? "https://runvelo.app"
const LOGO_URL = `${WEB_URL}/velo-lockup-email.png`

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAGE_BG};padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding:0 0 32px;">
              <img src="${LOGO_URL}" alt="Velo" width="135" height="44" style="display:block;border:0;" />
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:40px 36px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 0;">
              <p style="margin:0;font-size:12px;color:${TEXT_SECONDARY};line-height:18px;">
                Velo — open-source, self-hosted test management
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${TEXT_PRIMARY};line-height:28px;">${text}</h1>`
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:${TEXT_SECONDARY};line-height:24px;">${text}</p>`
}

function button(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background-color:${IRIS};border-radius:6px;">
              <a href="${url}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">${text}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}

function codeBlock(code: string): string {
  return `<div style="margin:24px 0;padding:20px;background-color:${PAGE_BG};border:1px solid ${BORDER};border-radius:6px;text-align:center;">
    <span style="font-family:'JetBrains Mono','SF Mono',Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:${IRIS};">${code}</span>
  </div>`
}

function muted(text: string): string {
  return `<p style="margin:0;font-size:13px;color:${TEXT_SECONDARY};line-height:20px;">${text}</p>`
}

// ── Templates ──────────────────────────────────────────────────────────────

export function otpEmail(code: string): string {
  return layout(
    heading("Verification code") +
    paragraph("Enter this code to verify your email address.") +
    codeBlock(code) +
    muted("This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.")
  )
}

export function passwordResetEmail(resetUrl: string): string {
  return layout(
    heading("Reset your password") +
    paragraph("We received a request to reset your password. Click the button below to choose a new one.") +
    button("Reset Password", resetUrl) +
    muted("This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.")
  )
}

export function workspaceInviteEmail(
  inviterName: string,
  workspaceName: string,
  inviteUrl: string
): string {
  return layout(
    heading(`Join ${workspaceName} on Velo`) +
    paragraph(`<strong style="color:${TEXT_PRIMARY};">${inviterName}</strong> has invited you to collaborate on the <strong style="color:${TEXT_PRIMARY};">${workspaceName}</strong> workspace.`) +
    button("Accept Invitation", inviteUrl) +
    muted("This invitation expires in 7 days.")
  )
}

// ── Lifecycle: Workspace Deletion ────────────────────────────────────────────

export function workspaceDeletionRequestedEmail(
  workspaceName: string,
  scheduledDate: string,
  exportUrl: string
): string {
  return layout(
    heading("Workspace scheduled for deletion") +
    paragraph(`The workspace <strong style="color:${TEXT_PRIMARY};">${workspaceName}</strong> has been scheduled for deletion on <strong style="color:${TEXT_PRIMARY};">${scheduledDate}</strong>.`) +
    paragraph("If you have data you'd like to keep, please export it before the deletion date.") +
    button("Export Workspace Data", exportUrl) +
    muted("If this wasn't expected, contact your workspace admin to cancel the deletion.")
  )
}

export function workspaceDeletionWarningEmail(
  workspaceName: string,
  scheduledDate: string,
  timeRemaining: string,
  cancelUrl: string
): string {
  return layout(
    heading("Deletion reminder") +
    paragraph(`The workspace <strong style="color:${TEXT_PRIMARY};">${workspaceName}</strong> will be permanently deleted in <strong style="color:${TEXT_PRIMARY};">${timeRemaining}</strong> (${scheduledDate}).`) +
    paragraph("All test cases, runs, and workspace data will be removed. This cannot be undone.") +
    button("View Workspace Settings", cancelUrl) +
    muted("Workspace admins can cancel the deletion from workspace settings.")
  )
}

export function workspaceDeletionCompletedEmail(
  workspaceName: string
): string {
  return layout(
    heading("Workspace deleted") +
    paragraph(`The workspace <strong style="color:${TEXT_PRIMARY};">${workspaceName}</strong> and all associated data have been permanently deleted.`) +
    muted("This action cannot be reversed. If you need to start fresh, you can create a new workspace.")
  )
}

// ── Lifecycle: User Erasure ──────────────────────────────────────────────────

export function userErasureRequestedEmail(
  scheduledDate: string,
  cancelUrl: string
): string {
  return layout(
    heading("Account erasure scheduled") +
    paragraph(`Your personal data is scheduled for erasure on <strong style="color:${TEXT_PRIMARY};">${scheduledDate}</strong>. Your sessions have been invalidated and you will not be able to log in.`) +
    paragraph("If you change your mind, you can cancel the erasure before the scheduled date by logging in and visiting your profile settings.") +
    button("View Profile Settings", cancelUrl) +
    muted("After the scheduled date, your name and email will be anonymized and cannot be recovered.")
  )
}

export function userErasureWarningEmail(
  scheduledDate: string,
  timeRemaining: string
): string {
  return layout(
    heading("Erasure reminder") +
    paragraph(`Your personal data will be permanently erased in <strong style="color:${TEXT_PRIMARY};">${timeRemaining}</strong> (${scheduledDate}).`) +
    paragraph("After this date, your name and email will be replaced with anonymous placeholders. This cannot be undone.") +
    muted("To cancel, log in and visit your profile settings before the scheduled date.")
  )
}

export function userErasureCompletedEmail(): string {
  return layout(
    heading("Account data erased") +
    paragraph("Your personal data has been permanently erased from Velo. Your name and email have been anonymized across all workspaces.") +
    paragraph("You may register a new account at any time using the same email address.") +
    muted("This email was sent to confirm completion of your GDPR erasure request.")
  )
}
