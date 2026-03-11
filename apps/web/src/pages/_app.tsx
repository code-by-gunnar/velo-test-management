import { useEffect } from "react"
import type { AppProps } from "next/app"
import { SessionProvider, signOut } from "next-auth/react"
import { DM_Sans, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google"
import "@/styles/globals.css"

// Global fetch interceptor: force sign-out when API returns 401 (deactivated/expired session).
// The gateway clears the cookie; this ensures the client redirects immediately.
if (typeof window !== "undefined") {
  const originalFetch = window.fetch
  window.fetch = async (...args) => {
    const res = await originalFetch(...args)
    const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : ""
    if (res.status === 401 && url.includes("/api/backend/") && !url.includes("/auth/")) {
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
      <div className={`${dmSans.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable} font-body`}>
        <Component {...pageProps} />
      </div>
    </SessionProvider>
  )
}
