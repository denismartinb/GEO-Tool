export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError =
  process.env.SENTRY_DSN
    ? (...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) => {
        // Dynamic import so this file has zero Sentry runtime cost when
        // SENTRY_DSN is unset (the common case until PLATFORM-COMMERCIAL-1's
        // founder-side Sentry account exists).
        import("@sentry/nextjs").then(({ captureRequestError }) => captureRequestError(...args));
      }
    : undefined;
