import * as Sentry from "@sentry/nextjs";

// See sentry.server.config.ts — same guard, edge runtime (middleware).
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false
  });
}
