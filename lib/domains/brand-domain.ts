/**
 * Shared brand-domain matching (BRAND-DOMAIN-1).
 *
 * A brand rarely lives on a single hostname: IKEA is `ikea.es` in Spain and
 * `ikea.com` globally, MercadoLibre is `mercadolibre.com.co` and
 * `mercadolibre.com.mx`. Until now every "is this citation mine?" check used
 * exact-or-subdomain matching against `projects.domain`, so a real citation
 * to `ikea.com` on an `ikea.es` project counted as a third party — which
 * silently under-reported `citation_score`, the `authority` component of
 * `geo_score`, and `own_citation_share`.
 *
 * This module is the single definition of the three questions those callers
 * actually ask, so they can never drift apart again:
 *
 *   normalizeDomain   — canonical host form (no scheme, no `www.`, no path)
 *   isSameOrSubdomain — same host or a subdomain of it (`blog.ikea.es`)
 *   isBrandDomain     — the above, OR the same brand on another TLD
 *
 * IMPORTANT — scope of `isBrandDomain`: use it only for "does this domain
 * belong to the brand?" (citations, visibility, competitor de-duplication).
 * Do NOT use it for link topology (internal vs external links in the web
 * audit): for technical SEO, a link from `ikea.es` to `ikea.com` genuinely
 * is an external link, and those call sites must keep using
 * `isSameOrSubdomain`.
 *
 * Known trade-off (founder decision 2026-07-25, "opción A"): matching by
 * brand label is a heuristic, not ownership proof. Two unrelated owners of
 * `<generic>.es` and `<generic>.com` will match. This was accepted over an
 * explicit per-project domain list because it needs no schema change and
 * fixes the real, observed case today; an explicit `brand_domains` column
 * remains the precise long-term option if false positives show up.
 */

/**
 * Two-level public suffixes we care about, so the brand label of
 * `mercadolibre.com.co` is `mercadolibre` and not `com`. Not a full Public
 * Suffix List: this is deliberately limited to the markets the product
 * serves (Spain, LatAm, main EU/EN) plus the widespread `com.*` forms.
 * Anything not listed falls back to "last part is the suffix", which is
 * correct for `.es`, `.com`, `.mx`, `.de`, and every other single-level TLD.
 */
const TWO_LEVEL_SUFFIXES = new Set([
  "com.ar", "com.au", "com.bo", "com.br", "com.co", "com.do", "com.ec",
  "com.gt", "com.mx", "com.pa", "com.pe", "com.py", "com.sg", "com.tr",
  "com.uy", "com.ve",
  "co.cr", "co.il", "co.jp", "co.kr", "co.nz", "co.uk", "co.za",
  "net.br", "net.co", "net.mx",
  "org.br", "org.co", "org.mx", "org.uk",
  "gob.es", "gob.mx",
]);

/** Canonical host form: lowercased, no scheme, no `www.` prefix, no path. */
export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/**
 * True when `domain` is exactly `root` or a subdomain of it. Matches on
 * label boundaries (`notikea.es` is not a subdomain of `ikea.es`).
 */
export function isSameOrSubdomain(domain: string, root: string): boolean {
  if (!domain || !root) return false;
  return domain === root || domain.endsWith(`.${root}`);
}

/**
 * The registrable brand label of a host — the label immediately before its
 * public suffix. Returns "" when there is no such label.
 *
 *   ikea.es                      → "ikea"
 *   ikea.com                     → "ikea"
 *   blog.ikea.es                 → "ikea"
 *   listado.mercadolibre.com.mx  → "mercadolibre"
 *   es.homary.com                → "homary"
 */
export function brandLabel(domain: string): string {
  const normalized = normalizeDomain(domain);
  if (!normalized || !normalized.includes(".")) return "";

  const parts = normalized.split(".").filter(Boolean);
  if (parts.length < 2) return "";

  const lastTwo = parts.slice(-2).join(".");
  const suffixLength = TWO_LEVEL_SUFFIXES.has(lastTwo) ? 2 : 1;
  const labelIndex = parts.length - 1 - suffixLength;

  return labelIndex >= 0 ? parts[labelIndex] : "";
}

/**
 * True when `candidate` belongs to the brand behind `projectDomain` — the
 * same host, a subdomain of it, or the same brand on a different TLD.
 *
 * Use for citations/visibility ownership. See the module header for why link
 * topology must NOT use this.
 */
export function isBrandDomain(
  candidate: string | null | undefined,
  projectDomain: string | null | undefined
): boolean {
  const rawCandidate = candidate?.trim();
  const rawProject = projectDomain?.trim();
  if (!rawCandidate || !rawProject) return false;

  const normalizedCandidate = normalizeDomain(rawCandidate);
  const normalizedProject = normalizeDomain(rawProject);
  if (!normalizedCandidate || !normalizedProject) return false;

  if (isSameOrSubdomain(normalizedCandidate, normalizedProject)) return true;

  const candidateLabel = brandLabel(normalizedCandidate);
  const projectLabel = brandLabel(normalizedProject);
  return candidateLabel.length > 0 && candidateLabel === projectLabel;
}
