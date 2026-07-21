// Hardened headers for serving user/CI-uploaded files from the app's OWN origin
// (VEL-77). Presigned URLs used to serve evidence from a SEPARATE storage origin,
// which isolated any malicious upload from the app's cookies/DOM. Same-origin
// streaming removed that isolation, so an uploaded HTML/SVG served inline with a
// trusted Content-Type would execute as XSS in the app origin. These headers are
// the serve-side defense (in addition to the upload-time MIME allowlist):
//
//   - X-Content-Type-Options: nosniff  → the browser can't sniff bytes into HTML
//   - Content-Security-Policy sandbox   → no script/plugin/active content runs,
//     opaque origin (belt-and-suspenders even if a type slips through)
//   - Content-Type is normalized to an inline-SAFE allowlist (passive media that
//     cannot execute); anything else is forced to application/octet-stream +
//     Content-Disposition: attachment, so it downloads instead of rendering.

// Passive media that renders inline without any script-execution path. Notably
// EXCLUDES text/html, image/svg+xml, application/pdf, and text/* — those must
// never render inline from our own origin.
const INLINE_SAFE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/webm",
])

interface HeaderSink {
  header(name: string, value: string): unknown
}

export function isInlineSafeType(contentType: string | null | undefined): boolean {
  const declared = (contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? ""
  return INLINE_SAFE_TYPES.has(declared)
}

/**
 * Set safe response headers for streaming a stored file same-origin. Inline-safe
 * media keeps its (allowlisted) type and renders in the tab; everything else is
 * served as an opaque octet-stream download. Always sets nosniff + sandbox CSP.
 */
export function setSafeDownloadHeaders(
  reply: HeaderSink,
  opts: {
    contentType?: string | null | undefined
    filename?: string | null | undefined
    contentLength?: number | null | undefined
  }
): void {
  const declared = (opts.contentType ?? "").toLowerCase().split(";")[0]?.trim() ?? ""
  const inline = INLINE_SAFE_TYPES.has(declared)

  reply.header("X-Content-Type-Options", "nosniff")
  reply.header("Content-Security-Policy", "default-src 'none'; sandbox")
  reply.header("Content-Type", inline ? declared : "application/octet-stream")

  const safeName = (opts.filename ?? "download").replace(/[^\w.\-]/g, "_") || "download"
  reply.header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${safeName}"`)

  if (opts.contentLength != null) reply.header("Content-Length", String(opts.contentLength))
}
