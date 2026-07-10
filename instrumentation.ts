export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Must be a real `async function` that Next.js can `await` — a fire-and-forget
 * `.then()` here (an earlier version of this file did that) resolves
 * immediately without waiting for the dynamic import or the actual event
 * capture, so on Vercel's serverless runtime the function instance can freeze
 * before the event is ever sent, and it silently never reaches Sentry.
 * `flush()` is a second safety net for the same reason: serverless functions
 * can suspend right after the response is sent, before the SDK's background
 * transport has finished delivering the event over HTTP.
 */
export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) {
  if (!process.env.SENTRY_DSN) return;

  const Sentry = await import("@sentry/nextjs");
  await Sentry.captureRequestError(...args);
  await Sentry.flush(2000);
}
