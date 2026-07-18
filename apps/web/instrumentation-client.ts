import * as Sentry from "@sentry/nextjs"

// Off by default. Self-hosted instances opt in by setting NEXT_PUBLIC_SENTRY_DSN
// (a build ARG — inlined at build time). Empty = no init, no phone-home.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,

    sendDefaultPii: true,

    // 10% of transactions in production, 100% locally
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Session Replay: 10% of sessions, 100% of sessions with errors
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [Sentry.replayIntegration()],

    // Tag so web + api can share one Sentry project yet stay filterable
    initialScope: { tags: { component: "web-client" } },
  })
}
