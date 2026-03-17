import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  integrations: [Sentry.replayIntegration()],

  // 10% of transactions in production, 100% locally
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Capture 10% of sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Send PII (user email/IP) for debugging
  sendDefaultPii: true,

  // Filter out noisy non-errors
  beforeSend(event) {
    // Drop ResizeObserver errors (browser noise)
    if (event.exception?.values?.[0]?.value?.includes("ResizeObserver")) {
      return null
    }
    return event
  },
})
