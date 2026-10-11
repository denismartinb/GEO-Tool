import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/observability/sentry-options";

// Client-side counterpart of sentry.server.config.ts / sentry.edge.config.ts.
// NEXT_PUBLIC_* (not SENTRY_DSN / VERCEL_ENV) because this file ships to the
// browser bundle; Vercel exposes the NEXT_PUBLIC_VERCEL_* system variables by
// default. Same guard: unset -> no-op, no console noise.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init(
    sentryInitOptions({
      dsn,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
      release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    })
  );
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
