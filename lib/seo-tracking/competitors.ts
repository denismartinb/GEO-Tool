import { normalizeStudyDomain } from "@/lib/studies/sector-study";

/**
 * SEO-TRACK-1 (log §340): what changes when a customer sets their rival
 * domains. Pure, so the rules are testable: domains are normalized
 * (`https://www.Acme.es/x` → `acme.es`), the project's own domain and its
 * subdomains are never a rival, duplicates collapse, and the list is cut to
 * the plan's cap in the order the customer gave it.
 */
export type CompetitorChange = { own: string; keep: string[]; add: string[]; remove: string[]; rejected: string[] };

export function planCompetitorChange(input: { ownDomain: string; current: string[]; wanted: string[]; cap: number }): CompetitorChange {
  const own = normalizeStudyDomain(input.ownDomain) ?? input.ownDomain.toLowerCase();
  const isOwn = (domain: string) => domain === own || domain.endsWith(`.${own}`);

  const valid: string[] = [];
  const rejected: string[] = [];
  for (const raw of input.wanted) {
    const domain = normalizeStudyDomain(raw);
    if (!domain || isOwn(domain)) {
      rejected.push(raw);
      continue;
    }
    if (!valid.includes(domain)) valid.push(domain);
  }
  const chosen = valid.slice(0, Math.max(0, input.cap));
  rejected.push(...valid.slice(chosen.length));

  const current = new Set(input.current);
  return {
    own,
    keep: chosen.filter((domain) => current.has(domain)),
    add: chosen.filter((domain) => !current.has(domain)),
    remove: input.current.filter((domain) => !chosen.includes(domain)),
    rejected
  };
}
