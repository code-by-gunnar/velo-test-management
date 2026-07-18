import * as Sentry from "@sentry/node"

Sentry.init({
  // Empty DSN disables Sentry — self-hosted instances must not report into
  // the hosted production project unless explicitly configured.
  dsn: process.env.SENTRY_DSN ?? "",

  sendDefaultPii: true,

  // 10% of transactions in production, 100% locally
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Capture local variable values in stack frames
  includeLocalVariables: true,

  environment: process.env.NODE_ENV ?? "production",

  // Tag so web + api can share one Sentry project yet stay filterable
  initialScope: { tags: { component: "api" } },
})
