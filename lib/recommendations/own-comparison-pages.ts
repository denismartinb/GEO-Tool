/**
 * RECS-COVERAGE-1 (log §330) — comparisons the brand already published.
 *
 * `close_competitor_gap` and `add_comparison_content` ask the user to publish
 * a comparison, and the engine writes them at scan finalize, before any audit
 * exists, so it never knew whether one was already live. In the real test on
 * genscore.es three cards asked for comparisons with Peec AI, Otterly and
 * RankScale that sat in `/comparativas/` for weeks (P1, P28, P34).
 *
 * The evidence is the brand's own sitemap: the technical audit already keeps
 * its `<loc>` values (`bots.sitemap.locs`, capped, see
 * `lib/web-audit/sitemap.ts`), so this costs no fetch and no LLM call. A page
 * counts only by its URL, which is honest about what was checked: we saw a
 * page whose address names the rival, not its content. Pure and client-safe.
 */

import { isSameOrSubdomain, normalizeDomain } from "@/lib/domains/brand-domain";

/** Types whose advice is "publish a comparison". */
export const COMPARISON_REC_TYPES: ReadonlySet<string> = new Set(["close_competitor_gap", "add_comparison_content"]);

const COMPARISON_SEGMENTS = new Set(["comparativas", "comparativa", "comparisons", "comparison", "compare", "comparar", "vs"]);

/** Lowercase, accents off, every run of non-alphanumerics as one hyphen. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ownPath(url: string, projectDomain: string): string | null {
  try {
    const parsed = new URL(url);
    if (!isSameOrSubdomain(normalizeDomain(parsed.hostname), normalizeDomain(projectDomain))) return null;
    return parsed.pathname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Own-domain URLs that read as a comparison page: under a comparison section
 * (`/comparativas/x`), or with a `vs` / `alternativas-a` slug. The section
 * index itself (`/comparativas`) is not a comparison.
 */
export function findOwnComparisonPages(urls: readonly string[], projectDomain: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    const path = ownPath(url, projectDomain);
    if (!path) continue;
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    const underSection = segments.slice(0, -1).some((s) => COMPARISON_SEGMENTS.has(s));
    const comparisonSlug = /(^|-)vs(-|$)/.test(last) || /^(alternativas?|alternatives?)-(a|to)-/.test(last);
    if (!underSection && !comparisonSlug) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * The comparison page that names this competitor, if any. The competitor's
 * slug must appear as whole hyphen-bounded words of the last path segment,
 * so "Otter" never matches `genscore-vs-otterly`.
 */
export function comparisonPageFor(competitor: string, comparisonPages: readonly string[]): string | null {
  const slug = slugify(competitor);
  if (slug.length < 2) return null;
  const pattern = new RegExp(`(^|-)${slug.replace(/-/g, "\\-")}(-|$)`);
  for (const url of comparisonPages) {
    try {
      const segments = new URL(url).pathname.toLowerCase().split("/").filter(Boolean);
      const last = segments[segments.length - 1] ?? "";
      if (pattern.test(last)) return url;
    } catch {
      continue;
    }
  }
  return null;
}

type ComparisonRec = {
  id: string;
  recommendationType: string;
  /** `dominant_competitor` of a per-competitor `close_competitor_gap` card. */
  competitor: string | null;
  /** Competitors seen in the card's answers (`mentioned_competitors`). */
  mentionedCompetitors: readonly string[];
};

/**
 * The own comparison page each comparison card already has. A per-competitor
 * card needs a page naming that competitor; a generic card (no single
 * competitor) needs one naming any competitor seen in its answers. No match
 * means no entry: the card keeps its "publish" advice.
 */
export function matchComparisonPages(recs: readonly ComparisonRec[], comparisonPages: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (comparisonPages.length === 0) return out;
  for (const rec of recs) {
    if (!COMPARISON_REC_TYPES.has(rec.recommendationType)) continue;
    const names = rec.competitor ? [rec.competitor] : rec.mentionedCompetitors;
    for (const name of names) {
      const page = comparisonPageFor(name, comparisonPages);
      if (page) {
        out.set(rec.id, page);
        break;
      }
    }
  }
  return out;
}

/** `bots.sitemap.locs` of a persisted technical snapshot, tolerant of old rows. */
export function sitemapLocsFromBots(bots: unknown): string[] {
  const sitemap = (bots as { sitemap?: { kind?: unknown; locs?: unknown } | null } | null)?.sitemap;
  if (!sitemap || sitemap.kind !== "urlset" || !Array.isArray(sitemap.locs)) return [];
  return sitemap.locs.filter((loc): loc is string => typeof loc === "string");
}
