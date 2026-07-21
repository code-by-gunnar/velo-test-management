import { describe, it, expect } from "vitest"
import { setSafeDownloadHeaders, isInlineSafeType } from "../safe-download.js"

// VEL-77: same-origin file serving must not let uploaded HTML/SVG (or a sniffed
// image) execute in the app origin. Passive media renders inline; everything
// else downloads as opaque octet-stream; always nosniff + sandbox CSP.

function sink() {
  const headers: Record<string, string> = {}
  return {
    headers,
    header(name: string, value: string) {
      headers[name.toLowerCase()] = value
    },
  }
}

describe("isInlineSafeType", () => {
  it("accepts passive raster/video/audio types", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4"]) {
      expect(isInlineSafeType(t)).toBe(true)
    }
  })
  it("rejects active/renderable types (html, svg, pdf, text)", () => {
    for (const t of ["text/html", "image/svg+xml", "application/pdf", "text/plain", "application/json", "application/xml"]) {
      expect(isInlineSafeType(t)).toBe(false)
    }
  })
  it("ignores parameters and case", () => {
    expect(isInlineSafeType("IMAGE/PNG; charset=binary")).toBe(true)
  })
  it("treats null/unknown as unsafe", () => {
    expect(isInlineSafeType(null)).toBe(false)
    expect(isInlineSafeType("application/x-msdownload")).toBe(false)
  })
})

describe("setSafeDownloadHeaders", () => {
  it("always sets nosniff and a sandbox CSP", () => {
    const r = sink()
    setSafeDownloadHeaders(r, { contentType: "image/png" })
    expect(r.headers["x-content-type-options"]).toBe("nosniff")
    expect(r.headers["content-security-policy"]).toBe("default-src 'none'; sandbox")
  })

  it("serves an inline-safe image inline with its type", () => {
    const r = sink()
    setSafeDownloadHeaders(r, { contentType: "image/png", filename: "shot.png", contentLength: 8 })
    expect(r.headers["content-type"]).toBe("image/png")
    expect(r.headers["content-disposition"]).toBe('inline; filename="shot.png"')
    expect(r.headers["content-length"]).toBe("8")
  })

  it("forces HTML to an octet-stream download (XSS defense)", () => {
    const r = sink()
    setSafeDownloadHeaders(r, { contentType: "text/html", filename: "evil.html" })
    expect(r.headers["content-type"]).toBe("application/octet-stream")
    expect(r.headers["content-disposition"]).toBe('attachment; filename="evil.html"')
  })

  it("forces SVG to an octet-stream download (SVG can carry script)", () => {
    const r = sink()
    setSafeDownloadHeaders(r, { contentType: "image/svg+xml", filename: "x.svg" })
    expect(r.headers["content-type"]).toBe("application/octet-stream")
    expect(r.headers["content-disposition"]).toContain("attachment")
  })

  it("sanitizes the filename to a safe token", () => {
    const r = sink()
    setSafeDownloadHeaders(r, { contentType: "image/png", filename: 'a"; b=\r\nevil.png' })
    expect(r.headers["content-disposition"]).not.toContain('"; b=')
    expect(r.headers["content-disposition"]).not.toContain("\n")
  })
})
