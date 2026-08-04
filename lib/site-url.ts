/**
 * The site's own absolute base URL, for server-side code that has to call one
 * of our own routes over HTTP (self-dispatching workers: the scan chain, the
 * cron sweeps, the post-scan audit queue).
 *
 * Lives in its own leaf module rather than inside `lib/scan/executor.ts`,
 * where it used to sit, because the modules that need it are exactly the ones
 * the executor itself imports. AUDIT-AFTER-SCAN-1 made that concrete:
 * `lib/scan/executor.ts` imports `lib/web-audit/audit-dispatch.ts`, which
 * needed this — a cycle that pulled the whole executor (Gemini providers,
 * scoring, extraction, notifications) into the dispatch module and only
 * happened to work because the call sites are inside function bodies. A
 * three-line pure helper with no imports of its own cannot be part of a cycle.
 *
 * `lib/scan/executor.ts` re-exports it, so existing importers (and the test
 * mocks that stub `@/lib/scan/executor`) are untouched.
 */
export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
