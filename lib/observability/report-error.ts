import "server-only";

import * as Sentry from "@sentry/nextjs";

/**
 * OBSERVABILITY-1 (log §300): send an error we caught and handled to Sentry.
 *
 * `onRequestError` (instrumentation.ts) only sees what escapes a route. The
 * crons catch their own failures to answer a clean 500 without leaking a raw
 * Postgres/provider message, which is right for the caller and meant the
 * stack trace only lived in a runtime log nobody reads. This keeps the
 * sanitized response and sends the real error where it can be read.
 *
 * No-op without `SENTRY_DSN`. Awaits `flush` because a serverless function can
 * freeze right after responding (the bug fixed in PR #183).
 */
export async function reportError(error: unknown, area: string): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureException(error, { tags: { area } });
  await Sentry.flush(2000);
}
