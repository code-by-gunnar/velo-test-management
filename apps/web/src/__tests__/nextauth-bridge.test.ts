import { describe, it, expect } from "vitest"

// Test the Set-Cookie forwarding logic extracted from the [...nextauth].ts bridge.
// The bridge converts Web API Response headers to Node.js res.setHeader() calls.
// Set-Cookie is the only header where comma-joining is invalid (RFC 7230 §3.2.2).

describe("[...nextauth] bridge Set-Cookie forwarding (INF-06)", () => {
  it("forwards multiple Set-Cookie headers as an array, not comma-joined", () => {
    // Simulate a Web Response with multiple Set-Cookie headers
    // (OAuth flows set state, nonce, PKCE, callback URL cookies simultaneously)
    const webHeaders = new Headers()
    webHeaders.append("set-cookie", "authjs.state=abc123; Path=/; HttpOnly; SameSite=Lax")
    webHeaders.append("set-cookie", "authjs.nonce=def456; Path=/; HttpOnly; SameSite=Lax")
    webHeaders.append("set-cookie", "authjs.pkce=ghi789; Path=/; HttpOnly; SameSite=Lax")
    webHeaders.append("content-type", "text/html")

    // Apply the bridge's forwarding logic
    const result: Record<string, string | string[]> = {}
    webHeaders.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") return
      result[key] = value
    })
    const setCookies = webHeaders.getSetCookie()
    if (setCookies.length > 0) {
      result["set-cookie"] = setCookies
    }

    // Verify Set-Cookie is an array of 3 separate cookies
    expect(result["set-cookie"]).toEqual([
      "authjs.state=abc123; Path=/; HttpOnly; SameSite=Lax",
      "authjs.nonce=def456; Path=/; HttpOnly; SameSite=Lax",
      "authjs.pkce=ghi789; Path=/; HttpOnly; SameSite=Lax",
    ])
    // Verify other headers forwarded normally
    expect(result["content-type"]).toBe("text/html")
  })

  it("handles responses with no Set-Cookie headers", () => {
    const webHeaders = new Headers()
    webHeaders.set("content-type", "application/json")

    const result: Record<string, string | string[]> = {}
    webHeaders.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") return
      result[key] = value
    })
    const setCookies = webHeaders.getSetCookie()
    if (setCookies.length > 0) {
      result["set-cookie"] = setCookies
    }

    expect(result["set-cookie"]).toBeUndefined()
    expect(result["content-type"]).toBe("application/json")
  })

  it("handles responses with a single Set-Cookie header", () => {
    const webHeaders = new Headers()
    webHeaders.set("set-cookie", "authjs.session-token=xyz; Path=/; HttpOnly")

    const result: Record<string, string | string[]> = {}
    webHeaders.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") return
      result[key] = value
    })
    const setCookies = webHeaders.getSetCookie()
    if (setCookies.length > 0) {
      result["set-cookie"] = setCookies
    }

    // Even a single cookie should be in an array (res.setHeader handles both)
    expect(result["set-cookie"]).toEqual([
      "authjs.session-token=xyz; Path=/; HttpOnly",
    ])
  })
})
