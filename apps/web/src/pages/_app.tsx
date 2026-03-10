import type { AppProps } from "next/app"
import { SessionProvider } from "next-auth/react"
import { Inter, JetBrains_Mono } from "next/font/google"
import "@/styles/globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
      <div className={`${inter.variable} ${jetbrainsMono.variable} font-ui`}>
        <Component {...pageProps} />
      </div>
    </SessionProvider>
  )
}
