// Bounded request-body reader for the /api/backend gateway (VEL-64).
//
// The gateway disables Next's body parser and forwards the raw body upstream.
// Without a cap it would Buffer.concat an unbounded body into memory *before*
// auth ever runs — a pre-auth memory-DoS. This reader aborts as soon as a
// strict byte threshold is crossed instead of accumulating without bound.

/** Error `code` set on the rejection when the body exceeds the limit. */
export const BODY_TOO_LARGE = "BODY_TOO_LARGE"

/** Minimal stream shape we depend on — satisfied by Node's IncomingMessage. */
interface ReadableBody {
  on(event: "data", listener: (chunk: Buffer) => void): unknown
  on(event: "end", listener: () => void): unknown
  on(event: "error", listener: (err: Error) => void): unknown
  destroy(err?: Error): unknown
}

/**
 * Reads the request body into a Buffer, rejecting with a `BODY_TOO_LARGE` error
 * the moment the accumulated size exceeds `limitBytes`. A body whose size is
 * exactly `limitBytes` is accepted.
 */
export function readBodyWithLimit(req: ReadableBody, limitBytes: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let aborted = false

    req.on("data", (chunk: Buffer) => {
      if (aborted) return
      total += chunk.length
      if (total > limitBytes) {
        aborted = true
        const err = Object.assign(new Error("Request body too large"), { code: BODY_TOO_LARGE })
        reject(err)
        req.destroy() // stop reading; don't keep buffering a hostile stream
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (!aborted) resolve(Buffer.concat(chunks))
    })
    req.on("error", (err) => {
      if (!aborted) reject(err)
    })
  })
}
