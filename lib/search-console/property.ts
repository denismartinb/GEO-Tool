import { isSameOrSubdomain, normalizeDomain } from "@/lib/domains/brand-domain";

/**
 * SEARCH-SEO-1 Fase 3 (log §283). Which Search Console properties may feed a
 * project's screen. It is the customer's own Google data either way, but the
 * wrong site on the screen would be a fake metric, so a property only counts
 * when it covers the project's domain:
 *
 *  - `sc-domain:X` (domain property) — the project's domain is X or under X.
 *  - `https://host/…` (URL prefix) — host and project domain match in either
 *    direction, so `https://www.ikea.es/` fits a project on `ikea.es`.
 *
 * Pure, shared by the property picker and the server action that saves it.
 */

export const PROPERTY_MAX_LENGTH = 2048;

export function propertyHost(property: string): string | null {
  if (property.startsWith("sc-domain:")) {
    const host = normalizeDomain(property.slice("sc-domain:".length));
    return host || null;
  }
  if (!/^https?:\/\//i.test(property)) return null;
  try {
    return normalizeDomain(new URL(property).hostname);
  } catch {
    return null;
  }
}

export function propertyMatchesDomain(property: string, projectDomain: string): boolean {
  if (property.length > PROPERTY_MAX_LENGTH) return false;
  const domain = normalizeDomain(projectDomain);
  const host = propertyHost(property);
  if (!domain || !host) return false;
  if (property.startsWith("sc-domain:")) return isSameOrSubdomain(domain, host);
  return isSameOrSubdomain(domain, host) || isSameOrSubdomain(host, domain);
}

/**
 * Matching properties, best first: a domain property covers every protocol
 * and subdomain, then https before http, then the shortest prefix.
 */
export function rankMatchingProperties(properties: string[], projectDomain: string): string[] {
  const score = (p: string) => (p.startsWith("sc-domain:") ? 0 : p.startsWith("https://") ? 1 : 2);
  return [...new Set(properties)]
    .filter((p) => propertyMatchesDomain(p, projectDomain))
    .sort((a, b) => score(a) - score(b) || a.length - b.length || a.localeCompare(b));
}

/** "sc-domain:ikea.es" → "ikea.es (todo el dominio)"; a URL prefix shows as is. */
export function propertyLabel(property: string): string {
  return property.startsWith("sc-domain:") ? `${property.slice(10)} (todo el dominio)` : property;
}
