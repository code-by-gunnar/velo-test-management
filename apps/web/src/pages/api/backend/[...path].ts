import type { NextApiRequest, NextApiResponse } from "next"
import { readBodyWithLimit, BODY_TOO_LARGE } from "@/lib/read-body-limit"

// Disable body parsing — we forward the raw body upstream unchanged.
export const config = { api: { bodyParser: false } }

// Hard cap on the buffered request body (VEL-64). Above the largest legitimate
// upload — 10 MB evidence attachments plus multipart envelope — while bounding
// per-request memory. The API enforces its own stricter per-file limits (5 MB
// multipart / 10 MB attachments) downstream; this only stops an unbounded
// pre-auth buffer.
const MAX_GATEWAY_BODY_BYTES = 20 * 1024 * 1024

// Gateway: proxies all /api/backend/* requests to the API.
// Reads the Auth.js session cookie server-side (same-origin, no SameSite issues),
// then forwards the raw token as Authorization: Bearer so the API can decode it.
// This avoids cross-origin cookie restrictions between the web and API tiers.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const path = (req.query.path as string[]).join("/")
  const queryString = req.url?.split("?")[1] ?? ""
  // Railway routes are all prefixed with /api/; we strip it from the public path
  // so the browser sees /api/backend/workspaces instead of /api/backend/api/workspaces.
  const apiUrl = `${process.env.API_URL}/api/${path}${queryString ? `?${queryString}` : ""}`

  // Only buffer the body for methods that carry one — skip for GET/HEAD.
  // Enforce a strict size cap so an unauthenticated client can't exhaust memory
  // by streaming an unbounded body before we even read the session (VEL-64).
  let rawBody: Buffer
  try {
    rawBody = (req.method !== "GET" && req.method !== "HEAD")
      ? await readBodyWithLimit(req, MAX_GATEWAY_BODY_BYTES)
      : Buffer.alloc(0)
  } catch (err) {
    if ((err as { code?: string } | null)?.code === BODY_TOO_LARGE) {
      res.status(413).json({ error: "Request body too large" })
      return
    }
    res.status(400).json({ error: "Invalid request body" })
    return
  }

  // Get the session token — server-side cookie read, same-origin, always works.
  // Auth.js v5 uses __Secure- prefix on HTTPS (Vercel production/preview).
  const isSecureCookie = !!req.cookies["__Secure-authjs.session-token"]
  const token = isSecureCookie
    ? req.cookies["__Secure-authjs.session-token"]
    : req.cookies["authjs.session-token"]

  const forwardHeaders: Record<string, string> = {}
  if (rawBody.length > 0) {
    forwardHeaders["content-type"] = (req.headers["content-type"] as string) ?? "application/json"
  }
  if (token) {
    forwardHeaders["authorization"] = `Bearer ${token}`
    // Hint which cookie name derived the JWE key — avoids trial-and-error decryption
    forwardHeaders["x-token-secure"] = isSecureCookie ? "1" : "0"
  }

  // Bounded upstream call — a hung API connection must return 504, never hold
  // the browser's request open indefinitely
  let fetchRes: Response
  try {
    fetchRes = await fetch(apiUrl, {
      method: req.method ?? "GET",
      headers: forwardHeaders,
      signal: AbortSignal.timeout(30_000),
      ...(rawBody.length > 0 ? { body: new Uint8Array(rawBody) } : {}),
    })
  } catch (err) {
    const timedOut = (err as { name?: string } | null)?.name === "TimeoutError"
    res.status(timedOut ? 504 : 502).json({ error: timedOut ? "API timeout" : "API unreachable" })
    return
  }

  // If the API returns 401, the session is invalid (deactivated user, expired token, etc.).
  // Clear the Auth.js session cookie so the next page load redirects to /login.
  if (fetchRes.status === 401 && token) {
    const cookieName = isSecureCookie ? "__Secure-authjs.session-token" : "authjs.session-token"
    const isSecure = isSecureCookie
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isSecure ? "; Secure" : ""}`
    )
  }

  // Forward status + headers (skip hop-by-hop headers that cause issues)
  const skip = new Set(["content-encoding", "transfer-encoding", "connection"])
  res.status(fetchRes.status)
  fetchRes.headers.forEach((value, key) => {
    if (!skip.has(key)) res.setHeader(key, value)
  })

  // Use arrayBuffer for binary responses (ZIP, etc.), text for everything else
  const contentType = fetchRes.headers.get("content-type") ?? ""
  if (contentType.includes("application/zip") || contentType.includes("application/octet-stream")) {
    const buf = Buffer.from(await fetchRes.arrayBuffer())
    res.end(buf)
  } else {
    const body = await fetchRes.text()
    res.send(body)
  }
}
