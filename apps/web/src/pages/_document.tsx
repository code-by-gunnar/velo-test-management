import { Html, Head, Main, NextScript } from "next/document"

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" type="image/svg+xml" href="/velo-favicon.svg" />
        <meta name="theme-color" content="#2D2926" />

        {/* Open Graph / Twitter — social share defaults (marketing site) */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Velo" />
        <meta property="og:title" content="Velo — Open-source, self-hosted test management" />
        <meta
          property="og:description"
          content="Test management that does less, on purpose. Write cases, run them, see where you stand — self-hosted and MIT-licensed."
        />
        <meta property="og:url" content="https://runvelo.app" />
        <meta property="og:image" content="https://runvelo.app/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Velo — Open-source, self-hosted test management" />
        <meta name="twitter:description" content="Test management that does less, on purpose." />
        <meta name="twitter:image" content="https://runvelo.app/og.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
