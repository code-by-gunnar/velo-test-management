import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 10% of transactions in production, 100% locally
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Send PII for debugging
  sendDefaultPii: true,
})
