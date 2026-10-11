import { scrubBreadcrumb, scrubEvent } from "./scrub";

/**
 * OBSERVABILITY-1 (log §300): the one set of `Sentry.init` options shared by
 * the server, edge and browser configs. Before this the three files repeated
 * the same object by hand, without environment, release or scrubbing.
 *
 * - **environment** separates production from Vercel previews, so an error a
 *   PR preview throws never pages as a production incident.
 * - **release** is the commit, so an issue says which deploy introduced it
 *   and Sentry can mark it resolved "in the next release".
 * - **Errors are never sampled** (Sentry's default `sampleRate` is 1). Only
 *   performance traces are, and only in production: previews are PR scratch
 *   and their traces would eat the plan's quota for nothing.
 */
export function sentryInitOptions(input: {
  dsn: string;
  environment: string | undefined;
  release: string | undefined;
}) {
  const environment = input.environment || "development";

  return {
    dsn: input.dsn,
    environment,
    release: input.release || undefined,
    tracesSampleRate: environment === "production" ? 0.1 : 0,
    // Off explicitly rather than trusting the SDK default: server actions here
    // carry auth/session data, and the scrubber below is the second lock.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    // Browser noise with no fix on our side: Chrome reports this whenever a
    // ResizeObserver callback resizes what it observes, and the page is fine.
    ignoreErrors: ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications"]
  };
}
