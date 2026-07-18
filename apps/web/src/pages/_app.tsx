import { useEffect } from "react"
import type { AppProps } from "next/app"
import { SessionProvider, signOut } from "next-auth/react"
import { DM_Sans, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google"
import { ToastProvider } from "@/components/ui/toast"
import { RouteProgress } from "@/components/layout/RouteProgress"
import { clearVeloCache } from "@/hooks/useCachedState"
import "@/styles/globals.css"

// Global fetch interceptor, two jobs:
//
// 1. Bounded GETs with one retry. Docker Desktop's Windows port proxy can
//    black-hole a keep-alive socket: the request reaches the server, the 200
//    response never reaches the browser, and Chrome waits forever (its
//    automatic retry after the server's keep-alive close lands on another
//    poisoned socket — observed repeating at exactly keepAliveTimeout
//    intervals). Aborting after a few seconds and retrying forces a fresh
//    connection. Applies only to idempotent app GETs (_next/data navigations
//    and /api/backend data fetches, excluding long-running /export) — normal
//    responses take ~25ms, so 6s is 200x headroom, not a tight budget.
//    If a _next/data fetch fails both attempts, Next.js falls back to a full
//    page navigation on its own, which always recovers.
//
// 2. Force sign-out when the API returns 401 (deactivated/expired session).
//    The gateway clears the cookie; this ensures the client redirects
//    immediately.
if (typeof window !== "undefined") {
  const originalFetch = window.fetch

  const FETCH_TIMEOUT_MS = 6_000

  const isBoundedGet = (url: string, init?: RequestInit): boolean => {
    const method = (init?.method ?? "GET").toUpperCase()
    if (method !== "GET") return false
    if (url.includes("/export")) return false
    return url.includes("/_next/data/") || url.includes("/api/backend/")
  }

  const withTimeout = (init: RequestInit | undefined): RequestInit => {
    const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
    const signal =
      init?.signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([init.signal, timeoutSignal])
        : init?.signal ?? timeoutSignal
    return { ...init, signal }
  }

  window.fetch = async (...args) => {
    const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : ""
    const init = args[1]

    let res: Response
    if (isBoundedGet(url, init)) {
      try {
        res = await originalFetch(args[0], withTimeout(init))
      } catch (err) {
        // Caller-initiated aborts propagate; timeouts/network errors retry once
        if (init?.signal?.aborted) throw err
        res = await originalFetch(args[0], withTimeout(init))
      }
    } else {
      res = await originalFetch(...args)
    }

    if (res.status === 401 && url.includes("/api/backend/") && !url.includes("/auth/")) {
      clearVeloCache()
      void signOut({ callbackUrl: "/login" })
    }
    return res
  }
}

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  display: "swap",
})

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"],
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <SessionProvider session={session}>
      <ToastProvider>
        <div className={`${dmSans.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable} font-body`}>
          <RouteProgress />
          <Component {...pageProps} />
        </div>
      </ToastProvider>
    </SessionProvider>
  )
}
