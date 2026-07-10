import * as Sentry from "@sentry/nextjs";

// PLATFORM-COMMERCIAL-1: optional by design — SENTRY_DSN is not set in any
// environment yet (no Sentry account exists). Guarded rather than passed
// straight to Sentry.init() so an unset DSN produces zero console noise, not
// just a silently-disabled SDK.
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Sentry cannot see request bodies/headers in server-rendered pages by
    // default; this keeps that off explicitly rather than relying on the
    // SDK's current default, since GEO Studio's server actions handle
    // auth/session data.
    sendDefaultPii: false
  });
}
