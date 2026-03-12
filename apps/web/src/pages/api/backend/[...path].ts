import type { NextApiRequest, NextApiResponse } from "next"

// Disable body parsing — we forward the raw body to Railway unchanged.
export const config = { api: { bodyParser: false } }

// Gateway: proxies all /api/backend/* requests to the Railway API.
// Reads the Auth.js session cookie server-side (same-origin, no SameSite issues),
// then forwards the raw token as Authorization: Bearer so Railway can decode it.
// This avoids cross-origin cookie restrictions between Vercel and Railway.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const path = (req.query.path as string[]).join("/")
  const queryString = req.url?.split("?")[1] ?? ""
  // Railway routes are all prefixed with /api/; we strip it from the public path
  // so the browser sees /api/backend/workspaces instead of /api/backend/api/workspaces.
  const apiUrl = `${process.env.API_URL}/api/${path}${queryString ? `?${queryString}` : ""}`

  // Only buffer the body for methods that carry one — skip for GET/HEAD
  const rawBody = (req.method !== "GET" && req.method !== "HEAD")
    ? await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        req.on("data", (chunk: Buffer) => chunks.push(chunk))
        req.on("end", () => resolve(Buffer.concat(chunks)))
        req.on("error", reject)
      })
    : Buffer.alloc(0)

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

  const fetchRes = await fetch(apiUrl, {
    method: req.method ?? "GET",
    headers: forwardHeaders,
    ...(rawBody.length > 0 ? { body: new Uint8Array(rawBody) } : {}),
  })

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
