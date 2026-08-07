/**
 * Server side of the favicon pipeline: fetches a domain's icon and decides
 * whether what came back is a real brand icon or the service's generic globe.
 *
 * **Why a server is needed for something this small.** Google's S2 answers
 * `200` with a globe when it does not know a domain — not a `404`. From the
 * browser that is indistinguishable from a real icon (`onError` never fires),
 * so the console spent months showing globes as if they were brands:
 * alberdiderma.es and our own genscore.es, 2 of 10 domains in the founder's
 * account. Here we can look at the bytes.
 *
 * Only ever talks to the fixed host below. The user-supplied domain travels as
 * a query parameter and never determines where the request goes — see
 * `docs/brand/design-decisions-log.md` §36 for why fetching the site's own
 * `apple-touch-icon` was built, measured and then reverted.
 */

import { createHash } from "node:crypto";

const ICON_SERVICE = "https://www.google.com/s2/favicons";

/**
 * A domain that cannot exist: `.invalid` is reserved by RFC 2606 and will
 * never resolve, so whatever the service returns for it *is* its generic
 * placeholder. That is the calibration.
 *
 * Preferred over embedding a hash of the globe, which would go stale in
 * silence the day Google redraws it.
 */
const SENTINEL_DOMAIN = "no-such-site.invalid";

const FETCH_TIMEOUT_MS = 5_000;

/** A favicon is a few KB. The cap is defensive, not a tuned number. */
const MAX_BYTES = 200_000;

export type FaviconResult =
  /** A real brand icon, ready to serve. */
  | { kind: "icon"; body: ArrayBuffer }
  /** The service has no icon for this domain: the client should draw initials. */
  | { kind: "generic" }
  /** We could not find out. Also draws initials, but is cached briefly so it retries. */
  | { kind: "unavailable" };

function hash(buf: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(buf)).digest("hex");
}

async function fetchIcon(domain: string, size: number): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${ICON_SERVICE}?domain=${encodeURIComponent(domain)}&sz=${size}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Our own edge cache is the one that matters; see the route.
      cache: "no-store"
    });
    if (!res.ok) return null;

    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;

    const body = await res.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return null;
    return body;
  } catch {
    // Timeout, DNS, transport. No provider message is kept: the caller
    // categorises, per `.claude/rules/gemini.md` ("sanitize all errors").
    return null;
  }
}

/**
 * Hash of the placeholder for a given size, memoised per size **and by
 * promise** — several icons rendering at once on a cold start share one
 * calibration call instead of firing one each.
 *
 * The placeholder differs per size, hence the per-size key.
 */
const placeholderBySize = new Map<number, Promise<string | null>>();

/** Test seam: module state would otherwise leak between cases. */
export function resetPlaceholderCache(): void {
  placeholderBySize.clear();
}

function placeholderHash(size: number): Promise<string | null> {
  const cached = placeholderBySize.get(size);
  if (cached) return cached;

  const pending = fetchIcon(SENTINEL_DOMAIN, size)
    .then((buf) => (buf ? hash(buf) : null))
    .catch(() => null);

  // Only a success is kept. Caching a failure would leave this instance
  // permanently and silently fail-open for that size: one second of network
  // trouble and, for as long as the function stays warm, every generic globe
  // would be served as if it were a brand. Fail-open is meant to be a moment,
  // not an inheritance. The promise is still stored before yielding, so
  // concurrent callers keep sharing the single in-flight call.
  void pending.then((result) => {
    if (result === null) placeholderBySize.delete(size);
  });

  placeholderBySize.set(size, pending);
  return pending;
}

/**
 * Fetches the icon and says whether it is real or the placeholder.
 *
 * **Fails open on purpose.** With no calibration available we serve the icon
 * rather than risk hiding a good one: showing one globe too many is ugly,
 * hiding a competitor's real brand mark is lost information. Same bias as
 * `scripts/vercel-should-build.sh`.
 */
export async function fetchFavicon(domain: string, size: number): Promise<FaviconResult> {
  const [icon, placeholder] = await Promise.all([fetchIcon(domain, size), placeholderHash(size)]);

  if (!icon) return { kind: "unavailable" };
  if (placeholder && hash(icon) === placeholder) return { kind: "generic" };
  return { kind: "icon", body: icon };
}

/**
 * Shape check before spending a request. Not a security boundary — the
 * destination host is the constant at the top of this file, so the domain
 * cannot redirect us anywhere — but a value that is not domain-shaped can only
 * produce a useless answer, so it is rejected before the call.
 */
export function isPlausibleDomain(value: string): boolean {
  if (!value || value.length > 253) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value);
}
