import { describe, it, expect } from "vitest"
import { resolveBrowserApiUrl } from "@/lib/browser-api-url"

// The browser-facing API URL (SSE EventSource + the CI ingestion command the UI
// shows) is resolved in getServerSideProps, so it must be picked from RUNTIME
// env — not a NEXT_PUBLIC_ var that Next freezes into the image at build time.
// That freeze is why the prebuilt image always pointed the browser at
// http://localhost:3001 and SSE never connected for self-hosters.

describe("resolveBrowserApiUrl", () => {
  it("prefers the runtime PUBLIC_API_URL over everything else", () => {
    const url = resolveBrowserApiUrl({
      PUBLIC_API_URL: "https://api.example.com",
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:3001", // baked default
      API_URL: "http://api:3001",
    })
    expect(url).toBe("https://api.example.com")
  })

  it("falls back to NEXT_PUBLIC_API_BASE_URL when PUBLIC_API_URL is unset (built-from-source compat)", () => {
    const url = resolveBrowserApiUrl({
      NEXT_PUBLIC_API_BASE_URL: "https://api.built.example",
      API_URL: "http://api:3001",
    })
    expect(url).toBe("https://api.built.example")
  })

  it("falls back to API_URL when neither public var is set", () => {
    expect(resolveBrowserApiUrl({ API_URL: "http://api:3001" })).toBe("http://api:3001")
  })

  it("treats an empty string as unset and keeps falling through", () => {
    const url = resolveBrowserApiUrl({
      PUBLIC_API_URL: "",
      NEXT_PUBLIC_API_BASE_URL: "",
      API_URL: "http://api:3001",
    })
    expect(url).toBe("http://api:3001")
  })

  it("returns an empty string when nothing is configured", () => {
    expect(resolveBrowserApiUrl({})).toBe("")
  })
})
