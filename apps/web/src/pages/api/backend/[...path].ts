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
  const apiUrl = `${process.env.API_URL}/${path}${queryString ? `?${queryString}` : ""}`

  // Read raw body from stream
  const rawBody = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })

  // Get the session token — server-side cookie read, same-origin, always works.
  // Auth.js v5 uses __Secure- prefix on HTTPS (Vercel production/preview).
  const token =
    req.cookies["__Secure-authjs.session-token"] ??
    req.cookies["authjs.session-token"]

  const forwardHeaders: Record<string, string> = {
    "content-type": (req.headers["content-type"] as string) ?? "application/json",
  }
  if (token) {
    forwardHeaders["authorization"] = `Bearer ${token}`
  }

  const fetchRes = await fetch(apiUrl, {
    method: req.method ?? "GET",
    headers: forwardHeaders,
    ...(rawBody.length > 0 ? { body: rawBody } : {}),
  })

  // Forward status + headers (skip hop-by-hop headers that cause issues)
  const skip = new Set(["content-encoding", "transfer-encoding", "connection"])
  res.status(fetchRes.status)
  fetchRes.headers.forEach((value, key) => {
    if (!skip.has(key)) res.setHeader(key, value)
  })

  const body = await fetchRes.text()
  res.send(body)
}
