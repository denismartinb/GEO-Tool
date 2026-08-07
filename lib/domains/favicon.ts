/**
 * Builds the `<img>` attributes for a domain's brand icon. Client-safe: this
 * module only builds URLs, it never fetches. The fetching half lives in
 * `./favicon-source`, behind `/api/favicon`.
 *
 * Two decisions are baked in here, both from FAVICON-QUALITY-1
 * (`docs/brand/design-decisions-log.md` §39):
 *
 * 1. **The requested size is derived from the CSS size times the device pixel
 *    ratio, never fixed.** A hardcoded `sz=64` was being upscaled by the
 *    browser on every retina display — worst on the Domains hero, where 56 CSS
 *    px is 112 device px from a 64 px source.
 * 2. **The URL points at our own route, not at Google.** That is what lets the
 *    server look at the bytes and answer "there is no icon here" (204), which
 *    is the only way the letter-initial fallback can ever trigger — Google
 *    answers 200 with a generic globe, indistinguishable from a real icon to a
 *    browser. It also stops the user's browser telling Google which account
 *    they are looking at, a leak this file carried since 2026-07-23.
 */

/**
 * Icon sizes the pipeline actually serves. Google's S2 rounds anything else up
 * on its own — asking for 100 silently returns 128 — so the rounding happens
 * here instead, and the URL stays honest about what comes back.
 */
const SERVED_SIZES = [16, 32, 64, 128, 256] as const;

/** Density descriptors to emit. 3x is included because phones ship it and the
 *  Overview panorama renders favicons on mobile. */
const DENSITIES = [1, 2, 3] as const;

/**
 * Our own domain never goes through the icon service: the authentic asset is
 * in the repo. It is vector, so it needs no density candidates at all.
 *
 * Narrow on purpose. genscore.es is the one domain whose real icon we hold, so
 * it is the one domain where guessing is pointless — and it was showing the
 * generic globe inside our own product, because S2's index is populated by
 * crawling and it had never crawled us.
 */
const OWN_DOMAIN = "genscore.es";
const OWN_ICON = "/brand/genscore-tile.svg";

/**
 * The single definition of "the same domain". Both the client helpers below and
 * the route that serves the bytes normalize through this, so a domain can never
 * be considered valid by one and different by the other.
 */
export function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const clean = domain.trim().toLowerCase().replace(/^www\./, "");
  return clean || null;
}

/** Smallest served size that still covers `px`, capped at 256 — above that the
 *  service clamps, and the srcset descriptor would be claiming pixels the
 *  candidate does not contain. */
export function snapFaviconSize(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return SERVED_SIZES[0];
  return SERVED_SIZES.find((size) => size >= px) ?? SERVED_SIZES[SERVED_SIZES.length - 1];
}

/** Deliberately not exported: every call site goes through `faviconImgProps`,
 *  so there is no way to request an icon without saying what size it renders
 *  at — which is how the fixed `sz=64` survived unnoticed for months. */
function iconUrl(domain: string, size: number): string {
  return `/api/favicon?domain=${encodeURIComponent(domain)}&sz=${snapFaviconSize(size)}`;
}

export type FaviconImgProps = {
  src: string;
  /** Absent for our own vector icon, which has nothing to switch between. */
  srcSet?: string;
};

/**
 * Everything an `<img>` needs to render a brand icon crisply at `cssSize`.
 * Returns null when there is no domain at all, so call sites keep their
 * letter-initial branch for that case; when the domain exists but has no icon,
 * the route answers 204 and the client's `onError` takes over.
 *
 * `src` is the 1x candidate rather than the largest: a browser that ignores
 * `srcSet` should get a correctly sized icon, not a 256 px one.
 */
export function faviconImgProps(
  domain: string | null | undefined,
  cssSize: number
): FaviconImgProps | null {
  const clean = normalizeDomain(domain);
  if (!clean) return null;
  if (clean === OWN_DOMAIN) return { src: OWN_ICON };

  // Collapse densities that snap to the same size: once `cssSize * dpr`
  // saturates at 256, 2x and 3x are the same URL, and offering one file twice
  // makes the browser weigh a distinction that does not exist.
  const candidates: Array<{ dpr: number; size: number }> = [];
  for (const dpr of DENSITIES) {
    const size = snapFaviconSize(cssSize * dpr);
    if (candidates.some((c) => c.size === size)) continue;
    candidates.push({ dpr, size });
  }

  return {
    src: iconUrl(clean, candidates[0].size),
    srcSet: candidates.map(({ dpr, size }) => `${iconUrl(clean, size)} ${dpr}x`).join(", ")
  };
}
