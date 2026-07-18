import * as Sentry from "@sentry/nextjs"

// Off by default — see instrumentation-client.ts. Empty DSN = no init.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,

    // 10% of transactions in production, 100% locally
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Send PII for debugging
    sendDefaultPii: true,

    initialScope: { tags: { component: "web-server" } },
  })
}
