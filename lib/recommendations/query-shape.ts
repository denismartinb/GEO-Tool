import { classifySourceType } from "@/lib/citations/source-type";

/**
 * Is this a "what does X mean" query? (log §292)
 *
 * A definitional query is answered with a definition, and the engines back it
 * with dictionaries and encyclopedias, not with brands. So the visibility card
 * cannot honestly say "nobody owns it, whoever publishes first wins": what is
 * winnable there is being *cited as a source*, rarely being *named*. The
 * product told its own founder exactly that wrong thing for «que significa
 * geo» (2026-10-11), whose evidence was RAE, WordReference, Fundéu and
 * Wikipedia.
 *
 * Two independent signals, either one is enough:
 *  - the wording of the prompt («qué significa», «qué es», «significado de»…);
 *  - every domain the answers cited is a dictionary or an encyclopedia
 *    (`classifySourceType`, the same classifier Páginas citadas uses), with at
 *    least two of them so a single Wikipedia link doesn't decide it.
 */
export type QueryShape = "definition" | "other";

const DEFINITION_PATTERNS: RegExp[] = [
  /^(que|qué)\s+(significa|quiere decir|es|son)\s+(el|la|los|las|un|una)?\s*\S+(\s+\S+)?\s*\??$/,
  /^significado\s+de\s+/,
  /^definici(o|ó)n\s+de\s+/,
  /^(what|whats)\s+(does|is)\s+\S+(\s+\S+)?\s+mean\s*\??$/,
  /^meaning\s+of\s+/
];

function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[¿?¡!"«»“”'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Only short «qué es X» prompts count: «qué es el mejor CRM para pymes» is a
 * recommendation query wearing a definitional opening, and a brand can and
 * should be named there. The `\S+(\s+\S+)?` tail in the first pattern caps the
 * term at two words for exactly that reason.
 */
export function isDefinitionalPrompt(prompt: string): boolean {
  const normalized = normalizePrompt(prompt);
  if (!normalized) return false;
  return DEFINITION_PATTERNS.some((re) => re.test(normalized));
}

const MIN_REFERENCE_DOMAINS = 2;

export function citesOnlyReferenceSources(domains: readonly string[]): boolean {
  const unique = Array.from(new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean)));
  if (unique.length < MIN_REFERENCE_DOMAINS) return false;
  return unique.every((d) => classifySourceType(d) === "encyclopedia");
}

export function classifyQueryShape(prompt: string, citedDomains: readonly string[]): QueryShape {
  if (isDefinitionalPrompt(prompt) || citesOnlyReferenceSources(citedDomains)) return "definition";
  return "other";
}
