import "server-only";

/**
 * Resolves Gemini Google Search grounding redirect URIs
 * (`https://vertexaisearch.cloud.google.com/grounding-api-redirect/...`) to
 * their real destination URL, so the UI can show the actual cited domain
 * (e.g. `www.movistar.es`) instead of Google's redirect host.
 *
 * See docs/adr/0006-grounding-redirect-resolution.md.
 */

/** Per-fetch timeout. Bounded so a slow/unresponsive redirect target cannot
 * stall the synchronous scan pipeline (maxDuration=60, ADR 0003). */
export const REDIRECT_RESOLUTION_TIMEOUT_MS = 2500;

export type CitationResolutionResult = {
  /** The final destination URL after following redirects, or `null` if
   * resolution failed/timed out. */
  resolvedUrl: string | null;
};

/**
 * Attempts to resolve a single grounding redirect URI to its final
 * destination URL. Never throws — returns `{ resolvedUrl: null }` on any
 * error, timeout, or non-OK-ish response so callers can apply the
 * documented fallback (domain: null, confidence: "low").
 *
 * Tries HEAD first (cheaper — no response body), falling back to GET if the
 * redirect target rejects HEAD (some servers return 405/403 for HEAD).
 */
export async function resolveGroundingRedirect(uri: string): Promise<CitationResolutionResult> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const response = await fetch(uri, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(REDIRECT_RESOLUTION_TIMEOUT_MS)
      });

      // A resolved URL that still points at Google's redirect host means we
      // didn't actually get redirected anywhere useful — treat as failure.
      if (response.url && !response.url.includes("vertexaisearch.cloud.google.com")) {
        return { resolvedUrl: response.url };
      }

      // HEAD succeeded but didn't redirect anywhere useful; try GET before
      // giving up.
      if (method === "HEAD") continue;

      return { resolvedUrl: null };
    } catch {
      // HEAD not supported / network error / timeout — try GET, or give up
      // if this was already the GET attempt.
      if (method === "GET") return { resolvedUrl: null };
    }
  }

  return { resolvedUrl: null };
}

/**
 * Resolves a batch of grounding chunk URIs in parallel, each individually
 * timeout-bounded. Returns a map from the original URI to its resolution
 * result. Uses `Promise.allSettled` so one slow/failing chunk never blocks
 * or fails the others.
 */
export async function resolveGroundingRedirects(
  uris: string[]
): Promise<Map<string, CitationResolutionResult>> {
  const uniqueUris = Array.from(new Set(uris));
  const results = await Promise.allSettled(uniqueUris.map((uri) => resolveGroundingRedirect(uri)));

  const map = new Map<string, CitationResolutionResult>();
  uniqueUris.forEach((uri, index) => {
    const result = results[index];
    map.set(uri, result.status === "fulfilled" ? result.value : { resolvedUrl: null });
  });

  return map;
}
