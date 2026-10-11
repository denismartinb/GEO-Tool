import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/observability/sentry-options";

// See sentry.server.config.ts — same guard, edge runtime (middleware).
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
