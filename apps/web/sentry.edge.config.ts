import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://8b39dc689ed8ed7498347c63bc85b73b@o4511058912411648.ingest.de.sentry.io/4511058913722448",

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  sendDefaultPii: true,
})
