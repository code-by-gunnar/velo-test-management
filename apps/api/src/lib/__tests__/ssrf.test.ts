import { describe, it, expect } from "vitest"
import { isBlockedAddress, assertSafePublicUrl, SsrfError } from "../ssrf.js"

describe("isBlockedAddress — IPv4", () => {
  const blocked = [
    "127.0.0.1",
    "127.10.20.30",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "0.0.0.0",
    "100.64.0.1", // CGNAT
    "224.0.0.1", // multicast
    "255.255.255.255",
  ]
  for (const ip of blocked) {
    it(`blocks ${ip}`, () => {
      expect(isBlockedAddress(ip, 4)).toBe(true)
    })
  }

  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1", "11.0.0.1"]
  for (const ip of allowed) {
    it(`allows public ${ip}`, () => {
      expect(isBlockedAddress(ip, 4)).toBe(false)
    })
  }
})

describe("isBlockedAddress — IPv6", () => {
  const blocked = [
    "::1", // loopback
    "::", // unspecified
    "fc00::1", // ULA
    "fd12:3456::1", // ULA
    "fe80::1", // link-local
    "ff02::1", // multicast
    "::ffff:169.254.169.254", // IPv4-mapped metadata
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "64:ff9b::a9fe:a9fe", // NAT64 of 169.254.169.254
  ]
  for (const ip of blocked) {
    it(`blocks ${ip}`, () => {
      expect(isBlockedAddress(ip, 6)).toBe(true)
    })
  }

  const allowed = ["2606:4700:4700::1111", "2001:4860:4860::8888"]
  for (const ip of allowed) {
    it(`allows public ${ip}`, () => {
      expect(isBlockedAddress(ip, 6)).toBe(false)
    })
  }

  it("blocks malformed addresses", () => {
    expect(isBlockedAddress("not-an-ip", 6)).toBe(true)
    expect(isBlockedAddress("gg::1", 6)).toBe(true)
  })
})

describe("assertSafePublicUrl", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(assertSafePublicUrl("ftp://example.com")).rejects.toBeInstanceOf(SsrfError)
    await expect(assertSafePublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfError)
  })

  it("rejects invalid URLs", async () => {
    await expect(assertSafePublicUrl("not a url")).rejects.toBeInstanceOf(SsrfError)
  })

  it("rejects hostnames that resolve to loopback", async () => {
    // localhost resolves to 127.0.0.1 / ::1
    await expect(assertSafePublicUrl("http://localhost:9999/hook")).rejects.toBeInstanceOf(SsrfError)
  })

  it("rejects literal private IPs", async () => {
    await expect(assertSafePublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(SsrfError)
    await expect(assertSafePublicUrl("http://192.168.0.1/")).rejects.toBeInstanceOf(SsrfError)
  })

  it("allows a public host", async () => {
    // 1.1.1.1 is a stable public anycast address (no external DNS needed)
    const url = await assertSafePublicUrl("https://1.1.1.1/hook")
    expect(url.hostname).toBe("1.1.1.1")
  })
})
