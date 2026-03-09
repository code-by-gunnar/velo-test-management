import type { NextApiRequest, NextApiResponse } from "next"
import { NextRequest } from "next/server"
import { handlers } from "@/auth"

// Pages Router requires a default export with (req, res) signature.
// Auth.js v5 handlers expect NextRequest, so we bridge here.
// Body parsing is disabled so we pass the raw body through unchanged.
export const config = {
  api: { bodyParser: false },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const baseUrl =
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    `https://${req.headers.host}`

  const url = new URL(req.url!, baseUrl)

  // Read raw body from stream
  const rawBody = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks)))
    req.on("error", reject)
  })

  const reqInit: RequestInit = {
    method: req.method ?? "GET",
    headers: req.headers as HeadersInit,
  }
  if (rawBody.length > 0) reqInit.body = rawBody.toString("utf-8")

  const nextReq = new NextRequest(url.toString(), reqInit as any)

  const webHandler = req.method === "POST" ? handlers.POST : handlers.GET
  const webRes = await webHandler(nextReq)

  res.status(webRes.status)
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  const body = await webRes.text()
  res.send(body)
}
