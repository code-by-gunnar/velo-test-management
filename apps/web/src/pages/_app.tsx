import type { AppProps } from "next/app"
import { SessionProvider } from "next-auth/react"
import { DM_Sans, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google"
import "@/styles/globals.css"

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
