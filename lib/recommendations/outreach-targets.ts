import { classifySourceType } from "@/lib/citations/source-type";
import { normalizeDomain } from "@/lib/domains/brand-domain";
import { domainForBrandName } from "./anchored-domains";

/**
 * RECS-OUTREACH-TARGETS-1 (log §335). The founder's test on genscore.es (P29)
 * got «Consigue que 5 webs te mencionen» where the plan itself discarded four
 * of them: two were other tools' own sites and two were official
 * documentation (help.openai.com, developers.google.com), and the card's
 * first step said to "contact whoever publishes" OpenAI's help center.
 *
 * A cited site is not something to pitch when it is:
 * - documentation or a help center (its first label says so), which nobody
 *   outside the company edits; or
 * - an unclassified site whose domain IS a brand named in the same answer:
 *   that is the brand's own site, a company and often a rival, not a
 *   publisher. Same exact-label match as «Añadir competidor» (log §327),
 *   never containment. Comparators, media and communities keep their
 *   family even when the answer names them (Capterra named and cited is
 *   still a comparator).
 */
const DOCUMENTATION_LABELS = new Set([
  "help",
  "support",
  "docs",
  "doc",
  "developers",
  "developer",
  "learn",
  "kb",
  "ayuda",
  "soporte"
]);

export function isDocumentationHost(domain: string): boolean {
  const parts = normalizeDomain(domain).split(".").filter(Boolean);
  return parts.length > 2 && DOCUMENTATION_LABELS.has(parts[0]);
}

export function isOutreachTarget(domain: string, brandsInAnswer: readonly string[]): boolean {
  if (isDocumentationHost(domain)) return false;
  if (classifySourceType(domain) !== "unknown") return true;
  return !brandsInAnswer.some((name) => domainForBrandName(name, [domain]) !== null);
}
