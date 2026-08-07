import { NextResponse } from "next/server";
import { fetchFavicon, isPlausibleDomain } from "@/lib/domains/favicon-source";
import { normalizeDomain, snapFaviconSize } from "@/lib/domains/favicon";

/**
 * Serves a domain's brand icon, or **204 with no body when there is no real
 * one** — which is the entire point of this route. An `<img>` with nothing to
 * decode fires `onError`, and that is what lets the client draw letter
 * initials instead. Google answers 200 with a generic globe, which from the
 * browser is indistinguishable from a brand.
 *
 * **204 and not 404**, corrected after a real `PILOT FAIL` (2026-08-06): the
 * 404 did exactly what it was asked to, but a 4xx for a normal, expected state
 * lies to everything that watches traffic — the pilot read it as a broken
 * screen, and the browser console and Sentry would have followed. A domain
 * without a favicon is nobody's failure. The rule this left behind: **the
 * status code describes what happened, not what you want the client to do.**
 *
 * Unauthenticated on purpose. It forwards to a public service what the
 * browser already sent there directly, and requiring a session would stop the
 * edge cache from serving one response to everyone. What the user gains is
 * that their browser stops telling Google which account they are looking at.
 */

/** A week. Brand icons do not change, and every cache hit is one function
 *  invocation and one upstream call that never happen. */
const CACHE_ICON = "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400";

/** A day. A domain with no icon today may have one tomorrow, so "there is
 *  none" must not stick for a week. */
const CACHE_NO_ICON = "public, max-age=600, s-maxage=86400";

/** A minute: a transient upstream failure should be retried soon. */
const CACHE_TRANSIENT = "public, max-age=0, s-maxage=60";

/** A malformed domain cannot become well-formed, so this answer is permanent —
 *  unlike the other two, nothing is being retried here. */
const CACHE_MALFORMED = "public, max-age=86400, s-maxage=604800";

/** Google's S2 serves PNG. Derived from what the upstream contract says, not
 *  echoed from its response header, which we do not control. */
const ICON_CONTENT_TYPE = "image/png";

/** Used when `sz` is missing or unparseable. Every real caller sends one — this
 *  is for a hand-typed URL, and 64 is the historical default rather than the
 *  16 px that `Number(null)` would otherwise collapse to. */
const DEFAULT_SIZE = 64;

function noBody(cacheControl: string): NextResponse {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": cacheControl } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Normalised through the same helper the client uses to build the URL, so
  // the two can never disagree about what counts as the same domain.
  const domain = normalizeDomain(searchParams.get("domain"));
  const requested = Number(searchParams.get("sz"));
  const size = snapFaviconSize(Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_SIZE);

  if (!domain || !isPlausibleDomain(domain)) return noBody(CACHE_MALFORMED);

  const result = await fetchFavicon(domain, size);

  if (result.kind === "icon") {
    return new NextResponse(result.body, {
      status: 200,
      headers: { "Content-Type": ICON_CONTENT_TYPE, "Cache-Control": CACHE_ICON }
    });
  }

  // Both remaining cases are 204: the client only needs to know "draw the
  // initials". A transient upstream failure deliberately does not surface as
  // 5xx — the user sees the same thing either way, and it would fill the
  // monitor with noise nobody can act on. What separates them is how long the
  // answer is cached.
  return noBody(result.kind === "generic" ? CACHE_NO_ICON : CACHE_TRANSIENT);
}
