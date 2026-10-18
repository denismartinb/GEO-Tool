import { normalizeDomain } from "@/lib/domains/brand-domain";

/**
 * What counts as a competitor's website, in one place the browser can import
 * too: the alta form validates on the server (`manage-competitors.ts`), and
 * the "Añadir X a competidores" button on Recomendaciones enables itself with
 * the same rule (RECS-ADD-COMPETITOR-1), so the button never lights up for a
 * value the server will reject.
 */
export const COMPETITOR_DOMAIN_FORMAT =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** The normalized domain when it is valid, else null. */
export function parseCompetitorDomain(value: string): string | null {
  const domain = normalizeDomain(value);
  if (domain.length < 3 || domain.length > 255) return null;
  return COMPETITOR_DOMAIN_FORMAT.test(domain) ? domain : null;
}
