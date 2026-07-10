import * as Sentry from "@sentry/nextjs";

// Client-side counterpart of sentry.server.config.ts / sentry.edge.config.ts.
// NEXT_PUBLIC_SENTRY_DSN (not SENTRY_DSN) because this file ships to the
// browser bundle. Same guard: unset -> no-op, no console noise.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
