import "server-only";

import { isIP } from "node:net";
import { hostnameResolvesToPublicIp } from "@/lib/web-audit/fetch-page";

/**
 * Resolves Gemini Google Search grounding redirect URIs
 * (`https://vertexaisearch.cloud.google.com/grounding-api-redirect/...`) to
 * their real destination URL, so the UI can show the actual cited domain
 * (e.g. `www.movistar.es`) instead of Google's redirect host.
 *
 * See docs/adr/0006-grounding-redirect-resolution.md.
 *
 * CITATION-REDIRECT-SSRF-1 (data-guardian review, 2026-08-27): this follows a
 * redirect Google itself issues, to an arbitrary destination — unlike
 * fetch-page.ts's own-domain-only fetches, landing on any public site is the
 * whole point here. What it must never do is land on a PRIVATE one. Every hop
 * is verified with hostnameResolvesToPublicIp() — imported from fetch-page.ts,
 * never a second copy of that check — before being followed, mirroring
 * fetchPageSafely's manual redirect loop: never `redirect: "follow"`, which
 * sends the request to a redirect target before any check could run.
 */

/** Per-attempt (HEAD, then separately GET) time budget — a single absolute
 * deadline threaded through every hop and DNS check of that attempt, never a
 * fresh allowance per hop (`.claude/rules/scan.md`, "budget against the
 * invocation, not against itself"). Bounded so a slow/unresponsive redirect
 * chain cannot stall the synchronous scan pipeline (maxDuration=60, ADR 0003). */
export const REDIRECT_RESOLUTION_TIMEOUT_MS = 2500;

/** Google's own redirect chain plus whatever the destination site adds. */
const MAX_REDIRECTS = 5;

export type CitationResolutionResult = {
  /** The final destination URL after following redirects, or `null` if
   * resolution failed/timed out. */
  resolvedUrl: string | null;
};

function isGoogleRedirectHost(url: URL): boolean {
  return url.toString().includes("vertexaisearch.cloud.google.com");
}

async function isSafeToFetch(url: URL): Promise<boolean> {
  if (url.protocol !== "https:") return false;
  const hostname = url.hostname.toLowerCase();
  if (isIP(hostname)) return false; // reject IP-literal hosts outright, never resolve/allow them
  return hostnameResolvesToPublicIp(hostname);
}

/**
 * Follows redirects for ONE method (HEAD or GET), verifying every hop's
 * hostname before connecting to it, within a single absolute `deadline`.
 * Returns the final destination URL, or `null` on any unsafe hop, network
 * error, exhausted redirect budget, or a final URL still on Google's own
 * redirect host (no real destination was reached).
 */
async function resolveWithMethod(uri: string, method: "HEAD" | "GET", deadline: number): Promise<string | null> {
  let current: URL;
  try {
    current = new URL(uri);
  } catch {
    return null;
  }

  let reachedFinal = false;
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    if (!(await isSafeToFetch(current))) return null;

    const timeLeft = deadline - Date.now();
    if (timeLeft <= 0) return null;

    let response: Response;
    try {
      response = await fetch(current.toString(), {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(timeLeft)
      });
    } catch {
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        reachedFinal = true; // redirect status with no target — nothing more to follow
        break;
      }
      try {
        current = new URL(location, current);
      } catch {
        return null;
      }
      continue; // next iteration re-verifies the NEW host before following
    }

    reachedFinal = true; // not a redirect — this is the final response, ok or not
    break;
  }

  if (!reachedFinal) return null; // exceeded MAX_REDIRECTS without landing on a final response
  if (isGoogleRedirectHost(current)) return null;
  return current.toString();
}

/**
 * Attempts to resolve a single grounding redirect URI to its final
 * destination URL. Never throws — returns `{ resolvedUrl: null }` on any
 * error, timeout, unsafe hop, or non-useful response so callers can apply the
 * documented fallback (domain: null, confidence: "low").
 *
 * Tries HEAD first (cheaper — no response body), falling back to GET if HEAD
 * didn't reach a real destination (network error, or a final response still
 * on Google's redirect host).
 */
export async function resolveGroundingRedirect(uri: string): Promise<CitationResolutionResult> {
  const headDeadline = Date.now() + REDIRECT_RESOLUTION_TIMEOUT_MS;
  const viaHead = await resolveWithMethod(uri, "HEAD", headDeadline);
  if (viaHead) return { resolvedUrl: viaHead };

  const getDeadline = Date.now() + REDIRECT_RESOLUTION_TIMEOUT_MS;
  const viaGet = await resolveWithMethod(uri, "GET", getDeadline);
  return { resolvedUrl: viaGet };
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
