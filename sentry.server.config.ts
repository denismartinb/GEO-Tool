import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/observability/sentry-options";

// PLATFORM-COMMERCIAL-1: optional by design. Guarded rather than passed
// straight to Sentry.init() so an unset DSN (local, tests) produces zero
// console noise, not just a silently-disabled SDK. Shared options and PII
// scrubbing live in lib/observability (OBSERVABILITY-1, log §299).
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init(
    sentryInitOptions({
      dsn,
      environment: process.env.VERCEL_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA
    })
  );
}
