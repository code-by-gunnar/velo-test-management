import * as Sentry from "@sentry/node"

Sentry.init({
  dsn: "https://690c376c1417c8aa75636768fafd2af9@o4511058912411648.ingest.de.sentry.io/4511059656638544",

  sendDefaultPii: true,

  // 10% of transactions in production, 100% locally
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Capture local variable values in stack frames
  includeLocalVariables: true,

  environment: process.env.NODE_ENV ?? "production",
})
