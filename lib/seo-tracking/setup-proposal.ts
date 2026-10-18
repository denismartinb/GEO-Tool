import { normalizeKeyword } from "@/lib/seo-tracking/keyword-text";
import { pagePath } from "@/lib/seo-tracking/topic-actions";

/**
 * SEO-TRACK-1 PR B (log §342): the first-use proposal. Topics are the pages
 * Google already shows for the customer's searches (Search Console, live),
 * one topic per page, so «un tema se trabaja con una sola página» holds from
 * the start. No LLM groups anything: the grouping is Google's own.
 * Everything is a proposal the customer edits before saving.
 */

export type ProposalQuery = { query: string; position: number; impressions: number };

export type ProposedTopic = {
  name: string;
  targetUrl: string | null;
  keywords: Array<{ keyword: string; position: number; impressions: number; checked: boolean }>;
};

export const PROPOSAL_MAX_TOPICS = 6;
export const PROPOSAL_MAX_PER_TOPIC = 8;
/** Beyond page 3, Search Console's own position is too far to be a first target. */
const MAX_POSITION = 30;
const MIN_IMPRESSIONS = 5;
/** Ticked by default, at most: the customer adds more, we never spend for them. */
export const PROPOSAL_DEFAULT_CHECKED = 20;

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-ES");
}

/** «/servicios/implantes-dentales» → «Implantes dentales»; the home page is «Portada». */
export function topicNameFromUrl(url: string): string {
  const path = pagePath(url);
  if (path === "/") return "Portada";
  const last = decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "").replace(/\.[a-z0-9]{2,5}$/i, "");
  const words = last.replace(/[-_+]+/g, " ").trim();
  if (!words) return "Portada";
  const name = words.charAt(0).toLocaleUpperCase("es-ES") + words.slice(1);
  return name.slice(0, 80);
}

export function buildSetupProposal(input: {
  queries: ProposalQuery[];
  pageByQuery: Record<string, string>;
  /** Brand searches already land on the site; tracking them costs and teaches nothing. */
  brandTerms: string[];
  keywordCap: number;
}): ProposedTopic[] {
  const brand = input.brandTerms.map(fold).filter((t) => t.length >= 3);
  const groups = new Map<string, { url: string; total: number; rows: ProposalQuery[] }>();
  for (const q of input.queries) {
    const keyword = normalizeKeyword(q.query);
    const url = input.pageByQuery[q.query];
    if (!keyword || !url || q.position > MAX_POSITION || q.impressions < MIN_IMPRESSIONS) continue;
    if (brand.some((b) => fold(keyword).includes(b))) continue;
    const key = pagePath(url);
    if (!groups.has(key)) groups.set(key, { url, total: 0, rows: [] });
    const g = groups.get(key)!;
    g.total += q.impressions;
    g.rows.push({ ...q, query: keyword });
  }

  const topics = [...groups.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, PROPOSAL_MAX_TOPICS)
    .map((g) => ({
      name: topicNameFromUrl(g.url),
      targetUrl: g.url,
      keywords: g.rows
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, PROPOSAL_MAX_PER_TOPIC)
        .map((r) => ({ keyword: r.query, position: r.position, impressions: r.impressions, checked: false }))
    }));

  // Names must be unique per project (seo_topics_uniq).
  const used = new Map<string, number>();
  for (const t of topics) {
    const n = (used.get(t.name) ?? 0) + 1;
    used.set(t.name, n);
    if (n > 1) t.name = `${t.name} ${n}`.slice(0, 80);
  }

  const budget = Math.min(input.keywordCap, PROPOSAL_DEFAULT_CHECKED);
  const ranked = topics.flatMap((t) => t.keywords).sort((a, b) => b.impressions - a.impressions);
  for (const k of ranked.slice(0, budget)) k.checked = true;
  return topics;
}
