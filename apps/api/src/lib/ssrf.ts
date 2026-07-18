import { lookup } from "node:dns/promises"

// SSRF protection for outbound requests to user-controlled URLs (webhooks).
//
// Two enforcement points, both required:
//   1. assertSafePublicUrl — resolves the hostname and rejects if ANY resolved
//      address is private/reserved. Run at delivery time, not just creation,
//      so a hostname that later re-points to a private IP (DNS rebinding) is
//      caught when it matters.
//   2. redirect: "manual" in safeFetch — a public endpoint that 302-redirects
//      to 169.254.169.254 or an internal service is rejected, not followed.
//
// Residual (infra-level): a rebind landing precisely between our lookup and
// the OS connect resolves is a narrow TOCTOU window. Fully closing it needs IP
// pinning (custom undici dispatcher) or an egress allow-list — tracked as a
// deployment concern, not solvable in application code without a new dep.

export class SsrfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SsrfError"
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  let n = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    n = (n << 8) | octet
  }
  return n >>> 0
}

// Private / reserved IPv4 CIDRs (loopback, private, CGNAT, link-local/metadata,
// benchmarking, documentation, multicast, reserved, broadcast).
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]

function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  if (n === null) return true // unparseable → block
  for (const [base, bits] of BLOCKED_V4) {
    const b = ipv4ToInt(base)!
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    if ((n & mask) === (b & mask)) return true
  }
  return false
}

// Expand an IPv6 address (compressed or full, optionally with an embedded IPv4
// tail or zone id) to its 16 bytes. Returns null on malformed input.
function expandIPv6(input: string): number[] | null {
  const ip = input.split("%")[0]! // strip zone id
  let head: string[]
  let tail: string[]
  const dbl = ip.indexOf("::")
  if (dbl !== -1) {
    head = ip.slice(0, dbl) ? ip.slice(0, dbl).split(":") : []
    tail = ip.slice(dbl + 2) ? ip.slice(dbl + 2).split(":") : []
  } else {
    head = ip.split(":")
    tail = []
  }

  const toBytes = (groups: string[]): number[] | null => {
    const bytes: number[] = []
    for (const g of groups) {
      if (g.includes(".")) {
        const n = ipv4ToInt(g)
        if (n === null) return null
        bytes.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255)
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
        const v = parseInt(g, 16)
        bytes.push((v >> 8) & 255, v & 255)
      }
    }
    return bytes
  }

  const headBytes = toBytes(head)
  const tailBytes = toBytes(tail)
  if (!headBytes || !tailBytes) return null
  const missing = 16 - headBytes.length - tailBytes.length
  if (missing < 0) return null
  if (dbl === -1 && missing !== 0) return null // no "::" but not full length
  return [...headBytes, ...new Array<number>(missing).fill(0), ...tailBytes]
}

function isBlockedV6(ip: string): boolean {
  const b = expandIPv6(ip)
  if (!b) return true // unparseable → block

  // Unspecified ::  and loopback ::1
  if (b.every((x) => x === 0)) return true
  if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true

  // Unique local fc00::/7
  if ((b[0]! & 0xfe) === 0xfc) return true
  // Link-local fe80::/10
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true
  // Multicast ff00::/8
  if (b[0] === 0xff) return true

  // IPv4-mapped ::ffff:0:0/96 — check the embedded IPv4
  if (b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) {
    return isBlockedV4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`)
  }
  // NAT64 well-known prefix 64:ff9b::/96 — check the embedded IPv4
  if (
    b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b &&
    b.slice(4, 12).every((x) => x === 0)
  ) {
    return isBlockedV4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`)
  }

  return false
}

/** True if the literal IP is in a private/reserved range. Exported for tests. */
export function isBlockedAddress(address: string, family: number): boolean {
  return family === 6 ? isBlockedV6(address) : isBlockedV4(address)
}

/**
 * Validate a user-supplied URL is safe to fetch: http(s) only (https in
 * production), and every DNS-resolved address is public. Throws SsrfError
 * otherwise. Returns the parsed URL on success.
 */
export async function assertSafePublicUrl(urlStr: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    throw new SsrfError("Invalid URL")
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SsrfError("Only http(s) URLs are allowed")
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new SsrfError("Webhook URL must use HTTPS")
  }

  let resolved: Array<{ address: string; family: number }>
  try {
    resolved = await lookup(url.hostname, { all: true })
  } catch {
    throw new SsrfError("Could not resolve host")
  }
  if (resolved.length === 0) throw new SsrfError("Could not resolve host")

  for (const { address, family } of resolved) {
    if (isBlockedAddress(address, family)) {
      throw new SsrfError("URL resolves to a private or reserved address")
    }
  }
  return url
}

/**
 * Fetch a user-controlled URL with SSRF protection: pre-validate the resolved
 * IPs, refuse to follow redirects (an opaque-redirect response is treated as a
 * blocked hop), and enforce a timeout. Throws SsrfError on a blocked target or
 * redirect; propagates other fetch/timeout errors.
 */
export async function safeFetch(
  urlStr: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  await assertSafePublicUrl(urlStr)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(urlStr, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    })
    // redirect: "manual" yields an opaque-redirect filtered response
    // (type "opaqueredirect", status 0) or, on some runtimes, the raw 3xx.
    if (res.type === "opaqueredirect" || res.status === 0 || (res.status >= 300 && res.status < 400)) {
      throw new SsrfError("Webhook endpoint attempted a redirect, which is not allowed")
    }
    return res
  } finally {
    clearTimeout(timer)
  }
}
